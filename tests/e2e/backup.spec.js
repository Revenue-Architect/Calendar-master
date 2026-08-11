import { expect, test } from "@playwright/test";
import { openPlanner, seedPlanner, settledState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

/* The nudge exists because a local-only notebook has exactly one copy, and the
 * action that makes a second one is buried in Settings. It only works if it is
 * rare enough to be believed — so most of what is asserted here is when it stays
 * quiet. */

const BACKUP_KEY = "nbmp:backup:v1";
const nudge = (page) => page.getByTestId("backup-nudge");

function notebookOf(count) {
  const blank = createBlankPlannerState({});
  let tasks = blank.tasks;
  for (let i = 0; i < count; i += 1) tasks = createTask(tasks, { id: `t${i}`, title: `Task ${i}`, planned: { date: keyOf(new Date()) } }).tasks;
  return { ...blank, tasks };
}

test.describe("the backup nudge", () => {
  test("stays quiet on an empty notebook", async ({ page }) => {
    await openPlanner(page);
    await page.waitForTimeout(400);
    await expect(nudge(page)).toHaveCount(0);
  });

  test("asks once a notebook is worth losing", async ({ page }) => {
    await seedPlanner(page, notebookOf(8));
    await expect(nudge(page)).toBeVisible();
    await expect(nudge(page)).toContainText("only exists on this device");
  });

  test("saving a copy downloads the notebook and silences it", async ({ page }) => {
    await seedPlanner(page, notebookOf(8));
    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("backup-nudge-save").click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/^planner-\d{4}-\d{2}-\d{2}\.json$/);

    await expect(nudge(page)).toHaveCount(0);
    /* And it stays quiet across a reload, because the record is on the device. */
    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await page.waitForTimeout(400);
    await expect(nudge(page)).toHaveCount(0);
  });

  test("'not now' holds until the notebook actually changes", async ({ page }) => {
    await seedPlanner(page, notebookOf(8));
    await page.getByTestId("backup-nudge-dismiss").click();
    await expect(nudge(page)).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await page.waitForTimeout(400);
    await expect(nudge(page), "dismissing must survive a reload").toHaveCount(0);
  });

  test("exporting from Settings counts as the backup", async ({ page }) => {
    await seedPlanner(page, notebookOf(8));
    await expect(nudge(page)).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("settings");
    await page.getByTestId("palette-cmd-settings").click();
    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /EXPORT .*JSON|BACKUP/i }).first().click(),
    ]);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    /* However the user got to an export, it is the same backup. */
    await expect(nudge(page)).toHaveCount(0);
  });

  test("what it writes is a record about the notebook, not part of it", async ({ page }) => {
    await seedPlanner(page, notebookOf(8));
    await page.getByTestId("backup-nudge-dismiss").click();
    await page.waitForTimeout(400);

    const record = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "null"), BACKUP_KEY);
    expect(record).toBeTruthy();
    expect(record.dismissedFingerprint).toBeTruthy();
    /* The notebook itself is untouched — the fingerprint it compares against
       must not be changed by the act of recording it. */
    const state = await settledState(page, (s) => s.tasks.length === 8);
    expect(Object.keys(state)).not.toContain("backup");
  });

  test("the storage warning wins when both would show", async ({ page }) => {
    /* A notebook that cannot be saved at all is the more urgent problem, and two
       banners arguing is worse than either. */
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new Error("storage blocked"); },
      });
    });
    await page.goto("/");
    await expect(page.getByText("NOT SAVING")).toBeVisible();
    await expect(nudge(page)).toHaveCount(0);
  });
});
