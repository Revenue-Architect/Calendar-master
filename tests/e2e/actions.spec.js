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

    const completedFace = await chip.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, opacity: style.opacity };
    });
    expect(completedFace.background, "a completed action face must stay opaque").not.toMatch(/rgba\([^)]*,\s*0(?:\.\d+)?\)/);
    expect(completedFace.opacity, "completion must not reveal the backing through the face").toBe("1");

    await page.getByRole("button", { name: "Reopen Review launch brief" }).click();
    const reopened = await settledState(page, (stored) => stored.tasks[0]?.status === "open", "completed action did not reopen");
    expect(reopened.tasks[0].status).toBe("open");
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
    expect(motion.column).toContain("opacity");
    expect(motion.column).toContain("transform");

    await collapse.click();
    await page.waitForTimeout(70);
    const shrinking = (await stream.boundingBox()).width;
    const fading = await column.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity));
    expect(shrinking).toBeGreaterThan(narrow);
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);
    await expect(column).toBeHidden();
    const wide = (await stream.boundingBox()).width;

    await restore.click();
    await page.waitForTimeout(70);
    const restoring = (await stream.boundingBox()).width;
    const returning = await column.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity));
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
