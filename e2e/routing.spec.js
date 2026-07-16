// What the URL promises: it addresses exactly what you're looking at — the pedal,
// in ?pedal= — the picker keeps it current, every pick is undoable with the back
// button, and none of it costs a page load.
//
// The pedal is the whole address. There's one picker over the whole catalog, so
// "switch family" isn't a move you can make: you pick a pedal and its family comes
// with it, and pedal ids are unique catalog-wide, so the pedal names the family.
import { expect, test } from "@playwright/test";

const pedalName = (page) => page.locator(".pickbtn .pickped");
const familyName = (page) => page.locator(".pickbtn .pickfam");

// Pick by name, the way a reader does: open the picker, click the pedal.
async function pick(page, name) {
  await page.locator(".pickbtn").click();
  await page.locator(".pickopt", { hasText: name }).click();
}

// The page swaps families by remounting, not by navigating. Stamping the window
// lets a test tell the two apart: a real page load wipes the stamp.
async function stampLoad(page) {
  await page.evaluate(() => {
    window.__stillLoaded = true;
  });
}
const survivedWithoutReload = (page) =>
  page.evaluate(() => window.__stillLoaded === true);

test("a bare URL opens the first family's first pedal, and leaves the URL bare", async ({
  page,
}) => {
  await page.goto("/");
  await expect(pedalName(page)).toHaveText("overdrive");
  await expect(familyName(page)).toHaveText("clipping");
  // seeding the opening pedal must not write the URL — only a real pick does
  expect(new URL(page.url()).search).toBe("");
});

test("a deep link opens the pedal it says, and its family comes along", async ({
  page,
}) => {
  await page.goto("/?pedal=chop");
  await expect(pedalName(page)).toHaveText("chop");
  await expect(familyName(page)).toHaveText("modulation");
});

test("a link written before ?effect= was dropped still lands on its pedal", async ({
  page,
}) => {
  // ?pedal= was always the load-bearing half, so old links keep working: the
  // leftover ?effect= is read by nobody, including when it's wrong.
  await page.goto("/?effect=clipping&pedal=warble");
  await expect(pedalName(page)).toHaveText("warble");
  await expect(familyName(page)).toHaveText("modulation");
});

test("a pedal nobody recognizes falls back instead of failing", async ({
  page,
}) => {
  await page.goto("/?pedal=nonsense");
  await expect(pedalName(page)).toHaveText("overdrive");
  await expect(familyName(page)).toHaveText("clipping");
});

test("picking a pedal puts it in the URL", async ({ page }) => {
  await page.goto("/");
  await stampLoad(page);
  await pick(page, "fuzz");
  await expect(page).toHaveURL(/\?pedal=fuzz$/);
  await expect(pedalName(page)).toHaveText("fuzz");
  expect(await survivedWithoutReload(page)).toBe(true);
});

test("picking across families is the same move, without a page load", async ({
  page,
}) => {
  await page.goto("/");
  await stampLoad(page);
  await pick(page, "slapback");
  await expect(page).toHaveURL(/\?pedal=slapback$/);
  await expect(familyName(page)).toHaveText("delay");
  expect(await survivedWithoutReload(page)).toBe(true);
});

test("back undoes a pedal pick, staying in the family", async ({ page }) => {
  await page.goto("/?pedal=overdrive");
  await stampLoad(page);
  await pick(page, "fuzz");
  await expect(pedalName(page)).toHaveText("fuzz");

  await page.goBack();
  await expect(page).toHaveURL(/\?pedal=overdrive$/);
  await expect(pedalName(page)).toHaveText("overdrive");
  // back within a family moves the picker; it doesn't remount (or reload)
  expect(await survivedWithoutReload(page)).toBe(true);

  await page.goForward();
  await expect(pedalName(page)).toHaveText("fuzz");
});

test("back undoes a cross-family pick, restoring the pedal it was left on", async ({
  page,
}) => {
  await page.goto("/");
  await pick(page, "fuzz");
  await pick(page, "echo");
  await expect(familyName(page)).toHaveText("delay");

  await page.goBack();
  await expect(page).toHaveURL(/\?pedal=fuzz$/);
  await expect(pedalName(page)).toHaveText("fuzz");
  await expect(familyName(page)).toHaveText("clipping");
});

test("re-picking the pedal that's already open is not a history entry", async ({
  page,
}) => {
  await page.goto("/?pedal=fuzz");
  const depth = await page.evaluate(() => history.length);
  await pick(page, "fuzz");
  await pick(page, "fuzz");
  expect(await page.evaluate(() => history.length)).toBe(depth);
});

test("a copied URL survives a hard reload", async ({ page }) => {
  await page.goto("/");
  await pick(page, "warble");
  const shared = page.url();

  await page.goto(shared);
  await expect(pedalName(page)).toHaveText("warble");
  await expect(familyName(page)).toHaveText("modulation");
});
