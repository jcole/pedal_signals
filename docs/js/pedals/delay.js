// ---- delay family (echo / slapback / ambient) ------------------------------
// The first pedal that doesn't fit the transfer-curve mould. A clipping pedal
// reshapes each sample in isolation (out = f(x)); a delay has MEMORY:
// out[n] = x[n] + fb·out[n−D], so a hit comes back D samples later, then fb·D
// later again — a train of repeats fading by the feedback ratio. All three
// instances run that same equation; they differ only in where the knobs start.
import { F0, SR } from "../dsp.js";
import { Pedal } from "./base.js";

// ~0.68 s of 48 kHz audio (power of two, though nothing here needs the FFT).
// Long enough to show a couple of repeats even at the longest delay time.
export const NLONG = 32768;
export const SPANMS = (NLONG / SR) * 1000;

export class DelayPedal extends Pedal {
  sampleCount = NLONG;
  spanSamples = NLONG;

  constructor({ time, feedback, ...opts }) {
    super(opts);
    this.defaults = { time, feedback };
  }

  // The base class's steady sine is useless here (a delayed copy of a continuous
  // tone just overlaps the original), and so is the raw note, for the same reason
  // — it just takes 683 ms to say so. Both sources are the same burst: a hit,
  // then silence for it to come back into. Only the carrier differs.
  genInput({ srcMode, guitar, n }) {
    return srcMode === "guitar" && guitar ? guitarBurst(guitar, n) : pluck(n);
  }

  // out = dry + geometric repeats. No peak-match (match=1): the whole point is
  // that the echoes are visibly *lower* than the dry hit.
  process(inp, params) {
    const D = (params.time / 1000) * SR;
    return { out: echo(inp, D, params.feedback), match: 1 };
  }
}

// ---- the delay family's pure DSP -------------------------------------------

// y[n] = x[n] + fb·y[n−D]. The dry signal rides through at unity (the y=x term)
// and each repeat is the previous output tapped D samples back and scaled by fb,
// so repeats decay geometrically. fb must stay < 1 or the tail never dies.
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

// The level below which a repeat is too quiet to be worth drawing — or waiting
// for. The tap train stops here, and the live source sizes its silent gap by it.
export const TAP_FLOOR = 0.02;

// The idealized impulse response of that same equation: a single unit hit in ->
// stems at 0, D, 2D, … with heights 1, fb, fb², …  Returned as {ms, level} pairs
// (level above `floor`, and inside `spanMs`) so a panel can draw the tap train.
export function impulseResponse(delayMs, feedback, spanMs, floor = TAP_FLOOR) {
  const taps = [];
  for (let k = 0, level = 1; k * delayMs <= spanMs; k++, level *= feedback) {
    if (level < floor) break;
    taps.push({ ms: k * delayMs, level });
    if (feedback <= 0) break; // fb=0 -> only the dry tap
  }
  return taps;
}

// How long the hit itself lasts. Exported because a caller spacing plucks apart
// has to outlast the pluck as well as its echoes.
export const PLUCK_MS = 70;

// The decay of the hit itself, ~12 ms — fast enough that the burst is over well
// inside PLUCK_MS, so even the shortest delay time lands its repeat in clear air.
const TAU = 0.012 * SR;

// The transient a delay needs to make repeats visible (and the "hit" the
// impulse-response panel idealizes): whatever you're playing, cut to a single
// decaying burst and silent after PLUCK_MS, so each echo lands in clear air.
//
// This is the family's ONE envelope, and both sources go through it. The shape
// is the lesson — a hit, then room for it to come back — and it can't be the
// sine's private property, because a source the shape doesn't apply to shows a
// different pedal. A sustained input has its repeats land on a note that's still
// ringing: no train, nothing for the panel above to draw, and the headline "a
// fading train of repeats" describes something that isn't in the signal.
// `carrier` is what's playing; this decides how long you hear it.
export function burst(carrier, n) {
  const out = new Float64Array(n),
    len = Math.min(n, Math.round((PLUCK_MS / 1000) * SR));
  for (let i = 0; i < len; i++) out[i] = carrier(i) * Math.exp(-i / TAU);
  return out;
}

// The synthetic hit: one pluck at the note's pitch.
export const pluck = (n) => burst((i) => Math.sin((2 * Math.PI * F0 * i) / SR), n);

// The real note's own attack, cut to the same burst. The recording's pick
// transient is at index 0 (onset ~1.9 ms), so the decay starts where the note
// does; what it removes is the 683 ms of ring that follows, which is the guitar
// being a guitar and is exactly what a delay lesson can't use. Every harmonic
// the pick threw is still in here — that's the reason the source exists.
export const guitarBurst = (guitar, n) => burst((i) => guitar[i] || 0, n);

// Same math throughout (y[n] = x[n] + fb·y[n−D]); these just start the two knobs
// somewhere different. Echo leads because it shows the whole lesson at once;
// slapback = one quick doubling; ambient = a long tail near self-oscillation.
//
// Their icons are the family's honest problem, the same one the tech column has:
// echo suggests a real box (the Boss DM-2), and the other two suggest nothing,
// because slapback and ambient are SETTINGS a player dials into a delay, not
// pedals a shop sells. So they're the same chassis in a different colour — which
// is what they are, and is the same answer this file already gives when all three
// rows print one identical formula.
const DELAY_TECH = "y[n] = x[n] + fb·y[n−D]";
export const DELAYS = [
  new DelayPedal({
    id: "echo",
    search: ["delay", "repeat", "tape echo"],
    tech: DELAY_TECH,
    outnar: "a fading train of repeats",
    whatChanges: "envelope, seconds-wide; no new frequencies",
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
    whatChanges: "one short repeat; reads as thickening, not echo",
    time: 90,
    feedback: 0.15,
    art: { shape: "box", hue: "#8d9aa8", knobs: 3 },
  }),
  new DelayPedal({
    id: "ambient",
    search: ["reverb", "hall", "verb", "wash", "shimmer"],
    tech: DELAY_TECH,
    outnar: "a long, smeared tail",
    whatChanges: "long tail near self-oscillation; repeats blur together",
    time: 240,
    feedback: 0.7,
    art: { shape: "box", hue: "#b9c2c8", knobs: 3 },
  }),
];
