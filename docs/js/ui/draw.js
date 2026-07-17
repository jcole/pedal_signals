// The drawing primitives and palette every canvas on this site is painted with —
// the bundle an effect's draw hooks get handed as `H`. Shared by the rig
// (harness.js) and the catalog page (thumb.js) so both draw the same curves in
// the same green.
//
// The plot margins do NOT belong here: the rig reserves 40px on the left for axis
// labels, a 48px thumbnail has none to give, so `frame` takes them as an argument.

// ---- colors (shared palette; effects read ACCENT for their center curve) ----
// styles.css owns these; read them off :root so the canvas strokes and the
// legend words in the panel headers can't drift. The literals are fallbacks for a
// missing/unparsed stylesheet only — keep them equal to the CSS.
const css = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;
export const colors = {
  DRY: css("--dry", "#9aa0a6"),
  WET: css("--wet", "#dd7048"),
  ACCENT: css("--accent-lo", "#7fa650"),
  GRID: css("--grid", "#2c3125"),
  ZERO: css("--zero", "#3a4030"),
};

// Axis ink. Not in the palette or stylesheet: nothing outside a canvas paints
// either, so there's no second copy to drift from.
const AXIS = "#6b7361",
  AXTITLE = "#525a4a";

// Size a canvas to its CSS box, scale for the display, and return the plot rect
// inside the margins `m`. Margins are the caller's: the rig spends them on axis
// labels, a thumbnail on nothing.
export function frame(cv, m) {
  const dpr = devicePixelRatio || 1,
    w = cv.clientWidth,
    h = cv.clientHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h, L: m.L, R: w - m.R, T: m.T, B: h - m.B };
}

export function line(g, xs, ys, sx, sy, color, width) {
  g.strokeStyle = color;
  g.lineWidth = width || 1.5;
  g.beginPath();
  for (let i = 0; i < xs.length; i++) {
    const px = sx(xs[i]),
      py = sy(ys[i]);
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.stroke();
}
export function txt(g, s, x, y, align, base, color) {
  g.fillStyle = color || AXIS;
  g.font = "10px ui-monospace,Menlo,monospace";
  g.textAlign = align || "start";
  g.textBaseline = base || "alphabetic";
  g.fillText(s, x, y);
}
export function vtxt(g, s, x, y, color) {
  g.save();
  g.translate(x, y);
  g.rotate(-Math.PI / 2);
  txt(g, s, 0, 0, "center", "middle", color);
  g.restore();
}
// y-axis title (rotated) + x-axis title, shared by the signal panels
export function titles(g, F, ytitle, xtitle) {
  vtxt(g, ytitle, 11, (F.T + F.B) / 2, AXTITLE);
  txt(g, xtitle, (F.L + F.R) / 2, F.B + 13, "center", "top", AXTITLE);
}

// The helper bundle handed to an effect's draw/audio hooks: drawing primitives +
// shared palette. (DSP + constants come from dsp.js.)
export const H = { line, txt, vtxt, titles, colors };
