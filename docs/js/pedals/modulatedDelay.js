// ---- modulated-delay family (chorus / flanger) ------------------------------
// The delay family's equation with the delay TIME set moving: out[n] = x[n] +
// g·x[n−D(n)], D(n) = Dc + Da·sin(2π·rate·t). A copy this short (single-digit to
// low-tens of ms) is heard not as an echo but as a comb filter — sum a signal
// with a delayed copy and the frequencies where the two cancel are notched out.
// Sweep the delay and the notches slide, and the moving delay detunes the copy
// against the dry (a Doppler drift) — that drift is the shimmer. That's the whole
// family: chorus is a longer, gentler sweep; flanger a short one with deeper
// notches. LTV, like modulation, but the clock rides the delay, not the gain.
import { F0, GOFF, SR } from "../dsp.js";
import { Pedal } from "./base.js";

// ~1.37 s of 48 kHz audio (power of two), same as modulation: long enough to hold
// several LFO cycles and to resolve the sweep in the panels.
export const NCHORUS = 65536;
export const SPANMS_CHORUS = (NCHORUS / SR) * 1000;

// A swept delay can dip toward zero (a deep flanger sweep); the read never crosses
// it, so the copy stays a copy rather than the dry sample back at full.
export const DELAY_FLOOR_MS = 0.2;

export class ModulatedDelayPedal extends Pedal {
  sampleCount = NCHORUS;
  spanSamples = NCHORUS;

  // `centerMs`/`mix` are this pedal's identity (like clipping's fn): the delay the
  // sweep rides around and how loud the copy comes back. rate/depth are the knobs.
  constructor({ rate, depth, centerMs, mix, ...opts }) {
    super(opts);
    this.defaults = { rate, depth };
    Object.assign(this, { centerMs, mix });
  }

  // A steady tone at fixed pitch (n is sized for the LFO, not the carrier), or a
  // mid-note guitar slice — the same input modulation uses, so the sweep has one
  // partial to slide the comb across.
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

  // the delay time D(t) in ms, bound to the live knobs — drawn directly by the
  // TRANSFORM panel, sampled per index by process(). Floored so the picture and the
  // buffer agree on where a deep sweep bottoms out.
  curve(params) {
    const { rate, depth } = params;
    return (tMs) =>
      Math.max(
        DELAY_FLOOR_MS,
        this.centerMs + depth * Math.sin(2 * Math.PI * rate * (tMs / 1000)),
      );
  }

  // out = dry + g·(swept, interpolated copy). No peak-match (match=1): the comb
  // both cuts and boosts, and that gain ripple is the effect, not something to
  // normalize away.
  process(inp, params) {
    const out = sweptComb(inp, {
      centerSamp: (this.centerMs / 1000) * SR,
      depthSamp: (params.depth / 1000) * SR,
      rate: params.rate,
      mix: this.mix,
    });
    return { out, match: 1 };
  }
}

// ---- the modulated-delay family's pure DSP ---------------------------------

// y[n] = x[n] + mix·x[n−D(n)], D(n) = centerSamp + depthSamp·sin(2π·rate·n/SR),
// clamped to the floor. D is fractional, so the copy is read by linear
// interpolation between the two straddling samples — an integer tap would zipper as
// the read point slid. Pure: (Float64Array, params) -> Float64Array.
export function sweptComb(inp, { centerSamp, depthSamp, rate, mix }) {
  const n = inp.length,
    out = new Float64Array(n),
    floor = (DELAY_FLOOR_MS / 1000) * SR,
    w = (2 * Math.PI * rate) / SR;
  for (let i = 0; i < n; i++) {
    const D = Math.max(floor, centerSamp + depthSamp * Math.sin(w * i)),
      r = i - D; // fractional read index into the past
    let wet = 0;
    if (r >= 0) {
      const i0 = Math.floor(r),
        frac = r - i0,
        a = inp[i0],
        b = i0 + 1 < n ? inp[i0 + 1] : 0;
      wet = a + (b - a) * frac;
    }
    out[i] = inp[i] + mix * wet;
  }
  return out;
}

// The feedforward comb's magnitude response in dB: summing a signal with a copy
// delayed `delaySec` gives H(f) = 1 + mix·e^{−j2πf·D}, peaks of 1+mix where the
// copy lands in phase and notches of 1−mix where it lands inverted (f = (k+½)/D).
// The delay sets the tooth spacing (1/D apart), mix sets how deep they cut. Pure:
// (number, number, number) -> number (dB).
export function combResponseDb(freq, delaySec, mix) {
  const theta = 2 * Math.PI * freq * delaySec,
    re = 1 + mix * Math.cos(theta),
    im = -mix * Math.sin(theta);
  return 20 * Math.log10(Math.hypot(re, im));
}

// One equation throughout; these differ in how long the delay is and how loud the
// copy returns. Chorus: a mid-teens-ms delay, gentle mix, slow wide sweep — the
// classic thickening. Flanger: a very short delay, louder copy, so the teeth are
// few, wide, and deep — the metallic jet sweep.
const CHORUS_TECH = "y[n] = x[n] + g·x[n−D(n)]";
export const CHORUSES = [
  new ModulatedDelayPedal({
    id: "chorus",
    search: ["chorus", "doubler", "ensemble", "shimmer"],
    tech: CHORUS_TECH,
    techNote: "a short delay, swept slowly — the copy detunes and drifts",
    outnar: "the note thickens and shimmers",
    whatChanges: "a fine comb of gentle notches",
    centerMs: 9,
    mix: 0.5,
    rate: 0.8,
    depth: 6,
    // The Boss CE-2: pale blue-green, two knobs (rate, depth).
    art: { shape: "box", hue: "#2fae9e", knobs: 2 },
  }),
  new ModulatedDelayPedal({
    id: "flanger",
    search: ["flanger", "jet", "flange", "comb sweep"],
    tech: CHORUS_TECH,
    techNote: "a very short delay, swept — a few deep notches jet across",
    outnar: "a sweeping whoosh rides through the note",
    whatChanges: "a few deep notches, wide apart",
    centerMs: 4,
    mix: 0.7,
    rate: 0.25,
    depth: 3,
    // The Boss BF-2: violet, three knobs shown (manual, depth, rate).
    art: { shape: "box", hue: "#c56ad0", knobs: 3 },
  }),
];
