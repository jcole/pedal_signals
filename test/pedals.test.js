// Unit tests for the pedals (docs/js/pedals/): the Pedal instances (their
// process/genInput/defaults) plus the delay family's pure DSP — the difference
// equation and the tap train — and the modulation family's LFO shapes. Run with
// `npm test` (i.e. `node --test`). Pure data / pure functions — no browser. The
// generic engines these feed (shapeSignal, envelope) are tested in dsp.test.js.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHORUSES,
  CLIPPING,
  ClippingPedal,
  combResponseDb,
  DELAYS,
  DelayPedal,
  echo,
  impulseResponse,
  ModulatedDelayPedal,
  PEDALS,
  PLUCK_MS,
  sineShape,
  squareShape,
  sweptComb,
  MODULATIONS,
  ModulationPedal,
  triangleShape,
} from "../docs/js/pedals/index.js";

test("overdrive is odd-symmetric at bias 0 and monotonic", () => {
  const { fn } = PEDALS.overdrive;
  for (const x of [-0.9, -0.4, 0.1, 0.7]) {
    assert.ok(Math.abs(fn(x, 6, 0) + fn(-x, 6, 0)) < 1e-12, "odd symmetry");
  }
  let prev = -Infinity;
  for (let x = -1; x <= 1; x += 0.05) {
    const y = fn(x, 6, 0);
    assert.ok(y >= prev, "monotonic increasing");
    prev = y;
  }
});

test("bias breaks the odd symmetry (introduces even harmonics)", () => {
  const { fn } = PEDALS.overdrive;
  assert.ok(Math.abs(fn(0.5, 6, 0.8) + fn(-0.5, 6, 0.8)) > 0.01);
});

test("distortion hard-clips into [-1, 1]", () => {
  const { fn } = PEDALS.distortion;
  for (let x = -1; x <= 1; x += 0.1) {
    const y = fn(x, 40, 0);
    assert.ok(y >= -1 && y <= 1);
  }
  assert.equal(fn(1, 40, 0), 1); // slammed to the rail
  assert.equal(fn(-1, 40, 0), -1);
});

test("fuzz clips into asymmetric rails [-0.6, 1]", () => {
  const { fn } = PEDALS.fuzz;
  for (let x = -1; x <= 1; x += 0.1) {
    const y = fn(x, 10, 0);
    assert.ok(y >= -0.6 && y <= 1);
  }
  assert.equal(fn(-1, 10, 0), -0.6); // lopsided lower rail
  assert.equal(fn(1, 10, 0), 1);
});

test("every pedal carries the metadata the UI reads", () => {
  for (const [id, p] of Object.entries(PEDALS)) {
    assert.equal(typeof p.id, "string", `${id}.id`);
    assert.equal(typeof p.label, "string", `${id}.label`);
    assert.equal(typeof p.tech, "string", `${id}.tech`);
    assert.equal(typeof p.outnar, "string", `${id}.outnar`);
    assert.equal(typeof p.process, "function", `${id}.process`);
    assert.equal(typeof p.genInput, "function", `${id}.genInput`);
  }
});

