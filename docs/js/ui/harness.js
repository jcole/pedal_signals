// Effect-neutral harness. Everything that isn't specific to one page lives here:
// the generic panels (input waveform, dry-vs-wet time), the transport, the
// dry/wet blend audio graph, the source toggle, and the control UI. It renders a
// VIEW over a list of PEDALS: the pedals (from pedals.js) are the model — each one
// knows how to generate its input and process it; the view is the page's UI — its
// panels, its controls, its live audio graph. The pure DSP (WAV parse, FFT,
// spectrum) is imported from dsp.js.
//
// A view module (clipping.js, delay.js, …) supplies only the family's UI and its
// list of pedals, and hands it to mount(). The contract:
//
//   const view = {
//     id, navLabel,           // URL ?effect= value + the nav link's label
//     pageTitle,               // <title> for this family's demo
//     dual,                    // the "⇅ ..." caption between the output panels
//     vinDefault, voutDefault, // starting volumes for the input/output sliders
//     pedals: [ Pedal, … ],   // the buttons; the selected one drives input+process
//     centerTitle,            // center-panel headline ("the pedal bends every sample")
//     spectrumTitle,          // output spectrum-panel headline
//     controls:[ {id, label, min, max, step, def, fmt?(v)->string}, … ],
//     drawCenter(F, pedal, params, H),           // draw the center panel
//     drawSpec(F, inp, out, pedal, src, H),      // draw the output spectrum panel
//     buildAudio(actx, inGain, H) -> { wetOut, update(pedal, params, state, match) },
//     buildSource?(actx) -> AudioNode,   // live synthetic source; default: a steady oscillator
//   };
//
// Each Pedal instance carries what makes it that pedal, and what the harness reads
// off the *selected* one: sampleCount / spanSamples (analysis sizing), analytic
// (redraw the input smoothly?), srcTitles ({sine, guitar} input-panel labels),
// defaults (knobs to snap to on select — empty = leave them put), genInput(...)
// and process(...). H is the harness helper bundle: drawing primitives and the
// shared palette, passed into the view's draw/audio hooks. The DSP core (specDb,
// windowed) and constants (SR, N, KBIN, …) live in dsp.js.
import { SR, F0, CYCLES, SPAN, MSMAX, parseWav, normalize } from "../dsp.js";

// ---- colors (shared palette; effects read ACCENT for their center curve) ----
const DRY = "#9aa0a6",
  WET = "#C0522F",
  ACCENT = "#7fa650",
  GRID = "#2c3125",
  ZERO = "#3a4030";

// ---- module-level state ----------------------------------------------------
let view = null; // the mounted page: pedals + UI hooks
let pedal = null; // the currently selected Pedal instance
const level = 1.0;
const params = {}; // live control values, keyed by control id
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

// ---- pedal-declared sizing --------------------------------------------------
// A per-sample pedal analyses N samples and shows ~13.5 ms of them; a time-based
// one asks for more of both. Everything downstream reads the selected pedal, not
// the consts. (Pedals on one page share a family, so these don't jump on select.)
const spanMs = () =>
  pedal.spanSamples === SPAN ? MSMAX : (pedal.spanSamples / SR) * 1000;
// input-panel headline per source; a pedal renames them (a delay's "sine" is a pluck)
const srcTitle = (m) => pedal.srcTitles[m] ?? m;

// ---- input generation ------------------------------------------------------
// The selected pedal makes its own input buffer — a steady sine (Pedal's default),
// a mid-note guitar slice, or something its lesson needs (a delay makes a transient
// pluck, since a steady tone can't show a repeat).
function genInput() {
  return pedal.genInput({ srcMode, guitar, n: pedal.sampleCount });
}

// ---- render (effect-neutral orchestration) ---------------------------------
function render() {
  const inp = genInput();
  const r = pedal.process(inp, params);
  lastState = r.state ?? null;
  lastMatch = r.match ?? 1;

  drawInput(inp);
  view.drawCenter(frame(C.center), pedal, params, H);
  drawTime(inp, r.out, lastMatch);
  view.drawSpec(frame(C.spec), inp, r.out, pedal, srcMode, H);
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
  // A generated steady sine is redrawn analytically (smooth at any width); any
  // real buffer — the guitar, or a pedal that makes its own input — is plotted as
  // samples. `analytic` marks a pedal whose sine input is that redrawable sine.
  if (!(pedal.analytic && srcMode === "sine")) {
    const span = pedal.spanSamples;
    for (let i = 0; i < span; i++) {
      xs.push(i / span);
      ys.push(inp[i] || 0);
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
  txt(g, spanMs().toFixed(0), sx(1), B + 3, "end", "top");
  titles(g, F, "amplitude", "time (ms)");
}

function drawTime(inp, out, match) {
  const F = frame(C.time),
    { g, L, R, T, B } = F;
  const span = pedal.spanSamples;
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
  txt(g, spanMs().toFixed(0), sx(span), B + 3, "end", "top");
  titles(g, F, "amplitude", "time (ms)");
}

// ---- control UI (generated from view.pedals + view.controls) ---------------
const ctlEls = {}; // id -> {input, output, ctl}
function buildControls() {
  const host = document.getElementById("centerctls");
  host.innerHTML = "";
  // pedal-select segment (one button per pedal; skipped if there's only one),
  // rendered into the top pedal-picker bar rather than the Pedal panel itself.
  pedal = view.pedals[0];
  const pedpicker = document.getElementById("pedpicker");
  pedpicker.innerHTML = "";
  pedpicker.style.display = view.pedals.length > 1 ? "" : "none";
  if (view.pedals.length > 1) {
    for (const p of view.pedals) {
      const b = el("button", `pedbtn${p === pedal ? " active" : ""}`);
      b.textContent = p.label;
      b.dataset.pedal = p.id;
      b.onclick = () => setPedal(p.id);
      pedpicker.appendChild(b);
    }
  }
  // sliders
  for (const c of view.controls) {
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
// Select a pedal: swap its labels (formula, output narrative) and snap any knobs
// it declares defaults for. A pedal with no defaults (the clipping family) leaves
// the knobs where the user left them — switching there changes only the knee.
function setPedal(id) {
  pedal = view.pedals.find((p) => p.id === id);
  document.querySelectorAll(".pedbtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.pedal === id);
  });
  if (pedal.tech) document.getElementById("centertech").textContent = pedal.tech;
  if (pedal.outnar)
    document.getElementById("outnar").textContent = pedal.outnar;
  document.getElementById("inh3").textContent = srcTitle(srcMode);
  for (const [k, v] of Object.entries(pedal.defaults)) {
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
      document.getElementById("inh3").textContent = srcTitle(srcMode);
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
  } else if (view.buildSource) {
    srcNode = view.buildSource(actx); // the view's own synthetic source (started below)
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
  audio.update(pedal, params, lastState, lastMatch);
  master.gain.value = 0.3; // headroom: dry+wet can sum, keep below clipping
}
function ensureAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  inGain = actx.createGain();
  wetGain = actx.createGain();
  dryGain = actx.createGain();
  master = actx.createGain();
  audio = view.buildAudio(actx, inGain, H);
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
export function mount(v) {
  view = v;
  document.querySelectorAll("canvas").forEach((cv) => {
    C[cv.dataset.c] = cv;
  });
  // headlines the view owns
  if (view.centerTitle)
    document.getElementById("centernar").textContent = view.centerTitle;
  if (view.spectrumTitle)
    document.getElementById("specnar").textContent = view.spectrumTitle;
  buildControls();
  setPedal(pedal.id); // seed labels + apply the first pedal's defaults
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
