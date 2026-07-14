// The per-pedal definitions, gathered in one place so you can read every pedal's
// actual JS side by side. Nothing here touches the DOM, canvas, or Web Audio —
// each entry is plain data / a pure transform, testable under `node --test`. The
// effect modules (clipping.js, delay.js, …) import from here and add only
// presentation: presets, controls, panel drawing, and the live audio graph.
// Generic, pedal-agnostic operations — FFT, spectrum, windowing, WAV, and
// shapeSignal (which runs ANY transfer curve) — live in dsp.js instead.

// ---- clipping family (overdrive / distortion / fuzz) -----------------------
// The transfer curve IS the pedal. Every pedal here shares the same two controls
// -- drive (gain into the knee -> harmonics) and bias (offset -> breaks the odd
// symmetry, so even harmonics appear; bias=0 -> odd only) -- and differs only in
// the knee SHAPE. Soft, rounded knee (tanh) = overdrive; hard corner that flattens
// to the rails (clip) = distortion, so the wave squares off; that same corner driven
// harder with lopsided rails = fuzz (near-square, strong even + odd harmonics).
// Each fn is PURE: (x, drive, bias) -> y. Adding a clipping pedal = one entry here.
export const PEDALS = {
  overdrive: {
    outnar: "the peaks get clipped",
    tech: "tanh(drive·x + bias)",
    drive: 6,
    fn: (x, drive, bias) => Math.tanh(drive * x + bias),
  },
  distortion: {
    outnar: "the peaks get squared off",
    tech: "clip(drive·x + bias)",
    drive: 4,
    fn: (x, drive, bias) => Math.max(-1, Math.min(1, drive * x + bias)),
  },
  // Rails clip at different levels (+1 vs -0.6): asymmetry like a real transistor
  // fuzz -> strong even AND odd harmonics, and a visibly lopsided curve. Higher
  // default drive slams it near-square. bias still slides it for even more.
  fuzz: {
    outnar: "the wave collapses to a square",
    tech: "clip(drive·x + bias) · asym",
    drive: 10,
    fn: (x, drive, bias) => Math.max(-0.6, Math.min(1, drive * x + bias)),
  },
};
