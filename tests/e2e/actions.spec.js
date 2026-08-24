import { expect, test } from "@playwright/test";
import { cancelCurrentPointer, openPlanner, quickAdd, seedPlanner, settledState, storedState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { createPreferences } from "../../src/platform/preferences/preferences.js";
import { PREFERENCES_STORE_KEY } from "../../src/platform/persistence/preferencesStore.js";
import { addDaysToKey, keyOf } from "../../src/shared/time/dateKey.js";

/* The Actions column can be collapsed, restored, and swapped for a full-screen
 * view. Two things about it are only observable in a browser: that the collapsed
 * state survives a reload (it is written to its own localStorage key, not the
 * notebook), and that pressing on an action to read it does not start a drag —
 * the panel's press-and-hold is the same gesture as "I am scrolling this list". */

function scheduledAction({ id = "task-timeline", title = "Review launch brief", estimateMinutes = 60 } = {}) {
  const state = createBlankPlannerState({});
  const result = createTask(state.tasks, {
    id, title,
    planned: { date: keyOf(new Date()), startMinute: 10 * 60, estimateMinutes },
  });
  return { ...state, tasks: result.tasks };
}

function narrowScheduledActions() {
  let state = createBlankPlannerState({});
  for (let index = 0; index < 3; index += 1) {
    const result = createTask(state.tasks, {
      id: `task-narrow-${index}`,
      title: `Narrow lane ${index}`,
      planned: { date: keyOf(new Date()), startMinute: 10 * 60, estimateMinutes: 60 },
    });
    state = { ...state, tasks: result.tasks };
  }
  return state;
}

function nearbyShortActions() {
  let state = createBlankPlannerState({});
  for (const [index, startMinute] of [10 * 60, 10 * 60 + 15].entries()) {
    const result = createTask(state.tasks, {
      id: `task-short-nearby-${index}`,
      title: `Nearby short ${index}`,
      planned: { date: keyOf(new Date()), startMinute, estimateMinutes: 15 },
    });
    state = { ...state, tasks: result.tasks };
  }
  return state;
}

function liveActionAt(now, { id = "task-live", title = "Live Action", estimateMinutes = 60 } = {}) {
  const state = createBlankPlannerState({});
  const result = createTask(state.tasks, {
    id, title,
    planned: {
      date: keyOf(now),
      startMinute: now.getHours() * 60,
      estimateMinutes,
    },
  });
  return { ...state, tasks: result.tasks };
}

function addLiveEvent(state, now) {
  const date = keyOf(now);
  return createEvent(state, {
    calendarId: "calendar-default", title: "Live event", category: "WORK",
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal: `${date}T${String(now.getHours()).padStart(2, "0")}:00`,
      endLocal: `${date}T${String(now.getHours() + 1).padStart(2, "0")}:00`,
    },
  }, { id: "event-live" }).state;
}

async function recordVibrations(page) {
  await page.addInitScript(() => {
    window.__calendarMasterVibrations = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (pattern) => { window.__calendarMasterVibrations.push(pattern); return true; },
    });
  });
}

async function dispatchTouch(session, type, x, y) {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: .5 }],
  });
}

async function completionSwipePoint(page, chip) {
  const title = chip.locator(".nb-lead").first();
  const box = await title.boundingBox();
  expect(box, "the Action title is not measurable for completion swipe").not.toBeNull();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const ownership = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return {
      move: hit?.closest?.("[data-touch-move]") != null,
      estimate: hit?.closest?.("[data-action-estimate]") != null,
      complete: hit?.closest?.("[data-timeline-complete]") != null,
    };
  }, point);
  expect(ownership.move, "completion swipe must start outside the move control").toBe(false);
  expect(ownership.estimate, "completion swipe must start outside the estimate control").toBe(false);
  expect(ownership.complete, "completion swipe must start outside completion").toBe(false);
  return point;
}

