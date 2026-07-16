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
const familyName = (page) => page.locator(".pickbtn .pickfam");

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
  await expect(page.locator(".famname")).toHaveText([
    "clipping",
    "delay",
    "modulation",
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
  await expect(fuzz.locator(".catwhat")).toContainText("near-square");
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

test("the bench links out to the catalog", async ({ page }) => {
  await page.goto("/");
  await page.locator(".pickhead .catlink").click();
  await expect(page).toHaveURL(/\/pedals\.html$/);
  await expect(rows(page).first()).toBeVisible();
});
