// Effect-neutral harness. Everything not specific to one page lives here: the two
// analyzer screens (dry-vs-wet), the pedal face and its knobs, the SIGNAL input
// scope, the footswitch bypass, the monitor (dry/wet blend + volume), the source
// toggle, and the patch cables. It renders a VIEW over a list of PEDALS: the pedals
// (from pedals/) are the model, the view is the page's UI. Pure DSP from dsp.js.
//
// The bench is a wired signal chain read left to right: an input generator, the
// pedal, an output analyzer. Every screen is the output against the input; the
// input alone gets the SIGNAL scope, the pedal's own curve the TRANSFORM screen.
//
// A view module (clipping.js, delay.js, …) supplies the family's UI and pedals and
// hands it to mount(). The contract (unchanged from the deck layout):
//
//   const view = {
//     id, navLabel,           // family key + name; the nav uses it as the shelf
//                             // heading, over the family's signal class
//     blendDefault,           // where the dry/wet crossfade starts (0 dry, 1 wet)
//     pedals: [ Pedal, … ],   // what the nav lists; the selected one drives
//                             // input+process
//     timeTech?,              // the TOP screen's chart-type word. Defaults to
//                             // "waveform"; override with drawTime.
//     spectrumTitle,          // bottom-screen claim. A string is the family's;
//                             // a fn(pedal) is rewritten per pick.
//     spectrumTech,           // the BOTTOM screen's chart-type word
//     bandSwap?,              // cross which screen reads CHANGES vs YOU HEAR
//                             // (modulation: the pulse you hear is the top screen)
//     lesson?,                // {formula, formulaNote, klass?, oneLiner, body,
//                             // aside?} — prose below the chain. Omit → hidden.
//     controls:[ {id, label, min, max, step, def, fmt?(v)->string}, … ], // knobs
//     thumbSquare?,           // curve reads against y = x? Squares the TRANSFORM
//                             // screen glyph and catalog thumbnail — see thumb.js.
//     drawCenter(F, pedal, params, H),           // the family's own curve; the
//                             // TRANSFORM screen and catalog thumbnail, off this hook
//     drawTime?(F, inp, out, pedal, src, H, params), // the TOP screen. Omit and
//                             // the harness draws dry-vs-wet waveform (drawTime below).
//     drawSpec(F, inp, out, pedal, src, H, params),  // the BOTTOM screen
//     buildAudio(actx, inGain, H) -> { wetOut, update(pedal, params, state, match), dispose?() },
//     buildSource?(actx, {srcMode, guitar}) -> AudioNode,  // the view's own source.
//   };
//
// mount(view, {pedal}) can be called again to swap families in place; selectPedal()
// moves within the family already up (no remount, so the audio chain stays put).
// Nothing here chooses a pedal: the nav owns that; the page turns its choice into a
// mount() or selectPedal().
import { F0, MSMAX, normalize, parseWav, SPAN, SR } from "../dsp.js";
// drawing primitives and palette, shared with the catalog (see chart.js).
import { baseline, frame as fit, H, line, titles, txt } from "./chart.js";
// the two scope claims, resolved by the same code the catalog uses (see setPedal)
import { claims } from "./rows.js";
// the TRANSFORM screen's curve is the catalog's thumbnail, live. See drawRail.
import { drawThumb } from "./thumb.js";

const { DRY, ZERO } = H.colors;
// The palette the analyzer draws with while the pedal is bypassed: the "out" trace
// is painted the "in" grey, so a footswitch-off screen reads as one untouched
// signal (out === in then) instead of an orange line laid over the grey one.
const H_BYPASS = { ...H, colors: { ...H.colors, WET: H.colors.DRY } };

