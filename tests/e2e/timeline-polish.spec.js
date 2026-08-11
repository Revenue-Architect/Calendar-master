import { expect, test } from "@playwright/test";
import { seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { createTask, updateTask } from "../../src/domains/tasks/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

/* Two marks that have to read as one thing each: the now marker against the hour
 * label it lands on, and a checklist's progress against the steps it counts. */

const pad = (n) => String(n).padStart(2, "0");

/* A fixed clock, so "a few minutes before the hour" is a fact of the test rather
   than a property of when it happens to run. */
async function atTime(page, hour, minute) {
  const when = new Date();
  when.setHours(hour, minute, 0, 0);
  await page.clock.setFixedTime(when);
  return keyOf(when);
}

function liveAt(today, hour) {
  return createEvent(createBlankPlannerState({}), {
    calendarId: "calendar-default", title: "Inbox sweep", category: "ADMIN",
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal: `${today}T${pad(hour - 1)}:00`, endLocal: `${today}T${pad(hour + 1)}:00`,
    },
  }, { id: "evt-live" }).state;
}

const hourLabel = (page, text) => page.getByText(text, { exact: true }).first();

test.describe("the now marker and the hour it lands on", () => {
  test("the hour label steps aside when the marker is on top of it", async ({ page }) => {
    const today = await atTime(page, 14, 56); /* four minutes short of 3 PM */
    await seedPlanner(page, liveAt(today, 14));

    const marker = page.getByText("2:56", { exact: true });
    await expect(marker).toBeVisible();
    /* Same place, same size — showing both is not more information, it is the
       same information twice and illegible. */
    await expect(hourLabel(page, "3 PM")).toHaveCSS("opacity", "0");
  });

  test("hours the marker is nowhere near are untouched", async ({ page }) => {
    const today = await atTime(page, 14, 30); /* squarely between two hours */
    await seedPlanner(page, liveAt(today, 14));

    await expect(page.getByText("2:30", { exact: true })).toBeVisible();
    await expect(hourLabel(page, "2 PM")).toHaveCSS("opacity", "1");
    await expect(hourLabel(page, "3 PM")).toHaveCSS("opacity", "1");
  });

  test("with nothing live every hour label stands", async ({ page }) => {
    const today = await atTime(page, 14, 58);
    await seedPlanner(page, createBlankPlannerState({}));
    /* The marker only moves into the gutter while an event is live, so there is
       nothing for a label to yield to. */
    await expect(hourLabel(page, "3 PM")).toHaveCSS("opacity", "1");
  });
});

test.describe("checklist progress", () => {
  const withSteps = (doneCount, total) => {
    const blank = createBlankPlannerState({});
    const created = createTask(blank.tasks, { id: "task-release", title: "Ship the release", planned: { date: keyOf(new Date()) } });
    const checklist = Array.from({ length: total }, (_, i) => ({
      id: `step-${i}`, title: `Step ${i + 1}`, done: i < doneCount, order: i,
    }));
    return { ...blank, tasks: updateTask(created.tasks, "task-release", { checklist }).tasks };
  };

  test("is one segment per step, not a fraction of one bar", async ({ page }) => {
    await seedPlanner(page, withSteps(2, 5));
    const bar = page.getByRole("progressbar", { name: /steps done/ });
    await expect(bar).toBeVisible();
    await expect(bar.locator("[data-segment-index]")).toHaveCount(5);
    await expect(bar).toHaveAttribute("aria-valuenow", "2");
    await expect(bar).toHaveAttribute("aria-valuemax", "5");
  });

  test("the segments are evenly sized, so the count is readable at a glance", async ({ page }) => {
    await seedPlanner(page, withSteps(1, 4));
    const widths = await page.getByRole("progressbar").locator("[data-segment-index]")
      .evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().width)));
    expect(widths).toHaveLength(4);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  test("ticking a step fills exactly one more segment", async ({ page }) => {
    await seedPlanner(page, withSteps(2, 5));
    const bar = page.getByRole("progressbar");
    const filled = async () => bar.locator('[data-filled="true"]').count();
    expect(await filled()).toBe(2);

    await page.getByRole("button", { name: /Step 3/ }).click();
    await page.waitForTimeout(500);
    await expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(await filled()).toBe(3);
  });

  test("fills left to right when a later step is completed first", async ({ page }) => {
    await seedPlanner(page, withSteps(0, 4));
    const bar = page.getByRole("progressbar");

    await page.getByRole("button", { name: /Step 2/ }).click();
    await page.waitForTimeout(500);
    await expect(bar.locator('[data-segment-index="0"] [data-filled="true"]')).toHaveCount(1);
    await expect(bar.locator('[data-segment-index="1"] [data-filled="true"]')).toHaveCount(0);

    await page.getByRole("button", { name: /Step 4/ }).click();
    await page.waitForTimeout(500);
    await expect(bar.locator('[data-filled="true"]')).toHaveCount(2);
    await expect(bar.locator('[data-segment-index="1"] [data-filled="true"]')).toHaveCount(1);
    await expect(bar.locator('[data-segment-index="3"] [data-filled="true"]')).toHaveCount(0);
  });

  test("an action with no steps shows no bar at all", async ({ page }) => {
    await seedPlanner(page, withSteps(0, 0));
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });
});
