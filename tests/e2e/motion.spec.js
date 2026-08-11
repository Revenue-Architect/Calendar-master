import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

/* The restrained liquid controls and connected sheet motion.
 *
 * The liquid language is intentionally tested at its lifecycle boundaries:
 * selection still moves, reduced motion still works, filters never flicker into
 * the DOM, and the sheet still opens and closes through every supported route. */

const filters = (page, prefix) => page.locator(`filter[id^="${prefix}"]`);

test.describe("the liquid pill", () => {
  test("travels as one stable surface without a runtime filter", async ({ page }) => {
    await openPlanner(page);
    /* Nothing moving, nothing expensive to mount. */
    await page.waitForTimeout(600);
    expect(await filters(page, "goo-pill").count()).toBe(0);

    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    /* The selection still travels, but one surface does not need a filter or a
       second shape with a separate lifecycle. */
    expect(await filters(page, "goo-pill").count()).toBe(0);

    await page.waitForTimeout(900);
    expect(await filters(page, "goo-pill").count()).toBe(0);
  });

  test("still switches views for someone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    expect(await filters(page, "goo-pill").count()).toBe(0);
    /* The selection still changes; only the travel is removed. */
    await expect(page.getByRole("tab", { name: "AGENDA", exact: true })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("adjacent weekdays", () => {
  /* Addressed by weekday index, not by letter: the chips read S M T W T F S,
     and two of those letters name two different days. */
  const day = (page, index) => page.locator(`[data-test="weekday-chip"][data-weekday="${index}"]`);
  const setDay = async (page, index, on) => {
    const chip = day(page, index);
    if ((await chip.getAttribute("data-on")) !== String(on)) await chip.click();
  };

  test("weekday fills stay stable without a filter lifecycle", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    await expect(page.getByTestId("composer")).toBeVisible();
    await page.getByRole("button", { name: "MORE OPTIONS" }).click();
    await page.getByRole("button", { name: "WEEKLY", exact: true }).click();
    await expect(day(page, 1)).toBeVisible();

    /* A weekly rule preselects the composer's own weekday; clear it so the run
       under test is the only thing on the row. */
    for (let i = 0; i < 7; i += 1) await setDay(page, i, false);
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count()).toBe(0);

    await setDay(page, 1, true); /* Mon */
    await setDay(page, 3, true); /* Wed */
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count()).toBe(0);

    await setDay(page, 2, true); /* Tue closes the run */
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count()).toBe(0);

    await setDay(page, 2, false);
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count()).toBe(0);
  });
});

test.describe("sheet entrances and exits", () => {
  test("NEW opens as a grounded sheet instead of zooming from the button", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet, "the composer should use the stable sheet entrance").toHaveAttribute("data-fluid-origin", "sheet");
    await expect.poll(() => sheet.evaluate((node) => getComputedStyle(node).animationName)).toBe("nbfluid");
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
    /* The body remains mounted inside the same panel; only the panel entrance
       changes, so the form does not appear to zoom the page into itself. */
    await expect(sheet.locator(".nb-notch-body")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("the mobile create button keeps the viewport stable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.getByTestId("new-action").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "sheet");
    await expect.poll(() => sheet.evaluate((node) => getComputedStyle(node).animationName)).toBe("nbfluid");
    expect(await page.evaluate(() => ({ innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scale: window.visualViewport?.scale ?? 1 })))
      .toEqual({ innerWidth: 390, clientWidth: 390, scale: 1 });
    await expect(page.getByTestId("composer")).toHaveAttribute("data-composer-kind", "task");
  });

  test("a timeline event returns toward its card while closing", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    const card = page.locator("[data-event-id]").first();
    await expect(card).toBeVisible();
    await card.click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");
    await page.waitForTimeout(450);
    const origin = await sheet.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        x: Number.parseFloat(style.getPropertyValue("--fluid-x")),
        y: Number.parseFloat(style.getPropertyValue("--fluid-y")),
      };
    });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(170);
    const closing = await sheet.evaluate((node) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return { scale: Math.min(Math.abs(matrix.a), Math.abs(matrix.d)), travel: Math.hypot(matrix.e, matrix.f) };
    });

    /* At this point the panel should already be on its way back to the card,
       not merely shrinking in place. */
    expect(closing.scale).toBeLessThan(0.65);
    expect(closing.travel).toBeGreaterThan(Math.hypot(origin.x, origin.y) * 0.5);
    await expect(sheet).toHaveCount(0, { timeout: 1000 });
  });

  test("every other route into the composer keeps the ordinary morph", async ({ page }) => {
    await openPlanner(page);
    /* A keyboard-opened composer keeps the ordinary trigger morph; the compact
       create controls use the grounded sheet entrance above. */
    await page.keyboard.press("n");
    await expect(page.getByTestId("sheet")).toHaveAttribute("data-fluid-origin", "trigger");
  });

  test("the composer still saves what it was opened with", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const composer = page.getByTestId("composer");
    await composer.getByRole("textbox").first().fill("Morphed into being");
    await page.getByTestId("sheet").getByRole("button", { name: /^ADD TO TIMELINE$/ }).click();
    await expect(page.getByTestId("composer")).toBeHidden();
    await expect(page.getByText("Morphed into being").first()).toBeVisible();
  });
});