// The type-badge glyphs, keyed by chart word: a wave for any time trace (signal,
// waveform, envelope), analyzer bins for a spectrum. In the chip's own ink.
const WAVE_IC =
  '<svg viewBox="0 0 20 12" aria-hidden="true"><path d="M1 6 Q4 1 7 6 T13 6 T19 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const BARS_IC =
  '<svg viewBox="0 0 20 12" fill="currentColor" aria-hidden="true"><rect x="2" y="1" width="2.4" height="10"/><rect x="6.8" y="3.5" width="2.4" height="7.5"/><rect x="11.6" y="5.5" width="2.4" height="5.5"/><rect x="16.4" y="7.5" width="2.4" height="3.5"/></svg>';
const techIcon = (tech) => (tech === "spectrum" ? BARS_IC : WAVE_IC);
// the TRANSFORM screen header's own glyph — a bending curve
const CURVE_IC =
  '<svg viewBox="0 0 15 13" aria-hidden="true"><path d="M1 11.5 C 6 11.5, 6 1.5, 13 1.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

// ---- module-level state ----------------------------------------------------
let view = null; // the mounted page: pedals + UI hooks
let pedal = null; // the currently selected Pedal instance
const level = 1.0;
const params = {}; // live control values, keyed by control id
const ctlDefs = {}; // control id -> its {min,max,step,def,fmt,…} spec
let srcMode = "sine", // "sine" | "guitar"
  guitar = null; // Float32Array of the clean note, 48 kHz mono
let engaged = true; // footswitch: true = the pedal is in circuit, false = bypassed
let lastState = null,
  lastMatch = 1; // process() output the audio graph needs (set each render)

// ---- canvas plumbing -------------------------------------------------------
const C = {};
const MARGINS = { L: 40, R: 12, T: 10, B: 26 };
// a glyph labels nothing — just enough to keep a stroke off its edge
const GLYPH_MARGINS = { L: 6, R: 6, T: 6, B: 6 };
const frame = (cv) => fit(cv, MARGINS);

// ---- pedal-declared sizing --------------------------------------------------
const spanMs = () =>
  pedal.spanSamples === SPAN ? MSMAX : (pedal.spanSamples / SR) * 1000;

// ---- input generation ------------------------------------------------------
function genInput() {
  return pedal.genInput({ srcMode, guitar, n: pedal.sampleCount });
}

// ---- render (effect-neutral orchestration) ---------------------------------
// Bypassed, the output IS the input: the analyzer's out-trace lands on the in-trace
// (no change), the spectrum drops to the fundamental, the envelope loses its
// repeats/pulse. The audio path mutes the wet chain in step (see setMix).
function render() {
  const inp = genInput();
  let out;
  if (engaged) {
    const r = pedal.process(inp, params);
    out = r.out;
    lastState = r.state ?? null;
    lastMatch = r.match ?? 1;
  } else {
    out = inp;
    lastState = null;
    lastMatch = 1;
  }
  // bypassed: paint the analyzer in the "in" grey, so the out-trace (which equals
  // the input then) reads as one untouched signal, not a red line over the grey
  const Hh = engaged ? H : H_BYPASS;
  document.getElementById("scope")?.classList.toggle("bypassed", !engaged);
  drawRail(inp);
  if (view.drawTime) view.drawTime(frame(C.time), inp, out, pedal, srcMode, Hh, params);
  else drawTime(inp, out, lastMatch, Hh);
  view.drawSpec(frame(C.spec), inp, out, pedal, srcMode, Hh, params);
}

