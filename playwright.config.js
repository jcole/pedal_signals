import { defineConfig, devices } from "@playwright/test";

// The e2e specs live in ./e2e, not ./test: `node --test` claims everything under
// a test/ directory, and these are Playwright's to run, not node's.
export default defineConfig({
  testDir: "./e2e",
  // Both of Playwright's output dirs default to the top level; tmp/ is where
  // this repo already keeps things it doesn't mind losing.
  outputDir: "./tmp/test-results",
  reporter: [["html", { outputFolder: "./tmp/playwright-report" }]],
  use: { baseURL: "http://localhost:8000" },
  // All three engines, because they disagree about something the picker leans on:
  // clicking a <button> focuses it in Chrome and Firefox, but not in Safari. A
  // popup that closes on focus leaving it can therefore work in two engines and
  // be dead in the third, which is what happened — chromium alone said green
  // while the picker was uncloseable in Safari.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  // Reuses the dev server if one is already up on 8000 rather than fighting it
  // for the port; only starts its own when there isn't one. Not on CI, though:
  // there, "whatever is already on 8000" is a stray from another job, and a run
  // that quietly tests someone else's server is worse than one that can't start.
  webServer: {
    command: "python3 -m http.server 8000 --directory docs",
    url: "http://localhost:8000/",
    reuseExistingServer: !process.env.CI,
  },
});
