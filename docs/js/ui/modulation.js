// Modulation-family VIEW (tremolo / chop / warble): only the UI. What a
// modulation pedal IS — the LFO multiplier m(t) = 1 − d/2 + d/2·shape(2π·rate·t),
// and how it processes a buffer — lives on the ModulationPedal instances in
// pedals/. This module renders them: the LFO-curve center panel, the
// wet-vs-dry envelope panel, the rate/depth controls, and the live
// gain-modulation audio graph. The peak-follower envelope comes from dsp.js;
// the LFO curve comes from the pedal's own curve(params) (they're the
// modulation family's own DSP).
import { envelope } from "../dsp.js";
import { MODULATIONS, SPANMS_MOD } from "../pedals/index.js";

// The center panel plots the LFO curve directly (analytic, like the clipping
// family's transfer curve) rather than the full analysis buffer — a fixed
// window is easier to read than one sized for the slowest rate on the slider.
const CURVE_SPAN_MS = 600;

export default {
  id: "modulation",
  navLabel: "modulation",
  pageTitle: "modulation — pedal demo",
  dual: "⇅ same signal — LFO curve above, envelope below",
  vinDefault: 0.6,
  voutDefault: 0.6,
  pedals: MODULATIONS,
  centerTitle: "the pedal rides the volume up and down",
  spectrumTitle: "the envelope traces the LFO — the ear hears it as pulsing",

  lesson: {
    formula: "y[n] = x[n]·m(t)",
    formulaNote: "the multiplier depends on the clock, not on the sample",
    klass: "linear, time-varying (LTV)",
    oneLiner: "it rides your volume knob for you.",
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
        panel shows the line smearing into a little cluster instead of
        sprouting a harmonic series.</p>
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

  // bottom panel: the wet envelope (orange) tracing the chop over the dry
  // envelope (grey, flat at 1) — the row of pulses the LFO carves into the tone.
  drawSpec(F, inp, out, _pedal, _src, H) {
    const { g, L, R, T, B } = F;
    const { DRY, WET } = H.colors;
    const span = out.length;
    const sx = (i) => L + (i / span) * (R - L),
      sy = (v) => B - Math.min(1, v) * (B - T - 4);
    const de = envelope(inp),
      we = envelope(out);
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