// The two live glyphs off to the side of the analyzer: the pedal's TRANSFORM curve
// (the catalog thumbnail, drawn off the live knobs) and the SIGNAL scope (the note
// going in — SPAN samples, three carrier periods, a readable wave on any source).
function drawRail(inp) {
  if (C.curve) {
    C.curve.classList.toggle("glyph--square", !!view.thumbSquare);
    drawThumb(C.curve, view, pedal, params);
  }
  if (!C.srcglyph) return;
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

// index ramp for sample plots' x's, memoized by length
const ramps = new Map();
function ramp(n) {
  let r = ramps.get(n);
  if (!r) {
    r = Array.from({ length: n }, (_, i) => i);
    ramps.set(n, r);
  }
  return r;
}

// The top screen's default: dry and wet waveforms on shared axes. A slower-span
// family (an LFO, a row of echoes) overrides drawTime instead.
function drawTime(inp, out, match, Hh = H) {
  const { DRY, WET } = Hh.colors;
  const F = frame(C.time),
    { g, L, R, T, B } = F;
  const span = pedal.spanSamples;
  const sx = (i) => L + (i / span) * (R - L),
    sy = (y) => (T + B) / 2 - y * ((B - T) / 2 - 4);
  baseline(g, F, sy); // the scope's centre line — partner to the spectra's dbLadder
  const od = new Float64Array(span);
  for (let i = 0; i < span; i++) od[i] = out[i] * match;
  line(g, ramp(span), inp.subarray(0, span), sx, sy, DRY, 1.5);
  line(g, ramp(span), od, sx, sy, WET, 2);
  txt(g, "+1", L - 5, sy(1), "end", "middle");
  txt(g, "0", L - 5, sy(0), "end", "middle");
  txt(g, "-1", L - 5, sy(-1), "end", "middle");
  txt(g, "0", sx(0), B + 3, "start", "top");
  txt(g, spanMs().toFixed(0), sx(span), B + 3, "end", "top");
  titles(g, F, "amplitude ↕", "time (ms) →");
}

// ---- the pedal face --------------------------------------------------------
// Rebuilt on every pick (a pedal is a different object — hue, brand, formula), which
// is fine: it's DOM, not audio. Its knobs read the live `params`, so a rebuild keeps
// the user's settings; the drag/stomp handlers are delegated on #pedalobj (wired
// once) so replacing its innerHTML never loses them. `params` seeding and pedal
// choice happen in mount()/setPedal(); nothing here touches the audio graph.
function inkOnHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.56 ? "#231f10" : "#f6f3e6";
}
// a knob at rotation `frac` in [0,1] over a −135°..+135° sweep
function dialSVG(frac) {
  const a = (-135 + frac * 270) * (Math.PI / 180),
    px = (24 + Math.sin(a) * 16).toFixed(1),
    py = (24 - Math.cos(a) * 16).toFixed(1);
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19" fill="rgba(0,0,0,.55)" stroke="rgba(0,0,0,.4)"/><circle cx="24" cy="24" r="19" fill="none" stroke="rgba(255,255,255,.16)"/><line x1="24" y1="24" x2="${px}" y2="${py}" stroke="#eae7d9" stroke-width="2.6" stroke-linecap="round"/></svg>`;
}
function renderPedal() {
  const hue = pedal.art?.hue ?? "#8a8f82";
  const ink = inkOnHue(hue);
  const knobs = view.controls
    .map((c, i) => {
      const frac = (params[c.id] - c.min) / (c.max - c.min);
      return `<div class="dial" data-knob="${i}" title="drag to turn"><span class="kn">${dialSVG(frac)}</span><span class="dcap" style="color:${ink}">${c.label}</span><span class="dval" style="color:${ink}">${fmtCtl(c, params[c.id])}</span></div>`;
    })
    .join("");
  document.getElementById("pedalobj").innerHTML = `
    <div class="pedal" style="--hue:${hue};--pedink:${ink}">
      <span class="screw tl"></span><span class="screw tr"></span><span class="screw bl"></span><span class="screw br"></span>
      <div class="pbrand">${pedal.label}</div>
      <div class="pknobs">${knobs}</div>
      <div class="psilk">${pedal.tech ?? ""}</div>
      <div class="silknote">${pedal.techNote ?? ""}</div>
      <div class="pscreen"><div class="pscreenhdr">${CURVE_IC}transform</div><canvas data-c="curve"></canvas></div>
      <div class="footwrap"><button class="footsw" id="footsw" title="stomp to bypass" aria-label="engage or bypass the pedal"><span class="hex"></span><span class="cap"></span></button><div class="footstate"><span class="pled" id="pled"></span><span class="footcap" id="footcap">on</span></div></div>
    </div>`;
  C.curve = document.querySelector('[data-c="curve"]');
  setEngagedUI();
}
// redraw one knob after a drag (just its dial + readout, not the whole face)
function updateKnob(i) {
  const c = view.controls[i];
  const frac = (params[c.id] - c.min) / (c.max - c.min);
  const d = document.querySelectorAll("#pedalobj .dial")[i];
  if (!d) return;
  d.querySelector(".kn").innerHTML = dialSVG(frac);
  d.querySelector(".dval").textContent = fmtCtl(c, params[c.id]);
}
function setEngagedUI() {
  const pled = document.getElementById("pled");
  if (pled) pled.classList.toggle("off", !engaged);
  const fc = document.getElementById("footcap");
  if (fc) {
    fc.textContent = engaged ? "on" : "off";
    fc.classList.toggle("off", !engaged);
  }
}