// The bench reserves the picture's slot in CSS whether or not a pedal fills it
// (see .pedalcell), so a missing `art` is a hole in the row rather than a crash —
// which is exactly the kind of thing that ships. The row's job is to say what
// you're looking at without being read; a pedal with no picture can't do it.
test("every pedal declares art the bench row can draw", () => {
  const SHAPES = ["box", "round"];
  for (const [id, p] of Object.entries(PEDALS)) {
    assert.ok(p.art, `${id} must declare art`);
    assert.ok(SHAPES.includes(p.art.shape), `${id}.art.shape is a chassis art.js draws`);
    assert.match(p.art.hue, /^#[0-9a-f]{6}$/, `${id}.art.hue is a 6-digit hex (art.js does math on it)`);
    assert.ok(
      Number.isInteger(p.art.knobs) && p.art.knobs >= 1 && p.art.knobs <= 3,
      `${id}.art.knobs is the real box's count, 1-3`,
    );
  }
});

// Colour is the whole of what tells one icon from the next at 40px — the
// silhouette says "a pedal" and only the hue says "which one". Two pedals sharing
// a hue would be two pedals with the same picture.
test("no two pedals share a hue", () => {
  const seen = new Map();
  for (const [id, p] of Object.entries(PEDALS)) {
    assert.ok(!seen.has(p.art.hue), `${id} reuses ${seen.get(p.art.hue)}'s hue ${p.art.hue}`);
    seen.set(p.art.hue, id);
  }
});

test("clipping pedals carry a curve; delay pedals carry starting knobs", () => {
  for (const p of CLIPPING) {
    assert.ok(p instanceof ClippingPedal);
    assert.equal(typeof p.fn, "function", `${p.id}.fn`);
    assert.equal(typeof p.drive, "number", `${p.id}.drive`);
    // each pedal snaps drive to its own starting point on select...
    assert.deepEqual(p.defaults, { drive: p.drive }, `${p.id}.defaults`);
    // ...but never bias, which stays where the user left it across a switch
    assert.ok(!("bias" in p.defaults), `${p.id} must not default bias`);
  }
  for (const p of DELAYS) {
    assert.ok(p instanceof DelayPedal);
    assert.equal(typeof p.defaults.time, "number", `${p.id}.defaults.time`);
    assert.equal(typeof p.defaults.feedback, "number", `${p.id}.defaults.feedback`);
  }
  for (const p of MODULATIONS) {
    assert.ok(p instanceof ModulationPedal);
    assert.equal(typeof p.defaults.rate, "number", `${p.id}.defaults.rate`);
    assert.equal(typeof p.defaults.depth, "number", `${p.id}.defaults.depth`);
    assert.equal(typeof p.fn, "function", `${p.id}.fn`);
    assert.equal(typeof p.waveType, "string", `${p.id}.waveType`);
  }
  for (const p of CHORUSES) {
    assert.ok(p instanceof ModulatedDelayPedal);
    assert.equal(typeof p.defaults.rate, "number", `${p.id}.defaults.rate`);
    assert.equal(typeof p.defaults.depth, "number", `${p.id}.defaults.depth`);
    // centre delay + copy level are the pedal's identity, not knobs (like fn)
    assert.equal(typeof p.centerMs, "number", `${p.id}.centerMs`);
    assert.equal(typeof p.mix, "number", `${p.id}.mix`);
    // the sweep must never drive the delay negative through zero
    assert.ok(p.centerMs > 0, `${p.id}.centerMs > 0`);
  }
});

test("PEDALS is the whole catalog, every family, keyed by id", () => {
  assert.deepEqual(Object.keys(PEDALS), [
    "overdrive",
    "distortion",
    "fuzz",
    "echo",
    "slapback",
    "ambient",
    "tremolo",
    "chop",
    "warble",
    "chorus",
    "flanger",
  ]);
});

test("ClippingPedal.process peak-matches wet to dry and reports the DC it removed", () => {
  const od = PEDALS.overdrive;
  const inp = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i / 3));
  let ipk = 0;
  for (const v of inp) ipk = Math.max(ipk, Math.abs(v));
  const { out, match, state } = od.process(inp, { drive: 6, bias: 0.5 });
  assert.equal(out.length, inp.length);
  let pk = 0;
  for (const v of out) pk = Math.max(pk, Math.abs(v));
  assert.ok(Math.abs(pk * match - ipk) < 1e-9, "match brings wet peak up to the input's");
  assert.equal(typeof state.outDc, "number");
});

