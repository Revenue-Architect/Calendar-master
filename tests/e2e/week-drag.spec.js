import { expect, test } from "@playwright/test";
import { openPlanner, quickAdd, settledState, pressHoldAndDrag } from "./helpers.js";

/* Dragging a card in the week view moves it on both axes at once — a different
 * write from the day timeline's (which keeps the day) and from dropping on a day
 * chip (which keeps the time). Only a browser can exercise it: the target day is
 * decided by hit-testing the column under the pointer, and the minute by the
 * pointer's offset into a scrolled grid. */

const openWeek = async (page) => {
  await page.getByTestId("zoom-out").click();
  await expect(page.getByTestId("week-grid")).toBeVisible();
};

const columnFor = (page, key) => page.locator(`[data-week-day="${key}"]`);

const dayKeys = async (page) => page.locator("[data-week-day]").evaluateAll(
  (nodes) => nodes.map((node) => node.getAttribute("data-week-day")),
);

test.describe("dragging in the week view", () => {
  test("a card moves to another day", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Standup today 10am 30m");
    await openWeek(page);

    const card = page.getByTestId("week-event").first();
    await expect(card).toBeVisible();

    const keys = await dayKeys(page);
    const startedOn = await settledState(page, (s) => s.events.length === 1);
    const originalDay = startedOn.events[0].timing.startLocal.slice(0, 10);
    /* Pick a target column that is not the one the event is already in. */
    const targetKey = keys.find((key) => key !== originalDay);
    expect(targetKey, "the week should hold a day other than the event's").toBeTruthy();

    await pressHoldAndDrag(page, card, columnFor(page, targetKey));

    const state = await settledState(
      page,
      (s) => s.events[0].timing.startLocal.slice(0, 10) !== originalDay,
      "the drag never moved the event to another day",
    );
    expect(state.events[0].timing.startLocal.slice(0, 10)).toBe(targetKey);
    /* The duration is the event's, not the drag's: moving is not resizing. */
    const { startLocal, endLocal } = state.events[0].timing;
    const minutes = (value) => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
    expect(minutes(endLocal) - minutes(startLocal)).toBe(30);
  });

  test("a press without a hold does not move anything", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Standup today 10am 30m");
    await openWeek(page);

    const before = await settledState(page, (s) => s.events.length === 1);
    const card = page.getByTestId("week-event").first();
    const keys = await dayKeys(page);
    const originalDay = before.events[0].timing.startLocal.slice(0, 10);
    const targetKey = keys.find((key) => key !== originalDay);

    /* Same movement, no hold: the week must stay readable by dragging across it. */
    await pressHoldAndDrag(page, card, columnFor(page, targetKey), { holdMs: 60 });
    await page.waitForTimeout(500);

    const after = await settledState(page, (s) => s.events.length === 1);
    expect(after.events[0].timing.startLocal).toBe(before.events[0].timing.startLocal);
  });

  test("a tap on a card opens it instead of moving it", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Standup today 10am 30m");
    await openWeek(page);

    await page.getByTestId("week-event").first().click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("textbox").first()).toHaveValue("Standup");
  });

  test("dropping a card back where it started changes nothing", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Standup today 10am 30m");
    await openWeek(page);

    const before = await settledState(page, (s) => s.events.length === 1);
    const card = page.getByTestId("week-event").first();
    await pressHoldAndDrag(page, card, card);
    await page.waitForTimeout(400);

    const after = await settledState(page, (s) => s.events.length === 1);
    expect(after.events[0].timing.startLocal).toBe(before.events[0].timing.startLocal);
  });
});