// ---- controls (knobs) ------------------------------------------------------
const DRAG_PX = 160; // vertical drag, in px, to sweep a knob its whole range
function fmtCtl(c, v) {
  return c.fmt ? c.fmt(v) : String(v);
}
const clampCtl = (c, v) => Math.max(c.min, Math.min(c.max, v));
const snapCtl = (c, v) => (c.step ? Math.round(v / c.step) * c.step : v);

let drag = null;
function wirePedal() {
  const pobj = document.getElementById("pedalobj");
  pobj.addEventListener("pointerdown", (e) => {
    const d = e.target.closest(".dial");
    if (!d) return;
    const i = +d.dataset.knob,
      c = view.controls[i];
    drag = { i, c, y: e.clientY, v: params[c.id] };
    d.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  pobj.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { c } = drag;
    const v = drag.v + ((drag.y - e.clientY) / DRAG_PX) * (c.max - c.min);
    params[c.id] = clampCtl(c, snapCtl(c, v));
    updateKnob(drag.i);
    schedule();
  });
  const end = () => {
    drag = null;
  };
  pobj.addEventListener("pointerup", end);
  pobj.addEventListener("pointercancel", end);
  // the footswitch: bypass is a real control, on the charts and in the audio
  pobj.addEventListener("click", (e) => {
    if (!e.target.closest("#footsw")) return;
    engaged = !engaged;
    setEngagedUI();
    setMix();
    schedule();
  });
}

// Select a pedal: snap any knobs it declares defaults for (the rest persist — bias
// stays put across clipping pedals), rebuild the face, and rewrite the two scope
// claims. Silent — the nav owns the choosing, the page owns the URL.
function setPedal(id) {
  pedal = view.pedals.find((p) => p.id === id) ?? view.pedals[0];
  for (const [k, v] of Object.entries(pedal.defaults)) {
    const c = ctlDefs[k];
    params[k] = c ? clampCtl(c, v) : v;
  }
  renderPedal();
  // The scope claims, from the resolver shared with the catalog (rows.js) so the two
  // pages can't disagree. topNar rides the top screen, botNar the bottom; bandSwap
  // only crosses which screen is CHANGES vs YOU HEAR (modulation hears the pulse on
  // the top screen and shows the sidebands it makes on the bottom).
  const { topNar, botNar } = claims(view, pedal);
  document.getElementById("topClaim").textContent = topNar;
  document.getElementById("botClaim").textContent = botNar;
  document.getElementById("topRole").textContent = view.bandSwap ? "you hear:" : "changes:";
  document.getElementById("botRole").textContent = view.bandSwap ? "changes:" : "you hear:";
  // the tab names the pedal, because the URL does (?pedal=overdrive)
  document.title = `Pedal signals — ${pedal.label}`;
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

// the SIGNAL screen's claim; the scope itself is drawn by drawRail on each render
function updateInput() {
  const cl = document.getElementById("inClaim");
  if (cl) cl.textContent = srcMode === "guitar" ? "a plucked note" : "a steady sine tone";
  showReplay();
}

// ↻ pluck restarts the note from the attack, and only guitar has a note to restart
// (sine is a continuous oscillator) — so it lives by the source toggle, shown on
// guitar only.
function showReplay() {
  const r = document.getElementById("replay");
  if (r) r.hidden = srcMode !== "guitar";
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
      document.getElementById("gcredit").hidden = srcMode !== "guitar";
      if (actx) startSource();
      updateInput();
      schedule();
    };
  });
}

