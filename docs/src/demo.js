// Demo glue: DOM, canvas drawing, Web Audio, and interaction. All the pure DSP
// (WAV parse, pedals, FFT, the shape/peak-match core) is imported from dsp.js so
// it can be unit-tested without a browser. This file owns everything that needs
// a real page: the panels, the transport, the audio node graph, the sliders.
import {
  SR,
  N,
  KBIN,
  F0,
  FMAX,
  CYCLES,
  SPAN,
  GOFF,
  MSMAX,
  parseWav,
  normalize,
  PEDALS,
  specDb,
  windowed,
  shapeSignal,
} from "./dsp.js";

// ---- colors ----------------------------------------------------------------
const DRY = "#9aa0a6",
  WET = "#C0522F",
  CURVE = "#7fa650",
  GRID = "#2c3125",
  ZERO = "#3a4030";

// ---- live UI state ---------------------------------------------------------
let level = 1.0,
  drive = 6,
  bias = 0;
let srcMode = "sine", // "sine" | "guitar"
  guitar = null; // Float32Array of the clean note, 48 kHz mono (loaded async below)
let pedal = "overdrive";
const nl = (x) => PEDALS[pedal].fn(x, drive, bias); // the current pedal, bound to live drive/bias

let outDc = 0,
  outMatch = 1; // DC offset + peak-match gain of current output (set each render)

// Load the real note straight from the WAV (no AudioContext needed for analysis).
const gbtn = () => document.querySelector('.srcbtn[data-src="guitar"]');
fetch("guitar_clean.wav")
  .then((r) => r.arrayBuffer())
  .then((b) => {
    guitar = normalize(parseWav(b)); // peak-normalize so it hits the pedal like the sine
    gbtn().disabled = false;
    gbtn().textContent = "guitar";
    render();
  })
  .catch(() => {
    gbtn().textContent = "guitar ✕";
  });

// ---- canvas plumbing -------------------------------------------------------
const C = {};
document.querySelectorAll("canvas").forEach((cv) => {
  C[cv.dataset.c] = cv;
});
const ML = 40,
  MR = 12,
  MT = 10,
  MB = 26; // plot margins reserved for axis labels
const AXIS = "#6b7361",
  AXTITLE = "#525a4a";
