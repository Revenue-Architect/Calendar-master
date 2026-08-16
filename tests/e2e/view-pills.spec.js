import { test, expect } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test.describe("the compact view switcher", () => {
  test.use({ hasTouch: true });

  test("grows one word, keeps icon-sized neighbours, and never moves the plate off the active tab", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);

    const timeline = page.getByTestId("view-mode-timeline");
    const actions = page.getByTestId("view-mode-actions");
    await expect(timeline).toHaveAttribute("aria-selected", "true");
    expect((await timeline.getByTestId("view-mode-label").boundingBox()).width,
      "active TIMELINE must keep a readable word").toBeGreaterThan(20);
    expect((await actions.boundingBox()).width,
      "inactive ACTIONS is an icon, not a third word").toBeLessThan(56);

    /* The regression this file exists for. The accent plate is the active
       sibling; if it is ever measured mid-transition it lands on a neighbour and
       stays there. Assert alignment, not the mechanism. */
    const aligned = async () => page.getByTestId("view-mode").evaluate((list) => {
      const plate = list.querySelector('[data-test="pill-indicator"]').getBoundingClientRect();
      const active = list.querySelector('[aria-selected="true"]').getBoundingClientRect();
      return { dLeft: Math.abs(plate.left - active.left), dWidth: Math.abs(plate.width - active.width) };
    });
    let drift = await aligned();
    expect(drift.dLeft, "plate must start on the active tab").toBeLessThanOrEqual(1);
    expect(drift.dWidth).toBeLessThanOrEqual(1);

    await actions.click();
    await expect(actions).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(400);
    drift = await aligned();
    expect(drift.dLeft, "plate must settle on the newly active tab").toBeLessThanOrEqual(1);
    expect(drift.dWidth, "plate must be the width of the newly active tab").toBeLessThanOrEqual(1);

    expect((await actions.getByTestId("view-mode-label").boundingBox()).width).toBeGreaterThan(20);
    expect((await timeline.boundingBox()).width).toBeLessThan(56);
  });

  test("the reserved track leaves the month navigator its lane", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const zoomOut = page.getByTestId("zoom-out");
    const before = (await zoomOut.boundingBox()).width;
    await page.getByTestId("view-mode-actions").click();
    await page.waitForTimeout(400);
    expect((await zoomOut.boundingBox()).width,
      "WEEK / MONTH must survive the pill expansion").toBeCloseTo(before, 0);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
  });

  test("an icon-only tab still takes a finger", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    /* The 44px floor is `.nb-tap::after`, not the drawn box — the control stays
       the size it was drawn so the navigator does not eat the timeline's rows.
       See the comment at Planner.jsx:4008. */
    const target = await page.getByTestId("view-mode-agenda").evaluate((node) => {
      const after = getComputedStyle(node, "::after");
      return { coarse: window.matchMedia("(pointer: coarse)").matches, height: after.height, width: after.width };
    });
    expect(target.coarse, "this assertion is meaningless without a coarse pointer").toBe(true);
    expect(parseFloat(target.height)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(target.width)).toBeGreaterThanOrEqual(44);
  });

  test("the word wipes rather than the track resizing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const props = await page.getByTestId("view-mode-agenda").getByTestId("view-mode-label")
      .evaluate((node) => getComputedStyle(node).transitionProperty);
    expect(props, "a compact word is revealed by a clip, never by a track animation").toContain("clip-path");
    expect(props).not.toContain("grid-template-columns");
    expect(props).not.toContain("width");
  });
});

test("desktop keeps three words and a travelling plate", async ({ page }) => {
  await openPlanner(page);
  for (const key of ["timeline", "agenda", "actions"]) {
    const label = page.getByTestId(`view-mode-${key}`).getByTestId("view-mode-label");
    expect((await label.boundingBox()).width, `${key} must keep its word on a wide header`).toBeGreaterThan(20);
  }
  await expect(page.getByTestId("view-mode")).not.toHaveAttribute("data-compact", "icon");
});
