// Modulation-family VIEW (tremolo / chop / warble): only the UI. The pedal model
// (LFO multiplier m(t) = 1 − d/2 + d/2·shape(2π·rate·t), buffer processing) lives
// on ModulationPedal in pedals/; this module renders the LFO-curve panel, the
// wet-vs-dry envelope panel, the sideband spectrum, the rate/depth controls, and
// the live gain-modulation graph. Held-peak envelope + FFT from dsp.js; LFO curve
// from the pedal's own curve(params).
import { envelopeHeld, F0, SR, smooth, specDb, windowed } from "../dsp.js";
import { MODULATIONS, NMOD, SPANMS_MOD } from "../pedals/index.js";

// drawCenter plots the LFO from its formula, not the analysis buffer — a fixed
// window reads easier than one sized for the slowest rate on the slider.
const CURVE_SPAN_MS = 600;

// Spectrum half-width, in hertz either side of the carrier, tracking rate: the
// sidebands sit at f₀ ± k·rate, so a fixed window buries tremolo's ±rate pair and
// clips chop's comb. k runs as far as the LFO shape carries energy — a sine only
// to ±rate, a triangle's odd harmonics (∝1/k²) to ~5·rate, a square's (∝1/k) to
// ~7·rate (chop's ±7·rate is still −17 dB). ×1.4 keeps the outermost pair off the
// edge; floored where the FFT lobe stops resolving a closer pair, capped so f₀
// keeps its gridline company.
const SIDEBAND_ORDER = { sine: 1, triangle: 5, square: 7 };
const fspanHz = (pedal, rate) =>
  Math.min(90, Math.max(10, (SIDEBAND_ORDER[pedal.waveType] ?? 1) * rate * 1.4));

export default {
  id: "modulation",
  navLabel: "modulation",
  // Half — a real pedal's mix knob: the dry path is unmodulated, so blending it
  // back shallows the pulse.
  blendDefault: 0.5,
  pedals: MODULATIONS,
  // The top panel is the envelope, not the harness's waveform — see drawTime.
  timeTech: "envelope",
  // The volume pulse (envelope, top) is what you HEAR; the sidebands (spectrum,
  // bottom) are the signal change. That's the reverse of clipping, so the band
  // crosses its CHANGES/YOU HEAR columns onto the right charts (see harness).
  bandSwap: true,
  // Per pedal, like clipping's: now the window tracks rate (see fspanHz) the three
  // spectra genuinely differ — one pair, a broad comb, a close faint pair — so the
  // headline moves with the pick the way the top panel's outnar does, one copy each.
  spectrumTitle: (pedal) => pedal.whatChanges,
  spectrumTech: "spectrum",
  spectrumUnit: "dB",

  lesson: {
    formula: "y[n] = x[n]·m(t)",
    formulaNote: "the multiplier depends on the clock, not on the sample",
    klass: "linear, time-varying (LTV)",
    oneLiner: "it rides your volume knob for you",
    body: `
      <h2>What's actually going on</h2>
      <p><strong>A second oscillator — far too slow to hear as a pitch, a few
      cycles per second — is turning your volume up and down.</strong> That's
      the LFO, and its shape is the whole pedal:
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
        panel is zoomed to a band a few dozen hertz either side of the carrier —
        it tracks the rate, since that's where the sidebands land — and not to
        the 3.6 kHz clipping's is: the whole of what this pedal did to your note
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

  // Output TOP panel: the wet envelope (orange) tracing the chop over the dry
  // (grey) — the row of pulses the LFO carves into the tone. On the sine source
  // the dry envelope is flat, so the pulses are the only thing moving; on the
  // guitar it decays and the chop rides that decay.
  //
  // Overrides the harness's dry-vs-wet waveform: at 65536 samples into ~400 px
  // (166 samples/px against a 215-sample carrier period) a polyline is a filled
  // band, not a wave.
  drawTime(F, inp, out, _pedal, _src, H) {
    const { g, L, R, T, B } = F;
    const { DRY, WET } = H.colors;
    const span = out.length;
    const sx = (i) => L + (i / span) * (R - L),
      sy = (v) => B - Math.min(1, v) * (B - T - 4);
    // Held, not released: the carrier is a sustained tone, and a follower that
    // coasts between its peaks draws its own 18% ripple over every LFO curve here.
    // See dsp.js — the delay page wants the other one.
    // Held follower steps once per carrier cycle; smooth over that same period so
    // the staircase reads as the pulse it is, not fuzz. LFO period ≫ a cycle.
    const de = smooth(envelopeHeld(inp)),
      we = smooth(envelopeHeld(out));
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
  // side of it, dry (grey) against wet (orange).
  //
  // Windowed: the OUTPUT is only bin-periodic when rate·NMOD/SR is whole, and at
  // 4 Hz that's 5.46 — raw, the leak would bury the sidebands it's meant to show.
  //
  // Each spectrum normalized to its own peak (specDb), as clipping's is, so both
  // carriers sit at 0 dB and the gap between traces is only the new energy — at
  // the cost of the 3 dB the carrier gives up at depth 0.6 (the panel above is
  // already the one reporting level).
  drawSpec(F, inp, out, pedal, _src, H, params) {
    const { g, L, R, T, B } = F;
    const { DRY, WET, GRID } = H.colors;
    const FSPAN = fspanHz(pedal, params.rate ?? pedal.defaults.rate);
    const df = SR / NMOD; // 0.73 Hz per bin
    const lo = Math.round((F0 - FSPAN) / df),
      hi = Math.round((F0 + FSPAN) / df);
    const dry = specDb(windowed(inp)),
      wet = specDb(windowed(out));
    const sx = (f) => L + ((f - F0 + FSPAN) / (2 * FSPAN)) * (R - L),
      sy = (db) => T + ((5 - Math.max(-80, db)) / 85) * (B - T);
    // dB ladder + floor — the analyzer furniture (see chart.js), matching the
    // clipping spectrum: this panel descends from a 0 dB ceiling to the -80 floor.
    H.dbLadder(g, F, sy, [0, -40], -80);
    // The carrier's own gridline — everything here is read as an offset from it,
    // and it's the one frequency that isn't the pedal's doing.
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
    H.txt(g, `−${Math.round(FSPAN)}`, sx(F0 - FSPAN), B + 3, "start", "top");
    H.txt(g, "f₀", sx(F0), B + 3, "center", "top");
    H.txt(g, `+${Math.round(FSPAN)}`, sx(F0 + FSPAN), B + 3, "end", "top");
    H.titles(g, F, "dB", "hertz from the carrier");
  },

  // live audio: an LFO drives a gain node's .gain AudioParam (lfoGain scales it to
  // depth/2, offset re-centers to 1−depth/2) — the same 1 − d/2 + d/2·shape(t)
  // equation, computed by the audio clock instead of sampled once per render.
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
      // both started above, so both must be stopped on swap-out — a disconnected
      // oscillator still runs.
      dispose() {
        lfo.stop();
        offset.stop();
      },
    };
  },
};
