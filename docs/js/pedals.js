// Every pedal, side by side: what each one IS, and the math it runs. A pedal is
// an instance of Pedal — overdrive and slapback are peers here, whatever family
// they come from. Nothing in this file touches the DOM, canvas, or Web Audio, so
// all of it runs under `node --test`. The generic engines these feed (shapeSignal,
// which runs ANY curve, plus FFT/spectrum, windowing, envelope, WAV) live in
// dsp.js. The UI each family needs — panels, controls, the live audio graph —
// lives in the view modules (clipping.js, delay.js) the harness renders through.
import { N, SPAN, SR, F0, KBIN, GOFF, shapeSignal } from "./dsp.js";

// ---- what a pedal is -------------------------------------------------------
// One Pedal instance = one button on one page. A subclass supplies the family's
// shared behaviour (its process(), its lesson's sizing); each instance supplies
// only what makes it that pedal — its curve, its formula, its starting knobs.
// The defaults below suit a per-sample effect; a time-based one overrides them.
export class Pedal {
  sampleCount = N; // analysis buffer length
  spanSamples = SPAN; // samples drawn in the time panels
  // The input is a generated steady sine, so the view can redraw it analytically
  // (smooth at any width). A pedal that generates its own buffer clears this and
  // gets plotted sample-by-sample instead.
  analytic = true;
  srcTitles = { sine: "sine", guitar: "guitar · A3" };
  // Knobs to snap to when this pedal is selected. Empty = leave them where the
  // user left them, which is what the clipping family wants: switching there
  // swaps the knee shape and nothing else.
  defaults = {};

  constructor({ id, label = id, tech = "", outnar = "" }) {
    Object.assign(this, { id, label, tech, outnar });
  }

  // The default input: an exact integer number of sine periods (so the spectrum
  // is a clean line spectrum, no FFT leakage), or a slice of the real note taken
  // past the pick attack. A pedal whose lesson needs a different signal — a delay
  // needs a transient, since a steady tone can't show a repeat — overrides this.
  genInput({ srcMode, guitar, n }) {
    const inp = new Float64Array(n);
    const guitarOn = srcMode === "guitar" && guitar;
    for (let i = 0; i < n; i++) {
      inp[i] = guitarOn
        ? guitar[GOFF + i] || 0
        : Math.sin((2 * Math.PI * KBIN * i) / n);
    }
    return inp;
  }

  // (Float64Array, params) -> { out, match, state? }
  process() {
    throw new Error(`${this.id}: process() not implemented`);
  }
}

// ---- clipping family (overdrive / distortion / fuzz) -----------------------
// The transfer curve IS the pedal. Every instance shares the same two controls --
// drive (gain into the knee -> harmonics) and bias (offset -> breaks the odd
// symmetry, so even harmonics appear; bias=0 -> odd only) -- and differs only in
// the knee SHAPE. Each fn is PURE: (x, drive, bias) -> y.
export class ClippingPedal extends Pedal {
  constructor({ id, label, tech, outnar, drive, fn }) {
    super({ id, label, tech, outnar });
    Object.assign(this, { drive, fn });
  }

  // this pedal's curve bound to the live knobs — the panel draws the same one
  curve(params) {
    return (x) => this.fn(x, params.drive, params.bias);
  }

  // shape the input, drop DC, peak-match to input; hand the DC back so the audio
  // graph can strip it from the WaveShaper curve too.
  process(inp, params) {
    const { out, outDc, outMatch } = shapeSignal(inp, this.curve(params));
    return { out, match: outMatch, state: { outDc } };
  }
}

// ---- delay family (echo / slapback / ambient) ------------------------------
// The first pedal that doesn't fit the transfer-curve mould. A clipping pedal
// reshapes each sample in isolation (out = f(x)); a delay has MEMORY:
// out[n] = x[n] + fb·out[n−D], so a hit comes back D samples later, then fb·D
// later again — a train of repeats fading by the feedback ratio. All three
// instances run that same equation; they differ only in where the knobs start.

// ~0.68 s of 48 kHz audio (power of two, though nothing here needs the FFT).
// Long enough to show a couple of repeats even at the longest delay time.
export const NLONG = 32768;
export const SPANMS = (NLONG / SR) * 1000;

export class DelayPedal extends Pedal {
  sampleCount = NLONG;
  spanSamples = NLONG;
  analytic = false; // the input is a pluck we generate — plot the real samples
  // Still the synthetic-vs-real axis the clipping demo uses: the synthetic source
  // is the same sine at the same pitch, just enveloped into a burst.
  srcTitles = { sine: "sine burst", guitar: "guitar · A3" };

