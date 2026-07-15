import { defineConfig, devices } from "@playwright/test";

// The e2e specs live in ./e2e, not ./test: `node --test` claims everything under
// a test/ directory, and these are Playwright's to run, not node's.
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:8000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuses the dev server if one is already up on 8000 rather than fighting it
  // for the port; only starts its own when there isn't one.
  webServer: {
    command: "python3 -m http.server 8000 --directory docs",
    url: "http://localhost:8000/",
    reuseExistingServer: true,
  },
});
