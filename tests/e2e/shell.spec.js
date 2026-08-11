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
  /* The day view used to offer one arrow either side of a date: it said which day
     you were on and nothing about the days around it, and gave a dragged event
     nowhere to land but the day already open. */
  test("the timeline carries the same fortnight strip the week view does", async ({ page }) => {
    await openPlanner(page);
    const cells = page.locator("[data-day]");
    await expect(cells.first()).toBeVisible();
    expect(await cells.count(), "the strip should span a fortnight").toBe(14);

    /* Each cell is a drop target, which is the point of having it here. */
    await expect(cells.first()).toHaveAttribute("data-day", /^\d{4}-\d{2}-\d{2}$/);
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
});
