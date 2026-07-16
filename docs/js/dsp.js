// Generic signal-analysis + IO core, shared by every effect module and the Node
// tests. Nothing in here touches the DOM, canvas, or Web Audio — every function
// is a plain data-in / data-out transform, so it runs identically in a browser
// and under `node --test`. The per-pedal DSP each effect is built from lives in
// pedals/; the UI/audio/canvas glue lives in ui/ — the harness (ui/harness.js)
// and the per-family view modules (ui/clipping.js, ui/delay.js, …).

// ---- constants -------------------------------------------------------------
export const SR = 48000;
export const N = 8192;
export const KBIN = 38; // fundamental bin -> exactly 38 cycles in N (no FFT leakage)
export const F0 = (KBIN * SR) / N; // ~222.7 Hz
export const FMAX = 3600;
export const CYCLES = 3;
export const SPAN = Math.round((CYCLES * N) / KBIN); // samples shown in the time panels (~13.5 ms)
export const GOFF = Math.round(0.1 * SR); // analysis slice: 0.1 s in — past the pick attack, still loud
export const MSMAX = (CYCLES / F0) * 1000; // width of the time panels, in ms

// ---- WAV parsing / normalization -------------------------------------------
// A real EGFxSet clean note (Stratocaster, bridge pickup, A3 ≈ 220 Hz). Parsed
// straight from the WAV so the analysis panels have true 48 kHz samples without
// needing an AudioContext (which only exists after the user hits "start audio").
export function parseWav(buf) {
  const dv = new DataView(buf);
  let i = 12,
    bits = 16,
    ch = 1,
    dataOff = 0,
    dataLen = 0;
  while (i < dv.byteLength - 8) {
    const id = String.fromCharCode(
      dv.getUint8(i),
      dv.getUint8(i + 1),
      dv.getUint8(i + 2),
      dv.getUint8(i + 3),
    );
    const sz = dv.getUint32(i + 4, true);
    if (id === "fmt ") {
      ch = dv.getUint16(i + 10, true);
      bits = dv.getUint16(i + 22, true);
    } else if (id === "data") {
      dataOff = i + 8;
      dataLen = sz;
    }
    i += 8 + sz + (sz & 1);
  }
  const bytes = bits / 8,
    frames = Math.floor(dataLen / (bytes * ch)),
    out = new Float32Array(frames);
  for (let n = 0; n < frames; n++) {
    const p = dataOff + n * bytes * ch; // channel 0 only
    let v;
    if (bits === 24) {
      v = dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getUint8(p + 2) << 16);
      if (v & 0x800000) v -= 0x1000000;
      v /= 0x800000;
    } else {
      v = dv.getInt16(p, true) / 0x8000;
    }
    out[n] = v;
  }
  return out;
}

// Peak-normalize to just under full scale so the recorded note hits the pedal's
// transfer curve at the same amplitude as the sine (which is generated at 1.0).
// Scales the whole buffer by one factor -> preserves the note's own dynamics.
export function normalize(sig, target = 0.98) {
  let pk = 0;
  for (let i = 0; i < sig.length; i++) {
    const a = Math.abs(sig[i]);
    if (a > pk) pk = a;
  }
  if (pk > 0) {
    const g = target / pk;
    for (let i = 0; i < sig.length; i++) sig[i] *= g;
  }
  return sig;
}

// ---- waveshaping engine ----------------------------------------------------
// Apply a bound per-sample transfer curve `fn` (x -> y) to an input buffer, then
// condition the output as the demo does: remove the DC offset a bias introduces
// (a coupling cap), then compute the gain that peak-matches the wet output to the
// input, so at equal volumes only timbre changes, not level. Generic — `fn` is
// any curve, so this runs any waveshaping pedal; the curves live in pedals/.
// Returns the centered output plus the two scalars the demo/audio graph need.
export function shapeSignal(inp, fn) {
  const len = inp.length,
    out = new Float64Array(len);
  let sum = 0,
    ipk = 0;
  for (let n = 0; n < len; n++) {
    const x = inp[n];
    if (Math.abs(x) > ipk) ipk = Math.abs(x); // real input peak (sine: == level)
    const y = fn(x);
    out[n] = y;
    sum += y;
  }
  const outDc = sum / len;
  let pk = 0;
  for (let n = 0; n < len; n++) {
    out[n] -= outDc;
    const a = Math.abs(out[n]);
    if (a > pk) pk = a;
  } // centre (drop DC)
  const outMatch = ipk / Math.max(1e-9, pk); // then peak-match to input, so only shape differs
  return { out, outDc, outMatch };
}

