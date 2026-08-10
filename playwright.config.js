import { defineConfig, devices } from "@playwright/test";

/* The browser suite exists for what unit tests structurally cannot reach: the
 * sheet that resizes as its content changes, the field that has to stay in view
 * while you type in it, the column that collapses and has to come back after a
 * reload, and the press-and-hold that must not turn every scroll into a drag.
 *
 * It runs against the production bundle rather than the dev server, because that
 * is the artefact that ships — a regression that only survives Vite's dev
 * transform is not a regression anyone would see.
 */

const PORT = 4321;

/* Normally Playwright finds the browser it installed itself. Some sandboxes and
   CI images ship a Chromium that does not match this Playwright's expected build
   and cannot download one, so `PLAYWRIGHT_CHROMIUM_EXECUTABLE` points at the one
   that is already there. Unset — the ordinary case — nothing changes. */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  /* These are UI flows against one shared origin's localStorage; running them in
     parallel in one browser would have them clearing each other's notebooks. */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    /* The app's hooks are `data-test`, matching the attribute already used for
       `data-day`, `data-task` and the rest. */
    testIdAttribute: "data-test",
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    /* Desktop width on purpose: the Actions column, its collapse control and the
       two-pane layout only exist above the `lg` breakpoint. */
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