// ---- audio -----------------------------------------------------------------
// Generic graph: a dry tap and the effect's wet chain, blended and summed through a
// master the volume knob rides. The effect owns everything between inGain and wetOut.
let actx,
  srcNode,
  inGain,
  wetGain,
  dryGain,
  master,
  audio = null, // { wetOut, update } from effect.buildAudio
  audioStarted = false;
const VOL_MAX = 0.6; // master ceiling at volume 1 — headroom, dry+wet can sum

// The signal is "always live", but a browser won't start an AudioContext without a
// user gesture. Any first touch on the bench (a knob, the footswitch, the monitor,
// the nav) is that gesture; volume starts at 0, so nothing is heard until it's
// raised regardless.
function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;
  ensureAudio();
  actx.resume();
}
function startSource() {
  if (!actx) return;
  stopSource();
  if (view.buildSource) {
    srcNode = view.buildSource(actx, { srcMode, guitar });
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

// the monitor's listening controls. One crossfade (dry is whatever wet isn't, so the
// pair can't drift), gated by the footswitch — bypassed, the wet chain is muted and
// the dry note passes at full. The signal is always live, so the master carries both
// a mute toggle (sound on/off, starts off) and a level (the volume slider).
let soundOn = false;
let volume = 0.75; // monitor level 0..1, scaled by VOL_MAX; the button gates it on/off
const blendS = () => document.getElementById("blend");
const volS = () => document.getElementById("volume");
const soundBtn = () => document.getElementById("sound");
function setMix() {
  if (!actx) return;
  const b = +blendS().value;
  dryGain.gain.value = engaged ? 1 - b : 1;
  wetGain.gain.value = engaged ? b : 0;
}
function applySound() {
  if (actx) master.gain.value = soundOn ? volume * VOL_MAX : 0;
}
function setSoundUI() {
  const b = soundBtn();
  b.classList.toggle("on", soundOn);
  b.setAttribute("aria-pressed", String(soundOn));
  b.querySelector(".soundlbl").textContent = soundOn ? "on" : "off";
}
function wireMonitor() {
  blendS().oninput = () => {
    startAudioOnce();
    setMix();
  };
  volS().oninput = () => {
    startAudioOnce();
    volume = +volS().value;
    applySound();
  };
  soundBtn().onclick = () => {
    startAudioOnce();
    soundOn = !soundOn;
    setSoundUI();
    applySound();
  };
  setSoundUI();
}
function updateAudio() {
  if (!actx) return;
  inGain.gain.value = level;
  audio.update(pedal, params, lastState, lastMatch);
  applySound();
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
  setMix();
  startSource();
}
function disconnectView() {
  stopSource();
  inGain.disconnect();
  wetGain.disconnect();
  audio.wetOut.disconnect();
  audio.dispose?.();
  audio = null;
}

// ---- patch cables ----------------------------------------------------------
// input → pedal → output, drawn as an SVG under the chain and recomputed from the
// live element rects on every resize/scroll (defensive: any missing box, no cables).
function cablePath(a, b, sag) {
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2 + sag;
  return `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;
}
function layoutCables() {
  const svg = document.getElementById("cables"),
    main = document.querySelector(".main");
  const inbox = document.getElementById("inputbox"),
    ped = document.querySelector(".pedal"),
    scope = document.getElementById("scope");
  if (!svg || !main || !inbox || !ped || !scope) return;
  const mr = main.getBoundingClientRect(),
    sx = main.scrollLeft,
    sy = main.scrollTop;
  const rel = (el, fx, fy) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - mr.left + sx + r.width * fx, y: r.top - mr.top + sy + r.height * fy };
  };
  const iRight = rel(inbox, 1, 0.62),
    pLeft = rel(ped, 0, 0.5),
    pRight = rel(ped, 1, 0.5),
    sIn = rel(scope, 0, 0.3);
  const c1 = cablePath({ x: iRight.x - 2, y: iRight.y }, { x: pLeft.x + 2, y: pLeft.y }, 22);
  const c2 = cablePath({ x: pRight.x - 2, y: pRight.y }, { x: sIn.x + 2, y: sIn.y }, 22);
  const plug = (p) =>
    `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#3a3d38" stroke="#111" stroke-width="1"/><circle cx="${p.x}" cy="${p.y}" r="2" fill="#c9ccc4"/>`;
  svg.innerHTML =
    `<path d="${c1}" fill="none" stroke="#111" stroke-width="7" stroke-linecap="round"/><path d="${c1}" fill="none" stroke="#4a4d47" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="${c2}" fill="none" stroke="#111" stroke-width="7" stroke-linecap="round"/><path d="${c2}" fill="none" stroke="#4a4d47" stroke-width="4" stroke-linecap="round"/>` +
    plug(iRight) + plug(pLeft) + plug(pRight) + plug(sIn);
}
function wireCables() {
  document.querySelector(".main").addEventListener("scroll", () =>
    requestAnimationFrame(layoutCables),
  );
}

let resizeT = 0;
function onResize() {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    render();
    updateInput();
    layoutCables();
  }, 80);
}

