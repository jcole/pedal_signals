// What the URL promises: it addresses exactly what you're looking at — the family
// in ?effect=, the pedal in ?pedal= — both switchers keep it current, both are
// undoable with the back button, and none of it costs a page load.
import { expect, test } from "@playwright/test";

const family = (page) => page.locator(".navbtn.active");
const pedalBtn = (page) => page.locator(".pedbtn.active");

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
  await expect(family(page)).toHaveText("clipping");
  await expect(pedalBtn(page)).toHaveText("overdrive");
  // seeding the opening pedal must not write the URL — only a real pick does
  expect(new URL(page.url()).search).toBe("");
});

test("a deep link opens both switchers where it says", async ({ page }) => {
  await page.goto("/?effect=modulation&pedal=chop");
  await expect(family(page)).toHaveText("modulation");
  await expect(pedalBtn(page)).toHaveText("chop");
});

test("ids nobody recognizes fall back instead of failing", async ({ page }) => {
  await page.goto("/?effect=nonsense&pedal=nonsense");
  await expect(family(page)).toHaveText("clipping");
  await expect(pedalBtn(page)).toHaveText("overdrive");
});

test("switching family rewrites the URL without a page load", async ({
  page,
}) => {
  await page.goto("/");
  await stampLoad(page);
  await page.locator(".navbtn", { hasText: "delay" }).click();
  await expect(page).toHaveURL(/\?effect=delay$/);
  await expect(family(page)).toHaveText("delay");
  await expect(pedalBtn(page)).toHaveText("echo"); // opens on its own first pedal
  expect(await survivedWithoutReload(page)).toBe(true);
});

test("picking a pedal puts it in the URL", async ({ page }) => {
  await page.goto("/");
  await stampLoad(page);
  await page.locator(".pedbtn", { hasText: "fuzz" }).click();
  await expect(page).toHaveURL(/\?effect=clipping&pedal=fuzz$/);
  expect(await survivedWithoutReload(page)).toBe(true);
});

test("back undoes a pedal pick, staying in the family", async ({ page }) => {
  await page.goto("/?effect=clipping&pedal=overdrive");
  await stampLoad(page);
  await page.locator(".pedbtn", { hasText: "fuzz" }).click();
  await expect(pedalBtn(page)).toHaveText("fuzz");

  await page.goBack();
  await expect(page).toHaveURL(/pedal=overdrive$/);
  await expect(pedalBtn(page)).toHaveText("overdrive");
  await expect(family(page)).toHaveText("clipping");
  // back within a family moves the picker; it doesn't remount (or reload)
  expect(await survivedWithoutReload(page)).toBe(true);

  await page.goForward();
  await expect(pedalBtn(page)).toHaveText("fuzz");
});

test("back undoes a family switch, restoring the pedal it was left on", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".pedbtn", { hasText: "fuzz" }).click();
  await page.locator(".navbtn", { hasText: "delay" }).click();
  await expect(family(page)).toHaveText("delay");

  await page.goBack();
  await expect(page).toHaveURL(/\?effect=clipping&pedal=fuzz$/);
  await expect(family(page)).toHaveText("clipping");
  await expect(pedalBtn(page)).toHaveText("fuzz");
});

test("re-picking the pedal that's already open is not a history entry", async ({
  page,
}) => {
  await page.goto("/?effect=clipping&pedal=fuzz");
  const depth = await page.evaluate(() => history.length);
  await page.locator(".pedbtn", { hasText: "fuzz" }).click();
  await page.locator(".pedbtn", { hasText: "fuzz" }).click();
  expect(await page.evaluate(() => history.length)).toBe(depth);
});

test("a copied URL survives a hard reload", async ({ page }) => {
  await page.goto("/");
  await page.locator(".navbtn", { hasText: "modulation" }).click();
  await page.locator(".pedbtn", { hasText: "warble" }).click();
  const shared = page.url();

  await page.goto(shared);
  await expect(family(page)).toHaveText("modulation");
  await expect(pedalBtn(page)).toHaveText("warble");
});
