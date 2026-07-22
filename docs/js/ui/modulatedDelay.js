// Modulated-delay-family VIEW (chorus / flanger): only the UI. The pedal model
// (swept comb out = x[n] + g·x[n−D(n)], the interpolated delay line) lives on
// ModulatedDelayPedal in pedals/; this module renders the swept-delay-time panel,
// the shimmer envelope, the comb (gain-vs-frequency) chart, the rate/depth
// controls, and the live modulated DelayNode. Held-peak envelope from dsp.js; the
// delay curve and comb shape from the pedal's own math.
import { envelopeHeld, F0, smooth } from "../dsp.js";
import {
  CHORUSES,
  combResponseDb,
  DELAY_FLOOR_MS,
  SPANMS_CHORUS,
} from "../pedals/index.js";

// drawCenter plots D(t) from the formula over a fixed window (like modulation's
// LFO), so a fixed window reads easier than one sized for the slowest rate.
const CURVE_SPAN_MS = 1200;
// The delay-time axis, shared by both pedals so their sweeps read against one
// scale: chorus rides high, flanger low. Clears chorus's ~15 ms peak.
const DMAX_MS = 20;

// The comb chart runs 0..1 kHz, not the full band: a comb has a tooth every 1/D
// Hz, so over the whole spectrum chorus's ~110 Hz spacing packs 30+ teeth into a
// solid blur. Zoomed here it reads as what it is — chorus a fine comb of ~9 teeth,
// flanger ~4 deep wide ones. f₀ (222 Hz) sits inside the window, so the note's
// place on the comb is visible.
const COMB_FMAX = 1000;
// dB window: a peak of 1+g (≈ +4.6 dB at flanger's g) up top, room for the deepest
// 1−g notch (≈ −10 dB) below.
const DB_TOP = 6,
  DB_BOT = -18;

