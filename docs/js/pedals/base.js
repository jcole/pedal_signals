// What a pedal is, family-agnostic. Nothing in this file touches the DOM,
// canvas, or Web Audio, so all of it runs under `node --test`. The generic
// engines a family's process() leans on (shapeSignal, FFT/spectrum, windowing,
// envelope, WAV) live in ../dsp.js. The UI each family needs — panels,
// controls, the live audio graph — lives in the view modules (ui/clipping.js,
// ui/delay.js, ui/modulation.js) the harness renders through.
import { GOFF, KBIN, N, SPAN } from "../dsp.js";

// One Pedal instance = one button on one page. A subclass supplies the family's
// shared behaviour (its process(), its lesson's sizing); each instance supplies
// only what makes it that pedal — its curve, its formula, its starting knobs.
// The defaults below suit a per-sample effect; a time-based one overrides them.
export class Pedal {
  sampleCount = N;
  spanSamples = SPAN;
  // The input is a generated steady sine, so the view can redraw it analytically
  // (smooth at any width). A pedal that generates its own buffer clears this and
  // gets plotted sample-by-sample instead.
  analytic = true;
  srcTitles = { sine: "sine", guitar: "guitar · A3" };
  // Knobs to snap to when this pedal is selected; a knob left out keeps whatever
  // value the user left on it. Per-knob on purpose — a pedal usually wants to
  // place the knob that defines it (a fuzz's drive) and leave the one the user is
  // experimenting with (bias) alone.
  defaults = {};

  // whatChanges is the one-line "and so the signal does THIS", and `tech` the
  // operation that does it. They're the two columns a pedal fills in under its
  // family's — on the catalog page for every pedal, in the bench's lede for the
  // one that's up (see ui/rows.js, which renders both). Not on the rig: the
  // panels there caption their own charts, and whatChanges describes the output
  // wave, which is one panel's chart and not the other two's. The family's signal
  // class (NL, LTI, LTV) is deliberately NOT here: it's constant across a family,
  // so it belongs to the view's lesson, not to each pedal.
  //
  // `search` is the names this pedal answers to that aren't its label. The labels
  // are deliberately generic — a real pedal's name is usually a brand's — so the
  // word a player actually types is often not the one on the button: "reverb"
  // means ambient here, "vibrato" means warble. Without these the picker's search
  // misses exactly the queries it exists to serve.
  constructor({
    id,
    label = id,
    tech = "",
    outnar = "",
    whatChanges = "",
    search = [],
  }) {
    Object.assign(this, { id, label, tech, outnar, whatChanges, search });
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
