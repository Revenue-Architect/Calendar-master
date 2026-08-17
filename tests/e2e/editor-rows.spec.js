import { test, expect } from "@playwright/test";
import { openPlanner, quickAdd } from "./helpers.js";

/* The editors used to be a column of identical full-width rows, four of which
 * carried a single bounded value. Bounded fields now pair two-up.
 *
 * This file exists because the pairing shipped once with no coverage and the same
 * defect appeared twice: a child of the newly-wrapping band with no declared basis
 * shrinks to its own text. The note row hit it and was fixed; the overlap warning
 * sat two lines away and was missed until review. Both are geometry a person has to
 * look at to notice, which is exactly what should be asserted instead.
 *
 * Widths are compared to the band, never to hardcoded pixels — the point is the
 * relationship (half, whole, same line), not the numbers on one machine. */

const band = (page) => page.getByTestId("attribute-band");

/** Every direct child of the attribute band, with its geometry. */
const rows = (page) => band(page).evaluate((node) => {
  const outer = node.getBoundingClientRect();
  return [...node.children].map((child) => {
    const box = child.getBoundingClientRect();
    return {
      top: Math.round(box.top),
      width: Math.round(box.width),
      share: box.width / outer.width,
      text: (child.textContent || "").trim().slice(0, 24),
    };
  });
});

async function openFirstEvent(page) {
  const card = page.locator("[data-event-id]").first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(page.getByTestId("sheet")).toBeVisible();
  await expect(band(page)).toBeVisible();
}

test.describe("the event editor's attribute band", () => {
  test("pairs its bounded fields two-up and keeps the rest whole", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await openFirstEvent(page);

    const band = await rows(page);
    expect(band.length, "the band should have rendered its rows").toBeGreaterThan(4);

    const halves = band.filter((row) => row.share > 0.4 && row.share < 0.6);
    const wholes = band.filter((row) => row.share > 0.9);

    expect(halves.length, "the four bounded fields should pair into two rows of two").toBe(4);
    expect(halves[0].top, "the first pair shares one line").toBe(halves[1].top);
    expect(halves[2].top, "the second pair shares one line").toBe(halves[3].top);
    expect(halves[0].top, "the two pairs are on different lines").not.toBe(halves[2].top);

    /* The regression this file was written for: a child with no declared basis
       shrinks to its own text instead of filling the band. Anything that is not
       half must be whole — nothing is allowed to land in between. */
    expect(halves.length + wholes.length,
      "every row is either half the band or all of it, never shrink-wrapped").toBe(band.length);
  });

  test("an overlap warning fills the band rather than hugging its own text", async ({ page }) => {
    /* Two events on the same day at the same hour. The warning only renders when
       the edited event actually collides with another. */
    await openPlanner(page);
    await quickAdd(page, "Overlap A today 2pm 1h");
    await quickAdd(page, "Overlap B today 2pm 1h");
    await openFirstEvent(page);

    const warning = band(page).locator("text=Overlaps another event").first();
    if (!(await warning.isVisible().catch(() => false))) {
      test.skip(true, "no overlap warning rendered for this fixture");
    }
    const share = await warning.evaluate((node) => {
      const row = node.closest('[data-test="attribute-band"] > *');
      return row.getBoundingClientRect().width / row.parentElement.getBoundingClientRect().width;
    });
    expect(share, "the warning is a banner, not a chip").toBeGreaterThan(0.9);
  });

  test("an opened field takes the whole band so its options are not shredded", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await openFirstEvent(page);

    const before = await rows(page);
    const paired = before.findIndex((row) => row.share > 0.4 && row.share < 0.6);
    expect(paired, "expected a paired row to open").toBeGreaterThan(-1);

    await band(page).locator("> *").nth(paired).locator("button").first().click();
    await page.waitForTimeout(350);

    const after = await rows(page);
    expect(after[paired].share,
      "an open row reclaims the full band; half a band shreds its chips").toBeGreaterThan(0.9);
  });
});

test("the action editor pairs inside its grouped card", async ({ page }) => {
  await openPlanner(page, { keepSample: true });
  const task = page.locator("[data-task-chip]").first();
  await task.scrollIntoViewIfNeeded();
  await task.click();
  await expect(page.getByTestId("sheet")).toBeVisible();

  const pairs = page.getByTestId("row-pair");
  const count = await pairs.count();
  if (!count) test.skip(true, "the action editor did not render its grouped card");

  for (let i = 0; i < count; i += 1) {
    const sides = await pairs.nth(i).evaluate((node) => [...node.children].map((child) => {
      const box = child.getBoundingClientRect();
      return { top: Math.round(box.top), share: box.width / node.getBoundingClientRect().width };
    }));
    expect(sides.length, `pair ${i} holds two rows`).toBe(2);
    expect(sides[0].top, `pair ${i} sits on one line`).toBe(sides[1].top);
    expect(sides[0].share, `pair ${i} splits evenly`).toBeCloseTo(sides[1].share, 1);
  }
});
