// ---- clipping family (overdrive / distortion / fuzz) -----------------------
// The transfer curve IS the pedal. Two controls: drive (gain into the knee ->
// harmonics) and bias (offset -> breaks odd symmetry, so even harmonics appear;
// bias=0 -> odd only). Instances differ only in knee SHAPE. Each fn is PURE.
import { shapeSignal } from "../dsp.js";
import { Pedal } from "./base.js";

export class ClippingPedal extends Pedal {
  // Only drive is a default (each pedal starts it where its knee reads clearest);
  // bias is deliberately absent, so it starts centred and moving it is the user's.
  constructor({ drive, fn, ...opts }) {
    super(opts);
    Object.assign(this, { drive, fn });
    this.defaults = { drive };
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

// Three knee shapes: soft/rounded (tanh) = overdrive; hard corner to the rails
// (clip) = distortion; that corner driven harder with lopsided rails = fuzz.
export const CLIPPING = [
  new ClippingPedal({
    id: "overdrive",
    search: ["od", "tube screamer", "boost", "crunch"],
    outnar: "the peaks get clipped",
    tech: "tanh(drive·x + bias)",
    techNote: "soft knee — the curve bends",
    whatChanges: "harmonics roll off gently",
    drive: 6,
    fn: (x, drive, bias) => Math.tanh(drive * x + bias),
    // The Boss OD-1: mustard, two knobs (level, overdrive — no tone).
    art: { shape: "box", hue: "#d8a83c", knobs: 2 },
  }),
  new ClippingPedal({
    id: "distortion",
    search: ["dist", "gain", "metal"],
    outnar: "the peaks get squared off",
    tech: "clip(drive·x + bias)",
    techNote: "hard corners — the curve hits a rail",
    whatChanges: "strong high harmonics",
    drive: 4,
    fn: (x, drive, bias) => Math.max(-1, Math.min(1, drive * x + bias)),
    // The Boss DS-1: orange, three knobs (tone, level, dist).
    art: { shape: "box", hue: "#e2622a", knobs: 3 },
  }),
  // Rails clip at different levels (+1 vs -0.6): asymmetry like a real transistor
  // fuzz -> strong even AND odd harmonics. Highest drive of the three.
  new ClippingPedal({
    id: "fuzz",
    search: ["fuzz face", "big muff", "octavia"],
    outnar: "the wave collapses to a square",
    tech: "clip(drive·x + bias) · asym",
    techNote: "hard corners, and the rails are uneven",
    whatChanges: "strong even harmonics as well as odd",
    drive: 10,
    fn: (x, drive, bias) => Math.max(-0.6, Math.min(1, drive * x + bias)),
    // The Fuzz Face: round enclosure, the one pedal here that breaks the chassis.
    art: { shape: "round", hue: "#1f6ea8", knobs: 2 },
  }),
];