  constructor({ id, label, tech, outnar, time, feedback }) {
    super({ id, label, tech, outnar });
    this.defaults = { time, feedback };
  }

  // The harness's steady sine is useless here (a delayed copy of a continuous
  // tone just overlaps the original): synthetic -> a decaying pluck; guitar ->
  // the real note from its pick attack (offset 0), so the transient repeats too.
  genInput({ srcMode, guitar, n }) {
    if (srcMode === "guitar" && guitar) {
      const inp = new Float64Array(n);
      for (let i = 0; i < n; i++) inp[i] = guitar[i] || 0;
      return inp;
    }
    return pluck(n);
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

// The idealized impulse response of that same equation: a single unit hit in ->
// stems at 0, D, 2D, … with heights 1, fb, fb², …  Returned as {ms, level} pairs
// (level above `floor`, and inside `spanMs`) so a panel can draw the tap train.
export function impulseResponse(delayMs, feedback, spanMs, floor = 0.02) {
  const taps = [];
  for (let k = 0, level = 1; k * delayMs <= spanMs; k++, level *= feedback) {
    if (level < floor) break;
    taps.push({ ms: k * delayMs, level });
    if (feedback <= 0) break; // fb=0 -> only the dry tap
  }
  return taps;
}

// A short decaying tone-burst: the transient a delay needs to make repeats
// visible (and the "hit" the impulse-response panel idealizes). One pluck at the
// note's pitch, ~12 ms decay, silent after ~70 ms so echoes land in clear air.
export function pluck(n) {
  const out = new Float64Array(n),
    tau = 0.012 * SR,
    len = Math.min(n, Math.round(0.07 * SR));
  for (let i = 0; i < len; i++)
    out[i] = Math.sin((2 * Math.PI * F0 * i) / SR) * Math.exp(-i / tau);
  return out;
}

// ---- the pedals ------------------------------------------------------------
// Adding a pedal = one entry here. Same knee-shape lesson, three shapes: soft,
// rounded knee (tanh) = overdrive; hard corner that flattens to the rails (clip)
// = distortion, so the wave squares off; that same corner driven harder with
// lopsided rails = fuzz (near-square, strong even + odd harmonics).
export const CLIPPING = [
  new ClippingPedal({
    id: "overdrive",
    outnar: "the peaks get clipped",
    tech: "tanh(drive·x + bias)",
    drive: 6,
    fn: (x, drive, bias) => Math.tanh(drive * x + bias),
  }),
  new ClippingPedal({
    id: "distortion",
    outnar: "the peaks get squared off",
    tech: "clip(drive·x + bias)",
    drive: 4,
    fn: (x, drive, bias) => Math.max(-1, Math.min(1, drive * x + bias)),
  }),
  // Rails clip at different levels (+1 vs -0.6): asymmetry like a real transistor
  // fuzz -> strong even AND odd harmonics, and a visibly lopsided curve. Higher
  // default drive slams it near-square. bias still slides it for even more.
  new ClippingPedal({
    id: "fuzz",
    outnar: "the wave collapses to a square",
    tech: "clip(drive·x + bias) · asym",
    drive: 10,
    fn: (x, drive, bias) => Math.max(-0.6, Math.min(1, drive * x + bias)),
  }),
];

// Same math throughout (y[n] = x[n] + fb·y[n−D]); these just start the two knobs
// somewhere different. Echo leads because it shows the whole lesson at once;
// slapback = one quick doubling; ambient = a long tail near self-oscillation.
const DELAY_TECH = "y[n] = x[n] + fb·y[n−D]";
export const DELAYS = [
  new DelayPedal({
    id: "echo",
    tech: DELAY_TECH,
    outnar: "a fading train of repeats",
    time: 160,
    feedback: 0.45,
  }),
  new DelayPedal({
    id: "slapback",
    tech: DELAY_TECH,
    outnar: "one quick slap",
    time: 90,
    feedback: 0.15,
  }),
  new DelayPedal({
    id: "ambient",
    tech: DELAY_TECH,
    outnar: "a long, smeared tail",
    time: 240,
    feedback: 0.7,
  }),
];

// every pedal, by id — the whole catalog, regardless of family
export const PEDALS = Object.fromEntries(
  [...CLIPPING, ...DELAYS].map((p) => [p.id, p]),
);
