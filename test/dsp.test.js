// Unit tests for the pure DSP core (docs/src/dsp.js). Run with `npm test`
// (i.e. `node --test`). No browser, no dependencies — everything here is plain
// data-in / data-out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  N,
  KBIN,
  parseWav,
  normalize,
  PEDALS,
  shapeSignal,
  specDb,
  windowed,
} from "../docs/src/dsp.js";

// ---- helpers ---------------------------------------------------------------

// Build a minimal 16-bit PCM mono WAV (RIFF/fmt/data) around known samples, so
// parseWav has a deterministic buffer to decode.
function buildWav16(samples, sampleRate = 48000) {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const ascii = (off, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  dv.setUint32(4, 36 + dataLen, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // channels
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  dv.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, samples[i], true);
  return buf;
}

function sine(len, cyclesInBuffer, amp = 1) {
  const s = new Float64Array(len);
  for (let n = 0; n < len; n++)
    s[n] = amp * Math.sin((2 * Math.PI * cyclesInBuffer * n) / len);
  return s;
}

function peak(sig) {
  let p = 0;
  for (const v of sig) if (Math.abs(v) > p) p = Math.abs(v);
  return p;
}

function argmax(arr) {
  let bi = 0,
    bv = -Infinity;
  for (let i = 0; i < arr.length; i++)
    if (arr[i] > bv) {
      bv = arr[i];
      bi = i;
    }
  return bi;
}

// ---- parseWav --------------------------------------------------------------

test("parseWav decodes 16-bit PCM samples to [-1, 1) floats", () => {
  const wav = buildWav16([0, 16384, -16384, 32767, -32768]);
  const out = parseWav(wav);
  assert.equal(out.length, 5);
  assert.ok(Math.abs(out[0] - 0) < 1e-7);
  assert.ok(Math.abs(out[1] - 0.5) < 1e-7);
  assert.ok(Math.abs(out[2] + 0.5) < 1e-7);
  assert.ok(Math.abs(out[3] - 32767 / 32768) < 1e-7);
  assert.ok(Math.abs(out[4] + 1) < 1e-7); // -32768 / 32768 === -1
});

test("parseWav skips a non-fmt/data chunk (e.g. LIST) without misaligning", () => {
  // Prepend a bogus "LIST" chunk of odd size to exercise the word-align (sz & 1).
  const base = buildWav16([100, -100]);
  const baseArr = new Uint8Array(base);
  const listBody = new Uint8Array([1, 2, 3]); // odd length -> 1 pad byte
  const chunk = new Uint8Array(8 + listBody.length + 1);
  const cdv = new DataView(chunk.buffer);
  "LIST".split("").forEach((c, i) => {
    cdv.setUint8(i, c.charCodeAt(0));
  });
  cdv.setUint32(4, listBody.length, true);
  chunk.set(listBody, 8);
  // splice the LIST chunk in right after "WAVE" (byte 12)
  const merged = new Uint8Array(baseArr.length + chunk.length);
  merged.set(baseArr.subarray(0, 12), 0);
  merged.set(chunk, 12);
  merged.set(baseArr.subarray(12), 12 + chunk.length);
  const out = parseWav(merged.buffer);
  assert.equal(out.length, 2);
  assert.ok(Math.abs(out[0] - 100 / 32768) < 1e-7);
});

test("parseWav reads the real guitar_clean.wav", () => {
  const path = fileURLToPath(new URL("../docs/guitar_clean.wav", import.meta.url));
  const nodeBuf = readFileSync(path);
  const ab = nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength,
  );
  const sig = parseWav(ab);
  assert.ok(sig.length > 48000, "expected at least ~1s of 48kHz samples");
  assert.ok(peak(sig) <= 1.0000001, "samples must stay within full scale");
  assert.ok(peak(sig) > 0.01, "the note should not be silent");
});

// ---- normalize -------------------------------------------------------------

