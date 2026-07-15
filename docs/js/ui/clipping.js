// Clipping-family VIEW (overdrive / distortion / fuzz): only the UI. What a
// clipping pedal IS — its transfer curve out = f(drive·x + bias), and how it
// processes a buffer — lives on the ClippingPedal instances in pedals.js. This
// module renders them: the transfer-curve center panel, the harmonic-stem
// spectrum, the drive/bias controls, and the WaveShaper audio node. The analysis
// core (FFT/spectrum, windowing) comes from dsp.js.

import { F0, FMAX, KBIN, N, SR, specDb, windowed } from "../dsp.js";
import { CLIPPING } from "../pedals.js";

export default {
  id: "clipping",
  navLabel: "clipping",
  pageTitle: "pedal demo",
  dual: "⇅ same signal — time above, spectrum below",
  vinDefault: 0,
  voutDefault: 0.8,
  pedals: CLIPPING,
  centerTitle: "the pedal bends every sample",
  spectrumTitle: "new harmonics — the tone you hear",

  // No control defaults on the pedals: switching pedals swaps only the knee shape
  // + labels and leaves drive/bias where the user left them. The first pedal's
  // drive still seeds the initial slider value via the control's `def` below.
  controls: [
    { id: "drive", label: "drive", min: 1, max: 40, step: 0.1, def: CLIPPING[0].drive, fmt: (v) => v.toFixed(1) },
    {
      id: "bias",
      label: "bias",
      min: -3,
      max: 3,
      step: 0.05,
      def: 0,
      fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2),
    },
  ],

  // center panel: the transfer curve itself, with y=x reference + zero axes
  drawCenter(F, pedal, params, H) {
    const { g, L, R, T, B } = F;
    const { GRID, ZERO, ACCENT } = H.colors;
    const nl = pedal.curve(params);
    const sx = (x) => L + ((x + 1) / 2) * (R - L),
      sy = (y) => B - ((y + 1) / 2) * (B - T);
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(sx(0), T);
    g.lineTo(sx(0), B);
    g.moveTo(L, sy(0));
    g.lineTo(R, sy(0));
    g.stroke();
    g.strokeStyle = ZERO;
    g.beginPath();
    g.moveTo(sx(-1), sy(-1));
    g.lineTo(sx(1), sy(1));
    g.stroke();
    const xs = [],
      ys = [];
    for (let i = 0; i <= 400; i++) {
      const x = -1 + (2 * i) / 400;
      xs.push(x);
      ys.push(nl(x));
    }
    H.line(g, xs, ys, sx, sy, ACCENT, 2.5);
    H.txt(g, "+1", L - 5, sy(1), "end", "middle");
    H.txt(g, "0", L - 5, sy(0), "end", "middle");
    H.txt(g, "-1", L - 5, sy(-1), "end", "middle");
    H.txt(g, "-1", sx(-1), B + 3, "start", "top");
    H.txt(g, "+1", sx(1), B + 3, "end", "top");
    H.titles(g, F, "output", "input");
  },

  // sine → clean line spectrum on exact harmonic bins; guitar → continuous curves
  drawSpec(F, inp, out, _pedal, src, H) {
    if (src === "guitar") drawSpecCont(F, inp, out, H);
    else drawSpecStems(F, specDb(inp), specDb(out), H);
  },

  // WaveShaper wet path: the same curve the panel draws, minus its DC offset (a
  // coupling cap), then a trim that peak-matches wet to dry.
  buildAudio(actx, inGain, _H) {
    const shaper = actx.createWaveShaper();
    shaper.oversample = "4x";
    const wetTrim = actx.createGain();
    inGain.connect(shaper).connect(wetTrim);
    const makeCurve = (pedal, params, outDc) => {
      const n = 1024,
        a = new Float32Array(n),
        nl = pedal.curve(params);
      for (let i = 0; i < n; i++) {
        const x = -1 + (2 * i) / (n - 1);
        a[i] = nl(x) - outDc;
      }
      return a;
    };
    return {
      wetOut: wetTrim,
      update(pedal, params, state, match) {
        shaper.curve = makeCurve(pedal, params, state ? state.outDc : 0);
        wetTrim.gain.value = match;
      },
    };
  },
};

function drawSpecStems(F, dryDb, wetDb, H) {
  const { g, L, R, T, B } = F;
  const { DRY, WET, GRID } = H.colors;
  const nH = Math.floor(FMAX / F0); // harmonics of f0 that fit under FMAX
  const sx = (f) => L + (f / FMAX) * (R - L),
    sy = (db) => T + ((5 - db) / 85) * (B - T);
  // faint gridline on every harmonic k*f0 — so empty (even) slots read as empty
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  for (let k = 1; k <= nH; k++) {
    const px = sx(k * F0);
    g.beginPath();
    g.moveTo(px, T);
    g.lineTo(px, B);
    g.stroke();
  }
  for (let k = 1; k <= nH; k++) {
    const b = k * KBIN;
    if (wetDb[b] > -79) {
      g.strokeStyle = WET;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(sx(k * F0), sy(-80));
      g.lineTo(sx(k * F0), sy(wetDb[b]));
      g.stroke();
    }
  }
  for (let k = 1; k <= nH; k++) {
    const b = k * KBIN;
    if (dryDb[b] > -79) {
      g.strokeStyle = DRY;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx(k * F0) - 3, sy(dryDb[b]));
      g.lineTo(sx(k * F0) + 3, sy(dryDb[b]));
      g.stroke();
    }
  }
  H.txt(g, "0", L - 5, sy(0), "end", "middle");
  H.txt(g, "-40", L - 5, sy(-40), "end", "middle");
  H.txt(g, "-80", L - 5, sy(-80), "end", "middle");
  H.txt(g, "0", sx(0), B + 3, "start", "top");
  for (const f of [1000, 2000, 3000])
    H.txt(g, `${f / 1000}k`, sx(f), B + 3, "center", "top");
  H.titles(g, F, "dB", "frequency (Hz)");
}

// Guitar mode: the note already carries a full harmonic series, so draw dry vs
// wet as continuous spectra and let the gap show what the pedal piles on.
function drawSpecCont(F, inp, out, H) {
  const dry = specDb(windowed(inp)),
    wet = specDb(windowed(out));
  const { g, L, R, T, B } = F;
  const { DRY, WET, GRID } = H.colors;
  const df = SR / N,
    nb = Math.floor(FMAX / df);
  const sx = (f) => L + (f / FMAX) * (R - L),
    sy = (db) => T + ((5 - Math.max(-80, db)) / 85) * (B - T);
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  for (const f of [1000, 2000, 3000]) {
    g.beginPath();
    g.moveTo(sx(f), T);
    g.lineTo(sx(f), B);
    g.stroke();
  }
  const xs = [];
  for (let i = 1; i <= nb; i++) xs.push(i * df);
  H.line(g, xs, Array.from({ length: nb }, (_, i) => dry[i + 1]), sx, sy, DRY, 1);
  H.line(g, xs, Array.from({ length: nb }, (_, i) => wet[i + 1]), sx, sy, WET, 1.5);
  H.txt(g, "0", L - 5, sy(0), "end", "middle");
  H.txt(g, "-40", L - 5, sy(-40), "end", "middle");
  H.txt(g, "-80", L - 5, sy(-80), "end", "middle");
  H.txt(g, "0", sx(0), B + 3, "start", "top");
  for (const f of [1000, 2000, 3000])
    H.txt(g, `${f / 1000}k`, sx(f), B + 3, "center", "top");
  H.titles(g, F, "dB", "frequency (Hz)");
}
