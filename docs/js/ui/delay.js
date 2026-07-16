// Delay-family VIEW (echo / slapback / ambient): only the UI. What a delay pedal
// IS — the feedback difference equation y[n] = x[n] + fb·y[n−D], its transient
// pluck input, its longer analysis buffer — lives on the DelayPedal instances in
// pedals/. This module renders them: the tap-train center panel, the wet-vs-dry
// envelope panel, the time/feedback controls, and the live DelayNode feedback
// loop. Both envelope followers come from dsp.js — this is the one family that
// needs both, see drawSpec; the tap train + the live source's pluck come from
// pedals/ (they're the delay's own DSP).
import { envelope, envelopeHeld, SR } from "../dsp.js";
import {
  DELAYS,
  impulseResponse,
  pluck,
  PLUCK_MS,
  SPANMS,
  TAP_FLOOR,
} from "../pedals/index.js";

// The knobs' limits, named once here: the controls below declare them, and the
// pluck loop sizes itself from them. Two copies of a limit is how the loop and
// the sliders drift apart.
const TIME_MAX = 400, // ms
  FB_MAX = 0.85;
// The shortest rest that still reads as one hit rather than a stutter. Slapback's
// echoes are gone 250 ms in, but re-plucking four times a second is a machine gun,
// not a demo of a doubling — so the gap answers to the ear's spacing as well as to
// the decay, and takes whichever is longer.
const MIN_GAP_MS = 800; // ~75 bpm: a slow deliberate strum

// How long one hit's echoes need: repeats fade by fb a pass, so the last one still
// above the tap panel's "too quiet to matter" floor is the log(floor)/log(fb)-th,
// each `time` after the one before — and then it takes the pluck's own decay to
// ring out. Same count impulseResponse stops drawing at, so the tail ends where the
// panel's last stem does.
const tailMs = (time, fb) =>
  (fb > 0 ? Math.floor(Math.log(TAP_FLOOR) / Math.log(fb)) * time : 0) + PLUCK_MS;
const gapMs = (time, fb) => Math.max(tailMs(time, fb), MIN_GAP_MS);
// The longest gap the sliders can ask for — the buffer has to hold it, since the
// buffer is allocated once and the knobs move afterwards.
const GAP_MAX_MS = gapMs(TIME_MAX, FB_MAX);

// Where the loop currently turns over, in seconds. update() writes it as the
// knobs move and buildSource reads it, so whichever runs first, the two agree.
let loopEnd = GAP_MAX_MS / 1000,
  srcNode = null;

