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
  // Knobs to snap to when this pedal is selected; a knob left out keeps whatever
  // value the user left on it. Per-knob on purpose — a pedal usually wants to
  // place the knob that defines it (a fuzz's drive) and leave the one the user is
  // experimenting with (bias) alone.
  defaults = {};

  // whatChanges is the one-line "and so the signal does THIS", and `tech` the
  // operation that does it. They're the two columns a pedal fills in under its
  // family's — on the catalog page for every pedal, in the bench's lede for the
  // one that's up (see ui/rows.js, which renders both). Mostly not on the rig:
  // the panels there caption their own charts, and whatChanges describes the
  // output, which is one panel's chart and not the other two's — a family whose
  // members differ in exactly that panel can point its spectrumTitle at this
  // line (clipping does), but that's the view's call, not this line's. It says
  // what the family's
  // mechanism DOES to the signal, never what the pedal's own maths looks like —
  // "hard corners" is the shape of distortion's knee, which is `techNote`'s job
  // below and the thing its siblings differ on, not a change to anything. The
  // blank each row fills in is the family's one-liner made specific: under
  // clipping's "it flattens the peaks", three answers to what the flattening
  // leaves behind. The family's signal class (NL, LTI, LTV) is deliberately NOT
  // here: it's constant across a family, so it belongs to the view's lesson, not
  // to each pedal.
  //
  // `techNote` reads `tech` back in English, and is the gloss under it in the
  // operation column — exactly what the family's formulaNote is to its formula
  // ("y[n] = f(x[n])" / "one sample in, one sample out, no memory"), one altitude
  // down. It's what makes the column legible to a reader who doesn't know the
  // notation: "tanh(drive·x + bias)" only says soft knee to someone who already
  // knows tanh, and the pedal a player would recognise from that phrase is the
  // one this row is about.
  //
  // Optional, and what decides it is whether a family's pedals differ IN the
  // formula. Clipping's and modulation's do, down to a single token — tanh vs
  // clip, sin vs square vs tri — so that token is carrying the whole difference
  // between three pedals while being the least readable thing on the row; those
  // six all have a note. Delay's three share one identical `tech`, so there's
  // nothing to gloss per row: the note would be the same sentence three times,
  // and it's already said once where it belongs, as the band's formulaNote
  // directly above them. An empty note renders as no line at all, not a blank
  // one (.catnote:empty in the stylesheet).
  //
  // `search` is the names this pedal answers to that aren't its label. The labels
  // are deliberately generic — a real pedal's name is usually a brand's — so the
  // word a player actually types is often not the one on the button: "reverb"
  // means ambient here, "vibrato" means warble. Without these the picker's search
  // misses exactly the queries it exists to serve.
  //
  // `art` is how this pedal is drawn as a toy in the bench row — {shape, hue,
  // knobs}, and nothing else, because the chassis is one drawing shared by all of
  // them (ui/art.js owns the geometry; that file is where the reasoning lives).
  // A spec and not a picture: the drawing is 40px of SVG and belongs to the view,
  // but WHICH pedal it looks like is this pedal's own fact, so it's declared here
  // where adding a pedal is still one entry.
  //
  // `hue` is the real box's colour, and it's the only thing carrying recognition
  // — at 40px the silhouette says "a pedal" and the colour says "which". `knobs`
  // is the real box's count, deliberately NOT this page's slider count: every
  // family here has exactly two sliders and most real pedals have three, so the
  // two numbers can't be reconciled and shouldn't be. They don't have to be,
  // because a knob at this size is unreadable, and the picture is never asked to
  // agree with the rig.
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
