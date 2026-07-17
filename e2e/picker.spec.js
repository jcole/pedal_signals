// The picker's job is lookup: someone arrives knowing a pedal's name and wants
// that pedal, without having to know which math class it falls under first. The
// interesting cases are all the ones where the name they type is NOT the name on
// the button — that's most of them, since the labels here are deliberately
// generic where a real pedal's name would be a brand's.
import { expect, test } from "@playwright/test";

// :visible on both, deliberately. The list is built into the DOM whether the
// popup is open or not, so a plain .pickopt matches nine elements even when the
// picker is shut — which is how a popup that opened and instantly closed itself
// once passed this whole file. Assert what the reader can see.
const opts = (page) => page.locator(".pickopt:visible");
const groups = (page) => page.locator(".pickgrp:visible");

async function search(page, q) {
  await page.locator(".pickbtn").click();
  await page.locator(".picksearch").fill(q);
}

test("opening it cold lists the whole catalog under its families", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".pickbtn").click();
  await expect(page.locator(".pickpop")).toBeVisible();
  await expect(groups(page)).toHaveText(["clipping", "delay", "modulation"]);
  await expect(opts(page)).toHaveCount(9);
});

test("a pedal's real-world name finds it, not just its label", async ({
  page,
}) => {
  // "reverb" is the query this whole feature exists for: nothing on the page is
  // labelled that, and the pedal it means is called ambient.
  await page.goto("/");
  await search(page, "reverb");
  await expect(opts(page)).toHaveText(["ambient"]);
});

test("finding a pedal teaches you its family", async ({ page }) => {
  // The heading is the payload, not decoration: search "vibrato", learn that the
  // pedal you wanted is a modulation.
  await page.goto("/");
  await search(page, "vibrato");
  await expect(opts(page)).toHaveText(["warble"]);
  await expect(groups(page)).toHaveText(["modulation"]);
});

test("the family is announced, not just drawn", async ({ page }) => {
  // The same lesson as the test above, asserted where a screen reader reads it
  // rather than where the eye does. Worth its own test because the two came
  // apart once: the headings were drawn correctly and marked presentational, so
  // the list looked grouped and announced flat, and the one test we had couldn't
  // tell. Ask for the option THROUGH the named group — that passes only if the
  // grouping survives into the accessibility tree.
  await page.goto("/");
  await search(page, "vibrato");
  const fam = page.getByRole("group", { name: "modulation" });
  await expect(fam.getByRole("option", { name: "warble" })).toBeVisible();
});

test("a family name finds its pedals, so the taxonomy is browsable too", async ({
  page,
}) => {
  await page.goto("/");
  await search(page, "delay");
  await expect(groups(page)).toHaveText(["delay"]);
  await expect(opts(page)).toHaveText(["echo", "slapback", "ambient"]);
});

test("search narrows the catalog without reordering it", async ({ page }) => {
  // Catalog order is the teaching order, so a search may hide entries but must
  // never shuffle the survivors: fuzz is last in clipping either way.
  await page.goto("/");
  await search(page, "s");
  const shown = await opts(page).allTextContents();
  const all = ["overdrive", "distortion", "fuzz", "echo", "slapback", "ambient",
    "tremolo", "chop", "warble"];
  expect(shown).toEqual(all.filter((p) => shown.includes(p)));
});

test("a pedal that isn't built yet says so, and names what you asked for", async ({
  page,
}) => {
  // The catalog is a work in progress, so "we don't have chorus" is a real
  // answer. An empty box would just read as a broken search.
  await page.goto("/");
  await search(page, "chorus");
  await expect(opts(page)).toHaveCount(0);
  await expect(page.locator(".pickempty")).toContainText("chorus");
});

test("the button closes the picker it opened", async ({ page }) => {
  // The button is a toggle, so the second click has to shut it. Worth its own
  // test because the failure is engine-specific and only Safari has it: closing
  // is driven by focus leaving the picker, and Safari alone doesn't focus a
  // <button> you click. So the click blurs the search field first, the popup
  // closes on its own, and the button's handler then reads "closed" and reopens
  // it — the popup never shuts and the button reads as dead. This passed in
  // chromium for as long as it was the only engine in the run.
  await page.goto("/");
  await page.locator(".pickbtn").click();
  await expect(page.locator(".pickpop")).toBeVisible();
  await page.locator(".pickbtn").click();
  await expect(page.locator(".pickpop")).toBeHidden();
});

test("it picks from the keyboard, and Escape leaves without picking", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".pickbtn").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pickpop")).toBeHidden();
  expect(new URL(page.url()).search).toBe(""); // dismissing isn't choosing

  await search(page, "fuzz");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pickbtn .pickped")).toHaveText("fuzz");
  await expect(page).toHaveURL(/pedal=fuzz$/);
});

test("arrows on the closed button step the catalog like a native select", async ({
  page,
}) => {
  // Focused and shut, Up/Down pick outright instead of opening — no popup, the
  // choice lands straight on the URL. overdrive is first, so Up stays put.
  await page.goto("/");
  await page.locator(".pickbtn").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".pickpop")).toBeHidden();
  await expect(page.locator(".pickbtn .pickped")).toHaveText("distortion");
  await expect(page).toHaveURL(/pedal=distortion$/);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".pickbtn .pickped")).toHaveText("overdrive");
});
