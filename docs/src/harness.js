// Effect-neutral harness. Everything that isn't specific to one effect lives
// here: the input generation, the generic panels (input waveform, dry-vs-wet
// time), the transport, the dry/wet blend audio graph, the source toggle, and
// the control UI that's generated from an effect module's declarations. The
// pure DSP (WAV parse, FFT, spectrum) is imported from dsp.js.
//
// An effect module (clipping.js, delay.js, …) fills in only what's genuinely
// effect-specific and hands it to mount(). The contract:
//
//   const effect = {
//     centerTitle,        // center-panel headline ("the pedal bends every sample")
//     spectrumTitle,      // output spectrum-panel headline
//     presets: [ {id, label, tech, outnar, defaults:{ctlId:val, …}}, … ],
//     controls:[ {id, label, min, max, step, def, fmt?(v)->string}, … ],
//     process(inp, params) -> { out:Float64Array, match:number, state?:any },
//     drawCenter(F, params, H),          // draw the center panel
//     drawSpec(F, inp, out, params, src, H),  // draw the output spectrum panel
//     buildAudio(actx, inGain, H) -> { wetOut, update(params, state, match) },
//   };
//
// H is the harness helper bundle: drawing primitives and the shared palette,
// passed into the effect's draw/audio hooks. The DSP core (specDb, windowed) and
// the constants (SR, N, KBIN, …) live in dsp.js; effect modules import whichever
// of those they need straight from there.
import {
  SR,
  N,
  KBIN,
  F0,
  CYCLES,
  SPAN,
  GOFF,
  MSMAX,
  parseWav,
  normalize,
} from "./dsp.js";

// ---- colors (shared palette; effects read ACCENT for their center curve) ----
const DRY = "#9aa0a6",
  WET = "#C0522F",
  ACCENT = "#7fa650",
  GRID = "#2c3125",
  ZERO = "#3a4030";

// ---- module-level state ----------------------------------------------------
let effect = null;
const level = 1.0;
const params = {}; // live control values, keyed by control id
let preset = null; // current preset id (null if the effect has no presets)
let srcMode = "sine", // "sine" | "guitar"
  guitar = null; // Float32Array of the clean note, 48 kHz mono
let lastState = null,
  lastMatch = 1; // process() output the audio graph needs (set each render)

// ---- canvas plumbing -------------------------------------------------------
const C = {};
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
// y-axis title (rotated) + x-axis title, shared by the signal panels
function titles(g, F, ytitle, xtitle) {
  vtxt(g, ytitle, 11, (F.T + F.B) / 2, AXTITLE);
  txt(g, xtitle, (F.L + F.R) / 2, F.B + 13, "center", "top", AXTITLE);
}

// The helper bundle handed to an effect's draw/audio hooks: harness-owned
// drawing primitives and the shared palette. (DSP + constants come from dsp.js.)
const H = {
  line,
  txt,
  vtxt,
  titles,
  colors: { DRY, WET, ACCENT, GRID, ZERO },
};

// ---- input generation (shared) ---------------------------------------------
// One N-sample buffer: an exact integer number of sine periods (clean line
// spectrum), or a slice of the real note starting past the pick attack.
function genInput() {
  const inp = new Float64Array(N);
  const guitarOn = srcMode === "guitar" && guitar;
  for (let n = 0; n < N; n++) {
    inp[n] = guitarOn
      ? guitar[GOFF + n] || 0
      : level * Math.sin((2 * Math.PI * KBIN * n) / N);
  }
  return inp;
}

