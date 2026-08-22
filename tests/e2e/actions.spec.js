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

function scheduledAction({ id = "task-timeline", title = "Review launch brief" } = {}) {
  const state = createBlankPlannerState({});
  const result = createTask(state.tasks, {
    id, title,
    planned: { date: keyOf(new Date()), startMinute: 10 * 60, estimateMinutes: 60 },
  });
  return { ...state, tasks: result.tasks };
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
    await seedPlanner(page, scheduledAction({ id: "task-resize", title: "Resize the brief" }));
    const chip = page.locator('[data-task-chip="task-resize"]');
    await chip.scrollIntoViewIfNeeded();
    const handle = chip.getByTestId("timeline-action-resize");
    await expect(handle).toBeVisible();
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
      (stored) => stored.tasks[0]?.planned.estimateMinutes > 60,
      "the Action resize did not update its estimate",
    );
    expect(state.tasks[0].planned.startMinute).toBe(10 * 60);
    expect(state.tasks[0].planned.estimateMinutes).toBeGreaterThan(60);
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
    const box = await chip.boundingBox();
    const x = box.x + Math.min(70, box.width / 2);
    const y = box.y + Math.min(18, box.height / 2);
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
    const box = await chip.boundingBox();
    const x = box.x + Math.min(70, box.width / 2);
    const y = box.y + Math.min(18, box.height / 2);
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
    const box = await chip.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height / 2, 18);
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
