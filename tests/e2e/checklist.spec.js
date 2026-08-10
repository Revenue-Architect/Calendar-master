import { expect, test } from "@playwright/test";
import { seedPlanner, settledState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createTask, updateTask } from "../../src/domains/tasks/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

/* Ticking the last step finishes the action — after a beat, and only if it is
 * still true when the beat is over. The delay is the point: it lets the tick and
 * the progress bar land, and it is easily long enough to change your mind. The
 * unit tests pin the predicates; only a browser can prove the timer, the ref and
 * the revalidation are wired to each other. */

const today = keyOf(new Date());

function withChecklist() {
  const blank = createBlankPlannerState({});
  const created = createTask(blank.tasks, {
    id: "task-release",
    title: "Ship the release",
    planned: { date: today },
  });
  const withSteps = updateTask(created.tasks, "task-release", {
    checklist: [
      { id: "step-a", title: "Cut the branch", done: false, order: 0 },
      { id: "step-b", title: "Write the notes", done: false, order: 1 },
    ],
  });
  return { ...blank, tasks: withSteps.tasks };
}

const statusOf = async (page) => {
  const state = await settledState(page, (s) => s.tasks.length > 0);
  return state.tasks.find((t) => t.id === "task-release").status;
};

const stepBox = (page, title) => page.getByRole("button", { name: new RegExp(title) });

test.describe("the last checklist step", () => {
  test("finishing every step completes the action", async ({ page }) => {
    await seedPlanner(page, withChecklist());
    await expect(page.getByText("Ship the release").first()).toBeVisible();

    await stepBox(page, "Cut the branch").click();
    await page.waitForTimeout(200);
    expect(await statusOf(page)).toBe("open");

    await stepBox(page, "Write the notes").click();
    /* Longer than the 420ms delay, so the completion has had its chance. */
    await page.waitForTimeout(900);
    expect(await statusOf(page)).toBe("completed");
  });

  test("unticking inside the delay cancels the completion", async ({ page }) => {
    await seedPlanner(page, withChecklist());
    await stepBox(page, "Cut the branch").click();
    await page.waitForTimeout(200);

    await stepBox(page, "Write the notes").click();
    /* Change your mind well inside the 420ms window. */
    await page.waitForTimeout(120);
    await stepBox(page, "Write the notes").click();

    await page.waitForTimeout(900);
    expect(await statusOf(page), "the delayed completion fired against stale state").toBe("open");
  });

  test("the action does not complete while a step is still open", async ({ page }) => {
    await seedPlanner(page, withChecklist());
    await stepBox(page, "Cut the branch").click();
    await page.waitForTimeout(900);
    expect(await statusOf(page)).toBe("open");
  });
});
