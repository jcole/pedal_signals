// The pedal's own signature, drawn at row size — a transfer curve for a clipping
// pedal, a tap train for a delay, an LFO for a modulation.
//
// This is the catalog page's answer to the question the page exists for and had
// no way to take: what IS the difference between overdrive and distortion. The
// rows already said it twice in words — "soft knee — the curve bends" against
// "hard corners — the curve hits a rail" — and the words are correct and they
// don't land, because the difference between those two pedals is a SHAPE. The
// whole of what a clipping pedal is, is its knee. So the page draws the knee.
//
// It works because of where it sits rather than what it is: three curves in one
// aligned column, stacked, is a comparison you get by scanning. The bench can't
// do that at any price — it's one pedal at a time by construction, and A/B'ing
// two of them there costs you a click and asks you to hold the first in your head
// while you look at the second. Nothing is being explained here that the site
// didn't already say. It's being said in the one column where the three answers
// are on screen together.
//
// NOT a picture of a pedal — that's art.js, the toy Boss box in the bench's row,
// which is deliberately unreadable as a claim (see its note on why the knobs are
// dead). This is the opposite kind of drawing: it's the math, and it's the same
// math the rig runs. Same `drawCenter` hook the bench's centre panel calls, same
// pure `fn` off the same Pedal instance, same green. A checked-in PNG of these
// would be the one thing on a page that renders everything else from the live
// catalog that a tweaked `fn` could quietly make into a lie — the same argument
// pedals.html makes about not writing down a count.

import { frame, H } from "./draw.js";

// A thumbnail has no axis labels, so it reserves no room for any. Which is the
// entire difference between this drawing and the rig's — see draw.js's `frame`.
const PAD = 1;

// Square the plot for a family that asks (`thumbSquare`), by spending the slack
// on the sides rather than stretching the drawing into it.
//
// This is the one thing here that isn't family-blind, and it's a fact about the
// axes rather than a taste about the picture. A clipping pedal plots output
// against input — the same unit twice — so its panel means something at 1:1 and
// lies at 2.4:1: the reference line it's read against is y = x, which is only the
// 45° the eye checks against if the box is square. Squashed flat, overdrive's
// soft knee stands up nearly as steep as distortion's hard corner, which is the
// exact distinction the column exists to draw. Delay and modulation plot against
// time, where there's no diagonal to be wrong and wide is just more milliseconds.
//
// The rig gets away with the same squash on the same curve because it labels its
// axes -1/0/+1 and hands you the knob — nothing up there is inferred from the
// shape alone. Down here the shape is the whole message.
// The slack all goes on the right, so a squared drawing still starts at the same
// left edge as an unsquared one. Centring it looks tidier on its own and isn't:
// it insets clipping's three curves ~30px from a column that delay's and
// modulation's six fill, and from the SHAPE that names it — so the one column on
// the page whose entire job is that things line up in it wouldn't.
function marginsFor(view, cv) {
  if (!view.thumbSquare) return { L: PAD, R: PAD, T: PAD, B: PAD };
  const side = cv.clientHeight - 2 * PAD;
  return { L: PAD, R: Math.max(PAD, cv.clientWidth - side - PAD), T: PAD, B: PAD };
}

// The same bundle the rig hands a view, with the text primitives struck out.
//
// This is what makes the reuse honest rather than a coincidence. Every family's
// drawCenter has the same shape: lay out the geometry through {g,L,R,T,B} and
// H.line, then label the axes with H.txt/H.titles at the end. So a bundle whose
// text primitives do nothing gets the geometry and only the geometry — the curve,
// its grid, its reference line — with no per-family knowledge here at all, and no
// `if (thumbnail)` branch over there. A family added later draws its own
// thumbnail on arrival, having done nothing to earn one.
//
// Struck out rather than sized down: at 48px there is no room for a "+1" that
// isn't touching the curve, and a label you can't read is ink on top of the one
// thing the reader IS meant to read. The row says the numbers in words anyway.
const NOOP = () => {};
const THUMB_H = { ...H, txt: NOOP, vtxt: NOOP, titles: NOOP };

// Where a pedal's knobs sit the moment you select it on the bench — which is what
// the thumbnail has to draw, or it's a picture of a pedal you can't get to. Same
// composition setPedal() does: the family's controls supply the starting value
// for every knob, and then the pedal overrides the ones it declares (a clipping
// pedal declares only `drive`, so `bias` stays at the family's centred 0).
function paramsFor(view, pedal) {
  const params = {};
  for (const c of view.controls) params[c.id] = c.def;
  return { ...params, ...pedal.defaults };
}

// Draw one pedal into one canvas. Separate from the element that holds it because
// a canvas can only be drawn once it has been laid out — it takes its size from
// its CSS box, and asks the box for it. See mountCatalog.
//
// `params` is for the rig's rail, which draws this same thumbnail live: the knobs
// are right there under it, and a curve that ignored them would be the only dead
// control on the page. The catalog passes none and gets paramsFor() — the knobs
// as you'd find them on arrival, which is the only honest answer on a page with
// no knobs to read.
export function drawThumb(cv, view, pedal, params) {
  if (!cv.clientWidth) return; // not laid out (or display:none) — nothing to size to
  const F = frame(cv, marginsFor(view, cv));
  view.drawCenter(F, pedal, params ?? paramsFor(view, pedal), THUMB_H);
}

// aria-hidden, and it carries no label: the row it sits in is already the pedal's
// name, its formula, and the plain-English reading of that formula. A screen
// reader gets all three. What this adds is available to a pair of eyes and to
// nothing else, and a canvas that announced itself could only announce one of the
// three things the row has already said better.
export function thumbCanvas() {
  const cv = document.createElement("canvas");
  cv.className = "catthumb";
  cv.setAttribute("aria-hidden", "true");
  return cv;
}