function frame(cv) {
  const dpr = devicePixelRatio || 1,
    w = cv.clientWidth,
    h = cv.clientHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h, L: ML, R: w - MR, T: MT, B: h - MB };
}
function line(g, xs, ys, sx, sy, color, width) {
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
function txt(g, s, x, y, align, base, color) {
  g.fillStyle = color || AXIS;
  g.font = "10px ui-monospace,Menlo,monospace";
  g.textAlign = align || "start";
  g.textBaseline = base || "alphabetic";
  g.fillText(s, x, y);
}
function vtxt(g, s, x, y, color) {
  g.save();
  g.translate(x, y);
  g.rotate(-Math.PI / 2);
  txt(g, s, 0, 0, "center", "middle", color);
  g.restore();
}
// y-axis title (rotated) + x-axis title, shared by the three signal panels
function titles(g, F, ytitle, xtitle) {
  vtxt(g, ytitle, 11, (F.T + F.B) / 2, AXTITLE);
  txt(g, xtitle, (F.L + F.R) / 2, F.B + 13, "center", "top", AXTITLE);
}

function render() {
  // one N-sample buffer, an exact integer number of periods -> clean line spectrum
  const inp = new Float64Array(N);
  const guitarOn = srcMode === "guitar" && guitar;
  for (let n = 0; n < N; n++) {
    inp[n] = guitarOn
      ? guitar[GOFF + n] || 0
      : level * Math.sin((2 * Math.PI * KBIN * n) / N);
  }
  // shape the input through the current pedal, drop DC, peak-match to input
  const shaped = shapeSignal(inp, nl);
  const out = shaped.out;
  outDc = shaped.outDc;
  outMatch = shaped.outMatch;

  drawInput(inp);
  drawCurve();
  drawTime(inp, out, outMatch);
  drawSpec(inp, out);
}

function drawInput(inp) {
  const F = frame(C.input),
    { g, L, R, T, B } = F;
  const sx = (t) => L + t * (R - L),
    sy = (y) => (T + B) / 2 - y * ((B - T) / 2 - 4);
  g.strokeStyle = ZERO;
  g.beginPath();
  g.moveTo(L, sy(0));
  g.lineTo(R, sy(0));
  g.stroke();
  const xs = [],
    ys = [];
  if (srcMode === "guitar" && guitar) {
    // the same SPAN-sample window the time panel shows, from the real note
    for (let i = 0; i < SPAN; i++) {
      xs.push(i / SPAN);
      ys.push(inp[i]);
    }
    line(g, xs, ys, sx, sy, DRY, 1.5);
  } else {
    for (let i = 0; i <= 400; i++) {
      const t = i / 400;
      xs.push(t);
      ys.push(level * Math.sin(2 * Math.PI * CYCLES * t));
    }
    line(g, xs, ys, sx, sy, DRY, 2);
  }
  txt(g, "+1", L - 5, sy(1), "end", "middle");
  txt(g, "0", L - 5, sy(0), "end", "middle");
  txt(g, "-1", L - 5, sy(-1), "end", "middle");
  txt(g, "0", sx(0), B + 3, "start", "top");
  txt(g, MSMAX.toFixed(0), sx(1), B + 3, "end", "top");
  titles(g, F, "amplitude", "time (ms)");
}
function drawCurve() {
  const F = frame(C.curve),
    { g, L, R, T, B } = F;
  const sx = (x) => L + ((x + 1) / 2) * (R - L),
    sy = (y) => B - ((y + 1) / 2) * (B - T);
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(sx(0), T);
  g.lineTo(sx(0), B);
  g.moveTo(L, sy(0));
  g.lineTo(R, sy(0));
  g.stroke(); // zero axes
  g.strokeStyle = ZERO;
  g.beginPath();
  g.moveTo(sx(-1), sy(-1));
  g.lineTo(sx(1), sy(1));
  g.stroke(); // y=x reference
  const xs = [],
    ys = [];
  for (let i = 0; i <= 400; i++) {
    const x = -1 + (2 * i) / 400;
    xs.push(x);
    ys.push(nl(x));
  }
  line(g, xs, ys, sx, sy, CURVE, 2.5);
  txt(g, "+1", L - 5, sy(1), "end", "middle");
  txt(g, "0", L - 5, sy(0), "end", "middle");
  txt(g, "-1", L - 5, sy(-1), "end", "middle");
  txt(g, "-1", sx(-1), B + 3, "start", "top");
  txt(g, "+1", sx(1), B + 3, "end", "top");
  titles(g, F, "output", "input");
}
function drawTime(inp, out, match) {
  const F = frame(C.time),
    { g, L, R, T, B } = F;
  const span = SPAN;
  const sx = (i) => L + (i / span) * (R - L),
    sy = (y) => (T + B) / 2 - y * ((B - T) / 2 - 4);
  g.strokeStyle = ZERO;
  g.beginPath();
  g.moveTo(L, sy(0));
  g.lineTo(R, sy(0));
  g.stroke();
  const xs = [],
    od = new Float64Array(span);
  for (let i = 0; i < span; i++) {
    xs.push(i);
    od[i] = out[i] * match;
  }
  line(g, xs, inp.subarray(0, span), sx, sy, DRY, 1.5);
  line(g, xs, od, sx, sy, WET, 2);
  txt(g, "+1", L - 5, sy(1), "end", "middle");
  txt(g, "0", L - 5, sy(0), "end", "middle");
  txt(g, "-1", L - 5, sy(-1), "end", "middle");
  txt(g, "0", sx(0), B + 3, "start", "top");
  txt(g, MSMAX.toFixed(0), sx(span), B + 3, "end", "top");
  titles(g, F, "amplitude", "time (ms)");
}
// sine → clean line spectrum on exact harmonic bins; guitar → continuous curves
function drawSpec(inp, out) {
  if (srcMode === "guitar" && guitar) drawSpecCont(inp, out);
  else drawSpecStems(specDb(inp), specDb(out));
}
function drawSpecStems(dryDb, wetDb) {
  const F = frame(C.spec),
    { g, L, R, T, B } = F;
  const nH = Math.floor(FMAX / F0); // number of harmonics of f0 that fit under FMAX
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
  // wet stems
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
  // dry marker (input has only the fundamental)
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
  txt(g, "0", L - 5, sy(0), "end", "middle");
  txt(g, "-40", L - 5, sy(-40), "end", "middle");
  txt(g, "-80", L - 5, sy(-80), "end", "middle");
  txt(g, "0", sx(0), B + 3, "start", "top");
  for (const f of [1000, 2000, 3000])
    txt(g, `${f / 1000}k`, sx(f), B + 3, "center", "top");
  titles(g, F, "dB", "frequency (Hz)");
}
// Guitar mode: the note already carries a full harmonic series, so the clean
// odd/even-only story doesn't apply. Draw dry vs wet as continuous spectra and
// let the gap show the harmonics + intermodulation the pedal piles on.
function drawSpecCont(inp, out) {
  const dry = specDb(windowed(inp)),
    wet = specDb(windowed(out));
  const F = frame(C.spec),
    { g, L, R, T, B } = F;
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
  line(g, xs, Array.from({ length: nb }, (_, i) => dry[i + 1]), sx, sy, DRY, 1);
  line(g, xs, Array.from({ length: nb }, (_, i) => wet[i + 1]), sx, sy, WET, 1.5);
  txt(g, "0", L - 5, sy(0), "end", "middle");
  txt(g, "-40", L - 5, sy(-40), "end", "middle");
  txt(g, "-80", L - 5, sy(-80), "end", "middle");
  txt(g, "0", sx(0), B + 3, "start", "top");
  for (const f of [1000, 2000, 3000])
    txt(g, `${f / 1000}k`, sx(f), B + 3, "center", "top");
  titles(g, F, "dB", "frequency (Hz)");
}

// ---- interaction -----------------------------------------------------------
let raf = 0;
function schedule() {
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0;
      render();
      updateAudio();
    });
}
const drvS = document.getElementById("drv"),
  drvO = document.getElementById("drvo");
