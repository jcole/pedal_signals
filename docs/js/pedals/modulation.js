// ---- modulation family (tremolo / chop / warble) ----------------------------
// The first LTV pedal: memoryless like clipping, but the multiplier depends on
// TIME, not the sample: y[n] = x[n]·m(t), m(t) = (1 − depth/2) + (depth/2)·
// shape(2π·rate·t). shape is bipolar (sine/square/triangle, each in [-1, 1]) so m
// rides between 1−depth (deepest cut) and 1 (untouched) — the range a native LFO
// oscillator produces. Three pedals, differing only in LFO shape and knob starts.
import { F0, GOFF, SR } from "../dsp.js";
import { Pedal } from "./base.js";

// ~1.37 s of 48 kHz audio (power of two). Long enough to show several cycles at
// the rates these pedals start at, down to under one at the slowest rate.
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

  // A steady tone at fixed pitch regardless of buffer length: n is sized for the
  // LFO, not the carrier, so the carrier frequency must stay put (unlike the base
  // sine, which packs an exact cycle count into n). Guitar mode takes a mid-note slice.
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

  // out = x[n]·m(n/SR); no peak-match (match=1) — the volume must visibly rise
  // and fall, not be normalized away.
  process(inp, params) {
    const n = inp.length,
      out = new Float64Array(n),
      m = this.curve(params);
    for (let i = 0; i < n; i++) out[i] = inp[i] * m((i / SR) * 1000);
    return { out, match: 1 };
  }
}

// ---- the modulation family's LFO shapes -------------------------------------
// Each bipolar in [-1, 1], matching OscillatorNode so `lfo.type` can match by name.
export const sineShape = (phase) => Math.sin(phase);
export const squareShape = (phase) => Math.sign(Math.sin(phase)) || 1;
// triangle from a folded sine
export const triangleShape = (phase) =>
  (2 / Math.PI) * Math.asin(Math.sin(phase));

// Same equation throughout; these differ in LFO shape and knob starts. Tremolo =
// classic sine; chop pushes rate/depth hard for an on/off gate; warble is slow
// and shallow.
export const MODULATIONS = [
  new ModulationPedal({
    id: "tremolo",
    search: ["trem", "amplitude modulation", "am"],
    outnar: "the volume rises and falls in a steady pulse",
    tech: "x[n]·(1 − d/2 + d/2·sin(2π·rate·t))",
    techNote: "sine LFO — a smooth rise and fall",
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
    rate: 7,
    depth: 0.95,
    fn: squareShape,
    waveType: "square",
    // No real box — chop is a square-wave tremolo, a setting not a product.
    art: { shape: "box", hue: "#54507e", knobs: 3 },
  }),
  new ModulationPedal({
    id: "warble",
    search: ["vibrato", "wobble", "wow"],
    outnar: "a slow, shallow wobble",
    tech: "x[n]·(1 − d/2 + d/2·tri(2π·rate·t))",
    techNote: "triangle LFO — a straight ramp up, a straight ramp down",
    rate: 2,
    depth: 0.35,
    fn: triangleShape,
    waveType: "triangle",
    // The Boss VB-2 vibrato: pale blue, three knobs.
    art: { shape: "box", hue: "#6f9ec9", knobs: 3 },
  }),
];
