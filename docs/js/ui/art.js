// The toy pedal that sits left of the picker — a shortcut to "what am I looking
// at" for someone who hasn't read a word yet. Everything else in the bench row
// answers that in text (the name, the formula, the consequence); this answers it
// as a picture, which is faster and asks nothing of the reader.
//
// It is NOT an instrument. The knobs don't move, they don't correspond to the
// drive/bias sliders under the rig, and nothing here is wired to `params`. The
// reason is size: at the 40px this row can afford, a knob is four pixels across
// and its angle is unreadable, so a live one would be spending real machinery on
// something nobody can see. The same fact is why the knob COUNT is free to be the
// real pedal's rather than ours — a picture that can't be read can't be misread
// as a claim about the sliders either. What survives at 40px is colour and
// silhouette, and those two carry the whole job.
//
// Drawn as a toy on purpose, and that's structural rather than a style note. The
// real Boss enclosure is 73×129mm; at 40px tall that's 23px wide, and it reads as
// a domino. Widening it well past the real thing is what makes it read as a
// pedal at all, so the fidelity we give up is what buys the recognition.
//
// One chassis, nine faceplates. A pedal declares only what makes it look like
// itself — `{shape, hue, knobs}`, see the `art` note in pedals/base.js — and the
// geometry lives here, once. Which is the site's own thesis falling out of the
// drawing: the pedal you know by name is an instance of a mechanism, and these
// are nine instances of one box.

// The outline on every pedal, and it's the page's own ink (--ink in styles.css)
// rather than a dark of each hue. Nine hues with nine outlines is nine chances to
// pick a bad one; one ink is what makes the set read as a set, and it's already
// the colour every other line on the lit page is drawn in. Hardcoded rather than
// read off :root because this is a fill on an <svg> in markup, not a stroke on a
// canvas the way harness.js's palette is — keep it in step with --ink by hand.
const INK = "#191c15";
// The LED. Not a hue any pedal declares: every one of them has a red one, and a
// pedal that had to name it would be naming it nine times.
const LED = "#cc3b28";

// The treadle, lighter than the body it sits on. Derived rather than declared, so
// a pedal states its colour ONCE — two hex values that must stay related is how
// they drift apart (the same argument the stylesheet makes about --dry/--wet and
// the traces they name).
function lighten(hex, amt) {
	const n = Number.parseInt(hex.slice(1), 16);
	const mix = (c) => Math.round(c + (255 - c) * amt);
	return `rgb(${mix((n >> 16) & 255)} ${mix((n >> 8) & 255)} ${mix(n & 255)})`;
}

// Knobs spread across the top panel, centred on it whatever the count. Two sit
// wider apart than three do (22 vs 32 units): with only two, spacing them at the
// three-knob pitch leaves a hole in the middle where a real pedal has none.
function knobRow(n, cy, r) {
	const span = n === 2 ? 22 : 32;
	return Array.from({ length: n }, (_, i) => {
		const cx = n === 1 ? 30 : 30 - span / 2 + (i * span) / (n - 1);
		return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#26251f" stroke="${INK}" stroke-width="1.5"/>`;
	}).join("");
}

// The Boss compact everyone pictures when you say "pedal": body, a treadle over
// its bottom half, knobs above it, an LED between them.
function box(hue, knobs) {
	return `
    <rect x="3" y="2" width="54" height="76" rx="6" fill="${hue}" stroke="${INK}" stroke-width="3"/>
    <rect x="8" y="34" width="44" height="39" rx="3" fill="${lighten(hue, 0.22)}" stroke="${INK}" stroke-width="2.2"/>
    ${knobRow(knobs, 20, knobs >= 3 ? 6 : 7)}
    <circle cx="30" cy="8" r="3" fill="${LED}" stroke="${INK}" stroke-width="1.2"/>`;
}

// The Fuzz Face, and the only pedal in the catalog you could name with the colour
// taken away — which is the whole reason it's worth breaking the chassis for. It
// reads as a face at this size: two knobs are eyes and the treadle is a mouth.
// That's not an accident to design out — Dallas Arbiter named it the Fuzz Face
// because the real one does exactly this.
function round(hue, knobs) {
	return `
    <circle cx="30" cy="42" r="28" fill="${hue}" stroke="${INK}" stroke-width="3"/>
    ${knobRow(knobs, 26, 6.5)}
    <ellipse cx="30" cy="53" rx="20" ry="13" fill="${lighten(hue, 0.22)}" stroke="${INK}" stroke-width="2.2"/>`;
}

const SHAPES = { box, round };

// pedalArt(spec) -> an <svg> string, or "" for a pedal that declares no art.
//
// aria-hidden, and it has no title: the picker is three pixels to the right
// saying the pedal's name in words. A picture that announced itself would make
// every screen reader say the name twice — the same call .sitesrc's mark makes in
// index.html, for the same reason.
export function pedalArt(spec) {
	if (!spec) return "";
	const draw = SHAPES[spec.shape];
	if (!draw) return "";
	return `<svg viewBox="0 0 60 80" aria-hidden="true" focusable="false">${draw(spec.hue, spec.knobs)}</svg>`;
}