test.describe("the actions column", () => {
  test("completing an action sends tactile feedback", async ({ page }) => {
    await recordVibrations(page);
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await page.getByText("Walk 8k steps", { exact: true }).first().click();
    await page.getByTestId("sheet").getByRole("button", { name: "MARK COMPLETE" }).click();

    await expect.poll(() => page.evaluate(() => window.__calendarMasterVibrations)).toContainEqual([24, 32, 36]);

    const completedCard = page.locator("[data-task]").filter({ hasText: "Walk 8k steps" }).first();
    const completionOverlay = completedCard.getByTestId("task-completion-overlay");
    await expect(completionOverlay).toHaveAttribute("data-visible", "true");
    await expect.poll(() => completionOverlay.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");

    await completedCard.getByRole("button", { name: "Reopen" }).click();
    await expect(completionOverlay).toHaveAttribute("data-visible", "false");
    await expect.poll(() => completionOverlay.evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
  });

  test("the timeline check completes an action without opening its inspector", async ({ page }) => {
    await recordVibrations(page);
    await seedPlanner(page, scheduledAction());
    const chip = page.locator('[data-task-chip="task-timeline"]');
    await chip.scrollIntoViewIfNeeded();

    await page.getByRole("button", { name: "Complete Review launch brief" }).click();

    const state = await settledState(page, (stored) => stored.tasks[0]?.status === "completed", "timeline check did not complete the action");
    expect(state.tasks[0].status).toBe("completed");
    await expect(page.getByTestId("sheet"), "the dedicated check must not inspect the action").toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__calendarMasterVibrations)).toContainEqual([24, 32, 36]);

    const completedFace = await chip.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, opacity: style.opacity };
    });
    expect(completedFace.background, "a completed action face must stay opaque").not.toMatch(/rgba\([^)]*,\s*0(?:\.\d+)?\)/);
    expect(completedFace.opacity, "completion must not reveal the backing through the face").toBe("1");

    const completionOverlay = page.getByTestId("timeline-action-completion-overlay");
    await expect(completionOverlay).toHaveAttribute("data-visible", "true");
    await expect.poll(() => completionOverlay.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");

    await page.getByRole("button", { name: "Reopen Review launch brief" }).click();
    const reopened = await settledState(page, (stored) => stored.tasks[0]?.status === "open", "completed action did not reopen");
    expect(reopened.tasks[0].status).toBe("open");
    await expect(completionOverlay).toHaveAttribute("data-visible", "false");
    await expect.poll(() => completionOverlay.evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
    await expect(page.locator('[role="status"]').filter({ hasText: "Completed" }), "reopening must clear the stale completion toast").toHaveCount(0);
  });

  test("an immediate desktop Action drag follows the pointer and reschedules on drop", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-drag", title: "Move the brief" }));
    const chip = page.locator('[data-task-chip="task-drag"]');
    await chip.scrollIntoViewIfNeeded();
    const before = await chip.boundingBox();
    const hourPx = 68;
    const x = before.x + before.width / 2;
    const y = before.y + before.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + hourPx, { steps: 8 });
    await expect.poll(async () => (await chip.boundingBox()).y).toBeGreaterThan(before.y + 30);
    await page.mouse.up();

    const state = await settledState(page, (stored) => stored.tasks[0]?.planned.startMinute === 11 * 60, "the Action drag did not reschedule the task");
    expect(state.tasks[0].planned.startMinute).toBe(11 * 60);
  });

  test("a narrow collision lane keeps a readable body instead of exposing direct controls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlanner(page, narrowScheduledActions());
    const cards = page.locator('[data-task-chip^="task-narrow-"]');
    await expect(cards).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByTestId("timeline-action-resize"), "a narrow Action must not advertise a resize owner").toHaveCount(0);
      await expect(card.getByTestId("timeline-action-move"), "a dense Action must leave its move lane to the body").toHaveCount(0);
      const title = card.locator(".nb-lead");
      const titleBox = await title.boundingBox();
      const cardBox = await card.boundingBox();
      expect(titleBox, "a dense Action title must remain measurable").not.toBeNull();
      expect(cardBox, "a dense Action card must remain measurable").not.toBeNull();
      expect(titleBox.width, "a dense Action must leave a readable body after completion").toBeGreaterThanOrEqual(44);
      const ownership = await page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return {
          chip: hit?.closest?.("[data-task-chip]")?.getAttribute("data-task-chip") ?? null,
          move: hit?.closest?.("[data-touch-move]") != null,
          estimate: hit?.closest?.("[data-action-estimate]") != null,
          complete: hit?.closest?.("[data-timeline-complete]") != null,
        };
      }, { x: titleBox.x + titleBox.width / 2, y: titleBox.y + titleBox.height / 2 });
      expect(ownership.chip).toBe(`task-narrow-${index}`);
      expect(ownership.move, "a dense Action title point must remain body-owned").toBe(false);
      expect(ownership.estimate).toBe(false);
      expect(ownership.complete).toBe(false);
    }
  });

  test("nearby short Actions do not overlap after the 44px render minimum", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlanner(page, nearbyShortActions());
    const cards = page.locator('[data-task-chip^="task-short-nearby-"]');
    await expect(cards).toHaveCount(2);
    const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    const [first, second] = boxes;
    const overlaps = first.left < second.right && second.left < first.right
      && first.top < second.bottom && second.top < first.bottom;
    expect(overlaps, "nearby short Action cards must remain disjoint").toBe(false);
  });

  test("a stationary desktop Action hold stays a click candidate", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-stationary", title: "Open the brief" }));
    const chip = page.locator('[data-task-chip="task-stationary"]');
    await chip.scrollIntoViewIfNeeded();
    const lane = page.getByTestId("timeline-action-lane");
    const box = await chip.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const before = (await storedState(page)).tasks[0].planned;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(360);
    await expect(lane, "a stationary mouse press must not auto-lift an Action").not.toHaveClass(/nb-timeline-lane-active/);
    await page.mouse.up();

    const after = await settledState(page, (state) => state.tasks.length === 1);
    expect(after.tasks[0].planned).toEqual(before);
    await expect(page.getByTestId("sheet"), "a stationary Action release remains a click").toBeVisible();
  });

  test("a tiny desktop Action tremor remains a click and opens the inspector", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-jitter", title: "Read the brief" }));
    const chip = page.locator('[data-task-chip="task-jitter"]');
    await chip.scrollIntoViewIfNeeded();
    const box = await chip.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const before = (await storedState(page)).tasks[0].planned;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 1, y + 1);
    await page.mouse.up();

    const after = await settledState(page, (state) => state.tasks.length === 1);
    expect(after.tasks[0].planned).toEqual(before);
    await expect(page.getByTestId("sheet"), "a tiny Action tremor remains a click").toBeVisible();
  });

  test("cancelling an Action drag leaves it unchanged and the next drag still works", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-cancel", title: "Cancel the brief" }));
    const chip = page.locator('[data-task-chip="task-cancel"]');
    await chip.scrollIntoViewIfNeeded();
    const before = await storedState(page);
    const box = await chip.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 68, { steps: 8 });
    await cancelCurrentPointer(page, "pointer");
    await page.mouse.up();

    const cancelled = await storedState(page);
    expect(cancelled.tasks.find((task) => task.id === "task-cancel").planned)
      .toEqual(before.tasks.find((task) => task.id === "task-cancel").planned);
    await expect(page.getByTestId("sheet")).toHaveCount(0);

    await chip.scrollIntoViewIfNeeded();
    const next = await chip.boundingBox();
    await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
    await page.mouse.down();
    await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2 + 68, { steps: 8 });
    await page.mouse.up();
    const recovered = await settledState(page, (stored) => stored.tasks[0]?.planned.startMinute === 11 * 60, "the next Action drag did not recover after cancellation");
    expect(recovered.tasks[0].planned.startMinute).toBe(11 * 60);
  });

  test("an estimated Action resizes immediately without moving its start", async ({ page }) => {
    const initialEstimate = 90;
    await seedPlanner(page, scheduledAction({ id: "task-resize", title: "Resize the brief", estimateMinutes: initialEstimate }));
    const chip = page.locator('[data-task-chip="task-resize"]');
    await chip.scrollIntoViewIfNeeded();
    const handle = chip.getByTestId("timeline-action-resize");
    await expect(handle).toBeVisible();
    await expect(handle.getByTestId("timeline-action-resize-cue"), "the estimate resize owner needs a visible cue").toBeVisible();
    const railGeometry = await handle.evaluate((node) => {
      const rail = node.getBoundingClientRect();
      const cue = node.querySelector('[data-test="timeline-action-resize-cue"]')?.getBoundingClientRect();
      const duration = node.querySelector(".nb-data")?.getBoundingClientRect();
      return {
        rail: { left: rail.left, right: rail.right, width: rail.width },
        cue: cue && { left: cue.left, right: cue.right, width: cue.width },
        duration: duration && { left: duration.left, right: duration.right, width: duration.width },
      };
    });
    expect(railGeometry.rail.width, "the Action estimate owner must retain its 48px rail").toBe(48);
    expect(railGeometry.cue, "the estimate cue must fit in the owner rail").not.toBeNull();
    expect(railGeometry.duration, "the estimate text must fit in the owner rail").not.toBeNull();
    expect(railGeometry.cue.left).toBeGreaterThanOrEqual(railGeometry.rail.left - 1);
    expect(railGeometry.duration.right).toBeLessThanOrEqual(railGeometry.rail.right + 1);
    expect(railGeometry.cue.right).toBeLessThanOrEqual(railGeometry.duration.left + 1);
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 68, { steps: 8 });
    await expect(page.getByTestId("timeline-action-lane")).toHaveClass(/nb-timeline-lane-active/);
    await page.mouse.up();

    const state = await settledState(
      page,
      (stored) => stored.tasks[0]?.planned.estimateMinutes > initialEstimate,
      "the Action resize did not update its estimate",
    );
    expect(state.tasks[0].planned.startMinute).toBe(10 * 60);
    expect(state.tasks[0].planned.estimateMinutes).toBeGreaterThan(initialEstimate);
    expect(state.tasks[0].planned.date).toBe(keyOf(new Date()));
  });

  test("a live estimated Action carries the NOW rule through its card", async ({ page }) => {
    const now = new Date("2026-08-13T10:20:00");
    await page.clock.setFixedTime(now);
    await seedPlanner(page, liveActionAt(now));

    const line = page.getByTestId("timeline-now-line");
    const action = page.locator('[data-task-chip="task-live"]');
    const fill = page.getByTestId("timeline-action-live-fill");
    const nowTime = page.getByTestId("timeline-now-time");
    await action.scrollIntoViewIfNeeded();
    await expect(fill).toBeVisible();
    await expect(fill).toHaveCSS("pointer-events", "none");
    await expect.poll(() => fill.evaluate((node) => Number.parseFloat(node.style.width))).toBeCloseTo(33, 0);

    const geometry = await line.evaluate((node) => ({
      line: node.getBoundingClientRect().width,
      layer: node.parentElement?.getBoundingClientRect().width,
    }));
    expect(geometry.line).toBeLessThan(geometry.layer);
    await expect.poll(() => nowTime.evaluate((node) => Number.parseFloat(getComputedStyle(node).right))).toBeGreaterThan(0);
  });

  test("a live unestimated Action uses its rendered default timeline duration", async ({ page }) => {
    const now = new Date("2026-08-13T10:20:00");
    await page.clock.setFixedTime(now);
    await seedPlanner(page, liveActionAt(now, { id: "task-live-default", estimateMinutes: null }));

    const line = page.getByTestId("timeline-now-line");
    const action = page.locator('[data-task-chip="task-live-default"]');
    const fill = page.getByTestId("timeline-action-live-fill");
    const nowTime = page.getByTestId("timeline-now-time");
    await action.scrollIntoViewIfNeeded();

    await expect(fill).toBeVisible();
    await expect.poll(() => fill.evaluate((node) => Number.parseFloat(node.style.width))).toBeCloseTo(67, 0);
    const geometry = await line.evaluate((node) => ({
      line: node.getBoundingClientRect().width,
      layer: node.parentElement?.getBoundingClientRect().width,
    }));
    expect(geometry.line).toBeLessThan(geometry.layer);
    await expect.poll(() => nowTime.evaluate((node) => Number.parseFloat(getComputedStyle(node).right))).toBeGreaterThan(0);
  });

  test("a live Event wins the NOW treatment over an overlapping Action", async ({ page }) => {
    const now = new Date("2026-08-13T10:20:00");
    await page.clock.setFixedTime(now);
    await seedPlanner(page, addLiveEvent(liveActionAt(now), now));

    await expect(page.locator('[data-event-id="event-live"]')).toContainText("33%");
    await expect(page.getByTestId("timeline-action-live-fill")).toHaveCount(0);
  });

  test("the live-time rule stays behind a moving Action card", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-now-layer", title: "Layered live time" }));
    const line = page.getByTestId("timeline-now-line");
    const chip = page.locator('[data-task-chip="task-now-layer"]');
    await chip.scrollIntoViewIfNeeded();

    const layering = await line.evaluate((node) => {
      const card = node.parentElement?.querySelector('[data-task-chip="task-now-layer"]')?.parentElement?.parentElement;
      return {
        line: getComputedStyle(node).zIndex,
        card: card ? getComputedStyle(card).zIndex : null,
      };
    });

    expect(layering.line, "the now rule is a grid guide, not a card overlay").toBe("0");
    expect(layering.card, "the Action lane must own the foreground").toBe("5");
  });

  test("drag feedback is a compact ghost, not a line across the timeline", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-drag-feedback", title: "Readable drag feedback" }));
    const chip = page.locator('[data-task-chip="task-drag-feedback"]');
    await chip.scrollIntoViewIfNeeded();
    const before = await chip.boundingBox();
    const x = before.x + before.width / 2;
    const y = before.y + before.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 56, { steps: 8 });

    const ghost = page.getByTestId("timeline-drag-ghost");
    await expect(ghost).toBeVisible();
    const ghostBox = await ghost.boundingBox();
    const cardBox = await chip.boundingBox();
    expect(ghostBox.y + ghostBox.height, "the ghost should sit above the card it represents").toBeLessThanOrEqual(cardBox.y + 1);

    const dropPreview = page.getByTestId("timeline-drop-preview");
    await expect(dropPreview).toBeVisible();
    expect(await dropPreview.evaluate((node) => getComputedStyle(node).zIndex), "the landing guide must sit behind cards").toBe("0");

    /* A lane can settle into a collision after a drag, but the lane currently
       under the pointer must follow the pointer exactly. Interpolating its
       left/width geometry makes a visible trailing rule race across the card. */
    const lane = page.getByTestId("timeline-action-lane");
    await expect(lane).toHaveClass(/nb-timeline-lane-active/);
    const activeProperties = await lane.evaluate((node) => getComputedStyle(node).transitionProperty);
    expect(activeProperties, "an active Action lane must not interpolate left geometry").not.toContain("left");
    expect(activeProperties, "an active Action lane must not interpolate width geometry").not.toContain("width");
    await page.mouse.up();
  });

  test("the Actions view removes the week ribbon", async ({ page }) => {
    await openPlanner(page);
    await expect(page.getByTestId("day-ribbon")).toBeVisible();

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("calendar-ribbon-reveal")).toHaveCount(0);
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
  });

  test("the timeline completion affordance stays compact and the action face is opaque", async ({ page }) => {
    await seedPlanner(page, scheduledAction());
    const chip = page.locator('[data-task-chip="task-timeline"]');
    await chip.scrollIntoViewIfNeeded();

    const complete = page.getByRole("button", { name: "Complete Review launch brief" });
    const mark = complete.getByTestId("timeline-complete-mark");
    const [chipBox, completeBox, markBox] = await Promise.all([
      chip.boundingBox(), complete.boundingBox(), mark.boundingBox(),
    ]);

    expect(chipBox).not.toBeNull();
    expect(completeBox).not.toBeNull();
    expect(markBox).not.toBeNull();
    expect(markBox.width).toBeLessThanOrEqual(20);
    expect(markBox.height).toBeLessThanOrEqual(20);
    expect(completeBox.y).toBeGreaterThanOrEqual(chipBox.y);
    expect(completeBox.y + completeBox.height).toBeLessThanOrEqual(chipBox.y + chipBox.height + 0.5);

    const background = await chip.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(background, "the swipe backing must not bleed through the resting action face").not.toMatch(/rgba\([^)]*,\s*0(?:\.\d+)?\)/);

    const backdrop = page.getByTestId("timeline-completion-backdrop");
    await expect(backdrop).toBeVisible();
    const backdropStyle = await backdrop.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, opacity: style.opacity };
    });
    expect(backdropStyle.background, "the COMPLETE reveal must be a solid surface").not.toMatch(/rgba\([^)]*,\s*0(?:\.\d+)?\)/);
    expect(backdropStyle.opacity).toBe("1");
  });

  test("the Actions card completion backing is a solid surface", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const backdrop = page.getByTestId("task-completion-backdrop").first();
    await expect(backdrop).toBeVisible();
    const resting = await backdrop.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, opacity: style.opacity };
    });

    expect(resting.background, "the completion backing must not be transparent at rest").not.toMatch(/rgba\([^)]*,\s*0(?:\.\d+)?\)/);
    expect(resting.opacity).toBe("1");

    const card = page.locator("[data-task]").first();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
    const revealed = await backdrop.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(revealed, "the revealed COMPLETE surface must be opaque").not.toMatch(/rgba\([^)]*,\s*0(?:\.\d+)?\)/);
    await page.mouse.up();
  });

  test("the empty Actions state enters with a restrained reveal", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const empty = page.getByRole("button", { name: /Nothing claimed for this day yet/ });
    await expect(empty).toBeVisible();
    const motion = await empty.evaluate((node) => {
      const style = getComputedStyle(node);
      return { name: style.animationName, duration: style.animationDuration, transform: style.transform };
    });
    expect(motion.name).toBe("nb-list-enter");
    expect(motion.duration).toBe("0.18s");
    expect(motion.transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, [0-9.]+\))$/);
  });

  test("changing an Actions smart view reveals only its replacement rows", async ({ page }) => {
    const state = scheduledAction({ id: "task-today-motion", title: "Today action" });
    const inbox = createTask(state.tasks, {
      id: "task-inbox-motion", title: "Inbox action",
      planned: { date: null, startMinute: null, estimateMinutes: null },
    });
    await seedPlanner(page, { ...state, tasks: inbox.tasks });
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    await page.getByRole("button", { name: /INBOX/ }).click();
    const replacement = page.locator('[data-task="task-inbox-motion"]');
    await expect(replacement).toHaveClass(/nb-list-enter/);
  });

  test("every open Action exposes Add a step immediately", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-steps", title: "Action without steps" }));
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const card = page.locator('[data-task="task-steps"]');
    await expect(card.getByTestId("task-add-step"), "the subtask affordance must not depend on an existing step").toBeVisible();
    await expect(card.getByPlaceholder("Add a step")).toBeVisible();
  });

  test("a parent with only subtasks hides its empty checklist until Quick Step is chosen", async ({ page }) => {
    const action = scheduledAction({ id: "task-child-only", title: "Plan the launch" });
    action.tasks = createTask(action.tasks, {
      id: "task-child-only-research", title: "Confirm the audience", parentTaskId: "task-child-only",
    }).tasks;
    await seedPlanner(page, action);
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const parent = page.locator('[data-task="task-child-only"]');
    await expect(parent.getByTestId("task-add-step")).toHaveCount(0);
    await expect(parent.getByRole("button", { name: "+ QUICK STEP" })).toBeVisible();

    await parent.getByRole("button", { name: "+ QUICK STEP" }).click();
    await expect(parent.getByTestId("task-add-step")).toBeVisible();
    await expect(parent.getByPlaceholder("Add a step")).toBeVisible();
    await expect(parent.getByPlaceholder("Add a step")).toBeFocused();
  });

  test("Quick Step stays secondary to the Action title without shrinking its hit target", async ({ page }) => {
    const action = scheduledAction({ id: "task-quick-step-type", title: "Plan the launch" });
    action.tasks = createTask(action.tasks, {
      id: "task-quick-step-child", title: "Confirm the audience", parentTaskId: "task-quick-step-type",
    }).tasks;
    await seedPlanner(page, action);
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const card = page.locator('[data-task="task-quick-step-type"]');
    const quickStep = card.getByRole("button", { name: "+ QUICK STEP" });
    const metrics = await card.evaluate((node) => {
      const title = node.querySelector("span.text-sm.font-semibold");
      const prompt = [...node.querySelectorAll("button")].find((button) => button.textContent?.includes("QUICK STEP"));
      return {
        titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        promptSize: prompt ? parseFloat(getComputedStyle(prompt).fontSize) : 0,
        promptHeight: prompt?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(metrics.promptSize).toBeLessThan(metrics.titleSize);
    expect(metrics.promptHeight).toBeGreaterThanOrEqual(44);
    await expect(quickStep).toBeVisible();
  });

  test("Add a step precedes existing steps in the full-screen Actions view", async ({ page }) => {
    const action = scheduledAction({ id: "task-step-order", title: "Ordered checklist" });
    action.tasks[0].checklist = [
      { id: "step-first", title: "Existing first step", done: false, order: 0, completedAt: null },
      { id: "step-second", title: "Existing second step", done: false, order: 1, completedAt: null },
    ];
    await seedPlanner(page, action);
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const card = page.locator('[data-task="task-step-order"]');
    const order = await card.evaluate((node) => {
      const add = node.querySelector('input[placeholder="Add a step"]');
      const firstStep = [...node.querySelectorAll("button")].find((button) => button.textContent?.includes("Existing first step"));
      if (!add || !firstStep) return "missing";
      return add.compareDocumentPosition(firstStep) & Node.DOCUMENT_POSITION_FOLLOWING ? "add-first" : "step-first";
    });
    expect(order).toBe("add-first");
  });

  test("a parent separates checklist steps from tracked subtasks", async ({ page }) => {
    const action = scheduledAction({ id: "task-hierarchy-groups", title: "Prepare the demo" });
    action.tasks[0].checklist = [
      { id: "step-hierarchy", title: "Collect screenshots", done: false, order: 0, completedAt: null },
    ];
    action.tasks = createTask(action.tasks, {
      id: "task-hierarchy-child", title: "Write the talk track", parentTaskId: "task-hierarchy-groups", status: "waiting",
    }).tasks;
    await seedPlanner(page, action);
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const parent = page.locator('[data-task="task-hierarchy-groups"]');
    await expect(parent.getByTestId("task-checklist")).toContainText("CHECKLIST");
    await expect(parent.getByTestId("task-subtasks")).toContainText("SUBTASKS");
    await expect(parent.getByTestId("task-subtask")).toContainText("WAITING");
    await expect(parent.getByRole("button", { name: "Convert step to a subtask" })).toBeVisible();

    const hierarchy = await parent.evaluate((node) => {
      const title = node.querySelector('[data-test="task-subtask"] span.text-xs');
      const label = [...node.querySelectorAll('[data-test="task-subtask"] span')]
        .find((span) => span.textContent?.trim() === "SUBTASK");
      const card = node.querySelector("article");
      const subtasks = node.querySelector('[data-test="task-subtasks"]');
      return {
        titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        labelSize: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
        bottomGap: card && subtasks ? Math.abs(card.getBoundingClientRect().bottom - subtasks.getBoundingClientRect().bottom) : 999,
      };
    });
    expect(hierarchy.labelSize).toBeLessThan(hierarchy.titleSize);
    expect(hierarchy.bottomGap).toBeGreaterThanOrEqual(10);
    expect(hierarchy.bottomGap).toBeLessThanOrEqual(14);
  });

  test("a subtask inspector names its parent and does not offer a second hierarchy level", async ({ page }) => {
    const action = scheduledAction({ id: "task-inspect-parent", title: "Ship the workshop" });
    action.tasks = createTask(action.tasks, {
      id: "task-inspect-child", title: "Confirm the speakers", parentTaskId: "task-inspect-parent",
      checklist: [{ id: "child-step", title: "Check biographies", done: false, order: 0, completedAt: null }],
    }).tasks;
    await seedPlanner(page, action);
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const parent = page.locator('[data-task="task-inspect-parent"]');
    await parent.getByTestId("task-subtask").locator("button").nth(1).click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-sheet-title", "SUBTASK");
    await expect(sheet.getByRole("button", { name: "Open parent action Ship the workshop" })).toBeVisible();
    await sheet.getByRole("button", { name: "EDIT SUBTASK" }).click();
    await expect(sheet.getByRole("button", { name: "Convert step to a subtask" })).toHaveCount(0);

    await sheet.getByRole("button", { name: "Open parent action Ship the workshop" }).click();
    await expect(sheet).toHaveAttribute("data-sheet-title", "ACTION");
  });

  test("a promoted checklist step remains visible beneath its parent Action", async ({ page }) => {
    const action = scheduledAction({ id: "task-promote", title: "Prepare the workshop" });
    action.tasks[0].checklist = [
      { id: "step-promote", title: "Book the room", done: false, order: 0, completedAt: null },
    ];
    await seedPlanner(page, action);
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const parent = page.locator('[data-task="task-promote"]');
    await parent.getByRole("button", { name: "Convert step to a subtask" }).click();
    await expect(page.getByTestId("sheet")).toHaveCount(0);

    const state = await settledState(
      page,
      (stored) => stored.tasks.some((task) => task.parentTaskId === "task-promote" && task.title === "Book the room"),
      "promotion did not create a child Action",
    );
    expect(state.tasks.find((task) => task.parentTaskId === "task-promote")?.status).toBe("open");
    await expect(parent.getByTestId("task-checklist")).toHaveCount(0);
    const child = parent.getByTestId("task-subtask");
    await expect(child).toContainText("Book the room");
    await child.getByRole("button", { name: "Complete Book the room" }).click();
    await settledState(
      page,
      (stored) => stored.tasks.some((task) => task.parentTaskId === "task-promote" && task.status === "completed"),
      "nested subtask did not complete",
    );
    await child.getByRole("button", { name: "Reopen Book the room" }).click();
    await settledState(
      page,
      (stored) => stored.tasks.some((task) => task.parentTaskId === "task-promote" && task.status === "open"),
      "nested subtask did not reopen",
    );
    await expect(page.locator("[data-task]"), "a child must stay nested instead of duplicating the parent Action").toHaveCount(1);
  });

  test("inline promotion preserves a completed checklist item's state", async ({ page }) => {
    const action = scheduledAction({ id: "task-promote-completed", title: "Close the launch loop" });
    action.tasks[0].checklist = [
      { id: "step-promote-completed", title: "Archive the notes", done: true, order: 0, completedAt: "2026-08-09T09:00" },
    ];
    await seedPlanner(page, action);
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const parent = page.locator('[data-task="task-promote-completed"]');
    await parent.getByTestId("task-promote-subtask").click();
    const state = await settledState(
      page,
      (stored) => stored.tasks.some((task) => task.parentTaskId === "task-promote-completed" && task.title === "Archive the notes"),
      "completed inline promotion did not create a child Action",
    );
    const child = state.tasks.find((task) => task.parentTaskId === "task-promote-completed" && task.title === "Archive the notes");
    expect(child?.status).toBe("completed");
    await expect(parent.getByTestId("task-checklist")).toHaveCount(0);
    await expect(parent.getByTestId("task-subtask")).toContainText("Archive the notes");
  });

  test("the Timeline keeps a promoted subtask legible on its parent Action", async ({ page }) => {
    const action = scheduledAction({ id: "task-timeline-promote", title: "Run the workshop" });
    action.tasks[0].checklist = [
      { id: "step-timeline-promote", title: "Send the briefing", done: false, order: 0, completedAt: null },
    ];
    await seedPlanner(page, action);

    const chip = page.locator('[data-task-chip="task-timeline-promote"]');
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    const sheet = page.getByTestId("sheet");
    await sheet.getByRole("button", { name: "EDIT ACTION" }).click();
    await sheet.getByRole("button", { name: "Convert step to a subtask" }).click();
    await settledState(
      page,
      (stored) => stored.tasks.some((task) => task.parentTaskId === "task-timeline-promote" && task.title === "Send the briefing"),
      "Timeline promotion did not create a child Action",
    );

    await expect(sheet.getByTestId("task-subtask")).toContainText("Send the briefing");
    await expect(chip.getByTestId("timeline-action-subtasks")).toContainText("1 SUBTASK");
  });

  test.describe("on a mobile Timeline sheet", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("offers a visible touch-sized way to convert a checklist item to a subtask", async ({ page }) => {
      const action = scheduledAction({ id: "task-mobile-promote", title: "Prepare the mobile release" });
      action.tasks[0].checklist = [
        { id: "step-mobile-promote", title: "Confirm the checklist", done: false, order: 0, completedAt: null },
      ];
      await seedPlanner(page, action);

      const chip = page.locator('[data-task-chip="task-mobile-promote"]');
      await chip.scrollIntoViewIfNeeded();
      await chip.click();

      const sheet = page.getByTestId("sheet");
      const promote = sheet.getByRole("button", { name: "Convert step to a subtask" });
      await expect(promote).toBeVisible();
      await expect(promote).toHaveText("MAKE SUBTASK");
      await expect(promote).toHaveCSS("min-height", "44px");

      await promote.click();
      await settledState(
        page,
        (stored) => stored.tasks.some((task) => task.parentTaskId === "task-mobile-promote" && task.title === "Confirm the checklist"),
        "mobile Timeline promotion did not create a child Action",
      );
      await expect(sheet.getByTestId("task-subtask")).toContainText("Confirm the checklist");
    });
  });

  test("a short Timeline Action keeps its subtask count in the title row", async ({ page }) => {
    const action = scheduledAction({ id: "task-short-child", title: "Call the client" });
    action.tasks[0].planned.estimateMinutes = 15;
    action.tasks = createTask(action.tasks, {
      id: "task-short-child-follow-up", title: "Send the recap", parentTaskId: "task-short-child",
    }).tasks;
    await seedPlanner(page, action);

    const chip = page.locator('[data-task-chip="task-short-child"]');
    await chip.scrollIntoViewIfNeeded();
    await expect(chip.getByTestId("timeline-action-subtask-marker")).toContainText("1");
    await expect(chip.getByTestId("timeline-action-subtasks")).toHaveCount(0);
  });

  test("the haptics preference suppresses completion vibration without blocking completion", async ({ page }) => {
    await recordVibrations(page);
    await seedPlanner(page, scheduledAction({ id: "task-quiet", title: "Quiet completion" }));
    await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
      PREFERENCES_STORE_KEY,
      JSON.stringify(createPreferences({ feedback: { haptics: false } })),
    ]);
    await page.reload();

    const chip = page.locator('[data-task-chip="task-quiet"]');
    await chip.scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Complete Quiet completion" }).click();

    await settledState(page, (stored) => stored.tasks[0]?.status === "completed", "completion was incorrectly gated by feedback");
    expect(await page.evaluate(() => window.__calendarMasterVibrations)).toEqual([]);
  });

  test("collapses, restores, and remembers across a reload", async ({ page }) => {
    await openPlanner(page);
    const column = page.getByTestId("actions-column");
    await expect(column).toBeVisible();

    /* The panel is rendered twice — the desktop column and the mobile sheet —
       and only one is ever visible. Scope to the column so the test targets what
       a person at this viewport can actually click. */
    await column.getByTestId("actions-collapse").click();
    await expect(column).toBeHidden();
    await expect(page.getByTestId("actions-restore")).toBeVisible();

    /* Collapsed is a UI preference, so it has to survive the page going away. */
    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await expect(page.getByTestId("actions-column")).toBeHidden();
    await expect(page.getByTestId("actions-restore")).toBeVisible();

    await page.getByTestId("actions-restore").click();
    await expect(page.getByTestId("actions-column")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await expect(page.getByTestId("actions-column")).toBeVisible();
  });

  test("collapse and restore interpolate the pane, contents, and restore rail", async ({ page }) => {
    await openPlanner(page);
    const main = page.locator("main.nb-main");
    const stream = page.getByTestId("day-stream");
    const column = page.getByTestId("actions-column");
    const restore = page.getByTestId("actions-restore");
    const collapse = column.getByTestId("actions-collapse");
    const narrow = (await stream.boundingBox()).width;

    const motion = await main.evaluate((node) => {
      const columnStyle = getComputedStyle(node.querySelector('[data-test="actions-column"]'));
      const mainStyle = getComputedStyle(node);
      return {
        grid: mainStyle.transitionProperty,
        duration: mainStyle.transitionDuration,
        column: columnStyle.transitionProperty,
      };
    });
    expect(motion.grid).toContain("grid-template-columns");
    expect(motion.duration).toContain("0.3s");
    /* The column used to interpolate opacity as well. It now travels its own full
       width behind the ACTIONS rail instead of dissolving in place, so transform is
       the property carrying the motion and the assertions below read travel rather
       than fade. What is being pinned is unchanged: the pane interpolates, it does
       not snap. */
    expect(motion.column).toContain("transform");

    await collapse.click();
    await page.waitForTimeout(70);
    const shrinking = (await stream.boundingBox()).width;
    /* Partway through its travel: started moving, not yet gone. */
    const travelled = await column.evaluate((node) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return m.m41 / node.getBoundingClientRect().width;
    });
    expect(shrinking).toBeGreaterThan(narrow);
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(1);
    await expect(column).toBeHidden();
    const wide = (await stream.boundingBox()).width;

    await restore.click();
    await page.waitForTimeout(70);
    const restoring = (await stream.boundingBox()).width;
    const returning = await column.evaluate((node) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return m.m41 / node.getBoundingClientRect().width;
    });
    expect(restoring).toBeLessThan(wide);
    expect(restoring).toBeGreaterThan(narrow);
    expect(returning).toBeGreaterThan(0);
    expect(returning).toBeLessThan(1);
    await expect(column).toBeVisible();
  });

  test("collapsing gives the timeline the width the column gave up", async ({ page }) => {
    await openPlanner(page);
    const stream = page.getByTestId("day-stream");
    const narrow = (await stream.boundingBox()).width;

    await page.getByTestId("actions-column").getByTestId("actions-collapse").click();
    await expect(page.getByTestId("actions-column")).toBeHidden();
    const wide = (await stream.boundingBox()).width;
    expect(wide).toBeGreaterThan(narrow);
  });

  test("the full-screen actions view opens and comes back", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Reconcile the ledger");

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-stream")).toBeHidden();
    await expect(page.getByText("Reconcile the ledger").first()).toBeVisible();

    await page.getByRole("button", { name: "BACK TO DAY" }).click();
    await expect(page.getByTestId("day-stream")).toBeVisible();
  });

  test("the week date ribbon is absent in Actions and restores in Timeline", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("day-ribbon")).toBeVisible();

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);

    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toBeVisible();
  });

  test("PLAN TODAY reviews overdue actions before changing their plan", async ({ page }) => {
    const today = keyOf(new Date());
    const yesterday = addDaysToKey(today, -1);
    const blank = createBlankPlannerState({});
    const first = createTask(blank.tasks, {
      id: "task-overdue-one", title: "Reconcile the old invoice",
      deadline: { date: yesterday },
      planned: { date: yesterday, startMinute: 600, estimateMinutes: 45 },
    });
    const second = createTask(first.tasks, {
      id: "task-overdue-two", title: "Send the overdue follow-up",
      deadline: { date: yesterday },
      planned: { date: yesterday, startMinute: 780, estimateMinutes: 30 },
    });
    await seedPlanner(page, { ...blank, tasks: second.tasks });

    const actionsColumn = page.locator('[data-test="actions-column"]');
    const plan = actionsColumn.getByTestId("plan-today");
    await expect(plan).toBeVisible();
    const before = await storedState(page);
    await plan.click();

    const review = actionsColumn.getByTestId("overdue-plan-review");
    await expect(review).toBeVisible();
    await expect(review).toContainText("Reconcile the old invoice");
    await expect(review).toContainText("DUE");
    expect((await storedState(page)).tasks.map((task) => task.planned.date)).toEqual(before.tasks.map((task) => task.planned.date));

    await review.getByTestId("overdue-plan-cancel").click();
    await expect(review).toBeHidden();
    expect((await storedState(page)).tasks.map((task) => task.planned.date)).toEqual(before.tasks.map((task) => task.planned.date));

    await plan.click();
    await review.getByTestId("overdue-plan-one").first().click();
    const when = page.getByTestId("plan-when");
    await expect(when).toBeVisible();
    await expect(when.getByRole("button", { name: "TODAY", exact: true })).toBeVisible();
    await expect(when.getByRole("button", { name: "TOMORROW", exact: true })).toBeVisible();
    await expect(when.getByRole("button", { name: "NEXT WEEK", exact: true })).toBeVisible();
    await expect(when.getByLabel("Pick a day")).toBeVisible();
    expect((await storedState(page)).tasks.find((task) => task.id === "task-overdue-one").planned.date).toBe(yesterday);
    await when.getByRole("button", { name: "TOMORROW", exact: true }).click();
    await expect(when).toHaveCount(0);
    await expect.poll(async () => (await storedState(page)).tasks.find((task) => task.id === "task-overdue-one").planned.date).toBe(addDaysToKey(today, 1));
    await expect.poll(async () => (await storedState(page)).tasks.find((task) => task.id === "task-overdue-two").planned.date).toBe(yesterday);

    await review.getByTestId("overdue-plan-all").click();
    await expect.poll(async () => (await storedState(page)).tasks.every((task) => task.planned.date === today)).toBe(true);
  });

  test("pressing an action in the full-screen view does not start a drag", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Reconcile the ledger");
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();

    const card = page.locator("[data-task]").first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();

    /* Press, hold past the lift threshold, then move — the shape of a drag. In
       the full-screen view there is no timeline under the pointer to drop onto,
       so this must end in nothing happening rather than in a broken gesture or a
       task scheduled at a minute nobody chose. */
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(box.x + box.width / 2, box.y + 220, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const state = await storedState(page);
    const task = state.tasks.find((item) => item.title === "Reconcile the ledger");
    expect(task, "the action still exists").toBeTruthy();
    expect(task.planned.date, "an invalid drag must not schedule it").toBeNull();
    expect(task.planned.startMinute).toBeNull();
    /* And the app is still usable rather than stuck mid-gesture. */
    await page.getByRole("button", { name: "BACK TO DAY" }).click();
    await expect(page.getByTestId("day-stream")).toBeVisible();
  });
});

