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

  test("mounts no filter while it is at rest", async ({ page }) => {
    await openPlanner(page);
    /* The goo filter is expensive; it exists only while something is travelling
       through it. */
    expect(await page.locator('filter[id^="goo-search"]').count()).toBe(0);
    await control(page).hover();
    await page.waitForTimeout(300);
    expect(await page.locator('filter[id^="goo-search"]').count()).toBe(1);
  });
});
