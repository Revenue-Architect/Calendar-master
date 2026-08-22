import { expect, test } from "@playwright/test";
import { directMouseDrag, openPlanner, quickAdd, seedPlanner, settledState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";

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
  test("holding empty week space and dragging down opens a sized creation draft", async ({ page }) => {
    await openPlanner(page);
    await openWeek(page);

    const keys = await dayKeys(page);
    const day = keys[3];
    const column = columnFor(page, day);
    const stream = page.getByTestId("week-grid").locator(".nb-s").first();
    const streamBox = await stream.boundingBox();
    const columnBox = await column.boundingBox();
    expect(streamBox).toBeTruthy();
    expect(columnBox).toBeTruthy();
    const x = columnBox.x + columnBox.width / 2;
    const y = streamBox.y + 110;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(540);
    await page.waitForTimeout(60);
    await page.mouse.move(x, y + 120, { steps: 8 });

    const preview = page.getByTestId("week-draft-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("data-date", day);
    expect(Number(await preview.getAttribute("data-duration"))).toBeGreaterThan(30);

    await page.mouse.up();
    await expect(page.getByTestId("composer")).toBeVisible();
    await expect(preview).toBeVisible();
    await page.getByTestId("composer").getByRole("tab", { name: "ACTION", exact: true }).click();
    await expect(page.getByTestId("composer").getByRole("tab", { name: "ACTION", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();
  });

  test("Find a Slot searches the selected week instead of repeating today's openings", async ({ page }) => {
    await openPlanner(page);
    await openWeek(page);

    const futureDay = page.locator("[data-day]").nth(40);
    const selected = await futureDay.getAttribute("data-day");
    await futureDay.click();
    await expect(page.getByTestId("day-heading")).toHaveAttribute("data-date", selected);

    await page.getByRole("button", { name: "1H", exact: true }).click();
    const visibleWeek = new Set(await dayKeys(page));
    const slots = page.getByTestId("week-slot");
    await expect(slots.first()).toBeVisible();
    const slotDates = await slots.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slot-date")));
    expect(slotDates.length).toBeGreaterThan(0);
    expect(slotDates.every((date) => visibleWeek.has(date)), "every suggestion must belong to the visible week").toBe(true);
  });

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

    await directMouseDrag(page, card, columnFor(page, targetKey));

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

  test("an immediate desktop drag moves a Week Event without a hold", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Standup today 10am 30m");
    await openWeek(page);

    const before = await settledState(page, (s) => s.events.length === 1);
    const card = page.getByTestId("week-event").first();
    const keys = await dayKeys(page);
    const originalDay = before.events[0].timing.startLocal.slice(0, 10);
    const targetKey = keys.find((key) => key !== originalDay);

    await card.scrollIntoViewIfNeeded();
    const from = await card.boundingBox();
    const target = await columnFor(page, targetKey).boundingBox();
    expect(from).toBeTruthy();
    expect(target).toBeTruthy();
    const grabY = from.y + Math.min(8, from.height / 2);
    const dropY = Math.min(Math.max(grabY, target.y + 4), target.y + target.height - 4);

    await page.mouse.move(from.x + from.width / 2, grabY);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, dropY, { steps: 20 });
    await page.mouse.up();

    const after = await settledState(
      page,
      (s) => s.events[0].timing.startLocal.slice(0, 10) !== originalDay,
      "the immediate Week drag never persisted",
    );
    expect(after.events[0].timing.startLocal.slice(0, 10)).toBe(targetKey);
    const minutes = (value) => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
    expect(minutes(after.events[0].timing.endLocal) - minutes(after.events[0].timing.startLocal)).toBe(30);
  });

  test("a stationary desktop Week Event hold stays a click candidate", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Standup today 10am 30m");
    await openWeek(page);

    const card = page.getByTestId("week-event").first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(8, box.height / 2);
    const before = await settledState(page, (s) => s.events.length === 1);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(360);
    await expect(card, "a stationary mouse press must not auto-lift a Week Event").toHaveCSS("transform", "none");
    await page.mouse.up();

    const after = await settledState(page, (s) => s.events.length === 1);
    expect(after.events[0].timing).toEqual(before.events[0].timing);
    await expect(page.getByTestId("sheet"), "a stationary Week Event release remains a click").toBeVisible();
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
    await directMouseDrag(page, card, card);
    await page.waitForTimeout(400);

    const after = await settledState(page, (s) => s.events.length === 1);
    expect(after.events[0].timing.startLocal).toBe(before.events[0].timing.startLocal);
  });
});

async function touchAt(session, type, x, y) {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: .5 }],
  });
}