test.describe("scheduled action completion in the mobile timeline", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a deliberate right swipe completes the timeline action without turning the day", async ({ page }) => {
    await recordVibrations(page);
    await seedPlanner(page, scheduledAction({ id: "task-swipe", title: "Swipe the brief" }));
    const chip = page.locator('[data-task-chip="task-swipe"]');
    await chip.scrollIntoViewIfNeeded();
    const beforeDate = await page.getByTestId("day-heading").getAttribute("data-date");
    const { x, y } = await completionSwipePoint(page, chip);
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x + 72, y + 3);
    await dispatchTouch(session, "touchEnd", x + 72, y + 3);
    await session.detach();

    const state = await settledState(page, (stored) => stored.tasks[0]?.status === "completed", "right swipe did not complete the action");
    expect(state.tasks[0].status).toBe("completed");
    await expect(page.getByTestId("day-heading")).toHaveAttribute("data-date", beforeDate);
    await expect(page.getByTestId("sheet")).toHaveCount(0);
  });

  test("a partial timeline swipe returns the action without completing it", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-partial", title: "Keep the brief" }));
    const chip = page.locator('[data-task-chip="task-partial"]');
    await chip.scrollIntoViewIfNeeded();
    const { x, y } = await completionSwipePoint(page, chip);
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x + 40, y + 3);
    await dispatchTouch(session, "touchEnd", x + 40, y + 3);
    await session.detach();
    await page.waitForTimeout(300);

    const state = await storedState(page);
    expect(state.tasks[0].status).toBe("open");
    await expect(chip).toHaveCSS("transform", "none");
  });
});

