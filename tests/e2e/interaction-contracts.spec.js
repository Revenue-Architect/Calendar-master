import { expect, test } from "@playwright/test";
import {
  cancelCurrentPointer,
  hitTarget,
  isContainedBy,
  seedPlanner,
  settledState,
  storedRecord,
} from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { addDaysToKey, keyOf } from "../../src/shared/time/dateKey.js";

const today = keyOf(new Date());
const LINK = "https://meet.example.com/abc-defg";

function notebook() {
  let state = createBlankPlannerState({});
  state = createEvent(state, {
    calendarId: "calendar-default", title: "Standup", category: "PEOPLE", link: LINK,
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${today}T10:00`, endLocal: `${today}T10:15` },
  }, { id: "evt-short" }).state;
  const planned = createTask(state.tasks, {
    id: "task-timeline", title: "Review launch brief",
    planned: { date: today, startMinute: 11 * 60, estimateMinutes: 45 },
  });
  return { ...state, tasks: planned.tasks };
}

function compactActionNotebook() {
  let state = createBlankPlannerState({});
  const planned = createTask(state.tasks, {
    id: "task-compact", title: "Compact planning action",
    planned: { date: today, startMinute: 11 * 60, estimateMinutes: 15 },
  });
  return { ...state, tasks: planned.tasks };
}

async function selectedCellInsideRibbon(page) {
  const ribbon = page.getByTestId("day-ribbon");
  const date = await page.getByTestId("day-heading").getAttribute("data-date");
  const cell = page.locator(`[data-day="${date}"]`);
  await expect(ribbon).toBeVisible();
  expect(await isContainedBy(cell, ribbon, "horizontal"), "selected ribbon cell is off-screen").toBe(true);
  return date;
}

test.describe("Actions calendar-context contract", () => {
  test("Actions mounts no ribbon or month grid from day, week, or month", async ({ page }) => {
    await seedPlanner(page, notebook());
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await expect(page.locator(".nb-month-navigator.is-month")).toHaveCount(0);

    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await expect(page.getByTestId("week-grid")).toHaveCount(0);

    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    await page.getByTestId("zoom-out").click();
    await expect(page.locator(".nb-month-navigator.is-month")).toBeVisible();
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await expect(page.locator("[data-day]")).toHaveCount(0);
  });

  test("returning from Actions keeps the selected date inside the strip", async ({ page }) => {
    await seedPlanner(page, notebook());
    const future = addDaysToKey(today, 18);
    await page.locator(`[data-day="${future}"]`).click();
    await expect(page.getByTestId("day-heading")).toHaveAttribute("data-date", future);

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    expect(await selectedCellInsideRibbon(page)).toBe(future);

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    expect(await selectedCellInsideRibbon(page)).toBe(future);
  });
});

test.describe("short Event resize", () => {
  test("a 15-minute Event still exposes both edges", async ({ page }) => {
    await seedPlanner(page, notebook());
    const card = page.locator('[data-event-id="evt-short"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('[data-resize-edge="start"]')).toBeVisible();
    await expect(card.locator('[data-resize-edge="end"]')).toBeVisible();

    const end = card.locator('[data-resize-edge="end"]');
    const box = await end.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(box.x + box.width / 2, box.y + 50, { steps: 8 });
    await page.mouse.up();

    const next = await settledState(page, (state) => state.events[0].timing.endLocal !== `${today}T10:15`);
    expect(next.events[0].timing.startLocal).toBe(`${today}T10:00`);
    expect(next.events[0].timing.endLocal > `${today}T10:15`).toBe(true);
  });
});

test.describe("Action exclusive owners", () => {
  test("a compact Action dedicates its visible estimate to resizing", async ({ page }) => {
    await seedPlanner(page, compactActionNotebook());
    const card = page.locator('[data-task-chip="task-compact"]');
    const body = card.locator("button");
    const estimate = page.locator('[data-resize="task-compact"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByTestId("timeline-action-move"), "compact movement must not depend on a small move plate").toHaveCount(0);
    await expect(body, "the compact Action keeps one readable move body").toBeVisible();
    await expect(estimate).toHaveText("15m");

    const [bodyBox, estimateBox] = await Promise.all([body.boundingBox(), estimate.boundingBox()]);
    expect(bodyBox, "the Action body has no measurable move region").not.toBeNull();
    expect(estimateBox, "the visible estimate has no measurable resize target").not.toBeNull();
    expect(estimateBox.x, "the estimate must sit beside the body, not over it").toBeGreaterThanOrEqual(bodyBox.x + bodyBox.width - 1);

    const hit = await hitTarget(page, estimateBox.x + estimateBox.width / 2, estimateBox.y + estimateBox.height / 2);
    expect(hit.resize).toBe("end");
    expect(hit.complete).toBe(false);

    const before = await storedRecord(page, "task", "task-compact");
    await page.mouse.move(estimateBox.x + estimateBox.width / 2, estimateBox.y + estimateBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(estimateBox.x + estimateBox.width / 2, estimateBox.y + estimateBox.height + 40, { steps: 6 });
    await page.mouse.up();
    const after = await settledState(page, (state) => state.tasks[0].planned.estimateMinutes !== before.planned.estimateMinutes);
    expect(after.tasks[0].planned.startMinute).toBe(before.planned.startMinute);
  });

  test("active Event moves and Event or Action resizes never interpolate lane layout", async ({ page }) => {
    await seedPlanner(page, notebook());
    const noLayoutTransition = async (lane, label) => {
      const properties = await lane.evaluate((node) => getComputedStyle(node).transitionProperty);
      expect(properties, `${label} must not interpolate left geometry under the pointer`).not.toContain("left");
      expect(properties, `${label} must not interpolate width geometry under the pointer`).not.toContain("width");
    };

    const event = page.locator('[data-event-id="evt-short"]');
    await event.scrollIntoViewIfNeeded();
    const eventBox = await event.boundingBox();
    await page.mouse.move(eventBox.x + eventBox.width / 2, eventBox.y + eventBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(360);
    await page.mouse.move(eventBox.x + eventBox.width / 2, eventBox.y + 42, { steps: 6 });
    await expect(event).toHaveClass(/nb-timeline-lane-active/);
    await noLayoutTransition(event, "active Event move");
    await page.mouse.up();
    await expect.poll(() => event.evaluate((node) => getComputedStyle(node).transitionProperty)).toContain("left");
    await expect.poll(() => event.evaluate((node) => getComputedStyle(node).transitionProperty)).toContain("width");

    const eventGrip = event.locator('[data-resize-edge="end"]');
    const eventGripBox = await eventGrip.boundingBox();
    await page.mouse.move(eventGripBox.x + eventGripBox.width / 2, eventGripBox.y + eventGripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(eventGripBox.x + eventGripBox.width / 2, eventGripBox.y + 28, { steps: 4 });
    await expect(event).toHaveClass(/nb-timeline-lane-active/);
    await noLayoutTransition(event, "active Event resize");
    await page.mouse.up();

    const actionGrip = page.getByTestId("timeline-action-resize");
    await actionGrip.scrollIntoViewIfNeeded();
    const actionGripBox = await actionGrip.boundingBox();
    await page.mouse.move(actionGripBox.x + actionGripBox.width / 2, actionGripBox.y + actionGripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(actionGripBox.x + actionGripBox.width / 2, actionGripBox.y + 28, { steps: 4 });
    const actionLane = page.getByTestId("timeline-action-lane");
    await expect(actionLane).toHaveClass(/nb-timeline-lane-active/);
    await noLayoutTransition(actionLane, "active Action resize");
    await page.mouse.up();
  });

  test("the bottom edge resizes estimate instead of moving or completing", async ({ page }) => {
    await seedPlanner(page, notebook());
    const grip = page.getByTestId("timeline-action-resize");
    await grip.scrollIntoViewIfNeeded();
    const box = await grip.boundingBox();
    const before = await storedRecord(page, "task", "task-timeline");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(box.x + box.width / 2, box.y + 70, { steps: 10 });
    await page.mouse.up();
    const after = await settledState(page, (state) => state.tasks[0].planned.estimateMinutes !== before.planned.estimateMinutes);
    expect(after.tasks[0].planned.startMinute).toBe(before.planned.startMinute);
    expect(after.tasks[0].status).toBe("open");
    await expect(page.getByTestId("sheet")).toHaveCount(0);
  });

  test("elementFromPoint at the grip is the resize sibling", async ({ page }) => {
    await seedPlanner(page, notebook());
    const grip = page.getByTestId("timeline-action-resize");
    await grip.scrollIntoViewIfNeeded();
    const box = await grip.boundingBox();
    const hit = await hitTarget(page, box.x + box.width / 2, box.y + box.height / 2);
    expect(hit.resize).toBe("end");
    expect(hit.complete).toBe(false);
  });
});

test.describe("inspector contracts", () => {
  test("Add a Step is first as soon as an empty Action is edited", async ({ page }) => {
    await seedPlanner(page, notebook());
    await page.locator('[data-task-chip="task-timeline"]').click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    const add = sheet.getByPlaceholder("Add a step");
    await expect(add, "Add a Step must be first without waiting for Edit").toBeVisible();
    await sheet.getByRole("button", { name: "EDIT ACTION" }).click();
    await expect(add).toBeVisible();
    const order = await sheet.evaluate((node) => {
      const addNode = node.querySelector('input[placeholder="Add a step"]');
      const firstStep = [...node.querySelectorAll("button")].find((button) => /Complete step|Reopen step/.test(button.getAttribute("aria-label") || ""));
      if (!addNode) return "missing";
      if (!firstStep) return "add-only";
      return addNode.compareDocumentPosition(firstStep) & Node.DOCUMENT_POSITION_FOLLOWING ? "add-first" : "step-first";
    });
    expect(order).toMatch(/add-only|add-first/);
    await add.fill("Write the recap");
    await add.press("Enter");
    await expect(sheet.getByText("Write the recap")).toBeVisible();
    await expect(sheet.getByPlaceholder("Add a step")).toBeVisible();
  });

  test("activating Due opens only that field", async ({ page }) => {
    await seedPlanner(page, notebook());
    await page.locator('[data-task-chip="task-timeline"]').click();
    const sheet = page.getByTestId("sheet");
    await sheet.getByLabel("Deadline").click();
    await expect(sheet.getByLabel("Action planning state")).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "OFF" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "AT TIME" })).toHaveCount(0);
    await expect(sheet.getByPlaceholder("Add a step")).toBeVisible();
  });
});

test.describe("Week JOIN and cancellation", () => {
  test("Week JOIN is a sibling and opens the meeting", async ({ page }) => {
    await seedPlanner(page, notebook());
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    /* The fixture is recurring, so Week correctly renders one JOIN per visible
       occurrence. Any occurrence must keep the same direct-link contract. */
    const join = page.getByRole("link", { name: "Join Standup" }).first();
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute("href", LINK);
    const nested = await page.evaluate(() => document.querySelectorAll("button a, a button").length);
    expect(nested).toBe(0);
    await join.click();
    await expect(page.getByTestId("sheet")).toHaveCount(0);
  });

  test("cancelling a Day Event drag restores the stored record", async ({ page }) => {
    await seedPlanner(page, notebook());
    const card = page.locator('[data-event-id="evt-short"]');
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const before = await storedRecord(page, "event", "evt-short");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(360);
    await page.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 8 });
    await cancelCurrentPointer(page, "pointer");
    await page.mouse.up();
    const after = await storedRecord(page, "event", "evt-short");
    expect(after.timing).toEqual(before.timing);
    await expect(page.getByTestId("sheet")).toHaveCount(0);
  });
});