export default {
  id: "delay",
  navLabel: "delay",
  dual: "⇅ same signal — waveform above, envelope below",
  vinDefault: 0.6,
  voutDefault: 0.6,
  pedals: DELAYS,
  spectrumTitle: "each repeat is quieter — feedback sets the decay",
  // Not a spectrum: drawSpec draws peak-follower envelopes against time, on a
  // 0..1 level axis. Nothing here takes an FFT or a logarithm.
  spectrumTech: "envelope",

  lesson: {
    formula: "y[n] = x[n] + fb·y[n−D]",
    formulaNote: "this sample, plus the output from D samples ago",
    klass: "linear, time-invariant (LTI)",
    oneLiner: "it hands you back what you already played.",
    body: `
      <p><strong>What's actually going on:</strong> the pedal keeps a bucket of
      the recent past — a delay line, D samples long. Every sample, it plays
      what you're feeding it right now plus whatever fell out of the far end of
      that bucket, and drops the result back in the near end. So a hit comes
      back D samples later, and that repeat gets fed in again to come back D
      later still, each pass quieter than the last by the feedback ratio. The
      decay is geometric: fb, then fb², then fb³.</p>
      <p>Nothing here invents a frequency. The output is only ever <em>sums of
      copies</em> of what you put in, so the harmonics you get out are the
      harmonics you played — just arriving late, and more than once. That's
      what makes it linear. The two knobs are the only two numbers in the
      equation: time is D, feedback is fb.</p>
    `,
    aside: {
      title: `Why feedback stops at ${FB_MAX}`,
      body: `
        <p>Each trip round the loop multiplies the signal by <code>fb</code>.
        Below 1 that's a shrinking geometric series — the tail dies, and the
        maths converges no matter how long you wait. At exactly 1 every repeat
        returns at full strength and the tail never ends. Above 1 each pass is
        <em>louder</em> than the last, and the loop climbs until something
        clips.</p>
        <p>Real delays run this close to the edge on purpose: a tape echo with
        the repeats cranked is a self-oscillating feedback loop, howling on its
        own with nothing played into it. The slider stops at ${FB_MAX} so the
        ambient setting can get near that runaway without the demo screaming at
        you.</p>
      `,
    },
  },

  controls: [
    { id: "time", label: "time", min: 20, max: TIME_MAX, step: 5, def: 160, fmt: (v) => `${v.toFixed(0)} ms` },
    { id: "feedback", label: "feedback", min: 0, max: FB_MAX, step: 0.01, def: 0.45, fmt: (v) => v.toFixed(2) },
  ],

  // center panel: the tap train — stems at 0, D, 2D, … with the fb^k decay law
  // drawn faintly through their tops.
  drawCenter(F, _pedal, params, H) {
    const { g, L, R, T, B } = F;
    const { GRID, ZERO, ACCENT } = H.colors;
    const sx = (ms) => L + (ms / SPANMS) * (R - L),
      sy = (v) => B - v * (B - T - 6);
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(L, sy(0));
    g.lineTo(R, sy(0));
    g.stroke();
    // the geometric decay envelope fb^(ms/D) through the tap tops
    if (params.feedback > 0) {
      const xs = [],
        ys = [];
      for (let i = 0; i <= 200; i++) {
        const ms = (SPANMS * i) / 200;
        xs.push(ms);
        ys.push(params.feedback ** (ms / params.time));
      }
      H.line(g, xs, ys, sx, sy, ZERO, 1.5);
    }
    for (const { ms, level } of impulseResponse(params.time, params.feedback, SPANMS)) {
      g.strokeStyle = ACCENT;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(sx(ms), sy(0));
      g.lineTo(sx(ms), sy(level));
      g.stroke();
    }
    H.txt(g, "1", L - 5, sy(1), "end", "middle");
    H.txt(g, "0", L - 5, sy(0), "end", "middle");
    H.txt(g, "0", sx(0), B + 3, "start", "top");
    H.txt(g, SPANMS.toFixed(0), sx(SPANMS), B + 3, "end", "top");
    H.titles(g, F, "tap level", "time (ms)");
  },

  // bottom panel: the wet envelope (orange) over the dry envelope (grey) — the
  // decaying row of humps, one per repeat, that the ear hears as the echo.
  //
  // The follower answers to the SOURCE, not to this family. dsp.js says to pick
  // by the signal, and this is the one page where the same panel gets two: the
  // synthetic source is a 70 ms pluck, a transient, which wants envelope()'s
  // coast — hold it and 4.5 ms of stale peak sits on a 12 ms decay, which is most
  // of the hump. The guitar is the real note from its pick attack, which rings
  // for the whole 683 ms and is therefore SUSTAINED, exactly what a coasting
  // follower can't draw: it ripples 18% between the carrier's peaks and smears a
  // band up to 43% of level across the panel. Same page, opposite answers.
  drawSpec(F, inp, out, _pedal, src, H) {
    const { g, L, R, T, B } = F;
    const { DRY, WET } = H.colors;
    const span = out.length;
    const sx = (i) => L + (i / span) * (R - L),
      sy = (v) => B - Math.min(1, v) * (B - T - 4);
    const env = src === "guitar" ? envelopeHeld : envelope;
    const de = env(inp),
      we = env(out);
    const xs = new Array(span);
    for (let i = 0; i < span; i++) xs[i] = i;
    // Dry LAST and dashed, which is this panel's alone and not the harness's
    // habit. Everywhere else the two traces differ and painting order is a
    // detail; here the output CONTAINS the input — out[i] === inp[i] until the
    // first repeat lands — so a solid dry goes under a solid wet in exactly the
    // place it matters and is never seen again. Dashed and on top, it rides the
    // first hump instead of hiding beneath it, and the eye gets the page's whole
    // argument for free: your note is the dashed one, it stopped there, and
    // every hump after it is the pedal's.
    //
    // Dashes only work here because these are smooth curves. The waveform panel
    // above can't have this: a canvas dash walks PATH length, and a trace that
    // swings ±1 at 222 Hz spends ~500px of path in every 3px of width, so the
    // pattern chops the verticals into stipple rather than drawing a dashed line.
    H.line(g, xs, we, sx, sy, WET, 2);
    g.setLineDash([6, 4]);
    H.line(g, xs, de, sx, sy, DRY, 1.5);
    g.setLineDash([]);
    H.txt(g, "1", L - 5, sy(1), "end", "middle");
    H.txt(g, "0", L - 5, sy(0), "end", "middle");
    H.txt(g, "0", sx(0), B + 3, "start", "top");
    H.txt(g, SPANMS.toFixed(0), sx(span), B + 3, "end", "top");
    H.titles(g, F, "level", "time (ms)");
  },

  // Live source for pluck mode. The harness's default steady oscillator would be
  // useless here: a delayed copy of a continuous tone just overlaps the original,
  // so you'd see a pluck but hear no repeat. Loop one pluck followed by silence
  // instead, so each hit's echoes ring out in the gap before the next.
  //
  // The buffer holds the worst-case gap, because it's allocated once at mount and
  // the knobs move afterwards. The loop point doesn't have to sit at its end,
  // though: only the first PLUCK_MS carries the hit and the rest is silence, so
  // update() below turns the loop over wherever *this* setting's echoes have
  // finished. Moving loopEnd is silence-to-silence — no reallocation mid-drag,
  // and nothing to click.
  buildSource(actx) {
    const len = Math.round((GAP_MAX_MS / 1000) * SR);
    const buf = actx.createBuffer(1, len, SR);
    buf.copyToChannel(Float32Array.from(pluck(len)), 0);
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopEnd = loopEnd;
    srcNode = src;
    return src;
  },

  // live audio: a DelayNode with a feedback loop. wetOut carries only the repeats
  // (dry is summed back by the harness's own dry tap), so wet gain stays at unity.
  buildAudio(actx, inGain, _H) {
    const delay = actx.createDelay(2.0),
      fb = actx.createGain(),
      wet = actx.createGain();
    inGain.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    return {
      wetOut: wet,
      update(_pedal, params) {
        delay.delayTime.value = params.time / 1000;
        fb.gain.value = params.feedback;
        wet.gain.value = 1;
        // Re-space the plucks for the tail these knobs just asked for. Shortening
        // the gap while the playhead is out in the silence past the new turnover
        // wraps it there and then, which is only the next hit arriving early.
        loopEnd = gapMs(params.time, params.feedback) / 1000;
        if (srcNode) srcNode.loopEnd = loopEnd;
      },
    };
  },
};
