// Generic signal-analysis + IO core, shared by every effect module and the Node
// tests. Pure data-in/data-out transforms, no DOM/canvas/Web Audio, so it runs
// identically in a browser and under `node --test`.

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
// A real EGFxSet clean note (Stratocaster, bridge pickup, A3 ≈ 220 Hz), parsed
// straight from the WAV so panels get true 48 kHz samples without an AudioContext.
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

// Peak-normalize to just under full scale so the recorded note hits the transfer
// curve at the same amplitude as the sine. One factor -> preserves note dynamics.
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
// Apply per-sample transfer curve `fn` (x -> y), then remove the DC a bias
// introduces (coupling cap) and peak-match wet output to input, so at equal
// volume only timbre changes. Returns centered output plus outDc and outMatch.
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
// Two followers, because |sig| touches its true envelope only twice a cycle
// (~2.2 ms at F0): envelope() coasts down between peaks, envelopeHeld() holds.
// Transients want envelope(); a sustained tone wants envelopeHeld().

// Peak-follower: instant attack, exponential release. Pure, single pass, O(n).
// For TRANSIENTS — the delay family's plucks. Release (9 ms) must fall with the
// pluck's own 12 ms decay, else the humps decay at the follower's rate, not the
// pluck's. That quick release is why this ripples ~18 % on a sustained tone.
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

// Peak over a trailing window: instant attack, no release — a level only leaves
// when it falls out the back. Pure, O(n): each sample pushed/popped from `q` once.
// For SUSTAINED TONE — the modulation family; holds the envelope flat to <0.1 %
// where envelope() would fuzz a flat sine into an 18 % sawtooth.
// Default window is one carrier period, exact down to ~F0/2 (~111 Hz, under A3).
// Costs up to one window (~4.5 ms) of lag on the way down, which is why this is
// not the delay page's follower.
export function envelopeHeld(sig, holdMs = 1000 / F0) {
  const n = sig.length,
    W = Math.max(1, Math.round((holdMs / 1000) * SR)),
    e = new Float64Array(n),
    // indices into sig, |sig| descending: front is the window's peak; a smaller
    // sample behind it can never win, so it's dropped on arrival.
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
  // Warm-up: before i reaches W the trailing window is short, so a tone already at
  // level reads as a ramp up from |sig[0]| — a dip at t=0. This slice starts
  // mid-note, so hold the first full window's peak back across that leading region
  // (offline, so the look-ahead is free; ≥|sig| there, so it never uncovers a peak).
  const w0 = Math.min(n, W);
  for (let i = 0; i < w0 - 1; i++) e[i] = e[w0 - 1];
  return e;
}

// Centered box smooth, width one carrier period by default. The held follower
// steps once per cycle; averaged over that same period the staircase becomes a
// smooth ramp, and the LFO (period ≫ a cycle) rides through untouched. Pure, O(n)
// via a running sum; centered so it adds no lag.
export function smooth(sig, winMs = 1000 / F0) {
  const n = sig.length,
    W = Math.max(1, Math.round((winMs / 1000) * SR)),
    h = W >> 1,
    e = new Float64Array(n),
    ps = new Float64Array(n + 1); // ps[k] = sum of sig[0..k-1]
  for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + sig[i];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - h),
      hi = Math.min(n - 1, i + h);
    e[i] = (ps[hi + 1] - ps[lo]) / (hi - lo + 1);
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
// FFT would smear energy across bins (spectral leakage). Tapering keeps peaks sharp.
export function windowed(sig) {
  const n = sig.length,
    w = new Float64Array(n);
  for (let i = 0; i < n; i++)
    w[i] = sig[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}
