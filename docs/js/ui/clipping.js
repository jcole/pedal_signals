// Clipping-family VIEW (overdrive / distortion / fuzz): only the UI. The pedal
// model (transfer curve out = f(drive·x + bias), buffer processing) lives on
// ClippingPedal in pedals/; this module renders the transfer-curve panel, the
// harmonic-stem spectrum, the drive/bias controls, and the WaveShaper node.
// Analysis core (FFT/spectrum, windowing) from dsp.js.

import { F0, FMAX, KBIN, N, SR, specDb, windowed } from "../dsp.js";
import { CLIPPING } from "../pedals/index.js";

export default {
  id: "clipping",
  navLabel: "clipping",
  // A family only earns a chart for what it changes. Clipping peak-matches wet to
  // dry, so there's no envelope panel — level is the one thing it doesn't touch.
  // Pedal alone: clipping peak-matches wet to dry, so blending dry back in only
  // dilutes what the page is showing.
  blendDefault: 1,
  pedals: CLIPPING,
  // The one panel where the three pedals disagree — which harmonics each builds.
  // Headline is the pedal's whatChanges, not a second string beside it, so there's
  // only one copy to drift.
  spectrumTitle: (pedal) => pedal.whatChanges,
  spectrumTech: "spectrum",
  spectrumUnit: "dB",
  // Centre panel plots output vs input, same unit both axes, read against a y=x
  // at 45°. The thumbnail drops the axis labels, so a non-square box flattens this
  // family's distinction (a knee that bends vs one that corners). delay and
  // modulation plot against time, no diagonal, so they don't ask. See thumb.js.
  thumbSquare: true,

  lesson: {
    formula: "y[n] = f(x[n])",
    formulaNote: "one sample in, one sample out, no memory",
    // The family's signal class, named once here: same for all three.
    klass: "memoryless nonlinearity (NL)",
    oneLiner: "it flattens the peaks",
    body: `
      <h2>What's actually going on</h2>
      <p><strong>The pedal applies a fixed input→output curve.</strong> Below
      some level the curve is a straight line and nothing happens. Above it the
      curve bends over, so the tops of the wave get squashed. A squashed sine
      isn't a sine any more, and the only way to build a non-sine periodic wave
      is to add harmonics. So harmonics appear — at 2f₀, 3f₀, 4f₀ and up. The
      pitch does not change; the <em>period is identical</em>. Only the shape
      moved.</p>
      <p>Drive is just how hard you push the signal into the bend before the
      curve. A bend that rounds over gently is <em>soft clipping</em> — the
      overdrive's knee; a curve that runs straight into a corner and flattens
      against a rail is <em>hard clipping</em> — the distortion and the fuzz.
      (Builders use those same two words for the circuit that makes the shape:
      diodes to ground clip hard, diodes inside the op-amp's feedback loop clip
      soft.) Everything else — germanium vs silicon, LED vs diode, op-amp vs
      tube — is an argument about the exact shape of that bend.</p>
    `,
    aside: {
      title: "Why builders obsess over asymmetry",
      body: `
        <p>If your transfer curve is odd-symmetric — <code>f(−x) = −f(x)</code>
        — the maths guarantees you get <em>only odd harmonics</em>. 3f₀, 5f₀,
        7f₀. No 2f₀, no 4f₀. Odd harmonics on their own sound hollow and hard;
        that's the classic op-amp distortion character.</p>
        <p>Break the symmetry — clip the positive half harder than the
        negative, which is what an unmatched diode pair does — and even
        harmonics appear. The 2nd harmonic is an octave up, the 4th is two
        octaves. They're consonant. That is essentially all "tube warmth"
        means.</p>
      `,
    },
  },

  // Each pedal declares its own drive, so selecting one snaps that knob to its
  // knee. bias isn't declared, so it persists across a switch. `def` only seeds
  // the first render, before any pedal is selected.
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

  // WaveShaper wet path: the panel's curve minus its DC offset (a coupling cap),
  // then a trim that peak-matches wet to dry.
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
  // dB ladder + the floor the bins stand on — the analyzer furniture (see chart.js)
  H.dbLadder(g, F, sy, [0, -40], -80);
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
    H.txt(g, `${f / 1000}`, sx(f), B + 3, "center", "top");
  // ↓: level only ever falls from 0 dB toward the floor; →: frequency runs up.
  // kHz axis, so the ticks read 1/2/3 — see the tick labels above.
  H.titles(g, F, "level (dB) ↓", "frequency (kHz) →");
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
  // dB ladder + floor — the same analyzer furniture the stem view stands on
  H.dbLadder(g, F, sy, [0, -40], -80);
  const xs = [];
  for (let i = 1; i <= nb; i++) xs.push(i * df);
  H.line(g, xs, Array.from({ length: nb }, (_, i) => dry[i + 1]), sx, sy, DRY, 1);
  H.line(g, xs, Array.from({ length: nb }, (_, i) => wet[i + 1]), sx, sy, WET, 1.5);
  H.txt(g, "0", L - 5, sy(0), "end", "middle");
  H.txt(g, "-40", L - 5, sy(-40), "end", "middle");
  H.txt(g, "-80", L - 5, sy(-80), "end", "middle");
  H.txt(g, "0", sx(0), B + 3, "start", "top");
  for (const f of [1000, 2000, 3000])
    H.txt(g, `${f / 1000}`, sx(f), B + 3, "center", "top");
  // ↓: level only ever falls from 0 dB toward the floor; →: frequency runs up.
  // kHz axis, so the ticks read 1/2/3 — see the tick labels above.
  H.titles(g, F, "level (dB) ↓", "frequency (kHz) →");
}
