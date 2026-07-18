// Unit tests for the pure DSP core (docs/js/dsp.js). Run with `npm test`
// (i.e. `node --test`). No browser, no dependencies — everything here is plain
// data-in / data-out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  N,
  KBIN,
  SR,
  F0,
  parseWav,
  normalize,
  shapeSignal,
  specDb,
  windowed,
  envelope,
  envelopeHeld,
  smooth,
} from "../docs/js/dsp.js";
import { PEDALS, echo } from "../docs/js/pedals/index.js"; // fixtures: real pedal DSP

// ---- helpers ---------------------------------------------------------------

// a unit impulse: the cleanest probe for a follower or a difference equation
function impulse(len) {
  const s = new Float64Array(len);
  s[0] = 1;
  return s;
}

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

// ---- shapeSignal (waveshaping engine; driven with real PEDALS curves) ------

test("shapeSignal centers output and peak-matches to the input", () => {
  const inp = sine(N, KBIN, 1); // input peak = 1
  const fn = (x) => PEDALS.overdrive.fn(x, 6, 0);
  const { out, outDc, outMatch } = shapeSignal(inp, fn);
  // odd curve + symmetric sine -> ~zero DC
  assert.ok(Math.abs(outDc) < 1e-6, "overdrive on a sine has ~zero DC");
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

// ---- envelope --------------------------------------------------------------

test("envelope never dips below the signal it traces", () => {
  const sig = Float64Array.from({ length: 500 }, (_, i) =>
    Math.sin(i / 3) * Math.exp(-i / 120),
  );
  const e = envelope(sig);
  for (let i = 0; i < sig.length; i++) {
    assert.ok(e[i] >= Math.abs(sig[i]) - 1e-12, `envelope covers |sig| at ${i}`);
    assert.ok(e[i] >= 0, "envelope is non-negative");
  }
});

test("envelope jumps to a peak instantly, then releases downward", () => {
  const n = 2000; // ~42 ms — several 9 ms release constants, so it reaches silence
  const e = envelope(impulse(n));
  assert.equal(e[0], 1, "instant attack");
  for (let i = 1; i < n; i++) assert.ok(e[i] < e[i - 1], "monotonic release");
  assert.ok(e[n - 1] < 0.05, "and it actually decays away");
});

test("envelope reads an echo train as one hump per repeat", () => {
  // repeats far enough apart that the follower falls between them
  const out = echo(impulse(24000), 8000, 0.5);
  const e = envelope(out);
  assert.ok(Math.abs(e[0] - 1) < 1e-12, "dry hump");
  assert.ok(Math.abs(e[8000] - 0.5) < 1e-12, "1st repeat's hump = fb");
  assert.ok(Math.abs(e[16000] - 0.25) < 1e-12, "2nd repeat's hump = fb^2");
  assert.ok(e[7999] < 0.01, "and it has fallen back to silence in between");
});

// The follower the delay page can't use and the modulation page can't do without.
// Both of these are the ripple bug stated as a test: the first says what went
// wrong on screen, the second says why the fix isn't just "release more slowly".

test("envelopeHeld is flat on a steady tone, where envelope ripples", () => {
  const n = 24000; // 0.5 s of carrier
  const sig = Float64Array.from({ length: n }, (_, i) =>
    Math.sin((2 * Math.PI * F0 * i) / SR),
  );
  // A steady sine's envelope IS flat 1 — from t=0, not just once the trailing
  // window fills: the warm-up holds the first full window's peak back over the
  // leading region, so there's no dip at the left edge to skip.
  const e = envelopeHeld(sig);
  let lo = 1;
  for (let i = 0; i < n; i++) lo = Math.min(lo, e[i]);
  assert.ok(lo > 0.999, `held: flat to <0.1% (dipped to ${lo.toFixed(4)})`);
  // and the contrast that makes it worth a second function
  const r = envelope(sig);
  let rlo = 1;
  for (let i = 480; i < n; i++) rlo = Math.min(rlo, r[i]);
  assert.ok(rlo < 0.9, `released: ripples >10% on the same input (${rlo.toFixed(4)})`);
});

test("envelopeHeld holds a peak for one window, then drops it", () => {
  const W = Math.round((SR * 1) / F0); // the default hold: one carrier period
  const e = envelopeHeld(impulse(4000));
  assert.equal(e[0], 1, "instant attack");
  // The window is the W samples ending at i, so a peak at 0 is in view for
  // 0..W-1 and has aged out exactly at W — held for its full window, not one
  // sample longer.
  assert.equal(e[W - 1], 1, "still holding as the window closes");
  assert.equal(e[W], 0, "and gone the sample it ages out");
});

test("envelopeHeld never dips below the signal it traces", () => {
  const sig = Float64Array.from({ length: 500 }, (_, i) =>
    Math.sin(i / 3) * Math.exp(-i / 120),
  );
  const e = envelopeHeld(sig);
  for (let i = 0; i < sig.length; i++) {
    assert.ok(e[i] >= Math.abs(sig[i]) - 1e-12, `covers |sig| at ${i}`);
  }
});

test("smooth leaves a constant alone, ends included", () => {
  // A box average of a constant is that constant everywhere — the clipped
  // half-windows at the ends divide their shorter sum by their shorter count.
  const e = smooth(Float64Array.from({ length: 2000 }, () => 0.7));
  for (let i = 0; i < e.length; i++) {
    assert.ok(Math.abs(e[i] - 0.7) < 1e-12, `flat at ${i}: ${e[i]}`);
  }
});

test("smooth turns the held follower's staircase into a monotone ramp", () => {
  // A rising staircase — flats one carrier period wide, the shape envelopeHeld
  // carves on a rising amplitude. The step edges are the choppiness.
  const W = Math.round(SR / F0);
  const n = 40 * W;
  const stair = Float64Array.from({ length: n }, (_, i) =>
    Math.floor(i / W) / 40,
  );
  let rawJump = 0;
  for (let i = 1; i < n; i++) rawJump = Math.max(rawJump, stair[i] - stair[i - 1]);

  const e = smooth(stair);
  let smJump = 0;
  for (let i = 1; i < n; i++) {
    assert.ok(e[i] >= e[i - 1] - 1e-12, `non-decreasing at ${i}`);
    smJump = Math.max(smJump, e[i] - e[i - 1]);
  }
  // the step edge is spread across the whole window, so the largest jump shrinks
  // by roughly W×
  assert.ok(smJump < rawJump / 10, `edge softened: ${smJump} vs ${rawJump}`);
});

test("smooth stays within the signal's range and preserves length", () => {
  const sig = Float64Array.from({ length: 500 }, (_, i) => Math.sin(i / 5));
  const e = smooth(sig, 0.3);
  assert.equal(e.length, sig.length);
  for (let i = 0; i < e.length; i++) {
    assert.ok(e[i] >= -1 - 1e-12 && e[i] <= 1 + 1e-12, `bounded at ${i}: ${e[i]}`);
  }
});
