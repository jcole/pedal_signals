// Effect-neutral harness. Everything not specific to one page lives here: the
// generic output panel (dry-vs-wet time), the control rail, the transport, the
// dry/wet blend audio graph, the source toggle, and the control UI. It renders a
// VIEW over a list of PEDALS: the pedals (from pedals/) are the model, the view is
// the page's UI. Pure DSP is imported from dsp.js.
//
// The rig is a control rail and two output charts. Every chart is the output
// against the input; the input alone and the pedal's own internals get no panel
// (they're a grey trace and a measured curve already), only glyphs in the rail —
// see drawRail.
//
// A view module (clipping.js, delay.js, …) supplies the family's UI and pedals and
// hands it to mount(). The contract:
//
//   const view = {
//     id, navLabel,           // family key + name; the picker uses it as the list
//                             // heading, the band as the FAMILY cell's name
//     blendDefault,           // where the dry/wet crossfade starts (0 dry, 1 wet)
//     pedals: [ Pedal, … ],   // what the picker lists; the selected one drives
//                             // input+process
//     timeTech?,              // the TOP panel's chart-type word (its chip).
//                             // Defaults to "waveform"; override with drawTime.
//     spectrumTitle,          // bottom-panel headline. A string is the family's;
//                             // a fn(pedal) is rewritten per pick.
//     spectrumTech,           // the BOTTOM panel's chart-type word
//     spectrumUnit?,          // its unit, parenthesized ("dB"); omit if unitless
//     lesson?,                // {formula, formulaNote, klass?, oneLiner, body,
//                             // aside?:{title, body}} — prose above/below the rig.
//                             // Omit and both sections stay hidden.
//     controls:[ {id, label, min, max, step, def, fmt?(v)->string}, … ],
//     thumbSquare?,           // curve reads against y = x? Squares the rail glyph
//                             // and catalog thumbnail — see thumb.js's marginsFor.
//     drawCenter(F, pedal, params, H),           // the family's own curve; the
//                             // rail glyph and catalog thumbnail, off this one hook
//     drawTime?(F, inp, out, pedal, src, H, params), // the TOP panel. Omit and
//                             // the harness draws dry-vs-wet waveform (drawTime
//                             // below), right only for a span a few carrier cycles wide.
//     drawSpec(F, inp, out, pedal, src, H, params),  // the BOTTOM panel
//     buildAudio(actx, inGain, H) -> { wetOut, update(pedal, params, state, match), dispose?() },
//     buildSource?(actx, {srcMode, guitar}) -> AudioNode,  // the view's own live
//                             // source, for BOTH src modes. Default: looped guitar
//                             // buffer, or a steady oscillator.
//   };
//
// mount(view, {pedal}) can be called again to swap families in place. The harness
// disconnects the old wet chain and calls dispose() — a buildAudio that start()s
// anything (an LFO, a ConstantSource) MUST stop it there or it runs unheard for the
// life of the page. `pedal` is the id to open on (unknown falls back to first).
//
// Nothing here chooses a pedal: the picker owns that; the page turns its choice
// into a mount() or selectPedal().
//
// The harness reads off the *selected* pedal: sampleCount / spanSamples (analysis
// sizing), defaults (knobs to snap to; empty = leave them put), genInput() and
// process(). H is the helper bundle (drawing primitives + palette) passed to the
// view hooks. DSP core and constants (SR, N, KBIN, …) live in dsp.js.
import { F0, MSMAX, normalize, parseWav, SPAN, SR } from "../dsp.js";
// the toy pedal in the band's PEDAL cell (art.js has the reasoning)
import { pedalArt } from "./art.js";
// drawing primitives and palette, shared with the catalog so both draw the same
// curves in the same ink (see draw.js). `H` is the bundle handed to view hooks.
import { frame as fit, H, line, titles, txt } from "./draw.js";
// the band's two claims, resolved by the same code the catalog uses (see setPedal)
import { claims } from "./rows.js";
// the rail's curve glyph is the catalog's thumbnail, live. See drawRail.
import { drawThumb } from "./thumb.js";

const { DRY, WET, ZERO } = H.colors;

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
// plot margins reserved for axis labels (draw.js takes them as an argument so a
// catalog thumbnail can pass zeroes)
const MARGINS = { L: 40, R: 12, T: 10, B: 26 };
// a glyph labels nothing — just enough to keep a 1.5px stroke off its edge. Passed
// to `fit`, not `frame` (which closes over MARGINS): frame would draw the axis
// panel's 40px inset and bury the trace in a corner.
const GLYPH_MARGINS = { L: 2, R: 2, T: 2, B: 2 };
const frame = (cv) => fit(cv, MARGINS);

// ---- pedal-declared sizing --------------------------------------------------
// per-sample pedal shows ~13.5 ms; a time-based one asks for more. Downstream reads
// the selected pedal, not the consts.
const spanMs = () =>
  pedal.spanSamples === SPAN ? MSMAX : (pedal.spanSamples / SR) * 1000;

