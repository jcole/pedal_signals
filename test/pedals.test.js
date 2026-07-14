// Unit tests for the pedal definitions (docs/src/pedals.js): the PEDALS
// transfer-curve registry. Run with `npm test` (i.e. `node --test`). Pure
// data / pure functions — no browser. The engine that runs these curves
// (shapeSignal) is generic and tested in dsp.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";

import { PEDALS } from "../docs/src/pedals.js";

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
    assert.equal(typeof p.tech, "string", `${id}.tech`);
    assert.equal(typeof p.outnar, "string", `${id}.outnar`);
    assert.equal(typeof p.drive, "number", `${id}.drive`);
    assert.equal(typeof p.fn, "function", `${id}.fn`);
  }
});