const biaS = document.getElementById("bia"),
  biaO = document.getElementById("biao");
function setDrive(v) {
  drive = Math.max(1, Math.min(40, v));
  drvS.value = drive;
  drvO.textContent = drive.toFixed(1);
  schedule();
}
function setBias(v) {
  bias = Math.max(-3, Math.min(3, v));
  biaS.value = bias;
  biaO.textContent = (bias >= 0 ? "+" : "") + bias.toFixed(2);
  schedule();
}
drvS.oninput = (e) => setDrive(+e.target.value);
biaS.oninput = (e) => setBias(+e.target.value);

// input-source toggle: sine keeps the clean harmonic-generation lesson; guitar
// drives both the audio and the analysis panels from the real EGFxSet note
document.querySelectorAll(".srcbtn").forEach((b) => {
  b.onclick = () => {
    if (b.dataset.src === srcMode || b.disabled) return;
    srcMode = b.dataset.src;
    document
      .querySelectorAll(".srcbtn")
      .forEach((x) => {
        x.classList.toggle("active", x === b);
      });
    document.getElementById("inh3").textContent =
      srcMode === "guitar" ? "guitar · A3" : "sine";
    document.getElementById("gcredit").style.display =
      srcMode === "guitar" ? "" : "none";
    document.getElementById("replay").disabled = srcMode !== "guitar";
    if (actx) startSource();
    schedule();
  };
});

// pedal selector: swap the transfer curve (plus its formula, the output
// narrative, and the drive that lands on this pedal's sweet spot). nl() reads
// the registry, so render() and the audio graph pick up the new curve for free.
const pedTech = document.getElementById("pedtech"),
  outNar = document.getElementById("outnar");