test.describe("touch Action ownership in the timeline", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("touch scrolling from an Action does not reschedule or inspect it", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-scroll", title: "Scroll the brief" }));
    const chip = page.locator('[data-task-chip="task-touch-scroll"]');
    await chip.scrollIntoViewIfNeeded();
    const stream = page.getByTestId("day-stream");
    const beforeScroll = await stream.evaluate((node) => node.scrollTop);
    const before = (await storedState(page)).tasks[0].planned;
    const title = chip.locator(".nb-lead");
    const box = await title.boundingBox();
    expect(box, "the Action title is not measurable").not.toBeNull();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const ownership = await page.evaluate(({ x: px, y: py }) => {
      const hit = document.elementFromPoint(px, py);
      return {
        chip: hit?.closest?.("[data-task-chip]")?.getAttribute("data-task-chip") ?? null,
        move: hit?.closest?.("[data-touch-move]") != null,
        estimate: hit?.closest?.("[data-action-estimate]") != null,
        complete: hit?.closest?.("[data-timeline-complete]") != null,
      };
    }, { x, y });
    expect(ownership.chip).toBe("task-touch-scroll");
    expect(ownership.move, "body-scroll coverage must start outside the explicit move control").toBe(false);
    expect(ownership.estimate, "body-scroll coverage must start outside the estimate control").toBe(false);
    expect(ownership.complete, "body-scroll coverage must start outside completion").toBe(false);
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x, y + 80);
    await expect.poll(() => stream.evaluate((node, initial) => Math.abs(node.scrollTop - initial), beforeScroll), {
      message: "vertical Action touch should physically scroll the Day timeline",
    }).toBeGreaterThan(1);
    await dispatchTouch(session, "touchMove", x, y + 150);
    await dispatchTouch(session, "touchEnd", x, y + 150);
    await session.detach();

    const after = (await settledState(page, (state) => state.tasks.length === 1)).tasks[0].planned;
    expect(after, "scrolling from an Action must not write its plan").toEqual(before);
    await expect(page.getByTestId("sheet"), "scrolling from an Action must not inspect it").toHaveCount(0);
  });

  test("an explicit Action move control starts from immediate movement", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-direct-move", title: "Move the brief immediately" }));
    const chip = page.locator('[data-task-chip="task-touch-direct-move"]');
    await chip.scrollIntoViewIfNeeded();
    const move = chip.locator("[data-touch-move]");
    expect(await move.count(), "scheduled Actions need an explicit data-touch-move descendant").toBe(1);
    const box = await move.boundingBox();
    expect(box, "the Action move control is not measurable").not.toBeNull();
    const stream = page.getByTestId("day-stream");
    const beforeScroll = await stream.evaluate((node) => node.scrollTop);
    const before = (await storedState(page)).tasks[0].planned;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x, y + 68);
    await dispatchTouch(session, "touchEnd", x, y + 68);
    await session.detach();

    const state = await settledState(page, (stored) => stored.tasks[0]?.planned.startMinute === 11 * 60, "immediate Action move never changed start");
    expect(state.tasks[0].planned.date, "an explicit Action move must keep the date").toBe(before.date);
    expect(state.tasks[0].planned.estimateMinutes, "an explicit Action move must keep the estimate").toBe(before.estimateMinutes);
    expect(state.tasks[0].planned.startMinute).toBe(11 * 60);
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "the Day stream moved under an explicit Action move",
    }).toBe(beforeScroll);
    await expect(page.getByTestId("sheet"), "an explicit Action move must not inspect the card").toHaveCount(0);
  });

  test("an explicit Action estimate control resizes immediately without a hold", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-direct-resize", title: "Resize the brief immediately" }));
    const chip = page.locator('[data-task-chip="task-touch-direct-resize"]');
    await chip.scrollIntoViewIfNeeded();
    const handle = chip.getByTestId("timeline-action-resize");
    const box = await handle.boundingBox();
    expect(box, "the Action estimate control is not measurable").not.toBeNull();
    const stream = page.getByTestId("day-stream");
    const beforeScroll = await stream.evaluate((node) => node.scrollTop);
    const before = (await storedState(page)).tasks[0].planned;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x, y + 68);
    await dispatchTouch(session, "touchEnd", x, y + 68);
    await session.detach();

    const state = await settledState(page, (stored) => stored.tasks[0]?.planned.estimateMinutes > before.estimateMinutes, "immediate Action estimate resize never changed estimate");
    expect(state.tasks[0].planned.date, "an explicit Action resize must keep the date").toBe(before.date);
    expect(state.tasks[0].planned.startMinute, "an explicit Action resize must keep the start").toBe(before.startMinute);
    expect(state.tasks[0].planned.estimateMinutes).toBeGreaterThan(before.estimateMinutes);
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "the Day stream moved under an explicit Action estimate resize",
    }).toBe(beforeScroll);
    await expect(page.getByTestId("sheet"), "an explicit Action resize must not inspect the card").toHaveCount(0);
  });

  test("a tap or 2px tremor on the Action estimate control inspects without writing", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-direct-tap", title: "Inspect the brief" }));
    const chip = page.locator('[data-task-chip="task-touch-direct-tap"]');
    await chip.scrollIntoViewIfNeeded();
    const before = (await storedState(page)).tasks[0].planned;
    const locator = chip.getByTestId("timeline-action-resize");
    expect(await locator.count(), "scheduled Actions need an explicit estimate resize control").toBe(1);
    const box = await locator.boundingBox();
    expect(box, "the Action estimate control is not measurable").not.toBeNull();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchEnd", x, y);
    await expect(page.getByTestId("sheet"), "a tap on the Action estimate control must inspect").toHaveCount(1);
    let planned = (await settledState(page, () => true, "the notebook never settled after a direct-control tap")).tasks[0].planned;
    expect(planned, "a tap on the Action estimate control must not write").toEqual(before);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).toHaveCount(0);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x + 2, y);
    await dispatchTouch(session, "touchEnd", x + 2, y);
    await expect(page.getByTestId("sheet"), "a 2px tremor on the Action estimate control must inspect").toHaveCount(1);
    planned = (await settledState(page, () => true, "the notebook never settled after a direct-control tremor")).tasks[0].planned;
    expect(planned, "a 2px tremor on the Action estimate control must not write").toEqual(before);
    await session.detach();
  });

  test("a tap or 2px tremor on the Action move control inspects without writing", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-direct-move-tap", title: "Inspect the brief from move" }));
    const chip = page.locator('[data-task-chip="task-touch-direct-move-tap"]');
    await chip.scrollIntoViewIfNeeded();
    const before = (await storedState(page)).tasks[0].planned;
    const move = chip.locator("[data-touch-move]");
    expect(await move.count(), "scheduled Actions need an explicit move control").toBe(1);
    const box = await move.boundingBox();
    expect(box, "the Action move control is not measurable").not.toBeNull();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchEnd", x, y);
    await expect(page.getByTestId("sheet"), "a tap on the Action move control must inspect").toHaveCount(1);
    let planned = (await settledState(page, () => true, "the notebook never settled after a move-control tap")).tasks[0].planned;
    expect(planned, "a tap on the Action move control must not write").toEqual(before);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).toHaveCount(0);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x + 2, y);
    await dispatchTouch(session, "touchEnd", x + 2, y);
    await expect(page.getByTestId("sheet"), "a 2px tremor on the Action move control must inspect").toHaveCount(1);
    planned = (await settledState(page, () => true, "the notebook never settled after a move-control tremor")).tasks[0].planned;
    expect(planned, "a 2px tremor on the Action move control must not write").toEqual(before);
    await session.detach();
  });

  test("Action estimate control is visible, coarse, disjoint from completion, and browser-owned", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-direct-geometry", title: "Own the brief lanes" }));
    const lane = page.getByTestId("timeline-action-lane");
    const chip = page.locator('[data-task-chip="task-touch-direct-geometry"]');
    await chip.scrollIntoViewIfNeeded();
    const estimate = chip.getByTestId("timeline-action-resize");
    const complete = lane.locator("[data-timeline-complete]");
    await expect(estimate).toHaveCount(1);
    await expect(complete).toHaveCount(1);

    const geometryOf = async (locator) => {
      const box = await locator.boundingBox();
      expect(box, "a direct Action control has no measurable box").not.toBeNull();
      const style = await locator.evaluate((node) => {
        const computed = getComputedStyle(node);
        return { touchAction: computed.touchAction, opacity: computed.opacity, visibility: computed.visibility };
      });
      return { box, style };
    };
    const [estimateGeom, completeGeom] = await Promise.all([geometryOf(estimate), geometryOf(complete)]);
    const disjoint = (a, b, label) => {
      const separate = a.x + a.width <= b.x + 0.5
        || b.x + b.width <= a.x + 0.5
        || a.y + a.height <= b.y + 0.5
        || b.y + b.height <= a.y + 0.5;
      expect(separate, label).toBe(true);
    };

    expect(estimateGeom.box.width, "the Action estimate control must be at least 44px wide").toBeGreaterThanOrEqual(44);
    expect(estimateGeom.box.height, "the Action estimate control must be at least 44px tall").toBeGreaterThanOrEqual(44);
    expect(estimateGeom.style.visibility).not.toBe("hidden");
    expect(estimateGeom.style.opacity, "the Action estimate control must not be transparent").not.toBe("0");
    expect(estimateGeom.style.touchAction, "the Action estimate control must take browser ownership at touch start").toBe("none");
    disjoint(estimateGeom.box, completeGeom.box, "Action estimate overlaps completion");

    const hits = await page.evaluate((points) => points.map(([label, x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return {
        label,
        estimate: hit?.closest?.("[data-action-estimate]") != null,
        complete: hit?.closest?.("[data-timeline-complete]") != null,
      };
    }), [
      ["estimate", estimateGeom.box.x + estimateGeom.box.width / 2, estimateGeom.box.y + estimateGeom.box.height / 2],
      ["complete", completeGeom.box.x + completeGeom.box.width / 2, completeGeom.box.y + completeGeom.box.height / 2],
    ]);
    const byLabel = Object.fromEntries(hits.map((hit) => [hit.label, hit]));
    expect(byLabel.estimate.estimate, "the estimate center must remain estimate-owned").toBe(true);
    expect(byLabel.estimate.complete).toBe(false);
    expect(byLabel.complete.complete, "the completion center must remain completion-owned").toBe(true);
    expect(byLabel.complete.estimate).toBe(false);
  });

  test("Action move control is visible, coarse, disjoint, and browser-owned", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-direct-move-geometry", title: "Own the brief move lane" }));
    const lane = page.getByTestId("timeline-action-lane");
    const chip = page.locator('[data-task-chip="task-touch-direct-move-geometry"]');
    await chip.scrollIntoViewIfNeeded();
    const move = chip.locator("[data-touch-move]");
    const estimate = chip.getByTestId("timeline-action-resize");
    const complete = lane.locator("[data-timeline-complete]");
    expect(await move.count(), "scheduled Actions need an explicit data-touch-move descendant").toBe(1);
    await expect(estimate).toHaveCount(1);
    await expect(complete).toHaveCount(1);
    await expect(move).toHaveAttribute("aria-label", "Open or move Own the brief move lane");
    await expect(move).not.toHaveAttribute("aria-hidden", "true");

    const geometryOf = async (locator) => {
      const box = await locator.boundingBox();
      expect(box, "a direct Action control has no measurable box").not.toBeNull();
      const style = await locator.evaluate((node) => {
        const computed = getComputedStyle(node);
        return { touchAction: computed.touchAction, opacity: computed.opacity, visibility: computed.visibility };
      });
      return { box, style };
    };
    const [moveGeom, estimateGeom, completeGeom] = await Promise.all([
      geometryOf(move), geometryOf(estimate), geometryOf(complete),
    ]);
    const disjoint = (a, b, label) => {
      const separate = a.x + a.width <= b.x + 0.5
        || b.x + b.width <= a.x + 0.5
        || a.y + a.height <= b.y + 0.5
        || b.y + b.height <= a.y + 0.5;
      expect(separate, label).toBe(true);
    };

    expect(moveGeom.box.width, "the Action move control must be at least 44px wide").toBeGreaterThanOrEqual(44);
    expect(moveGeom.box.height, "the Action move control must be at least 44px tall").toBeGreaterThanOrEqual(44);
    expect(moveGeom.style.visibility).not.toBe("hidden");
    expect(moveGeom.style.opacity, "the Action move control must not be transparent").not.toBe("0");
    expect(moveGeom.style.touchAction, "the Action move control must take browser ownership at touch start").toBe("none");
    disjoint(moveGeom.box, estimateGeom.box, "Action move overlaps estimate resize");
    disjoint(moveGeom.box, completeGeom.box, "Action move overlaps completion");

    const hit = await page.evaluate(({ x, y }) => {
      const node = document.elementFromPoint(x, y);
      return {
        move: node?.closest?.("[data-touch-move]") != null,
        estimate: node?.closest?.("[data-action-estimate]") != null,
        complete: node?.closest?.("[data-timeline-complete]") != null,
      };
    }, { x: moveGeom.box.x + moveGeom.box.width / 2, y: moveGeom.box.y + moveGeom.box.height / 2 });
    expect(hit.move, "the Action move control center must hit data-touch-move").toBe(true);
    expect(hit.estimate).toBe(false);
    expect(hit.complete).toBe(false);

    const boundaryHits = await page.evaluate((points) => points.map(({ label, x, y }) => {
      const node = document.elementFromPoint(x, y);
      return {
        label,
        move: node?.closest?.("[data-touch-move]") != null,
        complete: node?.closest?.("[data-timeline-complete]") != null,
      };
    }), [
      { label: "completion edge", x: completeGeom.box.x + completeGeom.box.width - 1, y: completeGeom.box.y + completeGeom.box.height / 2 },
      { label: "move edge", x: moveGeom.box.x + 1, y: moveGeom.box.y + moveGeom.box.height / 2 },
    ]);
    const boundaryByLabel = Object.fromEntries(boundaryHits.map((sample) => [sample.label, sample]));
    expect(boundaryByLabel["completion edge"].complete, "completion must own its final visible pixel").toBe(true);
    expect(boundaryByLabel["completion edge"].move).toBe(false);
    expect(boundaryByLabel["move edge"].move, "move must own its first visible pixel on a coarse pointer").toBe(true);
    expect(boundaryByLabel["move edge"].complete, "completion's expanded pseudo-target must not cover move").toBe(false);
  });

  test("a held touch Action moves after the lift threshold", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-move", title: "Move the brief by touch" }));
    const chip = page.locator('[data-task-chip="task-touch-move"]');
    await chip.scrollIntoViewIfNeeded();
    const box = await chip.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height / 2, 18);
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await page.waitForTimeout(340);
    await dispatchTouch(session, "touchMove", x, y + 68);
    await dispatchTouch(session, "touchEnd", x, y + 68);
    await session.detach();

    const state = await settledState(page, (stored) => stored.tasks[0]?.planned.startMinute === 11 * 60, "the held touch Action did not move");
    expect(state.tasks[0].planned.startMinute).toBe(11 * 60);
  });

  test("the active Action owns the Day scroll position after lift", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-lock", title: "Lock the brief while moving" }));
    const chip = page.locator('[data-task-chip="task-touch-lock"]');
    await chip.scrollIntoViewIfNeeded();
    const stream = page.getByTestId("day-stream");
    const before = (await storedState(page)).tasks[0].planned;
    const box = await chip.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height / 2, 18);
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await page.waitForTimeout(340);
    const beforeLock = await stream.evaluate((node) => node.scrollTop);
    await stream.evaluate((node) => {
      node.scrollTop += 120;
      node.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "active Action ownership must restore forced Day scroll drift",
    }).toBe(beforeLock);
    await dispatchTouch(session, "touchMove", x, y + 68);
    await dispatchTouch(session, "touchEnd", x, y + 68);
    await session.detach();

    const state = await settledState(page, (stored) => stored.tasks[0]?.planned.startMinute === 11 * 60, "the active Action never committed after the scroll-lock check");
    expect(state.tasks[0].planned.date).toBe(before.date);
    expect(state.tasks[0].planned.estimateMinutes).toBe(before.estimateMinutes);
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "the Day stream moved underneath the active Action",
    }).toBe(beforeLock);
  });

  test("a held touch on the estimate resizes an Action without moving its start", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-touch-resize", title: "Resize the brief by touch" }));
    const chip = page.locator('[data-task-chip="task-touch-resize"]');
    await chip.scrollIntoViewIfNeeded();
    const handle = chip.getByTestId("timeline-action-resize");
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await page.waitForTimeout(340);
    await dispatchTouch(session, "touchMove", x, y + 68);
    await dispatchTouch(session, "touchEnd", x, y + 68);
    await session.detach();

    const state = await settledState(page, (stored) => stored.tasks[0]?.planned.estimateMinutes > 60, "the held touch Action resize did not change its estimate");
    expect(state.tasks[0].planned.startMinute).toBe(10 * 60);
    expect(state.tasks[0].planned.estimateMinutes).toBeGreaterThan(60);
  });

});

