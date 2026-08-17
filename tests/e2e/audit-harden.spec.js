import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test.describe("audit harden and adapt", () => {
  test("the viewport lets a reader enlarge the page", async ({ page }) => {
    await openPlanner(page);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport, "pinch-zoom must not be locked").not.toMatch(/user-scalable\s*=\s*no/i);
    expect(viewport, "maximum-scale must not pin the page at 1").not.toMatch(/maximum-scale\s*=\s*1(\D|$)/i);
    expect(viewport).toMatch(/viewport-fit=cover/);
    expect(viewport).toMatch(/interactive-widget=overlays-content/);
  });

  test("reduced motion keeps opacity and drops travel", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    const motion = await page.evaluate(() => {
      const hud = document.querySelector(".nb-hud");
      const sheetPad = document.querySelector(".nb-main");
      const star = getComputedStyle(document.body);
      return {
        globalDuration: star.animationDuration,
        hudPadTop: getComputedStyle(hud).paddingTop,
        mainTransition: getComputedStyle(sheetPad).transitionProperty,
      };
    });
    expect(motion.globalDuration, "the global 1ms kill must be gone").not.toBe("0.001s");
    expect(motion.mainTransition, "sheet pad must not tween a layout property").not.toMatch(/padding/i);
  });

  test("a coarse pointer shows the search word without hover", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const search = page.getByTestId("search-control");
    await expect(search).toContainText("SEARCH");
    const width = await search.evaluate((node) => node.getBoundingClientRect().width);
    expect(width, "the label must be reserved, not grown on hover").toBeGreaterThan(72);
  });
});
