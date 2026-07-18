// What a pedal is, family-agnostic. No DOM/canvas/Web Audio, so it runs under
// `node --test`. The generic engines process() leans on live in ../dsp.js; the
// per-family UI lives in the view modules (ui/clipping.js, ui/delay.js, …).
import { GOFF, KBIN, N, SPAN } from "../dsp.js";

// One Pedal instance = one button on one page. A subclass supplies the family's
// shared behaviour; each instance supplies only what makes it that pedal — its
// curve, formula, starting knobs. Defaults below suit a per-sample effect; a
// time-based one overrides them.
export class Pedal {
  sampleCount = N;
  spanSamples = SPAN;
  // Knobs to snap to when selected; a knob left out keeps the user's value.
  defaults = {};

  // `tech`: the operation, the OPERATION column on both pages. `outnar`: the
  // waveform claim, one of the bench's two (ui/rows.js resolves the pair). Signal
  // class (NL/LTI/LTV) is deliberately NOT here — constant per family, so it belongs
  // to the view's lesson.
  //
  // `whatChanges`: a pedal's per-pedal spectrum headline, which the family feeds to
  // spectrumTitle (clipping and modulation, whose spectra differ across their pedals).
  // Delay's spectrum is one claim per family, set on the view, so it leaves this blank.
  //
  // `techNote` reads `tech` back in English, one altitude down from the formula.
  // Optional: present only where a family's pedals differ IN the formula (clipping,
  // modulation), absent where they share one `tech` (delay). Empty renders as no
  // line (.catnote:empty in the stylesheet).
  //
  // `search`: alternate names this pedal answers to (labels are generic, a real
  // name is usually a brand's — "reverb" means ambient, "vibrato" means warble).
  //
  // `art`: how this pedal draws as a toy in the bench row — {shape, hue, knobs}.
  // Geometry lives in ui/art.js; only WHICH pedal it looks like is declared here.
  // `knobs` is the real box's count, deliberately NOT this page's slider count.
  constructor({
    id,
    label = id,
    tech = "",
    techNote = "",
    outnar = "",
    whatChanges = "",
    search = [],
    art = null,
  }) {
    Object.assign(this, {
      id,
      label,
      tech,
      techNote,
      outnar,
      whatChanges,
      search,
      art,
    });
  }

  // Default input: an exact integer number of sine periods (clean line spectrum,
  // no FFT leakage), or a slice of the real note past the pick attack. A pedal
  // needing a different signal (a delay needs a transient) overrides this.
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
