// The pedal's own signature, drawn at row size — a transfer curve for a clipping
// pedal, a tap train for a delay, an LFO for a modulation. Three curves stacked in
// one aligned column is a comparison you get by scanning, which the one-pedal-at-
// a-time bench can't do.
//
// NOT a picture of a pedal (that's art.js) — this is the live math, the same
// `drawCenter` hook and pure `fn` the rig runs, so a tweaked `fn` can't quietly
// make it lie the way a checked-in PNG could.

import { frame, H } from "./chart.js";

// A thumbnail has no axis labels, so it reserves no room for any — the whole
// difference between this drawing and the rig's (see chart.js's `frame`).
const PAD = 1;

// Square the plot for a family that asks (`thumbSquare`) by spending the slack on
// the right, not by stretching the drawing.
//
// A clipping pedal plots output against input — the same unit twice, read against
// y = x — so it means something at 1:1 and lies squashed: overdrive's soft knee
// stands up as steep as distortion's hard corner, the exact distinction the column
// draws. Delay and modulation plot against time, where wide is just more ms.
//
// Slack goes on the right so a squared drawing starts at the same left edge as an
// unsquared one — centring would inset clipping's curves from the column that must
// line up.
function marginsFor(view, cv) {
  if (!view.thumbSquare) return { L: PAD, R: PAD, T: PAD, B: PAD };
  const side = cv.clientHeight - 2 * PAD;
  return { L: PAD, R: Math.max(PAD, cv.clientWidth - side - PAD), T: PAD, B: PAD };
}

// The same bundle the rig hands a view, with the text primitives struck out. Every
// drawCenter lays out geometry through {g,L,R,T,B}+H.line then labels axes with
// H.txt/H.titles, so a bundle whose text primitives do nothing gets the geometry
// only, with no per-family branch here. Struck out rather than sized down: at 48px
// there's no room for a label that isn't touching the curve, and the row says the
// numbers in words anyway.
const NOOP = () => {};
const THUMB_H = { ...H, txt: NOOP, vtxt: NOOP, titles: NOOP };

// Where a pedal's knobs sit the moment you select it on the bench — same
// composition setPedal() does: the family's controls supply each knob's starting
// value, then the pedal overrides the ones it declares (a clipping pedal declares
// only `drive`, so `bias` stays at the family's centred 0).
function paramsFor(view, pedal) {
  const params = {};
  for (const c of view.controls) params[c.id] = c.def;
  return { ...params, ...pedal.defaults };
}

// Draw one pedal into one canvas. Separate from the element that holds it because
// a canvas takes its size from its CSS box and must be laid out first (see
// mountCatalog).
//
// `params` is for the rig's rail, which draws this thumbnail live off its knobs.
// The catalog passes none and gets paramsFor() — the knobs as you'd find them on
// arrival.
export function drawThumb(cv, view, pedal, params) {
  if (!cv.clientWidth) return; // not laid out (or display:none) — nothing to size to
  const F = frame(cv, marginsFor(view, cv));
  view.drawCenter(F, pedal, params ?? paramsFor(view, pedal), THUMB_H);
}

// aria-hidden with no label: the row already carries the pedal's name, formula,
// and plain-English reading, so a canvas that announced itself would only repeat
// one of them worse.
export function thumbCanvas() {
  const cv = document.createElement("canvas");
  cv.className = "catthumb";
  cv.setAttribute("aria-hidden", "true");
  return cv;
}
