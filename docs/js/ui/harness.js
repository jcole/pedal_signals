// Effect-neutral harness. Everything that isn't specific to one page lives here:
// the generic output panel (dry-vs-wet time), the control rail, the transport,
// the dry/wet blend audio graph, the source toggle, and the control UI. It
// renders a VIEW over a list of PEDALS: the pedals (from pedals/) are the model —
// each one knows how to generate its input and process it; the view is the page's
// UI — its panels, its controls, its live audio graph. The pure DSP (WAV parse,
// FFT, spectrum) is imported from dsp.js.
//
// The rig is a control rail and two output charts. Every chart it draws is the
// output against the input; the two things that aren't — the input alone, and the
// pedal's own internals (an LFO curve, a tap train) — are respectively a trace the
// output panels already carry in grey, and a curve the output panels already
// measure. So neither gets a panel: they're glyphs in the rail. See drawRail.
//
// A view module (clipping.js, delay.js, …) supplies only the family's UI and its
// list of pedals, and hands it to mount(). The contract:
//
//   const view = {
//     id, navLabel,           // this family's key + its name, which the picker
//                             // uses twice: the heading over this family's
//                             // pedals, and the gloss under the chosen one
//     why,                    // HTML: why this family gets THESE two charts —
//                             // the paragraph above the pair. Every other label
//                             // on the rig answers a question you only have once
//                             // you can read a chart; this one is addressed to a
//                             // reader who can't yet, so it's the only thing here
//                             // that says why the pair is a pair. The shape is
//                             // the same on all three: what the pedal leaves
//                             // alone, what it changes instead, and "So:" the two
//                             // charts that fall out — in the order they're
//                             // stacked, so the sentence reads down into them.
//                             //
//                             // There is no connector caption between the panels
//                             // any more, and this is what replaced it: `dual`
//                             // said "⇅ same signal — envelope above, spectrum
//                             // below" in the gap, which was the pair's only
//                             // explanation back when nothing above it was one.
//                             // Once the panels started NAMING themselves (see
//                             // .ctype) it was reading the two chips back to the
//                             // reader a few pixels from where they're printed,
//                             // and every family's was exactly
//                             // `${timeTech} above, ${spectrumTech} below` — a
//                             // third copy of two words, free to drift from
//                             // both. Don't add it back: if the pair needs
//                             // saying, it needs saying here, in a sentence.
//     blendDefault,           // where the dry/wet crossfade starts: 0 is your
//                             // note alone, 1 is the pedal alone
//     pedals: [ Pedal, … ],   // what the picker lists for this family; the
//                             // selected one drives input+process
//     timeTech?,              // what the output TOP panel IS, named as a chart
//                             // type — the word in its chip. Defaults to
//                             // "waveform" (the generic dry-vs-wet plot below).
//                             // A family that overrides drawTime renames it here.
//     spectrumTitle,          // output bottom-panel headline
//     spectrumTech,           // what the BOTTOM panel is ("spectrum",
//                             // "envelope") — the word in its chip
//     spectrumUnit?,          // its unit, parenthesized ("dB"); omit if the
//                             // panel's axis is unitless (a 0..1 level)
//     lesson?,                // {formula, formulaNote, klass?, oneLiner, body,
//                             // aside?:{title, body}} — the prose above and below
//                             // the rig. Omit it and both sections stay hidden.
//     controls:[ {id, label, min, max, step, def, fmt?(v)->string}, … ],
//     thumbSquare?,           // does this family's curve read against a y = x?
//                             // Squares the rail's glyph and the catalog's
//                             // thumbnail — see thumb.js's marginsFor.
//     drawCenter(F, pedal, params, H),           // draw the family's own curve.
//                             // Not a panel on the rig any more: it's the rail's
//                             // curve glyph, and the catalog's row thumbnail, off
//                             // this one hook. See drawRail and thumb.js.
//     drawTime?(F, inp, out, pedal, src, H),     // draw the output TOP panel.
//                             // Optional: omit it and the harness draws its own
//                             // dry-vs-wet waveform (drawTime below), which is
//                             // right for a family whose span is a few carrier
//                             // cycles wide and useless for one whose isn't.
//     drawSpec(F, inp, out, pedal, src, H),      // draw the output BOTTOM panel
//     buildAudio(actx, inGain, H) -> { wetOut, update(pedal, params, state, match), dispose?() },
//     buildSource?(actx, {srcMode, guitar}) -> AudioNode,  // the view's own live
//                             // source, for BOTH src modes. Default: the looped
//                             // guitar buffer, or a steady oscillator.
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
// off the *selected* one: sampleCount / spanSamples (analysis sizing), defaults
// (knobs to snap to on select — empty = leave them put), genInput(...) and
// process(...). H is the harness helper bundle: drawing primitives and the shared
// palette, passed into the view's draw/audio hooks. The DSP core (specDb,
// windowed) and constants (SR, N, KBIN, …) live in dsp.js.
import { F0, MSMAX, normalize, parseWav, SPAN, SR } from "../dsp.js";
// The toy pedal in the bench row's PEDAL cell — what the row says to someone who
// hasn't read it yet. That file is where the reasoning lives.
import { pedalArt } from "./art.js";
// The drawing primitives and the palette, which this file used to own. They moved
// out when the catalog page started drawing the same curves at row size and had
// to draw them in the same ink — see draw.js. `H` is the bundle handed to a
// view's hooks; the three colours below are the ones this file's own panels
// stroke with.
import { frame as fit, H, line, titles, txt } from "./draw.js";
// The bench row's column names, from the same module the catalog page takes
// theirs from — the two pages name their columns once, together. The row under
// them is authored in index.html rather than built here, because the PEDAL cell
// is standing DOM that a re-render would destroy. Neither page owns the geometry;
// that's one rule in the stylesheet.
import { headRow } from "./rows.js";
// The rail's curve glyph is the catalog's thumbnail, live. See drawRail.
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
// Plot margins, reserved for axis labels. The rig's own, and the reason draw.js
// takes them as an argument rather than knowing them: a thumbnail on the catalog
// page draws the same curve with no labels to reserve for, so it passes zeroes.
const MARGINS = { L: 40, R: 12, T: 10, B: 26 };
// A glyph reserves nothing, because it labels nothing — just enough to keep a
// 1.5px stroke off its own edge. Passed to `fit` rather than to `frame`: the
// wrapper below closes over MARGINS and takes no margins of its own, so handing
// it a second argument silently draws the axis panel's inset instead. Which it
// did — a 40px left margin on a 46px-tall glyph put the whole trace in a 10px
// band in the top-left corner.
const GLYPH_MARGINS = { L: 2, R: 2, T: 2, B: 2 };
const frame = (cv) => fit(cv, MARGINS);