test("normalize scales peak to the target and preserves relative shape", () => {
  const sig = new Float32Array([0, 1, -2, 0.5]); // peak = 2
  normalize(sig); // default target 0.98
  assert.ok(Math.abs(peak(sig) - 0.98) < 1e-6);
  // ratios preserved: sig[1]/sig[2] stays -0.5
  assert.ok(Math.abs(sig[1] / sig[2] + 0.5) < 1e-6);
});

test("normalize respects a custom target and leaves an all-zero buffer alone", () => {
  const sig = new Float32Array([0.1, -0.3]);
  normalize(sig, 0.5);
  assert.ok(Math.abs(peak(sig) - 0.5) < 1e-6);
  const zeros = new Float32Array([0, 0, 0]);
  normalize(zeros);
  assert.deepEqual(Array.from(zeros), [0, 0, 0]);
});

// ---- PEDALS transfer curves ------------------------------------------------

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

// ---- shapeSignal -----------------------------------------------------------

test("shapeSignal centers output and peak-matches to the input", () => {
  const inp = sine(N, KBIN, 1); // input peak = 1
  const fn = (x) => PEDALS.overdrive.fn(x, 6, 0);
  const { out, outDc, outMatch } = shapeSignal(inp, fn);
  // odd curve + symmetric sine -> ~zero DC
  assert.ok(Math.abs(outDc) < 1e-6, "overdrive on a sine has ~zero DC");
  // output is DC-removed: mean ~ 0
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length;
  assert.ok(Math.abs(mean) < 1e-9, "output centered");
  // peak-matched: max|out| * outMatch == input peak
  assert.ok(Math.abs(peak(out) * outMatch - 1) < 1e-9);
});

test("shapeSignal removes the DC that a bias introduces", () => {
  const inp = sine(N, KBIN, 1);
  const biased = (x) => PEDALS.distortion.fn(x, 8, 0.6); // asymmetric -> nonzero DC
  const { out, outDc } = shapeSignal(inp, biased);
  assert.ok(Math.abs(outDc) > 0.01, "biased clip has a real DC offset");
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length;
  assert.ok(Math.abs(mean) < 1e-9, "DC removed from output");
});

// ---- spectrum --------------------------------------------------------------

test("specDb puts a pure sine's energy at its harmonic bin", () => {
  const inp = sine(N, KBIN, 1);
  const db = specDb(inp);
  assert.equal(argmax(db), KBIN, "peak bin is the fundamental");
  assert.ok(Math.abs(db[KBIN]) < 1e-6, "peak normalized to 0 dB");
  // a neighboring bin should be far down (clean, leakage-free)
  assert.ok(db[KBIN + 1] < -60, "no significant leakage into adjacent bins");
});

test("specDb puts a DC (constant) signal's energy at bin 0", () => {
  const c = new Float64Array(N).fill(0.5);
  const db = specDb(c);
  assert.equal(argmax(db), 0);
});

test("a distorted sine gains energy at odd harmonics", () => {
  const inp = sine(N, KBIN, 1);
  const fn = (x) => PEDALS.overdrive.fn(x, 12, 0); // hard drive -> rich harmonics
  const { out } = shapeSignal(inp, fn);
  const db = specDb(out);
  assert.ok(db[3 * KBIN] > -40, "3rd harmonic present");
  assert.ok(db[5 * KBIN] > -60, "5th harmonic present");
  // odd curve -> 2nd harmonic (even) should stay suppressed
  assert.ok(db[2 * KBIN] < -60, "even harmonic stays down at bias 0");
});

// ---- windowed --------------------------------------------------------------

test("windowed applies a Hann taper: zero at the ends, ~unity in the middle", () => {
  const ones = new Float64Array(1024).fill(1);
  const w = windowed(ones);
  assert.ok(Math.abs(w[0]) < 1e-12, "starts at zero");
  assert.ok(Math.abs(w[w.length - 1]) < 1e-12, "ends at zero");
  assert.ok(Math.abs(w[512] - 1) < 1e-3, "middle ~ unity");
});
