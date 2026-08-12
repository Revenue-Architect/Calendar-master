import { expect, test } from "@playwright/test";
import { openPlanner, quickAdd, seedPlanner, settledState, storedState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { createPreferences } from "../../src/platform/preferences/preferences.js";
import { PREFERENCES_STORE_KEY } from "../../src/platform/persistence/preferencesStore.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

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
