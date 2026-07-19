// The nav's job is the taxonomy: the whole catalog on a shelf, every pedal sitting
// under the family it's an instance of, so the grouping is the lesson. It replaced
// the search picker — looking a pedal up by its real-world name ("reverb" → ambient)
// is the catalog page's job now (see catalog.spec.js); the shelf only browses.
import { expect, test } from "@playwright/test";

const items = (page) => page.locator("#pedalnav .pitem");
const families = (page) => page.locator("#pedalnav .famname");
// which pedal the shelf says is open (caps are CSS; textContent misses them)
const current = (page) => page.locator('.pitem[aria-current="true"] .pname');

test("the shelf lists the whole catalog under its families", async ({ page }) => {
  await page.goto("/");
  await expect(families(page)).toHaveText(["clipping", "delay", "modulation"]);
  await expect(items(page)).toHaveCount(9);
});

test("the catalog's order is the shelf's order", async ({ page }) => {
  // Catalog order is the teaching order; the shelf never reranks it.
  await page.goto("/");
  await expect(items(page)).toHaveText([
    "overdrive", "distortion", "fuzz",
    "echo", "slapback", "ambient",
    "tremolo", "chop", "warble",
  ]);
});

test("clicking a pedal selects it and puts it in the URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "fuzz" }).click();
  await expect(page).toHaveURL(/\?pedal=fuzz$/);
  await expect(current(page)).toHaveText("fuzz");
});

test("the keyboard picks from the shelf", async ({ page }) => {
  // Each pedal is a role=button, tabbable, and Enter chooses it — the same move as
  // a click, straight onto the URL.
  await page.goto("/");
  await page.getByRole("button", { name: "echo" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?pedal=echo$/);
  await expect(current(page)).toHaveText("echo");
});

test("a deep link marks its pedal, exactly one at a time", async ({ page }) => {
  await page.goto("/?pedal=chop");
  await expect(page.locator('.pitem[aria-current="true"]')).toHaveCount(1);
  await expect(current(page)).toHaveText("chop");
});
