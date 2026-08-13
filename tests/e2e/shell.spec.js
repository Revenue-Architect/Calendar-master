import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test.describe("the shell", () => {
  test("opens on the day timeline", async ({ page }) => {
    await openPlanner(page);
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await expect(page.getByTestId("week-grid")).toBeHidden();
    /* Zooming in from the day is the end of the road; zooming out is not. */
    await expect(page.getByTestId("zoom-in")).toBeDisabled();
    await expect(page.getByTestId("zoom-out")).toBeEnabled();
  });

  test("week is reachable and returns to the day", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    /* Seven columns, one shared time axis — the thing that makes it a week view
       rather than seven day views. */
    await expect(page.locator("[data-week-day]")).toHaveCount(7);

    await page.getByTestId("zoom-in").click();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await expect(page.getByTestId("week-grid")).toBeHidden();
  });

  test("the keyboard reaches week and comes back", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("[");
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await page.keyboard.press("[");
    await expect(page.getByTestId("week-grid")).toBeHidden();
    await page.keyboard.press("]");
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await page.keyboard.press("]");
    await expect(page.getByTestId("day-stream")).toBeVisible();
  });

  test("? shows the shortcuts, and they are the ones that work", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("?");
    const sheet = page.getByTestId("shortcut-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Jump to today")).toBeVisible();
    await expect(sheet.getByText("New event")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("shortcuts do not fire while a sheet is open", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("?");
    await expect(page.getByTestId("shortcut-sheet")).toBeVisible();
    /* N would otherwise open the composer behind the sheet that is already up. */
    await page.keyboard.press("n");
    await expect(page.getByTestId("composer")).toBeHidden();
  });

  test("the week-start preference moves the columns and survives a reload", async ({ page }) => {
    const firstColumnOfWeek = async () => {
      await page.getByTestId("zoom-out").click();
      await expect(page.getByTestId("week-grid")).toBeVisible();
      const key = await page.locator("[data-week-day]").first().getAttribute("data-week-day");
      await page.getByTestId("zoom-in").click();
      await expect(page.getByTestId("day-stream")).toBeVisible();
      return key;
    };

    await openPlanner(page);
    const startedOn = await firstColumnOfWeek();

    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("settings");
    await page.getByTestId("palette-cmd-settings").click();
    const toggle = page.getByTestId("week-start-toggle");
    await expect(toggle).toContainText("SUNDAY");
    await toggle.click();
    await expect(toggle).toContainText("MONDAY");
    await page.keyboard.press("Escape");
    await expect(toggle).toBeHidden();

    const nowStartsOn = await firstColumnOfWeek();
    expect(nowStartsOn).not.toBe(startedOn);

    /* The preference lives in its own store, so a reload is the real proof it
       was written rather than only held in React state. */
    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await page.waitForTimeout(250);
    expect(await firstColumnOfWeek()).toBe(nowStartsOn);
  });
});

