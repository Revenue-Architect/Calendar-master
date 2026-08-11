import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

/* The goo and the notch.
 *
 * Both are decoration, which is exactly why they need tests: decoration is what
 * nobody notices breaking. What is asserted here is not that they look good —
 * a browser cannot tell me that — but the three things that would make them
 * wrong: costing something when idle, running for someone who asked for less
 * motion, and leaving the app in a state it cannot get out of. */

const filters = (page, prefix) => page.locator(`filter[id^="${prefix}"]`);

test.describe("the liquid pill", () => {
  test("mounts its filter only while the selection is travelling", async ({ page }) => {
    await openPlanner(page);
    /* Nothing moving, nothing to pay for. */
    await page.waitForTimeout(600);
    expect(await filters(page, "goo-pill").count()).toBe(0);

    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    /* Caught in flight: the droplet and the pill both exist, which is the whole
       reason the filter is there. */
    expect(await filters(page, "goo-pill").count()).toBeGreaterThan(0);

    await page.waitForTimeout(900);
    expect(await filters(page, "goo-pill").count(), "the filter outlived the movement").toBe(0);
  });

  test("still switches views for someone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    expect(await filters(page, "goo-pill").count()).toBe(0);
    /* The selection still moves; only the liquid does not. */
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

  test("merge only when a run actually exists", async ({ page }) => {
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
    expect(await filters(page, "goo-days").count(), "Mon and Wed are not a run").toBe(0);

    await setDay(page, 2, true); /* Tue closes the run */
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count(), "Mon-Tue-Wed is a run and should merge").toBe(1);

    await setDay(page, 2, false);
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count(), "breaking the run should unmount the filter").toBe(0);
  });
});

test.describe("the notch morph", () => {
  test("NEW grows the composer out of the button, and folds it back", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet, "the composer should morph as a notch from NEW").toHaveAttribute("data-fluid-origin", "notch");
    /* The body is the part that arrives late and leaves early. */
    await expect(sheet.locator(".nb-notch-body")).toBeVisible();

    await page.keyboard.press("Escape");
    /* The exit animation is longer than the ordinary one, and the sheet has to
       actually go away at the end of it rather than linger. */
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("the mobile create button morphs the same way", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.getByTestId("new-action").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");
    await expect(page.getByTestId("composer")).toHaveAttribute("data-composer-kind", "task");
  });

  test("every other route into the composer keeps the ordinary morph", async ({ page }) => {
    await openPlanner(page);
    /* The notch is the signature of "make something new" from a create button,
       not of the composer itself. */
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
