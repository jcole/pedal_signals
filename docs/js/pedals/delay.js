// ---- delay family (echo / slapback / ambient) ------------------------------
// The first pedal with MEMORY: out[n] = x[n] + fb·out[n−D], so a hit comes back
// D samples later, then again fb·D later — a train of repeats fading by fb. All
// three instances run that equation; they differ only in where the knobs start.
import { F0, SR } from "../dsp.js";
import { Pedal } from "./base.js";

// ~0.68 s of 48 kHz audio (power of two). Long enough to show a couple of repeats
// even at the longest delay time.
export const NLONG = 32768;
export const SPANMS = (NLONG / SR) * 1000;

export class DelayPedal extends Pedal {
  sampleCount = NLONG;
  spanSamples = NLONG;

  constructor({ time, feedback, ...opts }) {
    super(opts);
    this.defaults = { time, feedback };
  }

  // A steady tone can't show a repeat (a delayed copy just overlaps). Both sources
  // are the same burst — a hit, then silence for it to return into; carrier differs.
  genInput({ srcMode, guitar, n }) {
    return srcMode === "guitar" && guitar ? guitarBurst(guitar, n) : pluck(n);
  }

  // out = dry + geometric repeats. No peak-match (match=1): echoes must read
  // visibly lower than the dry hit.
  process(inp, params) {
    const D = (params.time / 1000) * SR;
    return { out: echo(inp, D, params.feedback), match: 1 };
  }
}

// ---- the delay family's pure DSP -------------------------------------------

// y[n] = x[n] + fb·y[n−D]: dry rides at unity, each repeat is the output tapped D
// back and scaled by fb (geometric decay). fb must stay < 1 or the tail never dies.
// Pure: (Float64Array, int, number) -> Float64Array.
export function echo(inp, delaySamples, feedback) {
  const n = inp.length,
    D = Math.max(1, Math.round(delaySamples)),
    out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = inp[i] + (i >= D ? feedback * out[i - D] : 0);
  }
  return out;
}

// The level below which a repeat is too quiet to draw: the tap train stops here,
// and the live source sizes its silent gap by it.
export const TAP_FLOOR = 0.02;

// Idealized impulse response: a single unit hit -> stems at 0, D, 2D, … with
// heights 1, fb, fb², … Returned as {ms, level} pairs above `floor`, inside `spanMs`.
export function impulseResponse(delayMs, feedback, spanMs, floor = TAP_FLOOR) {
  const taps = [];
  for (let k = 0, level = 1; k * delayMs <= spanMs; k++, level *= feedback) {
    if (level < floor) break;
    taps.push({ ms: k * delayMs, level });
    if (feedback <= 0) break; // fb=0 -> only the dry tap
  }
  return taps;
}

// How long the hit lasts. Exported so a caller spacing plucks apart can outlast
// the pluck and its echoes.
export const PLUCK_MS = 70;

// Decay of the hit, ~12 ms — over well inside PLUCK_MS, so even the shortest
// delay time lands its repeat in clear air.
const TAU = 0.012 * SR;

// The transient a delay needs to make repeats visible: cut whatever's playing to
// a single decaying burst, silent after PLUCK_MS, so each echo lands in clear air.
// The family's ONE envelope, shared by both sources. `carrier` is what's playing.
export function burst(carrier, n) {
  const out = new Float64Array(n),
    len = Math.min(n, Math.round((PLUCK_MS / 1000) * SR));
  for (let i = 0; i < len; i++) out[i] = carrier(i) * Math.exp(-i / TAU);
  return out;
}

// The synthetic hit: one pluck at the note's pitch.
export const pluck = (n) => burst((i) => Math.sin((2 * Math.PI * F0 * i) / SR), n);

// The real note's attack, cut to the same burst. The pick transient is at index 0
// (onset ~1.9 ms), so decay starts where the note does; what it removes is the
// 683 ms of ring that follows. Every harmonic the pick threw is still in here.
export const guitarBurst = (guitar, n) => burst((i) => guitar[i] || 0, n);

// Same math throughout; these just start the two knobs differently. Echo shows
// the whole lesson; slapback = one quick doubling; ambient = a long tail near
// self-oscillation. Slapback and ambient are settings, not products, so they
// share echo's chassis in a different colour.
const DELAY_TECH = "y[n] = x[n] + fb·y[n−D]";
export const DELAYS = [
  new DelayPedal({
    id: "echo",
    search: ["delay", "repeat", "tape echo"],
    tech: DELAY_TECH,
    outnar: "a fading train of repeats",
    time: 160,
    feedback: 0.45,
    // The Boss DM-2: dark green, three knobs.
    art: { shape: "box", hue: "#2f6b4a", knobs: 3 },
  }),
  new DelayPedal({
    id: "slapback",
    search: ["delay", "doubling", "rockabilly"],
    tech: DELAY_TECH,
    outnar: "one quick slap",
    time: 90,
    feedback: 0.15,
    art: { shape: "box", hue: "#8d9aa8", knobs: 3 },
  }),
  new DelayPedal({
    id: "ambient",
    search: ["reverb", "hall", "verb", "wash", "shimmer"],
    tech: DELAY_TECH,
    outnar: "a long, smeared tail",
    time: 240,
    feedback: 0.7,
    art: { shape: "box", hue: "#b9c2c8", knobs: 3 },
  }),
];