export default {
  id: "chorus",
  navLabel: "chorus",
  // Half — a real chorus/flanger mix knob: the dry path is untouched, so the copy
  // blends against it. Full wet on a flanger is all whoosh, no note.
  blendDefault: 0.5,
  pedals: CHORUSES,
  // The top panel is the shimmer envelope, not the harness's waveform — see drawTime.
  timeTech: "envelope",
  // The comb (bottom) is what the pedal DOES; the shimmer you HEAR is the envelope
  // (top). Same crossing as modulation — the band swaps which screen reads CHANGES
  // vs YOU HEAR (see harness).
  bandSwap: true,
  spectrumTitle: (pedal) => pedal.whatChanges,
  // "comb", not "spectrum": the bottom panel is the pedal's gain vs frequency — an
  // EQ-style curve of peaks and notches — NOT the note's spectrum. A single sine's
  // spectrum is one line; a comb only bites frequencies the signal actually has, so
  // drawing it against the note would prove nothing on a pure tone. This shows the
  // comb itself (flat unity IN, combed OUT); the harmonics it notches live in the
  // note, not here.
  spectrumTech: "comb",
  spectrumUnit: "dB",

  lesson: {
    formula: "y[n] = x[n] + g·x[n−D(n)]",
    formulaNote: "a copy delayed by an amount that keeps moving",
    klass: "linear, time-varying (LTV)",
    oneLiner: "it chases itself a few milliseconds behind",
    body: `
      <h2>What's actually going on</h2>
      <p><strong>It's a delay — the same equation as the echo pedal — but the
      delay is a hair long, a few to a few dozen milliseconds, far too short to
      hear as a separate repeat.</strong> Sum a signal with a copy of itself that
      close behind and you don't hear an echo, you get a <em>comb filter</em>:
      at every frequency where the copy comes back a half-cycle late it cancels
      the original, notching that frequency out. The notches land at odd
      multiples of 1/(2·D) and march up the spectrum evenly — a comb.</p>
      <p>Now move the delay. As D slides, the whole comb slides with it, and the
      moving delay stretches and squeezes the copy in time — a Doppler detune
      that drifts the copy's pitch a few cents off the dry. Those two together
      are the effect you hear: the sweeping notches colour the tone, the detune
      makes it shimmer and thicken. Chorus keeps the delay longer and the sweep
      slow and gentle; a flanger runs the delay short and the copy loud, so the
      teeth are few, wide, and deep — that's the metallic jet-plane whoosh.</p>
    `,
    aside: {
      title: "Why it's a delay and not a filter",
      body: `
        <p>Nothing here has a resonant filter in it — no cutoff, no Q. The comb
        is a side effect of addition: <code>x[n] + g·x[n−D]</code> is a sum of
        two copies, and wherever a frequency's period divides evenly into
        <em>twice</em> D the two copies land inverted and subtract. So the
        "filter" is just arithmetic on a delayed copy, which is why the family
        is linear — play twice as loud, get twice as loud out.</p>
        <p>It's the same family as the echo pedal, one knob turned by two orders
        of magnitude. Wind D up past ~50 ms and the comb's teeth crowd so close
        the ear stops hearing colour and starts hearing a distinct repeat — you've
        walked out of chorus and into delay. The boundary between the two families
        is a delay time, nothing more.</p>
      `,
    },
  },

  controls: [
    { id: "rate", label: "rate", min: 0.1, max: 6, step: 0.05, def: 0.8, fmt: (v) => `${v.toFixed(2)} Hz` },
    { id: "depth", label: "depth", min: 0, max: 10, step: 0.5, def: 6, fmt: (v) => `${v.toFixed(1)} ms` },
  ],

  // center panel: the delay time D(t) the sweep traces, with a reference line at
  // the pedal's centre delay so the sweep reads as a wobble around it.
  drawCenter(F, pedal, params, H) {
    const { L, R, T, B } = F;
    const D = pedal.curve(params);
    H.curvePanel(
      F,
      {
        sx: (ms) => L + (ms / CURVE_SPAN_MS) * (R - L),
        sy: (d) => B - (d / DMAX_MS) * (B - T - 6),
        from: 0,
        to: CURVE_SPAN_MS,
        curve: D,
        // one rule at the centre delay the sweep wobbles around; the axis ends get
        // a label with no rule.
        refs: [{ v: pedal.centerMs, label: pedal.centerMs.toFixed(0) }],
        yLabels: [
          { v: DMAX_MS, label: `${DMAX_MS}` },
          { v: 0, label: "0" },
        ],
        ytitle: "delay (ms)",
        xtitle: "time (ms)",
      },
      H,
    );
  },

  // Output TOP panel: the wet envelope (orange) against the dry (grey). A steady
  // tone has a flat dry envelope, so the pulses are pure effect: as the comb slides,
  // its teeth sweep across the note's frequency, and the note rides up each peak and
  // down into each notch. That amplitude wobble IS the comb response of the bottom
  // panel, read at f₀ over time — and it flattens as the rate goes to zero.
  //
  // Overrides the harness waveform: 65536 samples of a 222 Hz carrier into ~400 px
  // is a filled band, not a wave (same reason as modulation).
  drawTime(F, inp, out, _pedal, _src, H) {
    // Held follower (the carrier is sustained), smoothed over one carrier period so
    // the staircase reads as the pulse it is. See dsp.js / modulation. yMax 1.5: the
    // wet peaks push above unity where the comb teeth pile the copy in phase.
    H.envelopePanel(
      F,
      {
        dry: smooth(envelopeHeld(inp)),
        wet: smooth(envelopeHeld(out)),
        spanMs: SPANMS_CHORUS,
        yMax: 1.5,
      },
      H,
    );
  },

  // Output BOTTOM panel: the comb the pedal makes — an EQ-style curve of gain vs
  // frequency. Every frequency goes in at unity (the flat grey IN line) and comes
  // out scaled by |1 + g·e^{−jωD}| (the orange OUT comb): a peak of 1+g where the
  // copy lands in phase, a notch of 1−g where it lands inverted, teeth spaced 1/D
  // apart. Chorus's longer delay packs its teeth close (a fine comb); flanger's
  // shorter one spreads them wide and, with a louder copy, deeper — that spacing
  // and depth IS the difference between the two.
  //
  // Drawn from the comb formula, not an FFT of `out`: it's what the pedal does to
  // ALL frequencies, so it doesn't depend on the note (a sine has one frequency —
  // nothing for a comb to bite). The f₀ marker shows where the note rides on the
  // comb: the tooth it sits on is the level the top panel tracks, and the sweep
  // sliding that tooth past f₀ is the shimmer.
  drawSpec(F, _inp, _out, pedal, _src, H) {
    const { g, L, R, T, B } = F;
    const { DRY, WET, GRID } = H.colors;
    // Bypassed the pedal is out of circuit, so out === in and there's no comb — the
    // harness signals this by painting WET the same grey as DRY (see H_BYPASS). With
    // g=0 the comb flattens to 0 dB and lands on the IN line, exactly as the envelope
    // panel collapses to one line when the footswitch is off.
    const bypassed = WET === DRY;
    const mix = bypassed ? 0 : pedal.mix;
    const sx = (f) => L + (f / COMB_FMAX) * (R - L),
      sy = (db) =>
        T + ((DB_TOP - Math.max(DB_BOT, Math.min(DB_TOP, db))) / (DB_TOP - DB_BOT)) * (B - T);
    // dB ladder — the analyzer furniture (see chart.js). Bipolar here: the comb
    // rides above and below the 0 dB unity line (the grey IN trace), so the dashes
    // bracket it — a peak ceiling and a notch floor, no separate floor rule.
    H.dbLadder(g, F, sy, [DB_TOP, DB_BOT]);
    // f₀ marker — where the note sits on the comb (see above)
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(sx(F0), T);
    g.lineTo(sx(F0), B);
    g.stroke();
    // IN: every frequency enters at unity — the flat grey line the comb is read
    // against. This is the "in" the panel's legend names, drawn as the trace.
    H.line(g, [0, COMB_FMAX], [0, 0], sx, sy, DRY, 1.5);
    // OUT: the comb at the centre delay (flat when bypassed).
    const dSec = Math.max(DELAY_FLOOR_MS, pedal.centerMs) / 1000;
    const xs = [],
      ys = [];
    for (let f = 0; f <= COMB_FMAX; f += 2) {
      xs.push(f);
      ys.push(combResponseDb(f, dSec, mix));
    }
    H.line(g, xs, ys, sx, sy, WET, 2);
    H.txt(g, `+${DB_TOP}`, L - 5, sy(DB_TOP), "end", "middle");
    H.txt(g, "0", L - 5, sy(0), "end", "middle");
    H.txt(g, `${DB_BOT}`, L - 5, sy(DB_BOT), "end", "middle");
    H.txt(g, "0", sx(0), B + 3, "start", "top");
    H.txt(g, "f₀", sx(F0), B + 3, "center", "top");
    for (const f of [500, 1000])
      H.txt(g, `${f}`, sx(f), B + 3, "center", "top");
    H.titles(g, F, "gain (dB)", "frequency (Hz) →");
  },

  // live audio: a DelayNode whose delayTime is driven by an LFO — an oscillator
  // (depth, in seconds) summed onto a constant (the centre delay) feeds
  // delay.delayTime, the same Dc + Da·sin(t) the buffer computes. wetOut carries
  // only the copy (mix); the harness's dry tap sums the note back.
  buildAudio(actx, inGain, _H) {
    const delay = actx.createDelay(0.1),
      wet = actx.createGain(),
      lfo = actx.createOscillator(),
      lfoGain = actx.createGain(),
      base = actx.createConstantSource();
    lfo.type = "sine";
    lfo.connect(lfoGain).connect(delay.delayTime);
    base.connect(delay.delayTime);
    inGain.connect(delay).connect(wet);
    lfo.start();
    base.start();
    return {
      wetOut: wet,
      update(pedal, params) {
        lfo.frequency.value = params.rate;
        lfoGain.gain.value = params.depth / 1000; // ms -> s
        base.offset.value = pedal.centerMs / 1000;
        wet.gain.value = pedal.mix;
      },
      // both started above, so both must be stopped on swap-out.
      dispose() {
        lfo.stop();
        base.stop();
      },
    };
  },
};
