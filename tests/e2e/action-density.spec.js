import { expect, test } from "@playwright/test";
import { seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

async function atTime(page, hour, minute) {
  const when = new Date();
  when.setHours(hour, minute, 0, 0);
  await page.clock.setFixedTime(when);
  return keyOf(when);
}

function scheduledAction({
  id = "task-density-test",
  title = "Review launch brief",
  estimateMinutes = 60,
  startMinute = 10 * 60,
  checklist = [],
  status = "open",
} = {}) {
  const state = createBlankPlannerState({});
  const result = createTask(state.tasks, {
    id,
    title,
    status,
    checklist,
    planned: { date: keyOf(new Date()), startMinute, estimateMinutes },
  });
  return { ...state, tasks: result.tasks };
}

function assertVerticalContainment(titleBox, timeBox, chipBox, label) {
  expect(titleBox, `${label}: titleBox must exist`).not.toBeNull();
  expect(timeBox, `${label}: timeBox must exist`).not.toBeNull();
  expect(chipBox, `${label}: chipBox must exist`).not.toBeNull();

  // Top edge must not escape above card top
  expect(titleBox.y, `${label}: title top must be >= chip top`).toBeGreaterThanOrEqual(chipBox.y - 0.5);
  expect(timeBox.y, `${label}: time top must be >= chip top`).toBeGreaterThanOrEqual(chipBox.y - 0.5);

  // Bottom edge must not escape below card bottom
  expect(titleBox.y + titleBox.height, `${label}: title bottom must be <= chip bottom`).toBeLessThanOrEqual(chipBox.y + chipBox.height + 1);
  expect(timeBox.y + timeBox.height, `${label}: time bottom must be <= chip bottom`).toBeLessThanOrEqual(chipBox.y + chipBox.height + 1);
}

test.describe("Timeline Action Card responsive density modes", () => {
  test("15-minute Action (22px floor) renders micro density with strict vertical containment", async ({ page }) => {
    const action = scheduledAction({ id: "task-15m", title: "Call John", estimateMinutes: 15, startMinute: 14 * 60 + 30 });
    await seedPlanner(page, action);

    const chip = page.locator('[data-task-chip="task-15m"]');
    await chip.scrollIntoViewIfNeeded();

    await expect(chip).toHaveAttribute("data-density", "micro");
    const title = chip.locator(".nb-lead");
    const time = chip.locator(".nb-task-time");
    await expect(title).toHaveText("Call John");
    await expect(time).toBeVisible();
    await expect(time).toHaveText("2:30 PM");

    const titleBox = await title.boundingBox();
    const timeBox = await time.boundingBox();
    const chipBox = await chip.boundingBox();

    assertVerticalContainment(titleBox, timeBox, chipBox, "15m @ 22px floor");

    // Micro layout: title and time share horizontal row
    const titleMidY = titleBox.y + titleBox.height / 2;
    const timeMidY = timeBox.y + timeBox.height / 2;
    expect(Math.abs(titleMidY - timeMidY), "15m micro title and time should be horizontally aligned").toBeLessThanOrEqual(5);
    expect(timeBox.x).toBeGreaterThan(titleBox.x);
  });

  test("30-minute Action (~34px) renders micro density with strict vertical containment", async ({ page }) => {
    const action = scheduledAction({ id: "task-30m", title: "Design Review", estimateMinutes: 30, startMinute: 13 * 60 });
    await seedPlanner(page, action);

    const chip = page.locator('[data-task-chip="task-30m"]');
    await chip.scrollIntoViewIfNeeded();

    await expect(chip).toHaveAttribute("data-density", "micro");
    const title = chip.locator(".nb-lead");
    const time = chip.locator(".nb-task-time");
    await expect(title).toHaveText("Design Review");
    await expect(time).toBeVisible();
    await expect(time).toHaveText("1:00 PM");

    const titleBox = await title.boundingBox();
    const timeBox = await time.boundingBox();
    const chipBox = await chip.boundingBox();

    assertVerticalContainment(titleBox, timeBox, chipBox, "30m @ ~34px");
    expect(timeBox.x).toBeGreaterThan(titleBox.x);
  });

  test("40-minute Action (~45px) renders compact density with stacked time and vertical containment", async ({ page }) => {
    const action = scheduledAction({ id: "task-40m", title: "Team Sync", estimateMinutes: 40, startMinute: 11 * 60 });
    await seedPlanner(page, action);

    const chip = page.locator('[data-task-chip="task-40m"]');
    await chip.scrollIntoViewIfNeeded();

    await expect(chip).toHaveAttribute("data-density", "compact");
    const title = chip.locator(".nb-lead");
    const time = chip.locator(".nb-task-time");
    await expect(title).toHaveText("Team Sync");
    await expect(time).toBeVisible();
    await expect(time).toHaveText("11:00 AM");

    const titleBox = await title.boundingBox();
    const timeBox = await time.boundingBox();
    const chipBox = await chip.boundingBox();

    assertVerticalContainment(titleBox, timeBox, chipBox, "40m @ ~45px");
    expect(timeBox.y, "compact mode time must be underneath title").toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 2);
  });

  test("45-minute Action (~51px) renders standard density with stacked time and vertical containment", async ({ page }) => {
    const action = scheduledAction({ id: "task-45m", title: "Sprint Planning", estimateMinutes: 45, startMinute: 15 * 60 });
    await seedPlanner(page, action);

    const chip = page.locator('[data-task-chip="task-45m"]');
    await chip.scrollIntoViewIfNeeded();

    await expect(chip).toHaveAttribute("data-density", "standard");
    const title = chip.locator(".nb-lead");
    const time = chip.locator(".nb-task-time");
    await expect(title).toHaveText("Sprint Planning");
    await expect(time).toBeVisible();
    await expect(time).toHaveText("3:00 PM");

    const titleBox = await title.boundingBox();
    const timeBox = await time.boundingBox();
    const chipBox = await chip.boundingBox();

    assertVerticalContainment(titleBox, timeBox, chipBox, "45m @ ~51px");
    expect(timeBox.y, "standard mode time must be underneath title").toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 2);
  });

  test("60-minute Action (68px) renders expanded density with subtasks and vertical containment", async ({ page }) => {
    let state = scheduledAction({ id: "task-60m-parent", title: "Ship Release", estimateMinutes: 60, startMinute: 9 * 60 });
    state.tasks = createTask(state.tasks, { id: "sub-1", title: "Build assets", parentTaskId: "task-60m-parent", status: "completed" }).tasks;
    state.tasks = createTask(state.tasks, { id: "sub-2", title: "Run tests", parentTaskId: "task-60m-parent", status: "open" }).tasks;
    state.tasks = createTask(state.tasks, { id: "sub-3", title: "Deploy to staging", parentTaskId: "task-60m-parent", status: "open" }).tasks;
    await seedPlanner(page, state);

    const chip = page.locator('[data-task-chip="task-60m-parent"]');
    await chip.scrollIntoViewIfNeeded();

    await expect(chip).toHaveAttribute("data-density", "expanded");
    const title = chip.locator(".nb-lead");
    const time = chip.locator(".nb-task-time");
    const subtasks = chip.getByTestId("timeline-action-subtasks");

    await expect(title).toHaveText("Ship Release");
    await expect(time).toHaveText("9:00 AM");
    await expect(subtasks).toContainText("3 SUBTASKS · 1 DONE");

    const titleBox = await title.boundingBox();
    const timeBox = await time.boundingBox();
    const subBox = await subtasks.boundingBox();
    const chipBox = await chip.boundingBox();

    assertVerticalContainment(titleBox, timeBox, chipBox, "60m @ 68px");
    expect(subBox.y + subBox.height, "subtasks row bottom must be <= chip bottom").toBeLessThanOrEqual(chipBox.y + chipBox.height + 1);
  });

  test("vertical containment matrix across all durations (15m, 20m, 30m, 35m, 40m, 45m, 50m, 60m, 90m)", async ({ page }) => {
    let state = createBlankPlannerState({});
    const durations = [15, 20, 30, 35, 40, 45, 50, 60, 90];
    durations.forEach((dur, idx) => {
      state.tasks = createTask(state.tasks, {
        id: `task-matrix-${dur}`,
        title: `Matrix ${dur}m`,
        planned: { date: keyOf(new Date()), startMinute: (6 + idx) * 60, estimateMinutes: dur },
      }).tasks;
    });
    await seedPlanner(page, state);

    for (const dur of durations) {
      const chip = page.locator(`[data-task-chip="task-matrix-${dur}"]`);
      await chip.scrollIntoViewIfNeeded();

      const title = chip.locator(".nb-lead");
      const time = chip.locator(".nb-task-time");
      const titleBox = await title.boundingBox();
      const timeBox = await time.boundingBox();
      const chipBox = await chip.boundingBox();

      assertVerticalContainment(titleBox, timeBox, chipBox, `duration ${dur}m`);
    }
  });

  test("15-minute Action with long title truncates inside middle content button without overlapping estimate control", async ({ page }) => {
    const action = scheduledAction({
      id: "task-long-title",
      title: "Extremely long action title that would otherwise overflow the entire card width without truncation",
      estimateMinutes: 15,
      startMinute: 16 * 60 + 15,
    });
    await seedPlanner(page, action);

    const chip = page.locator('[data-task-chip="task-long-title"]');
    await chip.scrollIntoViewIfNeeded();

    const title = chip.locator(".nb-lead");
    const time = chip.locator(".nb-task-time");
    const middleButton = chip.locator("button.nb-tap");
    const estimateHandle = chip.getByTestId("timeline-action-resize");

    await expect(title).toBeVisible();
    await expect(time).toBeVisible();
    await expect(time).toHaveText("4:15 PM");

    const timeBox = await time.boundingBox();
    const buttonBox = await middleButton.boundingBox();
    const estimateBox = await estimateHandle.boundingBox();

    // Time must stay strictly within middle content button right boundary
    expect(timeBox.x + timeBox.width, "time must stay within middle content bounds").toBeLessThanOrEqual(buttonBox.x + buttonBox.width + 1);
    // Time must not overlap estimate control on the right
    expect(timeBox.x + timeBox.width, "time must not overlap estimate handle").toBeLessThanOrEqual(estimateBox.x + 1);
  });

  test("overlapping narrow-lane micro Action preserves title width and time priority over subtask badge", async ({ page }) => {
    // 2 overlapping 15m actions on mobile viewport
    await atTime(page, 10, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    let state = createBlankPlannerState({});
    state.tasks = createTask(state.tasks, {
      id: "task-overlap-1",
      title: "Sync Architecture Strategy",
      planned: { date: keyOf(new Date()), startMinute: 10 * 60, estimateMinutes: 15 },
    }).tasks;
    state.tasks = createTask(state.tasks, {
      id: "task-overlap-2",
      title: "Design Review Notes",
      planned: { date: keyOf(new Date()), startMinute: 10 * 60, estimateMinutes: 15 },
    }).tasks;
    // Add subtasks to task-overlap-1
    state.tasks = createTask(state.tasks, { id: "sub-1", title: "Prep doc", parentTaskId: "task-overlap-1" }).tasks;
    await seedPlanner(page, state);

    const chip1 = page.locator('[data-task-chip="task-overlap-1"]');
    const chip2 = page.locator('[data-task-chip="task-overlap-2"]');
    await chip1.scrollIntoViewIfNeeded();

    await expect(chip1).toHaveAttribute("data-density", "micro");
    await expect(chip2).toHaveAttribute("data-density", "micro");

    const title1 = chip1.locator(".nb-lead");
    const time1 = chip1.locator(".nb-task-time");
    await expect(title1).toBeVisible();
    await expect(title1).toHaveText("Sync Architecture Strategy");
    await expect(time1).toBeVisible();

    const chip1Box = await chip1.boundingBox();
    const title1Box = await title1.boundingBox();
    const time1Box = await time1.boundingBox();

    // 1. Title must retain meaningful readable width (>= 28px)
    expect(title1Box.width, "title must retain meaningful width in narrow lane").toBeGreaterThanOrEqual(28);

    // 2. Time must be visible and fit within card
    await expect(time1).toBeVisible();
    expect(time1Box.x + time1Box.width).toBeLessThanOrEqual(chip1Box.x + chip1Box.width + 1);

    // 3. Vertical containment
    assertVerticalContainment(title1Box, time1Box, chip1Box, "overlapping narrow micro 1");
  });

  test("live estimate resize round-trip (15m -> 60m -> 15m) transitions density modes continuously (micro -> expanded -> micro)", async ({ page }) => {
    const action = scheduledAction({ id: "task-resize-roundtrip", title: "Roundtrip Reflow", estimateMinutes: 15, startMinute: 10 * 60 });
    await seedPlanner(page, action);

    const chip = page.locator('[data-task-chip="task-resize-roundtrip"]');
    await chip.scrollIntoViewIfNeeded();

    await expect(chip).toHaveAttribute("data-density", "micro");

    const resizeHandle = chip.getByTestId("timeline-action-resize");
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // 1. Start drag: 15m -> 60m
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();

    // Drag down 60px
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 60, { steps: 5 });
    const expandedDensity = await chip.getAttribute("data-density");
    expect(["compact", "standard", "expanded"]).toContain(expandedDensity);

    // 2. Drag back up to original 15m height
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2, { steps: 5 });
    const restoredDensity = await chip.getAttribute("data-density");
    expect(restoredDensity, "must restore micro density when dragged back up").toBe("micro");

    // Release mouse
    await page.mouse.up();
    await expect(chip).toHaveAttribute("data-density", "micro");
  });
});
