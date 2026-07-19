// What the catalog page promises: it lists the whole catalog — the same pedals
// the nav shelves, in the same order, under their families — and every row is
// a door into the demo standing on that pedal.
//
// The list is built from the view modules the demo mounts, so the interesting
// failure isn't "a row is missing", it's the two pages drifting apart: a pedal
// the catalog lists that the demo won't open, or an order that disagrees with
// the nav's. Both are checked against the nav rather than a hardcoded list,
// since a hardcoded one would have to be updated by the same hand that added
// the pedal — and would pass while the page was wrong.
import { expect, test } from "@playwright/test";

const rows = (page) => page.locator(".catrow");
// which pedal the demo's shelf marks as open (see routing.spec.js)
const pedalName = (page) => page.locator('.pitem[aria-current="true"] .pname');
// the family the mounted pedal sits under on the shelf — its heading, no arrow
const familyName = (page) =>
  page.locator('#pedalnav .fam:has(.pitem[aria-current="true"]) .famname');

// Every pedal the nav shelves, in the nav's own order.
async function catalogViaNav(page) {
  await page.goto("/");
  return page.locator("#pedalnav .pitem .pname").allInnerTexts();
}

test("the catalog lists every pedal the nav does, in the same order", async ({
  page,
}) => {
  const expected = await catalogViaNav(page);
  await page.goto("/pedals.html");
  expect(await rows(page).locator(".catlabel").allInnerTexts()).toEqual(
    expected,
  );
});

test("each family heads its pedals with its signal class and formula", async ({
  page,
}) => {
  await page.goto("/pedals.html");
  // "family" is part of the name, not decoration around it: this name sits in a
  // column headed PEDAL, one row above three things that are pedals, so the noun
  // is what stops CLIPPING reading as a fourth. Asserted as text rather than as a
  // separate element because that's the failure worth catching — draw the gap in
  // CSS and the words come apart on screen while the name still says
  // "clippingfamily" to a screen reader.
  await expect(page.locator(".famname")).toHaveText([
    "clipping family",
    "delay family",
    "modulation family",
  ]);
  // the class named the way the demo's header names it — same phrase, so the two
  // pages teach one term and not a page-local shorthand
  await expect(page.locator(".famklass")).toHaveText([
    "memoryless nonlinearity (NL)",
    "linear, time-invariant (LTI)",
    "linear, time-varying (LTV)",
  ]);
  await expect(page.locator(".famop")).toHaveText([
    "y[n] = f(x[n])",
    "y[n] = x[n] + fb·y[n−D]",
    "y[n] = x[n]·m(t)",
  ]);
});

test("a row carries the pedal's operation and its two claims", async ({
  page,
}) => {
  await page.goto("/pedals.html");
  const fuzz = rows(page).filter({ has: page.locator("text=fuzz") }).first();
  await expect(fuzz.locator(".catop")).toHaveText("clip(drive·x + bias) · asym");
  // the operation, then the operation in English — "asym" is the entire difference
  // between this row and distortion's and the least readable thing on it, so the
  // gloss is what makes the column say anything to a reader without the notation
  await expect(fuzz.locator(".catnote")).toContainText("rails are uneven");
  // then the bench's two claims, in order: CHANGES (the waveform) then YOU HEAR
  // (the harmonics) — what you hear is the harmonics, never the shape of the curve
  const what = fuzz.locator(".catwhat");
  await expect(what.nth(0)).toContainText("collapses to a square");
  await expect(what.nth(1)).toContainText("even harmonics");
  // the aliases the picker only searches are printed here — they're what a
  // reader scanning for their pedal actually knows it by
  await expect(fuzz.locator(".catalias")).toContainText("big muff");
});

test("a row opens the demo standing on that pedal", async ({ page }) => {
  await page.goto("/pedals.html");
  await rows(page).filter({ hasText: "ambient" }).first().click();
  await expect(page).toHaveURL(/\?pedal=ambient$/);
  await expect(pedalName(page)).toHaveText("ambient");
  await expect(familyName(page)).toHaveText("delay");
});

test("every row's link opens a pedal the demo recognizes", async ({ page }) => {
  await page.goto("/pedals.html");
  const ids = await rows(page).evaluateAll((as) =>
    as.map((a) => a.dataset.pedal),
  );
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    await page.goto(`/?pedal=${id}`);
    // a bad id doesn't 404, it falls back to overdrive — so the check is that
    // the pedal that comes up is the one the row named
    await expect(pedalName(page)).toHaveText(id);
  }
});

// The bench's one way out to the catalog: the masthead's "compare pedals" pill.
// The shelf headings name the families in place, so the way out is a single link
// to the whole catalog rather than one deep-link per family.
test("the masthead links out to the catalog", async ({ page }) => {
  await page.goto("/?pedal=warble");
  await page.locator("#masthead .catlink").click();
  await expect(page).toHaveURL(/\/pedals\.html$/);
  await expect(page.locator("section.fam#modulation .famhead")).toBeVisible();
});

// ---- the SHAPE column ------------------------------------------------------
// The one cell on the page that isn't text, and the only one that can fail
// without leaving a mark: a canvas is a valid, correctly-placed, correctly-sized
// element whether or not anything was ever painted into it. Every assertion an
// ordinary test makes — it exists, it's in the right column, it's 56px tall —
// passes just as well over a blank one. So these look at the pixels.

// How much was actually drawn. Alpha, not colour: the question is whether the
// canvas was painted at all, and a blank one is transparent.
const inked = (loc) =>
  loc.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });

// The failure this is really watching for: a canvas takes its size from its CSS
// box and has to ask the document for it, so drawing one before its grid exists
// silently paints nothing. It's a race, it's invisible, and it would ship.
test("every row's shape is actually drawn", async ({ page }) => {
  await page.goto("/pedals.html");
  const thumbs = rows(page).locator("canvas.catthumb");
  expect(await thumbs.count()).toBe(await rows(page).count());
  for (let i = 0; i < (await thumbs.count()); i++)
    expect(await inked(thumbs.nth(i))).toBeGreaterThan(100);
});

// Why the column is worth its width, in one family. All three delay pedals run
// the same operation — the formula column is three copies of one string, which is
// the honest answer to "what's the difference between echo and slapback" and not
// much of an answer. The shapes beside them are the whole of it: they differ only
// in where their knobs start, and that's a picture. If these three ever render
// alike, the column has stopped saying the thing it was added to say.
test("the delay family's identical formulas have distinguishable shapes", async ({
  page,
}) => {
  await page.goto("/pedals.html");
  const delay = page.locator("section.fam#delay");
  expect(await delay.locator(".catop").allInnerTexts()).toEqual([
    "y[n] = x[n] + fb·y[n−D]",
    "y[n] = x[n] + fb·y[n−D]",
    "y[n] = x[n] + fb·y[n−D]",
  ]);
  const shots = await delay
    .locator("canvas.catthumb")
    .evaluateAll((cs) => cs.map((c) => c.toDataURL()));
  expect(new Set(shots).size).toBe(3);
});