test.describe("the day ribbon", () => {
  test("the timeline carries a rolling multi-year strip into the week view", async ({ page }) => {
    await openPlanner(page);
    const ribbon = page.getByTestId("day-ribbon");
    const cells = page.locator("[data-day]");
    await expect(cells.first()).toBeVisible();
    expect(await ribbon.getAttribute("data-ribbon-total-days"), "the logical strip should span more than two years").toBe("733");

    const span = await ribbon.evaluate((node) => {
      const first = Date.parse(`${node.getAttribute("data-ribbon-start")}T00:00:00Z`);
      const last = Date.parse(`${node.getAttribute("data-ribbon-end")}T00:00:00Z`);
      return Math.round((last - first) / 86_400_000);
    });
    expect(span, "the visible ribbon must cover at least a year in each direction").toBeGreaterThan(700);

    /* Each cell is a drop target, which is the point of having it here. */
    await expect(cells.first()).toHaveAttribute("data-day", /^\d{4}-\d{2}-\d{2}$/);
  });

  test("the ribbon shifts past both rolling edges and keeps the selected day reachable", async ({ page }) => {
    await openPlanner(page);
    const ribbon = page.getByTestId("day-ribbon");
    const cells = page.locator("[data-day]");

    const firstBefore = await ribbon.getAttribute("data-ribbon-start");
    await ribbon.evaluate((node) => { node.scrollLeft = 0; node.dispatchEvent(new Event("scroll")); });
    await expect.poll(() => ribbon.getAttribute("data-ribbon-start")).not.toBe(firstBefore);

    const lastBefore = await ribbon.getAttribute("data-ribbon-end");
    await ribbon.evaluate((node) => { node.scrollLeft = node.scrollWidth; node.dispatchEvent(new Event("scroll")); });
    await expect.poll(() => ribbon.getAttribute("data-ribbon-end")).not.toBe(lastBefore);

    const edge = await cells.last().getAttribute("data-day");
    await cells.last().click();
    await expect(page.getByTestId("day-heading")).toHaveAttribute("data-date", edge);
    await page.getByRole("button", { name: "Next day" }).click();
    const next = await page.getByTestId("day-heading").getAttribute("data-date");
    await expect(page.locator(`[data-day="${next}"]`)).toHaveAttribute("data-day", next);
    await page.waitForTimeout(360);

    const pastEdge = await cells.first().getAttribute("data-day");
    await page.locator(`[data-day="${pastEdge}"]`).click();
    await expect(page.getByTestId("day-heading")).toHaveAttribute("data-date", pastEdge);
    await page.getByRole("button", { name: "Previous day" }).click();
    const previous = await page.getByTestId("day-heading").getAttribute("data-date");
    await expect(page.locator(`[data-day="${previous}"]`)).toHaveAttribute("data-day", previous);
  });

  test("a day in the strip selects that day, and the arrows still step one at a time", async ({ page }) => {
    await openPlanner(page);
    const heading = page.getByTestId("day-heading");
    const cells = page.locator("[data-day]");

    const target = await cells.nth(9).getAttribute("data-day");
    await cells.nth(9).click();
    await expect(heading, "clicking a day in the strip should open it").toHaveAttribute("data-date", target);

    await page.getByRole("button", { name: "Next day" }).click();
    await expect(heading).not.toHaveAttribute("data-date", target);
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(heading, "the arrows should step one day either way").toHaveAttribute("data-date", target);
  });

  test("the selected cell moves within the viewport before the ribbon scrolls", async ({ page }) => {
    await openPlanner(page);
    const ribbon = page.getByTestId("day-ribbon");
    const today = await page.getByTestId("day-heading").getAttribute("data-date");
    await expect.poll(async () => ribbon.evaluate((node, key) => {
      const cell = node.querySelector(`[data-day="${key}"]`);
      if (!cell) return false;
      const strip = node.getBoundingClientRect();
      const box = cell.getBoundingClientRect();
      return box.left >= strip.left && box.right <= strip.right;
    }, today)).toBe(true);
    const before = await ribbon.evaluate((node, key) => {
      const cell = node.querySelector(`[data-day="${key}"]`);
      return { scrollLeft: node.scrollLeft, left: cell.getBoundingClientRect().left };
    }, today);

    await page.getByRole("button", { name: "Next day" }).click();
    const next = await page.getByTestId("day-heading").getAttribute("data-date");
    const after = await ribbon.evaluate((node, key) => {
      const cell = node.querySelector(`[data-day="${key}"]`);
      return { scrollLeft: node.scrollLeft, left: cell.getBoundingClientRect().left };
    }, next);

    expect(Math.abs(after.scrollLeft - before.scrollLeft), "a visible adjacent date should not recenter the ribbon").toBeLessThan(2);
    expect(after.left, "the highlighted cell should travel through the ribbon").toBeGreaterThan(before.left + 20);
  });
});

test.describe("the narrow month navigator", () => {
  test("keeps the month label readable instead of shrinking into the pill bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.getByTestId("zoom-out").click();
    await page.getByTestId("zoom-out").click();

    const month = page.getByTestId("zoom-out");
    const tabs = page.getByRole("tablist");
    const previousMonth = page.getByRole("button", { name: "Previous month" });
    const [monthBox, tabsBox, controlsBox] = await Promise.all([month.boundingBox(), tabs.boundingBox(), previousMonth.boundingBox()]);
    expect(monthBox.width, "the month label must retain enough width to read").toBeGreaterThan(50);
    expect(controlsBox.y, "month navigation controls should move to their own row on a phone")
      .toBeGreaterThan(Math.max(monthBox.y + monthBox.height, tabsBox.y + tabsBox.height) - 1);
  });
});
