// The chart primitives and palette every canvas on this site is painted with —
// the bundle an effect's draw hooks get handed as `H`: low-level marks (line, txt,
// axes) plus the shared chart furniture (dbLadder) that gives the frequency panels
// their analyzer identity in one place. Shared by the rig (harness.js) and the
// catalog page (thumb.js) so both draw the same curves in the same green.
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
// either, so there's no second copy to drift from. Titles ride brighter than the
// ticks — they carry the axis's identity (quantity, unit, direction), the cue that
// tells a time panel from a frequency one.
const AXIS = "#aab393",
  AXTITLE = "#c6cfb5";

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
// Sample a pure fn over [from,to] and stroke it — the curve every center panel
// draws (a transfer curve, an LFO, a swept delay), fixed at 400 steps so all three
// read at the same resolution. The one bit of drawCenter that was copied verbatim.
export function plotCurve(g, from, to, fn, sx, sy, color, width) {
  const n = 400,
    xs = new Array(n + 1),
    ys = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    xs[i] = t;
    ys[i] = fn(t);
  }
  line(g, xs, ys, sx, sy, color || colors.ACCENT, width || 2.5);
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

// The frequency panels' dB ladder — the analyzer's furniture, in one place so all
// four charts can't drift. Dashed reference rules at `levels`, plus an optional
// solid `floor` in the zero-line ink. This grid of stacked levels is the cue that
// tells a frequency panel from a time scope: a scope draws one centre line and
// swings around it; an analyzer measures against a descending ladder. `sy` maps
// dB → pixel; the family owns the levels (a spectrum hangs from 0; a comb brackets
// unity ±). Pass `labeled` to also print each level (and the floor) up the left
// edge — the tick column the spectra used to spell out by hand; a comb labels its
// rungs itself (it wants a "0" the ladder has no rule for) so it leaves this off.
export function dbLadder(g, F, sy, levels, floor, labeled) {
  g.lineWidth = 1;
  g.strokeStyle = colors.GRID;
  g.setLineDash([2, 3]);
  for (const db of levels) {
    g.beginPath();
    g.moveTo(F.L, sy(db));
    g.lineTo(F.R, sy(db));
    g.stroke();
  }
  g.setLineDash([]);
  if (floor != null) {
    g.strokeStyle = colors.ZERO;
    g.beginPath();
    g.moveTo(F.L, sy(floor));
    g.lineTo(F.R, sy(floor));
    g.stroke();
  }
  if (labeled) {
    for (const db of levels) txt(g, `${db}`, F.L - 5, sy(db), "end", "middle");
    if (floor != null) txt(g, `${floor}`, F.L - 5, sy(floor), "end", "middle");
  }
}

// A scope's zero line — the furniture that partners dbLadder. A time panel swings
// or rests around this single line; a frequency panel measures against the ladder.
// Zero-line ink, so a family's baseline reads the same as the waveform's centre.
// `sy` maps value → pixel; `y` defaults to 0.
export function baseline(g, F, sy, y = 0) {
  g.strokeStyle = colors.ZERO;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(F.L, sy(y));
  g.lineTo(F.R, sy(y));
  g.stroke();
}

// The delay tap-train panel: a stem at every repeat rising from the zero baseline,
// the geometric-decay curve threaded faintly through their tops. Data-in — the
// family computes the stems (its impulse response) and the decay points; this owns
// only the drawing. `cfg`: { stems:[{ms,level}], decay:{xs,ys}|null, spanMs }.
export function tapTrain(F, cfg, H) {
  const { g, L, R, T, B } = F;
  const { ZERO, ACCENT } = H.colors;
  const sx = (ms) => L + (ms / cfg.spanMs) * (R - L),
    sy = (v) => B - v * (B - T - 6);
  baseline(g, F, sy);
  if (cfg.decay) line(g, cfg.decay.xs, cfg.decay.ys, sx, sy, ZERO, 1.5);
  for (const { ms, level } of cfg.stems) {
    g.strokeStyle = ACCENT;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(sx(ms), sy(0));
    g.lineTo(sx(ms), sy(level));
    g.stroke();
  }
  txt(g, "1", L - 5, sy(1), "end", "middle");
  txt(g, "0", L - 5, sy(0), "end", "middle");
  txt(g, "0", sx(0), B + 3, "start", "top");
  txt(g, cfg.spanMs.toFixed(0), sx(cfg.spanMs), B + 3, "end", "top");
  titles(g, F, "tap level", "time (ms)");
}

