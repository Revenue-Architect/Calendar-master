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

const chrome = (page) => page.getByTestId("timeline-chrome");

/* Day and week keep their hours in different scroll nodes. */
async function timelineScroller(page) {
  const day = page.getByTestId("day-stream");
  if (await day.count()) return day.first();
  return page.locator('[data-test="week-grid"] .nb-s').first();
}

async function movePointerOverScroller(page, scroller) {
  const box = await scroller.boundingBox();
  if (!box) throw new Error("timeline scroller is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function normalizeToMidnight(scroller) {
  await scroller.evaluate((node) => { node.scrollTop = 0; });
  await expect.poll(
    () => scroller.evaluate((node) => node.scrollTop),
    { message: "timeline must be normalized to midnight before testing collapse" },
  ).toBeLessThanOrEqual(1);
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
          await expect(page.getByTestId("week-grid")).toBeVisible();
        }

        const scroller = await timelineScroller(page);
        await expect(scroller).toBeVisible();
        await normalizeToMidnight(scroller);

        await expect(chrome(page), "the chrome starts open at midnight")
          .toHaveAttribute("data-collapsed", "false");

        const before = await scroller.evaluate((node) => node.scrollTop);
        await movePointerOverScroller(page, scroller);
        /* Day hours are 68px; a 24px wheel stays in 12AM. Week columns map the
           same delta onto a much taller stream, so the short-scroll probe is
           day-only — week still uses the collapse-on-real-travel path below. */
        if (surface === "day") {
          await page.mouse.wheel(0, 24);
          await expect.poll(
            () => scroller.evaluate((node) => node.scrollTop),
            { message: "a short wheel from midnight must move the stream" },
          ).toBeGreaterThan(before);
          const afterShort = await scroller.evaluate((node) => node.scrollTop);
          expect(afterShort, "the short probe must stay inside the first hour row").toBeLessThan(68);
          await expect(chrome(page), "one hour-row of scroll must not collapse the ribbon")
            .toHaveAttribute("data-collapsed", "false");
          await movePointerOverScroller(page, scroller);
        }
        await page.mouse.wheel(0, 500);
        await expect.poll(
          () => scroller.evaluate((node) => node.scrollTop),
          { message: "real wheel input must move the timeline away from midnight" },
        ).toBeGreaterThan(68);
        await expect(chrome(page),
          "scrolling away from midnight must collapse the chrome")
          .toHaveAttribute("data-collapsed", "true");

        await movePointerOverScroller(page, scroller);
        await page.mouse.wheel(0, -6000);
        await expect.poll(
          () => scroller.evaluate((node) => node.scrollTop),
          { message: "timeline must return to midnight" },
        ).toBeLessThanOrEqual(24);
        await expect(chrome(page),
          "arriving back at midnight must return the heading")
          .toHaveAttribute("data-collapsed", "false");
      });
    }
  });
}