// ---- lesson section --------------------------------------------------------
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
// its wet chain and the live values keyed by knob id (a stale `time` from delay must
// not reach tremolo). The context, outer graph, guitar buffer, source mode, engaged
// state, and once-wired listeners survive.
function unmount() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (actx) disconnectView();
  for (const k of Object.keys(params)) delete params[k];
  for (const k of Object.keys(ctlDefs)) delete ctlDefs[k];
  lastState = null;
  lastMatch = 1;
}

// Move to another pedal in the family already up. Not a mount(): the family is
// unchanged, so its audio chain stays standing rather than rebuild under a note.
export function selectPedal(id) {
  setPedal(id);
}

const setChip = (id, word) => {
  document.getElementById(id).innerHTML = `${techIcon(word)}<span>${word.toUpperCase()}</span>`;
};

let wired = false;
export function mount(v, opts = {}) {
  if (view) unmount();
  view = v;
  document.querySelectorAll("canvas").forEach((cv) => {
    C[cv.dataset.c] = cv;
  });
  // seed the knob specs + live params (all controls), before setPedal overrides the
  // ones the picked pedal declares
  for (const c of view.controls) {
    ctlDefs[c.id] = c;
    params[c.id] = c.def;
  }
  // the three screen chips (icon + word): the input is a signal, the two output
  // screens whatever the family declares (waveform/envelope, spectrum/envelope)
  setChip("inctype", "signal");
  setChip("topctype", view.timeTech ?? "waveform");
  setChip("botctype", view.spectrumTech);
  document.getElementById("blend").value = view.blendDefault;
  renderLesson();
  // seed labels + defaults from the asked-for pedal (unknown falls back to first)
  setPedal(opts.pedal);
  if (actx) connectView(); // playing already? swap the chain under the audio
  else setMix();

  if (!wired) {
    wired = true;
    wireSourceToggle();
    wireMonitor();
    wirePedal();
    wireCables();
    // ↻ pluck: start audio if it hasn't been, then re-trigger the note from the top
    document.getElementById("replay").onclick = () => {
      startAudioOnce();
      startSource();
    };
    // any first touch on the bench starts the (silent-at-0) audio context
    document.querySelector(".app").addEventListener("pointerdown", startAudioOnce, {
      capture: true,
    });
    addEventListener("resize", onResize);
    loadGuitar();
  }
  updateInput();
  render();
  requestAnimationFrame(layoutCables);
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
