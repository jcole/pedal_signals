// Modulation-family VIEW (tremolo / chop / warble): only the UI. What a
// modulation pedal IS — the LFO multiplier m(t) = 1 − d/2 + d/2·shape(2π·rate·t),
// and how it processes a buffer — lives on the ModulationPedal instances in
// pedals/. This module renders them: the LFO-curve center panel, the wet-vs-dry
// envelope panel, the sideband spectrum, the rate/depth controls, and the live
// gain-modulation audio graph. The held-peak envelope and the FFT come from
// dsp.js; the LFO curve comes from the pedal's own curve(params) (that one's the
// modulation family's own DSP).
import { envelopeHeld, F0, SR, specDb, windowed } from "../dsp.js";
import { MODULATIONS, NMOD, SPANMS_MOD } from "../pedals/index.js";

// drawCenter plots the LFO from its formula (like the clipping family's transfer
// curve) rather than from the analysis buffer — a fixed window is easier to read
// than one sized for the slowest rate on the slider.
const CURVE_SPAN_MS = 600;

// The spectrum panel's half-width, in hertz either side of the carrier. Clipping
// plots 0–3600 Hz because that's where clipping puts things — 2f₀, 3f₀, 4f₀. This
// family puts them at f₀ ± rate, which on that axis is one pixel wide, indexed
// under the carrier and invisible. So the zoom isn't a drawing detail here, it's
// the lesson the aside has always been making in words: a few hertz either side
// of the note, not up in the harmonics. 60 Hz is wide enough for chop's odd
// sidebands (rate, 3·rate, 5·rate…) to spread out at the rates it starts at, and
// tight enough that tremolo's ±4 Hz pair still reads as a pair.
const FSPAN_HZ = 60;