// ---- input generation ------------------------------------------------------
// the selected pedal makes its own input — a steady sine, a guitar slice, or what
// its lesson needs (delay makes a transient pluck; a steady tone can't show a repeat)
function genInput() {
  return pedal.genInput({ srcMode, guitar, n: pedal.sampleCount });
}

// ---- render (effect-neutral orchestration) ---------------------------------
function render() {
  const inp = genInput();
  const r = pedal.process(inp, params);
  lastState = r.state ?? null;
  lastMatch = r.match ?? 1;

  drawRail(inp);
  if (view.drawTime) view.drawTime(frame(C.time), inp, r.out, pedal, srcMode, H, params);
  else drawTime(inp, r.out, lastMatch);
  view.drawSpec(frame(C.spec), inp, r.out, pedal, srcMode, H, params);
}

// The rail's two glyphs. The curve is the catalog's thumbnail live — drawThumb
// with the live knobs. The source glyph draws SPAN samples, not spanSamples: three
// carrier periods, which is a readable wave on every family and source (a span
// sized for an LFO would be a solid band).
function drawRail(inp) {
  // Square the canvas for a family whose curve reads against y = x, rather than
  // squaring the plot inside a wide one (marginsFor does that, spending the slack
  // on the right for the catalog's column). Here there's no column; a square canvas
  // lets CSS centre the box, so neither page has to know about the other.
  C.curve.classList.toggle("glyph--square", !!view.thumbSquare);
  drawThumb(C.curve, view, pedal, params);
  const { g, L, R, T, B } = fit(C.srcglyph, GLYPH_MARGINS);
  const n = Math.max(2, Math.min(SPAN, inp.length));
  const sx = (i) => L + (i / (n - 1)) * (R - L),
    sy = (y) => (T + B) / 2 - y * ((B - T) / 2 - 2);
  g.strokeStyle = ZERO;
  g.beginPath();
  g.moveTo(L, sy(0));
  g.lineTo(R, sy(0));
  g.stroke();
  line(g, ramp(n), inp.subarray(0, n), sx, sy, DRY, 1.5);
}

// index ramp for sample plots' x's, memoized by length (render() runs on every
// knob drag and the callers ask for the same lengths)
const ramps = new Map();
function ramp(n) {
  let r = ramps.get(n);
  if (!r) {
    r = Array.from({ length: n }, (_, i) => i);
    ramps.set(n, r);
  }
  return r;
}

// The top panel's default: dry and wet waveforms on shared axes. Legible only
// while spanSamples is a few carrier cycles wide; a slower-span family (an LFO, a
// row of echoes) would draw a solid band and overrides drawTime instead.
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
  const od = new Float64Array(span);
  for (let i = 0; i < span; i++) od[i] = out[i] * match;
  line(g, ramp(span), inp.subarray(0, span), sx, sy, DRY, 1.5);
  line(g, ramp(span), od, sx, sy, WET, 2);
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
// Select a pedal: swap its labels and snap any knobs it declares defaults for. A
// pedal with no defaults (clipping) leaves the knobs put. Silent — the picker owns
// the choosing, the page owns the URL; by the time this runs the decision is made.
// Everything here is the PEDAL's, written on every pick (a pick never remounts, so
// none of it can move to mount()).
function setPedal(id) {
  pedal = view.pedals.find((p) => p.id === id) ?? view.pedals[0];
  document.getElementById("pedalart").innerHTML = pedalArt(pedal.art);
  // The band's two claims and the panel headlines, from one resolver shared with the
  // catalog (rows.js) so a claim and the chart it points at can't disagree — nor the
  // two pages with each other. CHANGES/YOU HEAR cross by bandSwap (modulation: the
  // pulse you hear is the top chart, the sidebands it makes the bottom; chips cross to
  // match, in mount()); the panels always show the raw top/bottom narration.
  const { topNar, botNar, changes, youHear } = claims(view, pedal);
  document.getElementById("benchchanges").textContent = changes;
  document.getElementById("benchhear").textContent = youHear;
  if (topNar) document.getElementById("outnar").textContent = topNar;
  if (botNar) document.getElementById("specnar").textContent = botNar;
  // the deck's formula over a gloss of the curve's character (tech over techNote);
  // techNote is absent on delay, and :empty hides the blank line
  document.getElementById("pedalop").textContent = pedal.tech ?? "";
  document.getElementById("pedalnote").textContent = pedal.techNote ?? "";
  // the tab names the pedal, because the URL does (?pedal=overdrive). Site name
  // first: tabs truncate from the right, so keep the half that says where you are.
  document.title = `Pedal signals — ${pedal.label}`;
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

// input-source toggle: sine is the clean generated tone, guitar the real EGFxSet note
function wireSourceToggle() {
  document.querySelectorAll(".srcbtn").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.src === srcMode || b.disabled) return;
      srcMode = b.dataset.src;
      document.querySelectorAll(".srcbtn").forEach((x) => {
        x.classList.toggle("active", x === b);
      });
      document.getElementById("gcredit").style.display =
        srcMode === "guitar" ? "" : "none";
      showReplay();
      if (actx) startSource();
      schedule();
    };
  });
}

