import { test, expect } from "@playwright/test";
import { openPlanner } from "./helpers.js";

/* Stepping between days is travel within one surface, so the day heading holds
 * whatever state the reader left it in. Resetting focus on every dateKey change
 * meant swiping through days forced the heading open each time — collapse, swipe,
 * pop open, collapse again.
 *
 * Driven through the focus control and the arrow keys rather than a scroll,
 * because the timeline auto-positions on open and synthetic wheel input does not
 * move it — a scroll-driven version of this test cannot fail.
 */

const focused = (page) => page.locator(".nb-day-heading")
  .evaluate((n) => n.classList.contains("is-focused"));

test.describe("the day heading across a day turn", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a day turn keeps the collapsed heading collapsed", async ({ page }) => {
    await openPlanner(page);
    const toggle = page.getByTestId("timeline-focus-toggle");
    if (!(await toggle.count())) test.skip(true, "no focus control at this width");

    await toggle.first().click();
    await page.waitForTimeout(250);
    expect(await focused(page), "the control should have collapsed the heading").toBe(true);

    const heading = page.getByTestId("day-heading");
    const before = await heading.getAttribute("data-date");
    await page.keyboard.press("ArrowRight");
    await expect(heading).not.toHaveAttribute("data-date", before ?? "");

    expect(await focused(page), "a day turn must not force the heading open").toBe(true);
  });

});
