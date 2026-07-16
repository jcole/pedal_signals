// What the catalog page promises: it lists the whole catalog — the same pedals
// the picker offers, in the same order, under their families — and every row is
// a door into the demo standing on that pedal.
//
// The list is built from the view modules the demo mounts, so the interesting
// failure isn't "a row is missing", it's the two pages drifting apart: a pedal
// the catalog lists that the demo won't open, or an order that disagrees with
// the picker's. Both are checked against the picker rather than a hardcoded
// list, since a hardcoded one would have to be updated by the same hand that
// added the pedal — and would pass while the page was wrong.
import { expect, test } from "@playwright/test";

const rows = (page) => page.locator(".catrow");
const pedalName = (page) => page.locator(".pickbtn .pickped");
// see routing.spec.js — the family moved out of the picker button and into the
// row's FAMILY column
const familyName = (page) => page.locator("#famlink");

// Every pedal the picker lists, in the picker's own order.
async function catalogViaPicker(page) {
  await page.goto("/");
  await page.locator(".pickbtn").click();
  return page.locator(".pickopt").allInnerTexts();
}

test("the catalog lists every pedal the picker does, in the same order", async ({
  page,
}) => {
  const expected = await catalogViaPicker(page);
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

// The point of the layout: a family and its pedals share three columns, so the
// formula column reads general form → instances straight down. Geometry is what
// carries that, and geometry is exactly what a refactor breaks silently — so the
// test asserts the columns actually line up on screen, not just that the markup
// looks right.
test("a family's formula sits in the same column as its pedals'", async ({
  page,
}) => {
  await page.goto("/pedals.html");
  const clipping = page.locator(".fam").first();
  const famOp = await clipping.locator(".famop").boundingBox();
  const pedalOps = await clipping.locator(".catop").evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().left),
  );
  expect(pedalOps.length).toBe(3);
  for (const left of pedalOps) expect(Math.abs(left - famOp.x)).toBeLessThan(1);
});

test("a row carries the pedal's operation and what it changes", async ({
  page,
}) => {
  await page.goto("/pedals.html");
  const fuzz = rows(page).filter({ has: page.locator("text=fuzz") }).first();
  await expect(fuzz.locator(".catop")).toHaveText("clip(drive·x + bias) · asym");
  // The operation, then the operation in English, then the consequence — three
  // facts the row keeps apart on purpose. "asym" is the entire difference between
  // this row and distortion's and the least readable thing on it, so the gloss is
  // what makes the column say anything to a reader who doesn't have the notation;
  // and what CHANGES is the harmonics, never the shape of fuzz's own curve.
  await expect(fuzz.locator(".catnote")).toContainText("rails are uneven");
  await expect(fuzz.locator(".catwhat")).toContainText("even harmonics");
  // the aliases the picker only searches are printed here — they're what a
  // reader scanning for their pedal actually knows it by
  await expect(fuzz.locator(".catalias")).toContainText("big muff");
});

// Structure and state can't wear the same fill: a row under the cursor that
// paints itself the family band's color reads as "this row became a family".
test("a hovered row doesn't dress up as a family band", async ({ page }) => {
  await page.goto("/pedals.html");
  const bg = (sel) =>
    page
      .locator(sel)
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor);
  const band = await bg(".famhead");
  await rows(page).first().hover();
  expect(await bg(".catrow")).not.toBe(band);
});

test("a row opens the demo standing on that pedal", async ({ page }) => {
  await page.goto("/pedals.html");
  await rows(page).filter({ hasText: "ambient" }).first().click();
  await expect(page).toHaveURL(/\?pedal=ambient$/);
  await expect(pedalName(page)).toHaveText("ambient");
  await expect(familyName(page)).toHaveText("delay →");
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

// The bench's one way out, and — under a column headed FAMILY — the one place
// the site says what a family is. It aims at the mounted family's own band, not
// at the top of the page: the link is answering "what IS modulation", so it has
// to land on the row that says.
test("the bench links out to its family's band in the catalog", async ({
  page,
}) => {
  await page.goto("/?pedal=warble");
  await expect(page.locator("#lede .cathead")).toContainText("family");
  await expect(page.locator("#famlink")).toHaveText("modulation →");
  await page.locator("#famlink").click();
  await expect(page).toHaveURL(/\/pedals\.html#modulation$/);
  // the anchor has to exist, or the hash is a link to the top of the page
  // wearing a family's name
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

// The picture of the operation, so it sits against the operation — not on the end
// with WHAT CHANGES wedged between a formula and the drawing of that formula.
// Asserted on screen rather than in the markup: the cells are auto-placed, so the
// column order IS the DOM order plus a grid rule, and either one can move it.
test("shape sits between the operation and what it changes", async ({
  page,
}) => {
  await page.goto("/pedals.html");
  await expect(page.locator("#cat .cathead")).toContainText("shape");
  const row = rows(page).first();
  const x = async (sel) => (await row.locator(sel).boundingBox()).x;
  expect(await x(".catop")).toBeLessThan(await x("canvas.catthumb"));
  expect(await x("canvas.catthumb")).toBeLessThan(await x(".catwhat"));
});

// The band holds its place in the column without drawing in it. Both halves
// matter: skip the cell and the family's one-liner auto-places into the SHAPE
// track, printing prose under a column headed SHAPE; draw in it and the band is
// claiming a general case that doesn't exist — clipping's pedals ARE three
// shapes, and what they have in common is the formula, two cells left.
test("a family band leaves the shape column empty", async ({ page }) => {
  await page.goto("/pedals.html");
  const band = page.locator("section.fam#clipping .famhead");
  await expect(band.locator("canvas")).toHaveCount(0);
  // the one-liner is still in its own column, which is the half that breaks
  const what = await band.locator(".famwhat").boundingBox();
  const rowWhat = await rows(page).first().locator(".catwhat").boundingBox();
  expect(Math.abs(what.x - rowWhat.x)).toBeLessThan(1);
});