export default {
  id: "modulation",
  navLabel: "modulation",
  // The mirror of clipping's, deliberately: same sentence shape, opposite claim.
  // That's the pair being a lesson rather than a layout — these two families are
  // each exactly what the other isn't (shape vs level, one sample vs one clock),
  // and read one after the other the two cells say it before either lesson does.
  // Which is a thing the column can do and the paragraph couldn't: these are the
  // same cell on two mounts, so switching families swaps one sentence in place
  // against a row that's otherwise identical.
  why: `This pedal leaves the shape of a cycle alone; it changes how loud the note
    is, over seconds.`,
  // Half, which on this family is a real pedal's mix knob: the dry path is
  // unmodulated, so blending it back in is what shallows the pulse.
  blendDefault: 0.5,
  pedals: MODULATIONS,
  // The top panel is the envelope, not the harness's waveform — see drawTime.
  timeTech: "envelope",
  spectrumTitle: "new energy either side of the note — not up in the harmonics",
  spectrumTech: "spectrum",
  spectrumUnit: "dB",

  lesson: {
    formula: "y[n] = x[n]·m(t)",
    formulaNote: "the multiplier depends on the clock, not on the sample",
    klass: "linear, time-varying (LTV)",
    oneLiner: "it rides your volume knob for you",
    body: `
      <p><strong>What's actually going on:</strong> a second oscillator — far
      too slow to hear as a pitch, a few cycles per second — is turning your
      volume up and down. That's the LFO, and its shape is the whole pedal:
      a rounded sine gives tremolo's smooth pulse, a square slams the signal
      on and off, a triangle wobbles. Depth sets how far down the cut goes; at
      depth 1 the troughs reach silence, at depth 0 the multiplier is a flat 1
      and nothing happens.</p>
      <p>Like clipping, this pedal has no memory — it touches one sample at a
      time. But where clipping asks "how big is this sample?", modulation asks
      "what time is it?" That's the difference between the two families, and
      it's why this one is linear: play twice as loud and you get exactly twice
      as loud out. The pedal isn't bending your signal, it's scaling it.</p>
    `,
    aside: {
      title: "Sidebands, not harmonics",
      body: `
        <p>Multiply two sines and the trig gives you a sum and a difference,
        not a multiple: <code>sin(A)·sin(B)</code> is
        <code>½[cos(A−B) − cos(A+B)]</code>. So tremolo on a note at f₀ puts
        new energy at <em>f₀ ± rate</em> — a few hertz either side of the note,
        not up at 2f₀ and 3f₀ where clipping puts it. That's why the spectrum
        panel is zoomed to sixty hertz either side of the carrier and not to the
        3.6 kHz clipping's is: the whole of what this pedal did to your note
        happens inside a band narrower than the gap to its second harmonic.</p>
        <p>Those sidebands are why the family keeps going. Wind the rate up out
        of LFO territory and into the audio range and the sidebands move far
        enough from f₀ to hear as their own tones, inharmonic and clangy —
        that's a ring modulator, the same equation with a faster clock.</p>
      `,
    },
  },

  controls: [
    { id: "rate", label: "rate", min: 0.5, max: 12, step: 0.1, def: 4, fmt: (v) => `${v.toFixed(1)} Hz` },
    { id: "depth", label: "depth", min: 0, max: 1, step: 0.01, def: 0.6, fmt: (v) => v.toFixed(2) },
  ],

  // center panel: the multiplier m(t) over a fixed window, with 1 and 1−depth
  // reference lines so the cut depth reads directly off the curve's floor.
  drawCenter(F, pedal, params, H) {
    const { g, L, R, T, B } = F;
    const { GRID, ACCENT } = H.colors;
    const m = pedal.curve(params);
    const sx = (ms) => L + (ms / CURVE_SPAN_MS) * (R - L),
      sy = (v) => B - v * (B - T - 6);
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(L, sy(1));
    g.lineTo(R, sy(1));
    g.moveTo(L, sy(1 - params.depth));
    g.lineTo(R, sy(1 - params.depth));
    g.stroke();
    const xs = [],
      ys = [];
    for (let i = 0; i <= 400; i++) {
      const ms = (CURVE_SPAN_MS * i) / 400;
      xs.push(ms);
      ys.push(m(ms));
    }
    H.line(g, xs, ys, sx, sy, ACCENT, 2.5);
    H.txt(g, "1", L - 5, sy(1), "end", "middle");
    H.txt(g, (1 - params.depth).toFixed(2), L - 5, sy(1 - params.depth), "end", "middle");
    H.txt(g, "0", sx(0), B + 3, "start", "top");
    H.txt(g, CURVE_SPAN_MS.toFixed(0), sx(CURVE_SPAN_MS), B + 3, "end", "top");
    H.titles(g, F, "gain", "time (ms)");
  },

  // Output TOP panel: the wet envelope (orange) tracing the chop over the dry one
  // (grey) — the row of pulses the LFO carves into the tone. On the sine source
  // the dry envelope is flat, so the pulses are the only thing moving; on the
  // guitar it decays, and the chop rides that decay.
  //
  // This overrides the harness's dry-vs-wet waveform rather than sitting under it
  // (where it used to, one panel down). That waveform plots spanSamples — 65536
  // here, because the buffer is sized for the LFO — into ~400 px, which is 166
  // samples a pixel against a carrier period of 215. At 1.3 px a cycle a polyline
  // isn't a wave, it's a filled band, and the only thing legible about it was its
  // outline: this curve, drawn badly, in the panel above the one drawing it well.
  drawTime(F, inp, out, _pedal, _src, H) {
    const { g, L, R, T, B } = F;
    const { DRY, WET } = H.colors;
    const span = out.length;
    const sx = (i) => L + (i / span) * (R - L),
      sy = (v) => B - Math.min(1, v) * (B - T - 4);
    // Held, not released: the carrier under this family is a sustained tone, and
    // a follower that coasts between its peaks draws its own 18% ripple over
    // every LFO curve here. See dsp.js — the delay page wants the other one.
    const de = envelopeHeld(inp),
      we = envelopeHeld(out);
    const xs = new Array(span);
    for (let i = 0; i < span; i++) xs[i] = i;
    H.line(g, xs, de, sx, sy, DRY, 1.5);
    H.line(g, xs, we, sx, sy, WET, 2);
    H.txt(g, "1", L - 5, sy(1), "end", "middle");
    H.txt(g, "0", L - 5, sy(0), "end", "middle");
    H.txt(g, "0", sx(0), B + 3, "start", "top");
    H.txt(g, SPANMS_MOD.toFixed(0), sx(span), B + 3, "end", "top");
    H.titles(g, F, "level", "time (ms)");
  },

  // Output BOTTOM panel: the carrier and the sidebands multiplication puts either
  // side of it, dry (grey) against wet (orange). The page has been promising this
  // chart in prose since the lesson was written — the aside's "the spectrum panel
  // shows the line smearing into a little cluster", tremolo's "sidebands at
  // f ± rate" — and there has never been a spectrum panel to look at. This is it.
  //
  // Windowed, unlike the carrier's own maths would need: the sine sits at exactly
  // 304 cycles in NMOD so it lands dead on a bin, but the OUTPUT is only periodic
  // in the buffer when rate·NMOD/SR is a whole number, and at 4 Hz that's 5.46.
  // Raw, the leak from that would bury the sidebands it's meant to show.
  //
  // Each spectrum is normalized to its own peak (specDb), as clipping's is, so
  // both carriers sit at 0 dB and the gap between the traces is only ever the new
  // energy. What that costs is the 3 dB the carrier itself gives up at depth 0.6
  // — real, and the panel above is already the one reporting level.
  drawSpec(F, inp, out, _pedal, _src, H) {
    const { g, L, R, T, B } = F;
    const { DRY, WET, GRID } = H.colors;
    const df = SR / NMOD; // 0.73 Hz per bin
    const lo = Math.round((F0 - FSPAN_HZ) / df),
      hi = Math.round((F0 + FSPAN_HZ) / df);
    const dry = specDb(windowed(inp)),
      wet = specDb(windowed(out));
    const sx = (f) => L + ((f - F0 + FSPAN_HZ) / (2 * FSPAN_HZ)) * (R - L),
      sy = (db) => T + ((5 - Math.max(-80, db)) / 85) * (B - T);
    // The carrier's own gridline. Everything on this panel is read as an offset
    // from it, and it's the one frequency here that isn't the pedal's doing.
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(sx(F0), T);
    g.lineTo(sx(F0), B);
    g.stroke();
    const xs = [],
      ds = [],
      ws = [];
    for (let b = lo; b <= hi; b++) {
      xs.push(b * df);
      ds.push(dry[b]);
      ws.push(wet[b]);
    }
    H.line(g, xs, ds, sx, sy, DRY, 1);
    H.line(g, xs, ws, sx, sy, WET, 1.5);
    H.txt(g, "0", L - 5, sy(0), "end", "middle");
    H.txt(g, "-40", L - 5, sy(-40), "end", "middle");
    H.txt(g, "-80", L - 5, sy(-80), "end", "middle");
    H.txt(g, `−${FSPAN_HZ}`, sx(F0 - FSPAN_HZ), B + 3, "start", "top");
    H.txt(g, "f₀", sx(F0), B + 3, "center", "top");
    H.txt(g, `+${FSPAN_HZ}`, sx(F0 + FSPAN_HZ), B + 3, "end", "top");
    H.titles(g, F, "dB", "hertz from the carrier");
  },

  // live audio: an LFO oscillator drives a gain node's .gain AudioParam directly
  // (lfoGain scales it to depth/2, offset re-centers it to 1−depth/2) — the same
  // 1 − d/2 + d/2·shape(t) equation the analysis side runs, just computed by the
  // audio graph's own clock instead of sampled once per render.
  buildAudio(actx, inGain, _H) {
    const trem = actx.createGain(),
      lfo = actx.createOscillator(),
      lfoGain = actx.createGain(),
      offset = actx.createConstantSource();
    lfo.connect(lfoGain).connect(trem.gain);
    offset.connect(trem.gain);
    inGain.connect(trem);
    lfo.start();
    offset.start();
    return {
      wetOut: trem,
      update(pedal, params) {
        lfo.type = pedal.waveType;
        lfo.frequency.value = params.rate;
        lfoGain.gain.value = params.depth / 2;
        offset.offset.value = 1 - params.depth / 2;
      },
      // both are started above, so both must be stopped when the family is
      // swapped out — a disconnected oscillator still runs.
      dispose() {
        lfo.stop();
        offset.stop();
      },
    };
  },
};