function setPedal(id) {
  pedal = id;
  const p = PEDALS[id];
  document
    .querySelectorAll(".pedbtn")
    .forEach((b) => {
      b.classList.toggle("active", b.dataset.pedal === id);
    });
  pedTech.textContent = p.tech;
  outNar.textContent = p.outnar;
  setDrive(p.drive); // also calls schedule() -> render + updateAudio
}
document
  .querySelectorAll(".pedbtn")
  .forEach((b) => {
    b.onclick = () => setPedal(b.dataset.pedal);
  });

// ---- audio -----------------------------------------------------------------
// Two parallel paths off inGain: a dry tap and the shaped (wet) path. Each has
// its own volume (the sliders under the input and output graphs), so you can
// blend or solo. wetTrim peak-matches wet to dry, so at equal slider settings
// the only thing you hear change is timbre, not level.
let actx,
  srcNode,
  inGain,
  shaper,
  wetTrim,
  wetGain,
  dryGain,
  master,
  running = false;
// Rebuild the source feeding inGain. Oscillator for sine; a looping buffer of
// the real note for guitar. Everything downstream of inGain is source-agnostic.
function startSource() {
  if (!actx) return;
  stopSource();
  if (srcMode === "guitar" && guitar) {
    const ab = actx.createBuffer(1, guitar.length, SR);
    ab.copyToChannel(guitar, 0);
    srcNode = actx.createBufferSource();
    srcNode.buffer = ab;
    srcNode.loop = true;
  } else {
    srcNode = actx.createOscillator();
    srcNode.frequency.value = F0;
  }
  srcNode.connect(inGain);
  srcNode.start();
}
function stopSource() {
  if (!srcNode) return;
  try {
    srcNode.stop();
  } catch {}
  srcNode.disconnect();
  srcNode = null;
}
// Same curve the transfer panel draws, minus its DC offset (a coupling cap):
// WaveShaper output would otherwise carry the bias's DC straight to the speaker.
function makeCurveArray() {
  const n = 1024,
    a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = -1 + (2 * i) / (n - 1);
    a[i] = nl(x) - outDc;
  }
  return a;
}
const vinS = document.getElementById("vin"),
  voutS = document.getElementById("vout");
const vinO = document.getElementById("vino"),
  voutO = document.getElementById("vouto");
function setVol() {
  vinO.textContent = (+vinS.value).toFixed(2);
  voutO.textContent = (+voutS.value).toFixed(2);
  if (actx) {
    dryGain.gain.value = +vinS.value;
    wetGain.gain.value = +voutS.value;
  }
}
vinS.oninput = setVol;
voutS.oninput = setVol;
function updateAudio() {
  if (!actx) return;
  inGain.gain.value = level;
  shaper.curve = makeCurveArray();
  wetTrim.gain.value = outMatch; // peak-match wet to dry (computed in render)
  master.gain.value = 0.3; // headroom: dry+wet can sum, keep below clipping
}
function ensureAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  inGain = actx.createGain();
  shaper = actx.createWaveShaper();
  shaper.oversample = "4x";
  wetTrim = actx.createGain();
  wetGain = actx.createGain();
  dryGain = actx.createGain();
  master = actx.createGain();
  inGain.connect(shaper).connect(wetTrim).connect(wetGain).connect(master); // wet path
  inGain.connect(dryGain).connect(master); // dry path
  master.connect(actx.destination);
  updateAudio();
  setVol();
  startSource();
}
const playBtn = document.getElementById("play");
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/></svg>';
function setPlayUI(playing) {
  playBtn.innerHTML = playing ? ICON_STOP : ICON_PLAY;
  playBtn.classList.toggle("playing", playing);
  playBtn.title = playBtn.ariaLabel = playing ? "stop audio" : "start audio";
}
playBtn.onclick = async () => {
  ensureAudio();
  if (running) {
    await actx.suspend();
    running = false;
    setPlayUI(false);
  } else {
    await actx.resume();
    running = true;
    setPlayUI(true);
  }
};
// re-pluck: retrigger the note from its start without waiting for the loop
document.getElementById("replay").onclick = async () => {
  ensureAudio();
  await actx.resume();
  running = true;
  setPlayUI(true);
  startSource();
};

addEventListener("resize", render);
render();