// ---- pedal-declared sizing --------------------------------------------------
// A per-sample pedal analyses N samples and shows ~13.5 ms of them; a time-based
// one asks for more of both. Everything downstream reads the selected pedal, not
// the consts. (Pedals on one page share a family, so these don't jump on select.)
const spanMs = () =>
  pedal.spanSamples === SPAN ? MSMAX : (pedal.spanSamples / SR) * 1000;

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

  drawRail(inp);
  if (view.drawTime) view.drawTime(frame(C.time), inp, r.out, pedal, srcMode, H);
  else drawTime(inp, r.out, lastMatch);
  view.drawSpec(frame(C.spec), inp, r.out, pedal, srcMode, H);
}

// The rail's two glyphs, which are what's left of the input and centre panels now
// that neither is a chart. The curve is the catalog's thumbnail — literally
// drawThumb, so it's the family's own drawCenter with the labels struck out —
// handed the LIVE knobs rather than the pedal's defaults.
//
// The source glyph draws SPAN samples, not spanSamples: three carrier periods,
// which is a wave on every family and every source. That's the whole trick. The
// input panel had to plot the family's own span, and a span sized for an LFO
// makes a band; a glyph owes the reader a picture of the SIGNAL, not of the
// window, so it takes the only zoom at which the signal is one.
function drawRail(inp) {
  // Square the CANVAS for a family that reads its curve against a y = x, rather
  // than squaring the plot inside a wide one. marginsFor() does the latter and
  // spends the slack on the right — deliberately, so the catalog's clipping rows
  // start at the same left edge as delay's and modulation's, which is the one
  // thing that column is for. There's no column here: it's one curve in a deck,
  // where left-aligned just reads as fallen over. A square canvas leaves
  // marginsFor nothing to distribute and CSS centres the box instead, so neither
  // page has to know about the other.
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

// The index ramp every sample plot needs for its x's, built once and handed out
// by length. render() runs on every knob drag, and the two callers here ask for
// the same two lengths for the life of the page.
const ramps = new Map();
function ramp(n) {
  let r = ramps.get(n);
  if (!r) {
    r = Array.from({ length: n }, (_, i) => i);
    ramps.set(n, r);
  }
  return r;
}

// The output top panel's default: dry and wet waveforms on shared axes. Only
// legible while spanSamples stays within a few carrier cycles — clipping shows
// 3 of them across ~13.5 ms, which is ~5 px a cycle. A family whose span is
// sized for something slower than the carrier (an LFO, a row of echoes) is
// asking this to draw hundreds of cycles into a few hundred pixels, where a
// polyline can only come out a solid band; those families override drawTime and
// plot what survives the zoom instead. See the view contract at the top.
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
      document.getElementById("gcredit").style.display =
        srcMode === "guitar" ? "" : "none";
      showReplay();
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
// A view that declares buildSource is asked FIRST, and for both sources — it
// doesn't get to shape the sine and then have the guitar handed to it whole. The
// order used to be the other way round, so delay's pluck-and-silence loop only
// ever ran on sine: the charts drew a burst while your ears got 683 ms of ring
// smeared into itself, and the panel and the speaker disagreed about what the
// pedal does. If a view has an opinion about its input, it has it on every input.
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
// ↻ pluck restarts the note, and there's only a note to restart in guitar mode —
// the sine is a continuous oscillator with no beginning to go back to. It used to
// sit here greyed out on every other view of the page, which is a control
// advertising a capability the page doesn't have: a disabled button says "not
// yet", and this one means "not here". Gone instead, and the transport is two
// things whenever it's two things.
function showReplay() {
  document.getElementById("replay").hidden = srcMode !== "guitar";
}

// One crossfade, where there were two independent levels. See index.html for why
// two numbers were the wrong shape for one question; here it just means the pair
// can't drift, because there's only one of them: dry is whatever wet isn't.
const blendS = () => document.getElementById("blend");
function setBlend() {
  const b = +blendS().value;
  document.getElementById("blendo").textContent = b.toFixed(2);
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
// Build the mounted view's wet chain onto the standing dry/wet/master graph, and
// (re)connect the two paths into it. Called on first play and again after a
// family swap, which leaves the context and the outer graph alone.
function connectView() {
  audio = view.buildAudio(actx, inGain, H);
  audio.wetOut.connect(wetGain).connect(master); // wet path
  inGain.connect(dryGain).connect(master); // dry path
  updateAudio();
  setBlend();
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
  document.getElementById("whytxt").innerHTML = view.why;
  document.getElementById("blend").value = view.blendDefault;
  // headlines the view owns. The centre bar's isn't one of them: it names the
  // pedal, not the family, so setPedal() writes it at the end of this function.
  if (view.spectrumTitle)
    document.getElementById("specnar").textContent = view.spectrumTitle;
  // What the two output panels ARE. Neither word is the page's to hardcode — it
  // did, for all three families, and both lines went quietly wrong the moment a
  // family drew something else. The top defaults to "waveform" because the
  // harness's own dry-vs-wet plot is what it draws unless a view says otherwise.
  //
  // "waveform", where this said "time" for as long as the word was the head of a
  // 10px spec line — "time · in vs out" — and "time" is fine there, because a
  // spec line is read as a list of axes and that IS the x axis. It's the chart's
  // NAME now (see .ctype), and a name has to be the kind of noun the reader is
  // asking for: they want to know what they're looking at, and the answer is a
  // waveform, an envelope, a spectrum. None of those is "time". The connector
  // caption between the panels already used the chart-type word on every family,
  // so this was the vocabulary the page had — it just wasn't the one the loud
  // label was using. That caption is gone now (see `why` in the contract) and
  // these two chips are the only place the words live.
  document.getElementById("timetech").textContent = view.timeTech ?? "waveform";
  document.getElementById("spectech").textContent = view.spectrumTech;
  document.getElementById("specunit").textContent = view.spectrumUnit
    ? ` (${view.spectrumUnit})`
    : "";
  renderLesson();
  buildControls();
  // seed labels + defaults from the asked-for pedal, falling back to the
  // family's first for an id the URL made up
  setPedal(opts.pedal);
  if (actx) connectView(); // playing already? swap the chain under the audio
  else setBlend(); // otherwise just show the new family's starting mix

  if (!wired) {
    wired = true;
    // The bench row's column names. Not the view's — they're the same words
    // whatever is mounted, and they come from rows.js so that this page and the
    // catalog name their shared columns once, together. "family" is the fourth,
    // which only this page has.
    document.getElementById("ledehead").appendChild(headRow("family"));
    wireSourceToggle();
    wireTransport();
    showReplay();
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