test("DelayPedal.process runs the feedback equation at match=1 (repeats stay lower)", () => {
  const echoPedal = PEDALS.echo;
  const inp = new Float64Array(4096);
  inp[0] = 1; // one hit
  const { out, match } = echoPedal.process(inp, { time: 10, feedback: 0.5 });
  assert.equal(match, 1, "no peak-match — echoes must read as quieter");
  const D = Math.round((10 / 1000) * 48000); // time ms -> samples
  assert.ok(Math.abs(out[D] - 0.5) < 1e-9, "first repeat = fb");
});

// Both of the delay's sources are the same burst, and that's the lesson, not a
// detail of the synthetic one: a sustained input lands every repeat on a note
// that's still ringing, so there's no train in the signal for any panel to draw.
// The guitar path used to hand over 683 ms of raw ring and this is what caught
// nothing. Asserted on the SHAPE (silent past the burst), not on sample values,
// since it's the silence the echoes need.
test("both of a delay's sources are a burst — silent past PLUCK_MS, so echoes land in clear air", () => {
  const n = 32768,
    hit = Math.round((PLUCK_MS / 1000) * 48000);
  // stand-in for the real note: a sustained tone that never decays on its own
  const sustained = new Float32Array(n);
  for (let i = 0; i < n; i++) sustained[i] = Math.sin((2 * Math.PI * 220 * i) / 48000);

  for (const [src, inp] of [
    ["sine", PEDALS.echo.genInput({ srcMode: "sine", guitar: null, n })],
    ["guitar", PEDALS.echo.genInput({ srcMode: "guitar", guitar: sustained, n })],
  ]) {
    let after = 0;
    for (let i = hit; i < n; i++) after = Math.max(after, Math.abs(inp[i]));
    assert.equal(after, 0, `${src}: still ringing past the burst`);
    let peak = 0;
    for (let i = 0; i < hit; i++) peak = Math.max(peak, Math.abs(inp[i]));
    assert.ok(peak > 0.5, `${src}: no hit to echo (peak ${peak})`);
  }
});

// ---- delay: echo (y[n] = x[n] + fb·y[n-D]) ---------------------------------

// a unit impulse: the cleanest probe — whatever comes back IS the impulse response
function impulse(len) {
  const s = new Float64Array(len);
  s[0] = 1;
  return s;
}

test("echo repeats an impulse at every multiple of D, decaying by fb^k", () => {
  const out = echo(impulse(20), 5, 0.5);
  assert.equal(out[0], 1); // the dry hit rides through at unity
  assert.ok(Math.abs(out[5] - 0.5) < 1e-12, "1st repeat = fb");
  assert.ok(Math.abs(out[10] - 0.25) < 1e-12, "2nd repeat = fb^2");
  assert.ok(Math.abs(out[15] - 0.125) < 1e-12, "3rd repeat = fb^3");
  // everything between the taps stays silent
  for (const i of [1, 4, 6, 9, 11, 14, 16, 19]) assert.equal(out[i], 0);
});

test("echo at feedback 0 is the dry signal untouched", () => {
  const inp = Float64Array.from([0.4, -0.2, 0.9, 0.1, -0.7, 0.3]);
  assert.deepEqual(Array.from(echo(inp, 2, 0)), Array.from(inp));
});

test("echo repeats decay monotonically while fb < 1 (the tail dies)", () => {
  const out = echo(impulse(64), 8, 0.8);
  let prev = Infinity;
  for (let k = 0; k * 8 < 64; k++) {
    const tap = out[k * 8];
    assert.ok(tap < prev, "each repeat is quieter than the last");
    assert.ok(tap >= 0);
    prev = tap;
  }
});

test("echo leaves the signal alone before the first repeat arrives", () => {
  const inp = Float64Array.from([1, 0.5, 0.25, 0, 0, 0, 0, 0]);
  const out = echo(inp, 4, 0.7);
  for (let i = 0; i < 4; i++) assert.equal(out[i], inp[i], "pre-delay is dry");
  assert.ok(Math.abs(out[4] - 0.7 * 1) < 1e-12, "first repeat lands at D");
});