test.describe("document fallback touch origin", () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: true, isMobile: false });

  test("a touch drag that starts in the Actions column reaches the Day stream through the external fallback", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-external-desktop-touch", title: "Move from the Actions column" }));
    const stream = page.getByTestId("day-stream");
    const before = (await settledState(page, () => true, "the notebook never settled")).tasks[0].planned;
    const action = page.locator('[data-task="task-external-desktop-touch"]:visible');
    await expect(action).toBeVisible();
    const dragHandle = action.getByRole("button", { name: "Drag to schedule, reorder, or move to another day" });
    const from = await dragHandle.boundingBox();
    const target = await stream.boundingBox();
    const x = from.x + from.width / 2;
    const y = from.y + from.height / 2;
    const dropX = target.x + target.width / 2;
    const dropY = target.y + target.height / 2;
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await page.waitForTimeout(80);
    await dispatchTouch(session, "touchMove", dropX, dropY);
    await dispatchTouch(session, "touchEnd", dropX, dropY);
    await session.detach();

    const state = await settledState(page, (stored) => stored.tasks[0]?.planned.startMinute !== before.startMinute, "an externally-originated touch drag did not reach the Day stream");
    expect(state.tasks[0].planned.date).toBe(before.date);
    expect(state.tasks[0].planned.estimateMinutes).toBe(before.estimateMinutes);
  });
});