// ---- audio -----------------------------------------------------------------
// Generic graph: a dry tap and the effect's wet chain, blended and summed through a
// master with headroom. The effect owns everything between inGain and wetOut.
let actx,
  srcNode,
  inGain,
  wetGain,
  dryGain,
  master,
  audio = null, // { wetOut, update } from effect.buildAudio
  running = false;
// A view's buildSource is asked FIRST and for both sources — if a view has an
// opinion about its input, it has it on every input (else delay's pluck loop would
// run on sine only, and the charts and the speaker would disagree).
function startSource() {
  if (!actx) return;
  stopSource();
  if (view.buildSource) {
    srcNode = view.buildSource(actx, { srcMode, guitar }); // started below
  } else if (srcMode === "guitar" && guitar) {
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
// ↻ pluck restarts the note, and only guitar has a note to restart (sine is a
// continuous oscillator). Hidden, not disabled, on sine — and it sits in the INPUT
// deck by the source segment because srcMode is what governs it.
function showReplay() {
  document.getElementById("replay").hidden = srcMode !== "guitar";
}

// one crossfade, so dry is whatever wet isn't and the pair can't drift. No readout —
// a crossfade is set by ear (see index.html)
const blendS = () => document.getElementById("blend");
function setBlend() {
  const b = +blendS().value;
  if (actx) {
    dryGain.gain.value = 1 - b;
    wetGain.gain.value = b;
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
// build the view's wet chain onto the standing dry/wet/master graph and connect
// both paths; called on first play and after a family swap
function connectView() {
  audio = view.buildAudio(actx, inGain, H);
  audio.wetOut.connect(wetGain).connect(master); // wet path
  inGain.connect(dryGain).connect(master); // dry path
  updateAudio();
  setBlend();
  startSource();
}
// drop the view's wet chain. inGain feeds both the view's input and the dry tap, so
// it's cut wholesale here and connectView remakes the dry tap
function disconnectView() {
  stopSource();
  inGain.disconnect();
  wetGain.disconnect();
  audio.wetOut.disconnect();
  audio.dispose?.();
  audio = null;
}
function wireTransport() {
  blendS().oninput = setBlend;
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

// ---- lesson section ---------------------------------------------------------
// the family's prose below the rig, with an optional second-column aside
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
// Tear down everything a view owns so mount() can swap families without a reload:
// its wet chain, its knobs, and the live values keyed by knob id (a stale `time`
// from delay must not reach tremolo). The context, outer graph, guitar buffer,
// source mode and once-wired listeners survive.
function unmount() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (actx) disconnectView();
  for (const k of Object.keys(params)) delete params[k];
  for (const k of Object.keys(ctlEls)) delete ctlEls[k];
  lastState = null;
  lastMatch = 1;
}

// Move to another pedal in the family already up. Not a mount(): the family is
// unchanged, so its audio chain and knobs stay standing rather than rebuild under a
// sounding note.
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
  // The band's FAMILY cell — filled here, not in setPedal(): it's the family's, and
  // the family only changes on a mount. Its name is the way out to the catalog, so
  // the href is built here (the view knows its own id).
  const fam = document.getElementById("benchfam");
  fam.href = `./pedals.html#${encodeURIComponent(view.id)}`;
  document.getElementById("benchfamname").textContent = view.navLabel;
  document.getElementById("benchklass").textContent = view.lesson?.klass ?? "";
  document.getElementById("blend").value = view.blendDefault;
  // What the two output panels ARE — the view's words, not hardcoded (a family may
  // draw something else). Top defaults to "waveform", the harness's own plot; the
  // pedal- and spectrum-title headlines are written by setPedal() below.
  document.getElementById("timetech").textContent = view.timeTech ?? "waveform";
  document.getElementById("spectech").textContent = view.spectrumTech;
  document.getElementById("specunit").textContent = view.spectrumUnit
    ? ` (${view.spectrumUnit})`
    : "";
  // the band's chart chips mirror the panels' own names, so a claim points at the
  // chart that proves it (see index.html). bandSwap crosses them with the claims.
  const topTech = view.timeTech ?? "waveform";
  document.getElementById("benchchangeschip").textContent = view.bandSwap
    ? view.spectrumTech
    : topTech;
  document.getElementById("benchhearchip").textContent = view.bandSwap
    ? topTech
    : view.spectrumTech;
  renderLesson();
  buildControls();
  // seed labels + defaults from the asked-for pedal, falling back to the
  // family's first for an id the URL made up
  setPedal(opts.pedal);
  if (actx) connectView(); // playing already? swap the chain under the audio
  else setBlend(); // otherwise just show the new family's starting mix

  if (!wired) {
    wired = true;
    wireSourceToggle();
    wireTransport();
    showReplay();
    addEventListener("resize", render);
    loadGuitar();
  }
  render();
}

// the real note from the WAV, fetched once for the page (no AudioContext needed here)
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
