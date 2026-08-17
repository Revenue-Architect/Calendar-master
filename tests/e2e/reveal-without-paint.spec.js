import { test, expect } from "@playwright/test";

/* `requestAnimationFrame` is a paint callback, not a timer. A document that never
 * composites — a tab restored in the background, a window opened behind another —
 * never runs it. Anything whose *visibility* is gated on that callback is then
 * invisible for as long as the page stays unpainted, with no way back.
 *
 * The day ribbon, the month grid and the now-line all opened at `opacity: 0` and
 * waited on a single rAF to become visible, so loading the app unpainted left the
 * week header ribbon blank. The entrance is welcome; depending on it is not.
 *
 * Neutralising rAF reproduces the unpainted document deterministically. */

/* First run puts a scrim over the app; anything that has to navigate must clear
   it first. The ribbon renders behind it, so that test does not need to. */
async function boot(page, { dismissFirstRun = false } = {}) {
  await page.goto("/");
  await page.waitForSelector("[data-day]");
  if (!dismissFirstRun) return;
  const welcome = page.locator('[data-test="sheet"][data-sheet-title="Welcome"]');
  if (await welcome.isVisible().catch(() => false)) {
    await welcome.getByRole("button", { name: "START EMPTY" }).click();
    await welcome.waitFor({ state: "hidden" });
  }
}

test.describe("content that fades in on load", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  });

  test("the day ribbon is visible even when no frame is ever painted", async ({ page }) => {
    await boot(page);

    await expect.poll(async () => page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-test="day-ribbon"] [data-day]')];
      if (!cells.length) return "no cells rendered";
      const transparent = cells.filter((cell) => getComputedStyle(cell).opacity === "0").length;
      return transparent === 0 ? "all visible" : `${transparent}/${cells.length} transparent`;
    }), {
      message: "the ribbon must not need a paint callback to become visible",
      timeout: 4000,
    }).toBe("all visible");
  });

  test("the month grid is visible too", async ({ page }) => {
    await boot(page, { dismissFirstRun: true });
    await page.getByTestId("zoom-out").click();
    await page.getByTestId("zoom-out").click();
    await page.waitForSelector(".nb-cell.nb-hover-tile");

    await expect.poll(async () => page.evaluate(() => {
      const cells = [...document.querySelectorAll(".nb-cell.nb-hover-tile")];
      if (!cells.length) return "no cells rendered";
      return cells.every((cell) => getComputedStyle(cell).opacity === "0") ? "all transparent" : "painted";
    }), {
      message: "the month grid must not need a paint callback either",
      timeout: 4000,
    }).toBe("painted");
  });
});