// ---- render (effect-neutral orchestration) ---------------------------------
function render() {
  const inp = genInput();
  const r = effect.process(inp, params);
  lastState = r.state ?? null;
  lastMatch = r.match ?? 1;

  drawInput(inp);
  effect.drawCenter(frame(C.center), params, H);
  drawTime(inp, r.out, lastMatch);
  effect.drawSpec(frame(C.spec), inp, r.out, params, srcMode, H);
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

// ---- control UI (generated from effect.presets + effect.controls) ----------
const ctlEls = {}; // id -> {input, output, ctl}
function buildControls() {
  const host = document.getElementById("centerctls");
  host.innerHTML = "";
  // preset segment (optional)
  if (effect.presets?.length) {
    preset = effect.presets[0].id;
    params.preset = preset;
    const ctl = el("div", "ctl");
    const seg = el("span", "seg");
    for (const p of effect.presets) {
      const b = el("button", `pedbtn${p.id === preset ? " active" : ""}`);
      b.textContent = p.label;
      b.dataset.preset = p.id;
      b.onclick = () => setPreset(p.id);
      seg.appendChild(b);
    }
    ctl.appendChild(seg);
    host.appendChild(ctl);
  }
  // sliders
  for (const c of effect.controls) {
    const ctl = el("div", "ctl");
    const label = el("label");
    label.textContent = c.label;
    const input = Object.assign(document.createElement("input"), {
      type: "range",
      min: c.min,
      max: c.max,
      step: c.step,
      value: c.def,
    });
    const output = el("output");
    input.oninput = (e) => setParam(c.id, +e.target.value);
    ctl.append(label, input, output);
    host.appendChild(ctl);
    ctlEls[c.id] = { input, output, def: c };
    params[c.id] = c.def;
  }
  refreshControlOutputs();
}
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function fmtCtl(c, v) {
  return c.fmt ? c.fmt(v) : String(v);
}
const clampCtl = (c, v) => Math.max(c.min, Math.min(c.max, v));
function refreshControlOutputs() {
  for (const [id, { output, def }] of Object.entries(ctlEls))
    output.textContent = fmtCtl(def, params[id]);
}
function setParam(id, v) {
  const c = ctlEls[id].def;
  params[id] = clampCtl(c, v);
  ctlEls[id].input.value = params[id];
  ctlEls[id].output.textContent = fmtCtl(c, params[id]);
  schedule();
}
// Apply a preset: swap its per-preset labels (formula, output narrative) and
// snap any controls the preset overrides to their preset defaults.
function setPreset(id) {
  preset = id;
  params.preset = id;
  const p = effect.presets.find((x) => x.id === id);
  document.querySelectorAll(".pedbtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.preset === id);
  });
  if (p.tech) document.getElementById("centertech").textContent = p.tech;
  if (p.outnar) document.getElementById("outnar").textContent = p.outnar;
  for (const [k, v] of Object.entries(p.defaults || {})) {
    const c = ctlEls[k]?.def;
    params[k] = c ? clampCtl(c, v) : v;
    if (c) ctlEls[k].input.value = params[k];
  }
  refreshControlOutputs();
  schedule();
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

// input-source toggle: sine keeps the clean generation lesson; guitar drives
// both the audio and the analysis panels from the real EGFxSet note.
function wireSourceToggle() {
  document.querySelectorAll(".srcbtn").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.src === srcMode || b.disabled) return;
      srcMode = b.dataset.src;
      document.querySelectorAll(".srcbtn").forEach((x) => {
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
}

// ---- audio -----------------------------------------------------------------
// Generic graph: a dry tap and the effect's wet chain, each with its own volume
// (the sliders under the input and output graphs), summed through a master with
// headroom. The effect owns everything between inGain and wetOut.
let actx,
  srcNode,
  inGain,
  wetGain,
  dryGain,
  master,
  audio = null, // { wetOut, update } from effect.buildAudio
  running = false;
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
const vinS = () => document.getElementById("vin"),
  voutS = () => document.getElementById("vout");
function setVol() {
  document.getElementById("vino").textContent = (+vinS().value).toFixed(2);
  document.getElementById("vouto").textContent = (+voutS().value).toFixed(2);
  if (actx) {
    dryGain.gain.value = +vinS().value;
    wetGain.gain.value = +voutS().value;
  }
}
function updateAudio() {
  if (!actx) return;
  inGain.gain.value = level;
  audio.update(params, lastState, lastMatch);
  master.gain.value = 0.3; // headroom: dry+wet can sum, keep below clipping
}
function ensureAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  inGain = actx.createGain();
  wetGain = actx.createGain();
  dryGain = actx.createGain();
  master = actx.createGain();
  audio = effect.buildAudio(actx, inGain, H);
  audio.wetOut.connect(wetGain).connect(master); // wet path
  inGain.connect(dryGain).connect(master); // dry path
  master.connect(actx.destination);
  updateAudio();
  setVol();
  startSource();
}
function wireTransport() {
  vinS().oninput = setVol;
  voutS().oninput = setVol;
  const playBtn = document.getElementById("play");
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>';
  const ICON_STOP =
    '<svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/></svg>';
  const setPlayUI = (playing) => {
    playBtn.innerHTML = playing ? ICON_STOP : ICON_PLAY;
    playBtn.classList.toggle("playing", playing);
    playBtn.title = playBtn.ariaLabel = playing ? "stop audio" : "start audio";
  };
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
  document.getElementById("replay").onclick = async () => {
    ensureAudio();
    await actx.resume();
    running = true;
    setPlayUI(true);
    startSource();
  };
}

// ---- mount -----------------------------------------------------------------
export function mount(fx) {
  effect = fx;
  document.querySelectorAll("canvas").forEach((cv) => {
    C[cv.dataset.c] = cv;
  });
  // headlines the effect owns
  if (fx.centerTitle)
    document.getElementById("centernar").textContent = fx.centerTitle;
  if (fx.spectrumTitle)
    document.getElementById("specnar").textContent = fx.spectrumTitle;
  buildControls();
  if (effect.presets?.length) setPreset(preset); // seed labels
  wireSourceToggle();
  wireTransport();

  // load the real note straight from the WAV (no AudioContext needed here)
  const gbtn = () => document.querySelector('.srcbtn[data-src="guitar"]');
  fetch("guitar_clean.wav")
    .then((r) => r.arrayBuffer())
    .then((b) => {
      guitar = normalize(parseWav(b));
      gbtn().disabled = false;
      gbtn().textContent = "guitar";
      render();
    })
    .catch(() => {
      gbtn().textContent = "guitar ✕";
    });

  addEventListener("resize", render);
  render();
}
