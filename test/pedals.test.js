// Unit tests for the pedals (docs/js/pedals.js): the Pedal instances (their
// process/genInput/defaults) plus the delay family's pure DSP — the difference
// equation and the tap train. Run with `npm test` (i.e. `node --test`). Pure
// data / pure functions — no browser. The generic engines these feed (shapeSignal,
// envelope) are tested in dsp.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PEDALS,
  CLIPPING,
  DELAYS,
  ClippingPedal,
  DelayPedal,
  echo,
  impulseResponse,
} from "../docs/js/pedals.js";

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

test("clipping pedals carry a curve; delay pedals carry starting knobs", () => {
  for (const p of CLIPPING) {
    assert.ok(p instanceof ClippingPedal);
    assert.equal(typeof p.fn, "function", `${p.id}.fn`);
    assert.equal(typeof p.drive, "number", `${p.id}.drive`);
    // no defaults: switching clipping pedals leaves the knobs where they were
    assert.deepEqual(p.defaults, {}, `${p.id} declares no knob defaults`);
  }
  for (const p of DELAYS) {
    assert.ok(p instanceof DelayPedal);
    assert.equal(typeof p.defaults.time, "number", `${p.id}.defaults.time`);
    assert.equal(typeof p.defaults.feedback, "number", `${p.id}.defaults.feedback`);
  }
});

test("PEDALS is the whole catalog, both families, keyed by id", () => {
  assert.deepEqual(Object.keys(PEDALS), [
    "overdrive",
    "distortion",
    "fuzz",
    "echo",
    "slapback",
    "ambient",
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