test("echo rounds a fractional delay and never collapses to D=0", () => {
  // a 0-sample delay would make y[n] = x[n] + fb·y[n], an instant runaway
  const out = echo(impulse(8), 0, 0.5);
  assert.ok(Number.isFinite(out[7]));
  assert.ok(Math.abs(out[1] - 0.5) < 1e-12, "clamped to D=1");
  // 4.4 -> 4
  assert.ok(Math.abs(echo(impulse(12), 4.4, 0.5)[4] - 0.5) < 1e-12);
});

// ---- delay: impulseResponse (the tap train) --------------------------------

test("impulseResponse lists taps at k·D with height fb^k", () => {
  const taps = impulseResponse(100, 0.5, 1000, 0.02);
  assert.deepEqual(
    taps.map((t) => t.ms),
    [0, 100, 200, 300, 400, 500],
  );
  taps.forEach((t, k) => {
    assert.ok(Math.abs(t.level - 0.5 ** k) < 1e-12, `tap ${k}`);
  });
  // stops once fb^k drops under the floor (0.5^6 = 0.0156 < 0.02)
  assert.ok(taps.every((t) => t.level >= 0.02));
});

test("impulseResponse at feedback 0 is just the dry tap", () => {
  const taps = impulseResponse(100, 0, 1000);
  assert.equal(taps.length, 1);
  assert.deepEqual(taps[0], { ms: 0, level: 1 });
});

test("impulseResponse never runs past the panel's span", () => {
  const span = 500;
  for (const t of impulseResponse(120, 0.9, span)) assert.ok(t.ms <= span);
});

// ---- modulation: LFO shapes (each bipolar in [-1, 1]) ----------------------

test("sineShape, squareShape, and triangleShape stay within [-1, 1]", () => {
  for (let i = 0; i <= 200; i++) {
    const phase = (2 * Math.PI * i) / 200;
    for (const shape of [sineShape, squareShape, triangleShape]) {
      const v = shape(phase);
      assert.ok(v >= -1 && v <= 1, `${v} at phase ${phase}`);
    }
  }
});

test("squareShape is a hard ±1 gate, never 0", () => {
  for (let i = 0; i <= 200; i++) {
    const v = squareShape((2 * Math.PI * i) / 200);
    assert.ok(v === 1 || v === -1);
  }
});

test("triangleShape hits its extremes a quarter and three-quarters through the cycle", () => {
  assert.ok(Math.abs(triangleShape(Math.PI / 2) - 1) < 1e-9);
  assert.ok(Math.abs(triangleShape((3 * Math.PI) / 2) + 1) < 1e-9);
});

// ---- modulation: ModulationPedal (y[n] = x[n]·m(t)) ------------------------

