// What the URL promises: it addresses exactly what you're looking at — the family
// in ?effect=, the pedal in ?pedal= — the picker keeps it current, every pick is
// undoable with the back button, and none of it costs a page load.
//
// There's one picker now, so "switch family" isn't a move you can make: you pick
// a pedal and its family comes with it. ?effect= on its own still addresses a
// family, though, because a link to a lesson means one — so that's tested from
// the URL side rather than by clicking something.
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

test("a deep link opens the pedal it says", async ({ page }) => {
  await page.goto("/?effect=modulation&pedal=chop");
  await expect(pedalName(page)).toHaveText("chop");
  await expect(familyName(page)).toHaveText("modulation");
});

test("a pedal names its own family: ?pedal= alone is enough", async ({
  page,
}) => {
  await page.goto("/?pedal=ambient");
  await expect(pedalName(page)).toHaveText("ambient");
  await expect(familyName(page)).toHaveText("delay");
});

test("?effect= alone opens that family at its first pedal", async ({ page }) => {
  await page.goto("/?effect=delay");
  await expect(familyName(page)).toHaveText("delay");
  await expect(pedalName(page)).toHaveText("echo");
});

test("the pedal wins when the URL disagrees with itself", async ({ page }) => {
  // ?pedal= is the specific claim and ?effect= the general one, so a stale or
  // hand-edited effect can't strand a real pedal on the wrong lesson.
  await page.goto("/?effect=clipping&pedal=warble");
  await expect(pedalName(page)).toHaveText("warble");
  await expect(familyName(page)).toHaveText("modulation");
});

test("ids nobody recognizes fall back instead of failing", async ({ page }) => {
  await page.goto("/?effect=nonsense&pedal=nonsense");
  await expect(pedalName(page)).toHaveText("overdrive");
  await expect(familyName(page)).toHaveText("clipping");
});

test("picking a pedal puts it and its family in the URL", async ({ page }) => {
  await page.goto("/");
  await stampLoad(page);
  await pick(page, "fuzz");
  await expect(page).toHaveURL(/\?effect=clipping&pedal=fuzz$/);
  await expect(pedalName(page)).toHaveText("fuzz");
  expect(await survivedWithoutReload(page)).toBe(true);
});

test("picking across families rewrites both, without a page load", async ({
  page,
}) => {
  await page.goto("/");
  await stampLoad(page);
  await pick(page, "slapback");
  await expect(page).toHaveURL(/\?effect=delay&pedal=slapback$/);
  await expect(familyName(page)).toHaveText("delay");
  expect(await survivedWithoutReload(page)).toBe(true);
});

test("back undoes a pedal pick, staying in the family", async ({ page }) => {
  await page.goto("/?effect=clipping&pedal=overdrive");
  await stampLoad(page);
  await pick(page, "fuzz");
  await expect(pedalName(page)).toHaveText("fuzz");

  await page.goBack();
  await expect(page).toHaveURL(/pedal=overdrive$/);
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
  await expect(page).toHaveURL(/\?effect=clipping&pedal=fuzz$/);
  await expect(pedalName(page)).toHaveText("fuzz");
  await expect(familyName(page)).toHaveText("clipping");
});

test("re-picking the pedal that's already open is not a history entry", async ({
  page,
}) => {
  await page.goto("/?effect=clipping&pedal=fuzz");
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
