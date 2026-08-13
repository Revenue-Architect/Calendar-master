import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

/* The search control was a bare ⌕ with no label and no hint that ⌘K reaches it —
 * the fastest way into the app and the least legible thing in the header. It now
 * expands on hover or focus into a pill carrying the shortcut, two shapes merging
 * through an SVG goo filter.
 *
 * A flourish earns its place by costing nothing. These assert the three ways it
 * could cost something: moving its neighbours, delaying the thing it opens, or
 * animating for someone who asked it not to. */

const control = (page) => page.getByTestId("search-control");

test.describe("the search control", () => {
  test("is compact at rest and expands on hover", async ({ page }) => {
    await openPlanner(page);
    const rest = (await control(page).boundingBox()).width;
    expect(rest).toBeLessThan(48);

    await control(page).hover();
    await page.waitForTimeout(500);
    const open = (await control(page).boundingBox()).width;
    expect(open).toBeGreaterThan(rest + 40);
    await expect(control(page)).toContainText("⌘K");
  });

  test("expanding does not move the controls beside it", async ({ page }) => {
    await openPlanner(page);
    const neighbour = page.getByRole("button", { name: "NOTES" });
    const before = (await neighbour.boundingBox()).x;

    await control(page).hover();
    await page.waitForTimeout(500);
    const after = (await neighbour.boundingBox()).x;
    expect(Math.round(after), "hovering search shoved the header sideways").toBe(Math.round(before));
  });

  test("opens the palette immediately, without waiting for the animation", async ({ page }) => {
    await openPlanner(page);
    /* Clicked cold, with no hover first — the click must not be gated on the
       flourish having played. */
    await control(page).click();
    await expect(page.getByTestId("palette-input")).toBeFocused();
  });

  test("the keyboard reaches it and it announces its shortcut", async ({ page }) => {
    await openPlanner(page);
    await expect(control(page)).toHaveAttribute("aria-keyshortcuts", /Meta\+K/);
    await expect(control(page)).toHaveAttribute("aria-label", /Search/);

    await control(page).focus();
    await page.waitForTimeout(500);
    /* Focus expands it too, so a keyboard user sees the same affordance. */
    expect((await control(page).boundingBox()).width).toBeGreaterThan(48);
  });

  test("does not travel for someone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    const rest = (await control(page).boundingBox()).width;

    await control(page).hover();
    await page.waitForTimeout(500);
    expect((await control(page)).boundingBox && (await control(page).boundingBox()).width).toBe(rest);

    /* Still fully usable — reduced motion removes the movement, not the control. */
    await control(page).click();
    await expect(page.getByTestId("palette-input")).toBeFocused();
  });

  test("its filter is mounted for the life of the control, not toggled", async ({ page }) => {
    await openPlanner(page);
    /* Switching `filter` on and off around the expand re-rasterises the element
       at both ends — a snap in and a snap out on every hover. Over two static
       shapes leaving it on costs nothing visible. */
    expect(await page.locator('filter[id^="goo-search"]').count()).toBe(1);
    await control(page).hover();
    await page.waitForTimeout(400);
    expect(await page.locator('filter[id^="goo-search"]').count()).toBe(1);
  });

  test("no filter at all for someone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    expect(await page.locator('filter[id^="goo-search"]').count()).toBe(0);
  });
});

/* Opening Search used to pan the transformed app surface: native autofocus and
   scrollIntoView walked overflow:hidden ancestors while the sheet was still
   sitting on the right-hand control. With the Actions column open that shove
   sent the calendar and the header date off the left edge on Day, Week, and
   Month. The palette may cover them; it must not move them. */
const boxOf = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) return null;
  return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width) };
};

const stayPut = (before, after, label) => {
  expect(after, `${label} disappeared when Search opened`).not.toBeNull();
  expect(before, `${label} was missing before Search opened`).not.toBeNull();
  /* The reported failure is a sideways shove. Month chrome is still easing its
     height after a zoom change, so a vertical delta on the heading is the
     navigator settling, not Search moving the calendar off-screen. */
  expect(after.x, `${label} shifted sideways when Search opened`).toBe(before.x);
  expect(after.w, `${label} changed width when Search opened`).toBe(before.w);
};

test.describe("Search beside an open Actions column", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  const openWideActions = async (page) => {
    await openPlanner(page);
    await expect(page.getByTestId("actions-column")).toBeVisible();
    await expect(page.getByTestId("day-heading")).toBeVisible();
  };

  const assertPaletteLeavesCalendar = async (page, surface) => {
    const heading = page.getByTestId("day-heading");
    const beforeHeading = await boxOf(heading);
    const beforeSurface = await boxOf(surface);
    await control(page).click();
    await expect(page.getByTestId("palette-input")).toBeFocused();
    await page.waitForTimeout(500);
    stayPut(beforeHeading, await boxOf(heading), "the header date");
    stayPut(beforeSurface, await boxOf(surface), "the calendar");
  };

  test("leaves Day where it is", async ({ page }) => {
    await openWideActions(page);
    await assertPaletteLeavesCalendar(page, page.getByTestId("day-stream"));
  });

  test("leaves Week where it is", async ({ page }) => {
    await openWideActions(page);
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await assertPaletteLeavesCalendar(page, page.getByTestId("week-grid"));
  });

  test("leaves Month where it is", async ({ page }) => {
    await openWideActions(page);
    await page.getByTestId("zoom-out").click();
    await page.getByTestId("zoom-out").click();
    const month = page.locator("[data-day]").first();
    await expect(month).toBeVisible();
    /* The chrome height transition is 300ms; wait it out so the heading is
       no longer travelling when we snapshot. */
    await page.waitForTimeout(400);
    await assertPaletteLeavesCalendar(page, page.locator(".grid.grid-cols-7.gap-px"));
  });
});