test.describe("hold to complete feedback", () => {
  test("hold-to-complete cancels on pointer leave and does not complete early", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-hold", title: "Review project proposal" }));
    const actionCard = page.getByTestId("actions-column").locator('[data-task="task-hold"]');
    const holdBtn = actionCard.getByRole("button", { name: "Hold to complete" });

    // Press down briefly and leave to cancel
    const box = await holdBtn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(box.x - 50, box.y - 50); // leave
    await page.mouse.up();

    // Task must remain open
    await expect(actionCard).toHaveAttribute("data-task-status", "open");
    await expect(actionCard.getByTestId("task-completion-overlay")).toHaveAttribute("data-visible", "false");
  });

  test("holding to completion completes the task and reopening does not re-celebrate", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-hold-2", title: "Review project proposal 2" }));
    const actionCard = page.getByTestId("actions-column").locator('[data-task="task-hold-2"]');
    const holdBtn = actionCard.getByRole("button", { name: "Hold to complete" });

    // Hold through full duration (HOLD_MS = 640ms)
    const box = await holdBtn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();

    // Task must be completed
    const overlay = actionCard.getByTestId("task-completion-overlay");
    await expect(overlay).toHaveAttribute("data-visible", "true");
    await expect(actionCard.getByRole("button", { name: "Reopen" })).toBeVisible();

    // Reopen task
    await actionCard.getByRole("button", { name: "Reopen" }).click();
    await expect(overlay).toHaveAttribute("data-visible", "false");
    await expect(actionCard.locator(".nb-p")).toHaveCount(0); // no burst particles on reopen
  });
});
