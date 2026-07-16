// ---- clipping family (overdrive / distortion / fuzz) -----------------------
// The transfer curve IS the pedal. Every instance shares the same two controls --
// drive (gain into the knee -> harmonics) and bias (offset -> breaks the odd
// symmetry, so even harmonics appear; bias=0 -> odd only) -- and differs only in
// the knee SHAPE. Each fn is PURE: (x, drive, bias) -> y.
import { shapeSignal } from "../dsp.js";
import { Pedal } from "./base.js";

export class ClippingPedal extends Pedal {
  constructor({ drive, fn, ...opts }) {
    super(opts);
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

// Adding a pedal = one entry here. Same knee-shape lesson, three shapes: soft,
// rounded knee (tanh) = overdrive; hard corner that flattens to the rails (clip)
// = distortion, so the wave squares off; that same corner driven harder with
// lopsided rails = fuzz (near-square, strong even + odd harmonics).
export const CLIPPING = [
  new ClippingPedal({
    id: "overdrive",
    search: ["od", "tube screamer", "boost", "crunch"],
    outnar: "the peaks get clipped",
    tech: "tanh(drive·x + bias)",
    whatChanges: "soft knee; harmonics roll off gently",
    drive: 6,
    fn: (x, drive, bias) => Math.tanh(drive * x + bias),
  }),
  new ClippingPedal({
    id: "distortion",
    search: ["dist", "gain", "metal"],
    outnar: "the peaks get squared off",
    tech: "clip(drive·x + bias)",
    whatChanges: "hard corners; strong high harmonics",
    drive: 4,
    fn: (x, drive, bias) => Math.max(-1, Math.min(1, drive * x + bias)),
  }),
  // Rails clip at different levels (+1 vs -0.6): asymmetry like a real transistor
  // fuzz -> strong even AND odd harmonics, and a visibly lopsided curve. Higher
  // default drive slams it near-square. bias still slides it for even more.
  new ClippingPedal({
    id: "fuzz",
    search: ["fuzz face", "big muff", "octavia"],
    outnar: "the wave collapses to a square",
    tech: "clip(drive·x + bias) · asym",
    whatChanges: "near-square wave; lopsided rails add even harmonics",
    drive: 10,
    fn: (x, drive, bias) => Math.max(-0.6, Math.min(1, drive * x + bias)),
  }),
];
