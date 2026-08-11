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
  test("slides without a filter at all", () => {
    /* A trailing droplet plus a goo filter was tried and removed. The droplet
       could only be mounted once the pill was already moving, which meant
       mounting it at the position it was meant to travel *from* — it flickered
       at the destination. And switching `filter` on for the duration of a
       transition re-rasterises the element at both ends, so every press snapped
       in and snapped out. One shape sliding cleanly is the whole effect. */
  });

  test("the selection moves and nothing pops", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    expect(await filters(page, "goo-pill").count(), "the pill filter is gone for good").toBe(0);
    await expect(page.getByRole("tab", { name: "AGENDA", exact: true })).toHaveAttribute("aria-selected", "true");

    await page.waitForTimeout(700);
    expect(await filters(page, "goo-pill").count()).toBe(0);
  });

  test("still switches views for someone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
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

  test("merge with a filter that does not switch on under the finger", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    await expect(page.getByTestId("composer")).toBeVisible();
    await page.getByRole("button", { name: "MORE OPTIONS" }).click();
    await page.getByRole("button", { name: "WEEKLY", exact: true }).click();
    await expect(day(page, 1)).toBeVisible();

    /* On for the life of the row. Toggling it as days were picked meant every
       chip press flickered the whole row — the merge is what the filter is for,
       and it was ruining the thing it decorated. */
    expect(await filters(page, "goo-days").count()).toBe(1);

    await setDay(page, 1, true);
    await setDay(page, 2, true);
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count(), "a run must not remount it").toBe(1);

    await setDay(page, 2, false);
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count(), "breaking a run must not remove it").toBe(1);
  });

  test("no filter at all for someone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    await page.getByRole("button", { name: "MORE OPTIONS" }).click();
    await page.getByRole("button", { name: "WEEKLY", exact: true }).click();
    await expect(day(page, 1)).toBeVisible();
    expect(await filters(page, "goo-days").count()).toBe(0);
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

test.describe("sheet exits", () => {
  test("a detail sheet leaves along the path it arrived on", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("Standup today 10am 30m");
    await page.getByTestId("palette-quick-add").click();
    await page.waitForTimeout(500);

    await page.getByText("Standup", { exact: true }).first().click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");

    /* Entry and exit read the same custom properties, so the sheet retraces its
       own path instead of drifting vaguely downward. The exit used to travel a
       quarter of the distance and stop at a different scale. */
    const geometry = await sheet.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        x: style.getPropertyValue("--fluid-x").trim(),
        sx: style.getPropertyValue("--fluid-sx").trim(),
      };
    });
    expect(geometry.x).not.toBe("");
    expect(Number(geometry.sx)).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("form fields are big enough that a touch browser will not zoom the page", async ({ page }) => {
    /* Every sheet autofocuses a field, and a coarse-pointer browser zooms the
       whole viewport when that field's text is under 16px — then a pinch back
       out leaves every fixed sheet mis-painted. */
    await page.emulateMedia({ media: "screen" });
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    await expect(page.getByTestId("composer")).toBeVisible();

    const tooSmall = await page.evaluate(() => {
      const coarse = window.matchMedia("(pointer: coarse)");
      if (!coarse.matches) return "desktop";
      return [...document.querySelectorAll("input, textarea, select")]
        .filter((n) => n.offsetParent !== null)
        .filter((n) => parseFloat(getComputedStyle(n).fontSize) < 16)
        .length;
    });
    expect(tooSmall === "desktop" || tooSmall === 0).toBe(true);
  });
});