test.describe("empty week touch intent", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a small scroll cancels an empty-space creation hold", async ({ page }) => {
    await seedPlanner(page, createBlankPlannerState({}));
    await openWeek(page);
    const stream = page.getByTestId("week-grid").locator(".nb-s").first();
    const column = columnFor(page, (await dayKeys(page))[3]);
    const [streamBox, columnBox] = await Promise.all([stream.boundingBox(), column.boundingBox()]);
    const x = columnBox.x + columnBox.width / 2;
    const y = streamBox.y + 150;
    const session = await page.context().newCDPSession(page);

    await touchAt(session, "touchStart", x, y);
    await stream.evaluate((node) => { node.scrollTop += 6; node.dispatchEvent(new Event("scroll")); });
    await page.waitForTimeout(620);
    await touchAt(session, "touchEnd", x, y);
    await session.detach();

    await expect(page.getByTestId("composer")).toHaveCount(0);
  });

  test("a stationary empty hold still opens a Week creation composer", async ({ page }) => {
    await seedPlanner(page, createBlankPlannerState({}));
    await openWeek(page);
    const stream = page.getByTestId("week-grid").locator(".nb-s").first();
    const column = columnFor(page, (await dayKeys(page))[3]);
    const [streamBox, columnBox] = await Promise.all([stream.boundingBox(), column.boundingBox()]);
    const x = columnBox.x + columnBox.width / 2;
    const y = streamBox.y + 150;
    const session = await page.context().newCDPSession(page);

    await touchAt(session, "touchStart", x, y);
    await page.waitForTimeout(540);
    await expect(page.getByTestId("week-draft-preview")).toBeVisible();
    await touchAt(session, "touchEnd", x, y);
    await session.detach();

    await expect(page.getByTestId("composer")).toBeVisible();
    await expect(page.getByTestId("week-draft-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("week-draft-preview")).toBeHidden();
  });
});

test.describe("Week Event touch ownership", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("vertical movement from a Week Event scrolls instead of rescheduling", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Standup today 10am 30m");
    await openWeek(page);

    const card = page.getByTestId("week-event").first();
    const stream = page.getByTestId("week-grid").locator(".nb-s").first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const before = await settledState(page, (s) => s.events.length === 1);
    const beforeScroll = await stream.evaluate((node) => node.scrollTop);
    const session = await page.context().newCDPSession(page);

    await touchAt(session, "touchStart", box.x + box.width / 2, box.y + box.height / 2);
    await touchAt(session, "touchMove", box.x + box.width / 2, box.y + 120);
    await expect.poll(() => stream.evaluate((node, initial) => Math.abs(node.scrollTop - initial), beforeScroll), {
      message: "vertical Week Event touch should move the timeline before lift",
    }).toBeGreaterThan(1);
    await touchAt(session, "touchEnd", box.x + box.width / 2, box.y + 120);
    await session.detach();

    const after = await settledState(page, (s) => s.events.length === 1);
    expect(after.events[0].timing).toEqual(before.events[0].timing);
    await expect(page.getByTestId("sheet")).toHaveCount(0);
  });

  test("a held Week Event touch moves after the lift threshold", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Standup today 10am 30m");
    await openWeek(page);

    const card = page.getByTestId("week-event").first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const before = await settledState(page, (s) => s.events.length === 1);
    const originalDay = before.events[0].timing.startLocal.slice(0, 10);
    const targetKey = await page.locator("[data-week-day]").evaluateAll((nodes, original) => {
      const viewport = { left: 0, right: window.innerWidth };
      return nodes
        .map((node) => ({ key: node.getAttribute("data-week-day"), rect: node.getBoundingClientRect() }))
        .find(({ key, rect }) => key !== original
          && (rect.left + rect.width / 2) > 52
          && (rect.left + rect.width / 2) < viewport.right)?.key;
    }, originalDay);
    expect(targetKey, "a second Week column must be visible for the touch move").toBeTruthy();
    const target = await columnFor(page, targetKey).boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(8, box.height / 2);
    const dropX = target.x + target.width / 2;
    const session = await page.context().newCDPSession(page);

    await touchAt(session, "touchStart", x, y);
    await page.waitForTimeout(340);
    await touchAt(session, "touchMove", dropX, y);
    await touchAt(session, "touchEnd", dropX, y);
    await session.detach();

    const after = await settledState(
      page,
      (s) => s.events[0].timing.startLocal.slice(0, 10) !== originalDay,
      "held Week Event touch never persisted a move",
    );
    expect(after.events[0].timing.startLocal.slice(0, 10)).toBe(targetKey);
    const minutes = (value) => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
    expect(minutes(after.events[0].timing.endLocal) - minutes(after.events[0].timing.startLocal)).toBe(30);
  });
});