test("ModulationPedal.curve rides between 1-depth and 1", () => {
  const trem = PEDALS.tremolo;
  const m = trem.curve({ rate: 4, depth: 0.6 });
  let lo = Infinity,
    hi = -Infinity;
  for (let ms = 0; ms <= 1000; ms += 1) {
    const v = m(ms);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(Math.abs(hi - 1) < 1e-3, "peak reaches ~1 (untouched)");
  assert.ok(Math.abs(lo - 0.4) < 1e-3, "trough reaches ~1-depth");
});

test("ModulationPedal.curve at depth 0 is a constant 1 (no effect)", () => {
  const m = PEDALS.tremolo.curve({ rate: 4, depth: 0 });
  for (const ms of [0, 37, 250, 999]) assert.equal(m(ms), 1);
});

test("ModulationPedal.process multiplies sample-by-sample at match=1", () => {
  const trem = PEDALS.tremolo;
  const inp = Float64Array.from({ length: 512 }, () => 1); // constant input
  const { out, match } = trem.process(inp, { rate: 4, depth: 0.6 });
  assert.equal(match, 1, "no peak-match — the volume swing must stay visible");
  const m = trem.curve({ rate: 4, depth: 0.6 });
  for (const i of [0, 100, 300, 511]) {
    const expected = m((i / 48000) * 1000);
    assert.ok(Math.abs(out[i] - expected) < 1e-9, `sample ${i}`);
  }
});

test("chop (square LFO, depth 0.95) drives the signal near silent at its troughs", () => {
  const chop = PEDALS.chop;
  const inp = Float64Array.from({ length: 4096 }, () => 1);
  const { out } = chop.process(inp, { rate: 7, depth: 0.95 });
  let lo = Infinity;
  for (const v of out) lo = Math.min(lo, v);
  assert.ok(lo < 0.06, "square LFO gates all the way down near 1-depth");
});

// ---- modulated delay: sweptComb (y[n] = x[n] + g·x[n−D(n)]) ----------------

test("sweptComb at depth 0 is a fixed comb: dry plus one delayed copy at g", () => {
  // depth 0 freezes D at centerSamp, so an impulse rings once dry and once at D
  const inp = impulse(64);
  const out = sweptComb(inp, {
    centerSamp: 10,
    depthSamp: 0,
    rate: 5,
    mix: 0.6,
  });
  assert.equal(out[0], 1, "the dry hit rides through at unity");
  assert.ok(Math.abs(out[10] - 0.6) < 1e-12, "the copy lands at D, scaled by g");
  // nothing anywhere else — one tap, not a train (no feedback)
  for (const i of [1, 5, 9, 11, 20, 63]) assert.equal(out[i], 0);
});

test("sweptComb reads a fractional delay by interpolating between samples", () => {
  // a ramp so the interpolated value is easy to predict. D = 20.5 (above the ~9.6
  // sample floor) reads halfway between x[n−20] and x[n−21].
  const inp = Float64Array.from({ length: 64 }, (_, i) => i);
  const out = sweptComb(inp, {
    centerSamp: 20.5,
    depthSamp: 0,
    rate: 1,
    mix: 1,
  });
  // at n=40: dry 40 + copy interp(19.5) = 40 + 19.5
  assert.ok(Math.abs(out[40] - 59.5) < 1e-9, "linear interpolation of the tap");
});

test("sweptComb never reads through the delay floor on a deep sweep", () => {
  // depth well past the centre would swing D negative; the floor holds it positive,
  // so the copy stays a copy of the past, never the dry sample doubled
  const inp = Float64Array.from({ length: 4096 }, (_, i) =>
    Math.sin((2 * Math.PI * 220 * i) / 48000),
  );
  const out = sweptComb(inp, {
    centerSamp: 48, // ~1 ms
    depthSamp: 480, // ~10 ms, far deeper than the centre
    rate: 1,
    mix: 1,
  });
  assert.ok(out.every(Number.isFinite), "no NaN/Inf from a zero-crossing delay");
});

// ---- modulated delay: combResponseDb (the notch comb) ----------------------

test("combResponseDb peaks at 1+g in phase and notches at 1−g inverted", () => {
  const D = 0.005, // 5 ms -> teeth every 200 Hz, notches at 100, 300, …
    mix = 0.5;
  // in phase at DC (θ = 0): 1 + g
  assert.ok(Math.abs(combResponseDb(0, D, mix) - 20 * Math.log10(1.5)) < 1e-9);
  // inverted at f = 1/(2D) = 100 Hz: 1 − g
  assert.ok(
    Math.abs(combResponseDb(100, D, mix) - 20 * Math.log10(0.5)) < 1e-9,
    "the first notch is a 1−g cut",
  );
  // back in phase at f = 1/D = 200 Hz
  assert.ok(Math.abs(combResponseDb(200, D, mix) - 20 * Math.log10(1.5)) < 1e-9);
});

test("combResponseDb: a louder copy cuts deeper notches", () => {
  const D = 0.004;
  const notch = (mix) => combResponseDb(1 / (2 * D), D, mix); // the first null
  assert.ok(notch(0.7) < notch(0.5), "g=0.7 notches below g=0.5");
});
