// Delay-family VIEW (echo / slapback / ambient): only the UI. What a delay pedal
// IS — the feedback difference equation y[n] = x[n] + fb·y[n−D], its transient
// pluck input, its longer analysis buffer — lives on the DelayPedal instances in
// pedals/. This module renders them: the tap-train center panel, the wet-vs-dry
// envelope panel, the time/feedback controls, and the live DelayNode feedback
// loop. The peak-follower envelope comes from dsp.js; the tap train + the live
// source's pluck come from pedals/ (they're the delay's own DSP).
import { envelope, SR } from "../dsp.js";
import { DELAYS, impulseResponse, pluck, SPANMS } from "../pedals/index.js";

export default {
  id: "delay",
  navLabel: "delay",
  pageTitle: "delay — pedal demo",
  dual: "⇅ same signal — waveform above, envelope below",
  vinDefault: 0.6,
  voutDefault: 0.6,
  pedals: DELAYS,
  centerTitle: "one hit → a train of repeats",
  spectrumTitle: "each repeat is quieter — feedback sets the decay",

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
      title: "Why feedback stops at 0.85",
      body: `
        <p>Each trip round the loop multiplies the signal by <code>fb</code>.
        Below 1 that's a shrinking geometric series — the tail dies, and the
        maths converges no matter how long you wait. At exactly 1 every repeat
        returns at full strength and the tail never ends. Above 1 each pass is
        <em>louder</em> than the last, and the loop climbs until something
        clips.</p>
        <p>Real delays run this close to the edge on purpose: a tape echo with
        the repeats cranked is a self-oscillating feedback loop, howling on its
        own with nothing played into it. The slider stops at 0.85 so the
        ambient setting can get near that runaway without the demo screaming at
        you.</p>
      `,
    },
  },

  controls: [
    { id: "time", label: "time", min: 20, max: 400, step: 5, def: 160, fmt: (v) => `${v.toFixed(0)} ms` },
    { id: "feedback", label: "feedback", min: 0, max: 0.85, step: 0.01, def: 0.45, fmt: (v) => v.toFixed(2) },
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
  drawSpec(F, inp, out, _pedal, _src, H) {
    const { g, L, R, T, B } = F;
    const { DRY, WET } = H.colors;
    const span = out.length;
    const sx = (i) => L + (i / span) * (R - L),
      sy = (v) => B - Math.min(1, v) * (B - T - 4);
    const de = envelope(inp),
      we = envelope(out);
    const xs = new Array(span);
    for (let i = 0; i < span; i++) xs[i] = i;
    H.line(g, xs, de, sx, sy, DRY, 1.5);
    H.line(g, xs, we, sx, sy, WET, 2);
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
  buildSource(actx) {
    const len = Math.round(1.6 * SR); // longer than any echo tail at max feedback
    const buf = actx.createBuffer(1, len, SR);
    buf.copyToChannel(Float32Array.from(pluck(len)), 0);
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
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
      },
    };
  },
};
