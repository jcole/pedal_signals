// Effect-neutral harness. Everything that isn't specific to one page lives here:
// the generic panels (input waveform, dry-vs-wet time), the transport, the
// dry/wet blend audio graph, the source toggle, and the control UI. It renders a
// VIEW over a list of PEDALS: the pedals (from pedals/) are the model — each one
// knows how to generate its input and process it; the view is the page's UI — its
// panels, its controls, its live audio graph. The pure DSP (WAV parse, FFT,
// spectrum) is imported from dsp.js.
//
// A view module (clipping.js, delay.js, …) supplies only the family's UI and its
// list of pedals, and hands it to mount(). The contract:
//
//   const view = {
//     id, navLabel,           // this family's key + its name, which the picker
//                             // uses twice: the heading over this family's
//                             // pedals, and the gloss under the chosen one
//     dual,                    // the "⇅ ..." caption between the output panels
//     vinDefault, voutDefault, // starting volumes for the input/output sliders
//     pedals: [ Pedal, … ],   // what the picker lists for this family; the
//                             // selected one drives input+process
//     spectrumTitle,          // output spectrum-panel headline
//     lesson?,                // {formula, formulaNote, klass?, oneLiner, body,
//                             // aside?:{title, body}} — the prose above and below
//                             // the rig. Omit it and both sections stay hidden.
//     controls:[ {id, label, min, max, step, def, fmt?(v)->string}, … ],
//     drawCenter(F, pedal, params, H),           // draw the center panel
//     drawSpec(F, inp, out, pedal, src, H),      // draw the output spectrum panel
//     buildAudio(actx, inGain, H) -> { wetOut, update(pedal, params, state, match), dispose?() },
//     buildSource?(actx) -> AudioNode,   // live synthetic source; default: a steady oscillator
//   };
//
// mount(view, {pedal}) can be called again with another view to swap families in
// place. The harness disconnects the old wet chain and calls its dispose() — a
// view whose buildAudio start()s anything (an LFO, a ConstantSource) must stop it
// there, or it keeps running, unheard, for the life of the page. `pedal` is the
// id to open on (an unknown one falls back to the family's first).
//
// Nothing here chooses a pedal: the picker (ui/picker.js) owns that, and the
// page turns its choice into a mount() or a selectPedal(). So the harness only
// ever gets told, and never has to tell anyone back.
//
// Each Pedal instance carries what makes it that pedal, and what the harness reads
// off the *selected* one: sampleCount / spanSamples (analysis sizing), analytic
// (redraw the input smoothly?), srcTitles ({sine, guitar} input-panel labels),
// defaults (knobs to snap to on select — empty = leave them put), genInput(...)
// and process(...). H is the harness helper bundle: drawing primitives and the
// shared palette, passed into the view's draw/audio hooks. The DSP core (specDb,
// windowed) and constants (SR, N, KBIN, …) live in dsp.js.
import { SR, F0, CYCLES, SPAN, MSMAX, parseWav, normalize } from "../dsp.js";
// The toy pedal in the bench row's PEDAL cell — what the row says to someone who
// hasn't read it yet. That file is where the reasoning lives.
import { pedalArt } from "./art.js";
// The bench row's column names, from the same module the catalog page takes
// theirs from — the two pages name their columns once, together. The row under
// them is authored in index.html rather than built here, because the PEDAL cell
// is standing DOM that a re-render would destroy. Neither page owns the geometry;
// that's one rule in the stylesheet.
import { headRow } from "./rows.js";

