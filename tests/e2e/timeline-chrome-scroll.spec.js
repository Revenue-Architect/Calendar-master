import { test, expect } from "@playwright/test";
import { openPlanner } from "./helpers.js";

/* The day heading and its ribbon collapse as the reader moves away from midnight
 * and return when they arrive back at the top. That rule is one piece of
 * navigation, so it has to read the same on a phone and in a desktop window —
 * it was gated to `(max-width:1023px)` and so did nothing at all on a desktop.
 *
 * A sibling spec notes that a scroll-driven version of this cannot fail. That is
 * true only if the wheel is delivered without the pointer over the scroller;
 * moving onto the node first scrolls it for real, which these tests rely on. */

const collapsed = (page) => page.locator(".nb-timeline-chrome").first()
  .evaluate((node) => node.classList.contains("is-collapsed"));

/* Day and week keep their hours in different scroll nodes. */
async function wheel(page, dy) {
  const day = page.getByTestId("day-stream");
  const target = (await day.count()) ? day.first() : page.locator('[data-test="week-grid"] .nb-s').first();
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(500);
}

for (const tier of [
  { label: "a phone", width: 390, height: 844 },
  { label: "a desktop window", width: 1280, height: 860 },
]) {
  test.describe(`the timeline chrome in ${tier.label}`, () => {
    test.use({ viewport: { width: tier.width, height: tier.height } });

    for (const surface of ["day", "week"]) {
      test(`gives ${surface} view its hours back on the way down, and the heading back at midnight`, async ({ page }) => {
        await openPlanner(page);
        if (surface === "week") {
          await page.getByTestId("zoom-out").click();
          await page.waitForTimeout(400);
        }

        expect(await collapsed(page), "the chrome starts open").toBe(false);

        await wheel(page, 500);
        expect(await collapsed(page),
          "scrolling away from midnight must collapse the chrome").toBe(true);

        await wheel(page, -6000);
        expect(await collapsed(page),
          "arriving back at midnight must return the heading").toBe(false);
      });
    }
  });
}