// The wet-vs-dry envelope panel: two loudness contours over a time axis. Shared by
// the delay family (transients, dry dashed on top so it isn't buried by the wet it
// hides under until the first repeat) and the modulated-delay family (a sustained
// carrier, wet on top). Data-in: `cfg` = { dry, wet, spanMs, yMax=1, dryDashed }.
export function envelopePanel(F, cfg, H) {
  const { g, L, R, T, B } = F;
  const { DRY, WET } = H.colors;
  const n = cfg.wet.length,
    yMax = cfg.yMax ?? 1;
  const sx = (i) => L + (i / n) * (R - L),
    sy = (v) => B - Math.min(yMax, v) * ((B - T - 4) / yMax);
  const xs = new Array(n);
  for (let i = 0; i < n; i++) xs[i] = i;
  if (cfg.dryDashed) {
    line(g, xs, cfg.wet, sx, sy, WET, 2);
    g.setLineDash([6, 4]); // dashes only read on these smooth curves, not a ±1 wave
    line(g, xs, cfg.dry, sx, sy, DRY, 1.5);
    g.setLineDash([]);
  } else {
    line(g, xs, cfg.dry, sx, sy, DRY, 1.5);
    line(g, xs, cfg.wet, sx, sy, WET, 2);
  }
  txt(g, "1", L - 5, sy(1), "end", "middle");
  txt(g, "0", L - 5, sy(0), "end", "middle");
  txt(g, "0", sx(0), B + 3, "start", "top");
  txt(g, cfg.spanMs.toFixed(0), sx(n), B + 3, "end", "top");
  titles(g, F, "level", "time (ms)");
}

// The formula-curve center panel, shared by the two modulation families (the LFO
// and the swept delay both plot the pedal's own fn over a fixed time window). An
// ACCENT curve riding one or more GRID reference lines, with the axis labels and
// titles the rig shows and the thumbnail stubs out — so text goes through the
// passed H, geometry through the module primitives that always draw. Data-in: cfg =
// { sx, sy, from, to, curve, refs:[{v,label}], yLabels:[{v,label}], ytitle, xtitle }.
// `refs` draw a rule and label it; `yLabels` label a level with no rule (an axis end
// the sweep never reaches). Clipping keeps its own drawCenter — its bipolar axes and
// y=x diagonal don't fit this mould — but shares plotCurve for the curve itself.
export function curvePanel(F, cfg, H) {
  const { g, L, R, B } = F;
  const { GRID, ACCENT } = H.colors;
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  g.beginPath();
  for (const r of cfg.refs ?? []) {
    g.moveTo(L, cfg.sy(r.v));
    g.lineTo(R, cfg.sy(r.v));
  }
  g.stroke();
  plotCurve(g, cfg.from, cfg.to, cfg.curve, cfg.sx, cfg.sy, ACCENT, 2.5);
  for (const { v, label } of [...(cfg.refs ?? []), ...(cfg.yLabels ?? [])])
    H.txt(g, label, L - 5, cfg.sy(v), "end", "middle");
  H.txt(g, "0", cfg.sx(cfg.from), B + 3, "start", "top");
  H.txt(g, `${Math.round(cfg.to)}`, cfg.sx(cfg.to), B + 3, "end", "top");
  H.titles(g, F, cfg.ytitle, cfg.xtitle);
}

// The helper bundle handed to an effect's draw/audio hooks: drawing primitives,
// chart furniture (dbLadder/baseline), whole-panel renderers (tapTrain/
// envelopePanel), and the shared palette. (DSP + constants come from dsp.js.)
export const H = {
  line,
  plotCurve,
  txt,
  vtxt,
  titles,
  dbLadder,
  baseline,
  tapTrain,
  envelopePanel,
  curvePanel,
  colors,
};