// ---- colors (shared palette; effects read ACCENT for their center curve) ----
// styles.css owns these: the page paints the "in"/"out" legend words in a panel
// header with the same --dry/--wet the canvas strokes its traces with, and two
// copies of a color that must match is how they drift. So read them off :root
// rather than restating them. The literals below are fallbacks for a missing or
// unparsed stylesheet only — keep them equal to the CSS, and change the CSS when
// you want a different color.
const css = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;
const DRY = css("--dry", "#9aa0a6"),
  WET = css("--wet", "#dd7048"),
  ACCENT = css("--accent-lo", "#7fa650"),
  GRID = css("--grid", "#2c3125"),
  ZERO = css("--zero", "#3a4030");

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
// input-panel headline per source; a pedal renames them (a delay's "sine" is a burst)
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
  pedal = view.pedals[0]; // until setPedal() seeds the asked-for one
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
// Always silent: the picker owns the choosing and the page owns the URL, so by
// the time this runs the decision is made and everyone else already knows.
function setPedal(id) {
  pedal = view.pedals.find((p) => p.id === id) ?? view.pedals[0];
  // The bench row's other two columns. The PEDAL cell isn't written here — it's
  // the picker, which is standing DOM and already says the pedal's name; this
  // fills the two cells that describe whatever it's currently saying. Both are
  // the pedal's own, not the family's, which is the difference between this row
  // and the band that used to sit above it.
  document.getElementById("benchop").textContent = pedal.tech ?? "";
  document.getElementById("benchnote").textContent = pedal.techNote ?? "";
  document.getElementById("benchwhat").textContent = pedal.whatChanges ?? "";
  // The toy pedal beside the picker — the only thing in this row that answers
  // "what am I looking at" without being read. Here rather than in mount() with
  // the rest of the furniture for the reason every line in this function is here:
  // it's the PEDAL's, and a pick inside a family never remounts, so art set up
  // there would stick on whatever you arrived with.
  document.getElementById("pedalart").innerHTML = pedalArt(pedal.art);
  // The FAMILY cell. Just the name and an arrow — the column header says what
  // kind of noun it is, which is the one thing the bench never used to say
  // anywhere. Set here rather than in mount() for the same reason the tab title
  // is: it names the family, but it has to survive a pick, and a pick within a
  // family never remounts.
  const fam = document.getElementById("famlink");
  fam.textContent = `${view.navLabel} →`;
  fam.href = `./pedals.html#${encodeURIComponent(view.id)}`;
  if (pedal.tech) document.getElementById("centertech").textContent = pedal.tech;
  if (pedal.outnar)
    document.getElementById("outnar").textContent = pedal.outnar;
  // The pedal names its own bar in the chain: INPUT → OVERDRIVE → OUTPUT. It's
  // the one label on the rig that isn't furniture, because it's the one the
  // reader chose.
  //
  // The panel under it used to carry the pedal's whatChanges, which was a caption
  // for the wrong panel: this one plots the transfer curve, and whatChanges
  // describes the output, which the panels downstream were already saying
  // themselves. It now sits in the lede, where the pedal's row states it once
  // against the family it's an instance of.
  document.getElementById("pedalgrp").textContent = pedal.label;
  // The tab names the pedal for the same reason the bar does, and it's the same
  // fact: the URL is ?pedal=overdrive, so a tab that said "clipping" would be
  // answering a question nobody asked of it. This has to live here rather than
  // in mount() — a pick inside a family never remounts, so a title set up there
  // would stick on the pedal you arrived with and go quietly wrong from the
  // second pick on. Site name first: these are tabs, and a row of them truncates
  // from the right, so the half that survives should be the half that says where
  // you are.
  document.title = `Pedal signals — ${pedal.label}`;
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
  master.connect(actx.destination);
  connectView();
}
// Build the mounted view's wet chain onto the standing dry/wet/master graph, and
// (re)connect the two paths into it. Called on first play and again after a
// family swap, which leaves the context and the outer graph alone.
function connectView() {
  audio = view.buildAudio(actx, inGain, H);
  audio.wetOut.connect(wetGain).connect(master); // wet path
  inGain.connect(dryGain).connect(master); // dry path
  updateAudio();
  setVol();
  startSource();
}
// Drop the mounted view's wet chain. inGain feeds both the view's input and the
// dry tap, so it's cut wholesale here and the dry tap is remade by connectView.
function disconnectView() {
  stopSource();
  inGain.disconnect();
  wetGain.disconnect();
  audio.wetOut.disconnect();
  audio.dispose?.();
  audio = null;
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
    // One way only. .inviting is the big lifted state this button wears on a
    // page nobody has pressed yet; the first yes settles it into its header for
    // good. Not toggled back off on stop — by then it has been found, and a slab
    // that reappears over the chart every time you pause is asking a question
    // that's already been answered. Set from here rather than from the click
    // handler so that ↻ pluck, which also starts the audio, retires it too.
    if (playing) playBtn.classList.remove("inviting");
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

// ---- lesson section ---------------------------------------------------------
// What the mounted family says about itself in words: the prose block below the
// rig, with an optional second column for a deeper aside. It used to also own a
// band up in the lede — the family's own row, in the catalog's three columns —
// which is now a link in the bench row instead (see index.html for why, and
// pedals.html for where the band still stands).
function renderLesson() {
  const lesson = view.lesson;
  const section = document.getElementById("lesson");
  if (!lesson) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";
  document.getElementById("lbody").innerHTML = lesson.body;

  const asideWrap = document.getElementById("lasidewrap");
  if (lesson.aside) {
    asideWrap.style.display = "";
    document.getElementById("lasidetitle").textContent = lesson.aside.title;
    document.getElementById("lasidebody").innerHTML = lesson.aside.body;
  } else {
    asideWrap.style.display = "none";
  }
}

// ---- mount -----------------------------------------------------------------
// Everything a view owns is torn down here, so mount() can hand the page to a
// different family without a reload: its wet chain, its knobs, and the live
// values keyed by knob id (a stale `time` from delay must not reach tremolo).
// What survives a swap is what isn't the view's: the AudioContext and its outer
// graph, the guitar buffer, the source mode, and the once-wired listeners.
function unmount() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (actx) disconnectView();
  for (const k of Object.keys(params)) delete params[k];
  for (const k of Object.keys(ctlEls)) delete ctlEls[k];
  lastState = null;
  lastMatch = 1;
}