// ---- envelope --------------------------------------------------------------
// Two followers, because the two families that draw envelopes feed them opposite
// signals and a follower can only be right about one of them.
//
// Both trace the top of |sig|, and the choice between them is the choice of what
// to do BETWEEN the carrier's peaks — |sig| touches its true envelope only twice
// a cycle (every ~2.2 ms at F0) and is below it the rest of the time. envelope()
// coasts down from the last peak; envelopeHeld() holds it. Coasting is right when
// the signal really is dying away and wrong when it isn't; holding is the reverse.
// Pick by the signal, not by the panel: a transient wants envelope(), a sustained
// tone wants envelopeHeld().

// A peak-follower envelope: instant attack, exponential release. Traces the top
// of |sig| so a train of separated echoes reads as a row of decaying humps even
// when the raw waveform is a dense scribble. Pure, single pass, O(n).
//
// For TRANSIENTS — the delay family's plucks. The release has to be quick enough
// to fall with the hit it's tracing (9 ms against the pluck's own 12 ms decay, so
// the panel reports the pluck and not the follower: slow this to 25 ms and the
// humps decay in 25 ms no matter what the pluck does, which would make the echo
// page's whole subject an artifact of its drawing code). Quick release is also
// exactly why this ripples ~18 % on a sustained tone — see envelopeHeld().
export function envelope(sig, releaseMs = 9) {
  const n = sig.length,
    e = new Float64Array(n),
    rel = Math.exp(-1 / ((releaseMs / 1000) * SR));
  let env = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(sig[i]);
    env = a > env ? a : env * rel;
    e[i] = env;
  }
  return e;
}

// The peak over a trailing window: instant attack, and no release at all — a
// level only leaves when it falls out the back of the window. Pure, O(n): each
// sample is pushed and popped from `q` once.
//
// For SUSTAINED TONE — the modulation family, where the carrier runs flat and the
// LFO is the only thing moving. envelope() can't draw that: coasting for the
// ~2.2 ms between peaks costs it 18 % before the next peak snaps it back, so a
// steady sine — whose envelope is FLAT 1 — comes out as an 18 % sawtooth band,
// and every LFO curve wears the same fuzz. Holding instead is exact there: the
// window always contains a peak, so the trace is flat to <0.1 %.
//
// The default window is one carrier period, which is two half-periods of |sig| —
// i.e. twice the headroom it strictly needs, so it stays exact for anything down
// to ~F0/2 (~111 Hz), well under the guitar's A3. It costs a lag of at most one
// window (~4.5 ms) on the way DOWN, since a peak has to age out before the level
// can drop. That's the trade: on a sustained tone there's nothing to lag behind,
// which is why this is not the delay page's follower — there, 4.5 ms of hold on a
// 12 ms decay is the whole hump.
export function envelopeHeld(sig, holdMs = 1000 / F0) {
  const n = sig.length,
    W = Math.max(1, Math.round((holdMs / 1000) * SR)),
    e = new Float64Array(n),
    // indices into sig, |sig| descending: the front is the window's peak, and
    // anything smaller behind it can never be (a bigger, younger sample outlives
    // it), so it's dropped on arrival rather than compared with later.
    q = new Int32Array(n);
  let head = 0,
    tail = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(sig[i]);
    while (tail > head && Math.abs(sig[q[tail - 1]]) <= a) tail--;
    q[tail++] = i;
    if (q[head] <= i - W) head++; // the front aged out of the window
    e[i] = Math.abs(sig[q[head]]);
  }
  return e;
}

// ---- FFT / spectrum --------------------------------------------------------
// tiny iterative radix-2 FFT (real in) — mutates `re`, returns magnitude spectrum
export function fftMag(re) {
  const n = re.length,
    im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j) {
      const t = re[i];
      re[i] = re[j];
      re[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len,
      wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k],
          ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci,
          vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  const half = n / 2,
    mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

// magnitude spectrum in dB, normalized so the strongest bin sits at 0 dB
export function specDb(sig) {
  const mag = fftMag(Float64Array.from(sig));
  let mx = 1e-12;
  for (const v of mag) if (v > mx) mx = v;
  const db = new Float64Array(mag.length);
  for (let i = 0; i < mag.length; i++)
    db[i] = 20 * Math.log10(mag[i] / mx + 1e-9);
  return db;
}

// Hann window before the FFT: a real note slice isn't periodic in N, so a raw
// FFT would smear energy across bins (spectral leakage). The window tapers the
// ends to zero, so the harmonic peaks stay sharp.
export function windowed(sig) {
  const n = sig.length,
    w = new Float64Array(n);
  for (let i = 0; i < n; i++)
    w[i] = sig[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}
