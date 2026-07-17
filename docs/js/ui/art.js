// The toy pedal that sits left of the picker — a picture of "what am I looking
// at" for someone who hasn't read a word yet.
//
// NOT an instrument: the knobs don't move, don't correspond to the drive/bias
// sliders, and nothing is wired to `params`. At 40px a knob is unreadable, so the
// knob COUNT is free to be the real pedal's rather than the rig's; only colour and
// silhouette survive at this size.
//
// Drawn as a toy on purpose: the real Boss enclosure at 40px tall is 23px wide and
// reads as a domino, so widening it past the real thing is what makes it read as a
// pedal.
//
// One chassis, nine faceplates: a pedal declares only `{shape, hue, knobs}` (see
// the `art` note in pedals/base.js); the geometry lives here, once.

// The outline on every pedal — the page's own ink (--ink in styles.css). One ink
// makes the set read as a set. Hardcoded rather than read off :root because this
// is a fill on an <svg> in markup, not a canvas stroke — keep it in step by hand.
const INK = "#191c15";
// The LED. Not a hue any pedal declares: every one has a red one.
const LED = "#cc3b28";

// The treadle, lighter than the body. Derived rather than declared, so a pedal
// states its colour ONCE.
function lighten(hex, amt) {
	const n = Number.parseInt(hex.slice(1), 16);
	const mix = (c) => Math.round(c + (255 - c) * amt);
	return `rgb(${mix((n >> 16) & 255)} ${mix((n >> 8) & 255)} ${mix(n & 255)})`;
}

// Knobs spread across the top panel, centred whatever the count. Two sit wider
// apart than three (22 vs 32 units): at the three-knob pitch, two would leave a
// hole in the middle where a real pedal has none.
function knobRow(n, cy, r) {
	const span = n === 2 ? 22 : 32;
	return Array.from({ length: n }, (_, i) => {
		const cx = n === 1 ? 30 : 30 - span / 2 + (i * span) / (n - 1);
		return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#26251f" stroke="${INK}" stroke-width="1.5"/>`;
	}).join("");
}

// The Boss compact everyone pictures: body, a treadle over its bottom half, knobs
// above it, an LED between them.
function box(hue, knobs) {
	return `
    <rect x="3" y="2" width="54" height="76" rx="6" fill="${hue}" stroke="${INK}" stroke-width="3"/>
    <rect x="8" y="34" width="44" height="39" rx="3" fill="${lighten(hue, 0.22)}" stroke="${INK}" stroke-width="2.2"/>
    ${knobRow(knobs, 20, knobs >= 3 ? 6 : 7)}
    <circle cx="30" cy="8" r="3" fill="${LED}" stroke="${INK}" stroke-width="1.2"/>`;
}

// The Fuzz Face — the one pedal you could name with the colour taken away, which
// is why it's worth breaking the chassis for: two knobs are eyes, the treadle a
// mouth. The real one does exactly this.
function round(hue, knobs) {
	return `
    <circle cx="30" cy="42" r="28" fill="${hue}" stroke="${INK}" stroke-width="3"/>
    ${knobRow(knobs, 26, 6.5)}
    <ellipse cx="30" cy="53" rx="20" ry="13" fill="${lighten(hue, 0.22)}" stroke="${INK}" stroke-width="2.2"/>`;
}

const SHAPES = { box, round };

// pedalArt(spec) -> an <svg> string, or "" for a pedal that declares no art.
// aria-hidden with no title: the picker names the pedal in words, so a picture
// that announced itself would make screen readers say the name twice.
export function pedalArt(spec) {
	if (!spec) return "";
	const draw = SHAPES[spec.shape];
	if (!draw) return "";
	return `<svg viewBox="0 0 60 80" aria-hidden="true" focusable="false">${draw(spec.hue, spec.knobs)}</svg>`;
}