// Move to another pedal in the family that's already up. Deliberately not a
// mount(): the family hasn't changed, so its audio chain and knobs are left
// standing rather than torn down and rebuilt under a note that's still sounding.
export function selectPedal(id) {
  setPedal(id);
}

let wired = false;
export function mount(v, opts = {}) {
  if (view) unmount();
  view = v;
  document.querySelectorAll("canvas").forEach((cv) => {
    C[cv.dataset.c] = cv;
  });
  // page furniture the view owns
  document.getElementById("dualtxt").textContent = view.dual;
  document.getElementById("vin").value = view.vinDefault;
  document.getElementById("vout").value = view.voutDefault;
  // headlines the view owns. The centre bar's isn't one of them: it names the
  // pedal, not the family, so setPedal() writes it at the end of this function.
  if (view.spectrumTitle)
    document.getElementById("specnar").textContent = view.spectrumTitle;
  renderLesson();
  buildControls();
  // seed labels + defaults from the asked-for pedal, falling back to the
  // family's first for an id the URL made up
  setPedal(opts.pedal);
  if (actx) connectView(); // playing already? swap the chain under the audio
  else setVol(); // otherwise just show the new family's starting volumes

  if (!wired) {
    wired = true;
    // The bench row's column names. Not the view's — they're the same words
    // whatever is mounted, and they come from rows.js so that this page and the
    // catalog name their shared columns once, together. "family" is the fourth,
    // which only this page has.
    document.getElementById("ledehead").appendChild(headRow("family"));
    wireSourceToggle();
    wireTransport();
    addEventListener("resize", render);
    loadGuitar();
  }
  render();
}

// The real note, straight from the WAV (no AudioContext needed here). Fetched
// once for the page, not per family.
function loadGuitar() {
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
}
