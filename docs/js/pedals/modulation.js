// ---- modulation family (tremolo / chop / warble) ----------------------------
// The first LTV pedal: still memoryless like clipping (no y[n-D] feedback), but
// the multiplier now depends on TIME, not on the sample it's touching:
// y[n] = x[n]·m(t), m(t) = (1 − depth/2) + (depth/2)·shape(2π·rate·t). shape is
// bipolar (sine/square/triangle, each in [-1, 1]) so m rides between 1−depth
// (deepest cut) and 1 (untouched) — the same range a native LFO oscillator
// produces, which is what the live audio graph drives directly. Tremolo, chop,
// and warble are three PEDALS built from this one mechanism — the same
// relationship ClippingPedal has to overdrive/distortion/fuzz — differing only
// in LFO shape and where rate/depth start.
import { F0, GOFF, SR } from "../dsp.js";
import { Pedal } from "./base.js";

// ~1.37 s of 48 kHz audio (power of two, though nothing here needs the FFT — the
// modulation family's output panel draws envelopes, not a spectrum). Long enough
// to show several cycles at the rates these pedals start at; wind the rate slider
// down to its slowest and it holds under one, which the envelope panel shows
// honestly as a single slow swell.
export const NMOD = 65536;
export const SPANMS_MOD = (NMOD / SR) * 1000;

export class ModulationPedal extends Pedal {
  sampleCount = NMOD;
  spanSamples = NMOD;

  constructor({ rate, depth, fn, waveType, ...opts }) {
    super(opts);
    this.defaults = { rate, depth };
    Object.assign(this, { fn, waveType });
  }

  // A steady tone, at a fixed pitch regardless of buffer length (unlike the base
  // sine, which packs an exact cycle count into n — here n is sized for the LFO,
  // not the carrier, so the carrier's own frequency must stay put). Guitar mode
  // takes a mid-note slice long enough to carry the same LFO cycles.
  genInput({ srcMode, guitar, n }) {
    const inp = new Float64Array(n);
    const guitarOn = srcMode === "guitar" && guitar;
    for (let i = 0; i < n; i++) {
      inp[i] = guitarOn
        ? guitar[GOFF + i] || 0
        : Math.sin((2 * Math.PI * F0 * i) / SR);
    }
    return inp;
  }

  // this pedal's multiplier bound to the live knobs, as a function of time in
  // ms — the panel plots it directly; process() samples it once per index.
  curve(params) {
    const { rate, depth } = params;
    return (tMs) => {
      const phase = 2 * Math.PI * rate * (tMs / 1000);
      return 1 - depth / 2 + (depth / 2) * this.fn(phase);
    };
  }

  // out = x[n]·m(n/SR); no peak-match (match=1) — the whole point is that the
  // volume itself visibly rises and falls, not that it gets normalized away.
  process(inp, params) {
    const n = inp.length,
      out = new Float64Array(n),
      m = this.curve(params);
    for (let i = 0; i < n; i++) out[i] = inp[i] * m((i / SR) * 1000);
    return { out, match: 1 };
  }
}

// ---- the modulation family's LFO shapes -------------------------------------
// Each bipolar in [-1, 1], same convention a native OscillatorNode outputs, so
// the live audio graph's `lfo.type` can match the pedal's own shape by name.
export const sineShape = (phase) => Math.sin(phase);
export const squareShape = (phase) => Math.sign(Math.sin(phase)) || 1;
// a triangle wave built from a folded sine — smoother ramps than the square,
// slower-feeling than the sine's rounded top.
export const triangleShape = (phase) =>
  (2 / Math.PI) * Math.asin(Math.sin(phase));

// Same equation throughout (y[n] = x[n]·m(t)); these differ in LFO shape and
// where rate/depth start. Tremolo leads with the classic sine chop; chop pushes
// rate and depth hard for an on/off gate; warble is slow and shallow, closer to
// a wobble than a cut.
export const MODULATIONS = [
  new ModulationPedal({
    id: "tremolo",
    search: ["trem", "amplitude modulation", "am"],
    outnar: "the volume rises and falls in a steady pulse",
    tech: "x[n]·(1 − d/2 + d/2·sin(2π·rate·t))",
    techNote: "sine LFO — a smooth rise and fall",
    whatChanges: "amplitude; sidebands at f ± rate",
    rate: 4,
    depth: 0.6,
    fn: sineShape,
    waveType: "sine",
    // The Boss TR-2: mint, three knobs (rate, wave, depth).
    art: { shape: "box", hue: "#7fbf6a", knobs: 3 },
  }),
  new ModulationPedal({
    id: "chop",
    search: ["gate", "stutter", "square trem", "hard trem"],
    outnar: "the signal gates on and off",
    tech: "x[n]·(1 − d/2 + d/2·square(2π·rate·t))",
    techNote: "square LFO — full on, full off, nothing between",
    whatChanges: "amplitude gated on/off; many sidebands, spread wide",
    rate: 7,
    depth: 0.95,
    fn: squareShape,
    waveType: "square",
    // No real box to suggest — chop is a square-wave tremolo, which is a setting,
    // not a product. Same chassis, its own colour.
    art: { shape: "box", hue: "#54507e", knobs: 3 },
  }),
  new ModulationPedal({
    id: "warble",
    search: ["vibrato", "wobble", "wow"],
    outnar: "a slow, shallow wobble",
    tech: "x[n]·(1 − d/2 + d/2·tri(2π·rate·t))",
    techNote: "triangle LFO — a straight ramp up, a straight ramp down",
    whatChanges: "amplitude, slow and shallow; sidebands stay close in",
    rate: 2,
    depth: 0.35,
    fn: triangleShape,
    waveType: "triangle",
    // The Boss VB-2 vibrato, which is the pedal a player looking for "warble"
    // would actually pick up: pale blue, three knobs.
    art: { shape: "box", hue: "#6f9ec9", knobs: 3 },
  }),
];
