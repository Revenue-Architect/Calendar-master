import { expect, test } from "@playwright/test";
import { seedPlanner, STATE_KEY } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createTask } from "../../src/domains/tasks/index.js";

/* Everything lives on this device, which changes what a crash means. In a cloud
 * app a white screen is an outage you wait out; here the user's own instinct —
 * clear site data, reload, see if that helps — is the one action that destroys
 * everything they have. A blank page actively invites it.
 *
 * The crash is injected by making `Date.prototype.getDay` throw, which is a real
 * render failure rather than a simulated one: nothing in the app is aware of the
 * test, and the boundary catches it the same way it would catch a bad record. */
const breakRendering = (page) => page.addInitScript(() => {
  Date.prototype.getDay = function throwsOnPurpose() {
    throw new Error("injected render failure");
  };
});

const notebookWith = (title) => {
  const blank = createBlankPlannerState({});
  return { ...blank, tasks: createTask(blank.tasks, { id: "task-1", title }).tasks };
};

test.describe("when the planner crashes", () => {
  test("it says so instead of going blank", async ({ page }) => {
    await breakRendering(page);
    await page.goto("/");
    const fallback = page.getByRole("alert");
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("The planner stopped drawing");
    await expect(page.getByTestId("day-stream")).toHaveCount(0);
  });

  test("it offers the notebook back before anything else", async ({ page }) => {
    /* Seed first, then break: the crash has to happen with real data present. */
    await seedPlanner(page, notebookWith("Work I would hate to lose"));
    await breakRendering(page);
    await page.reload();

    const save = page.getByRole("button", { name: "SAVE A COPY" });
    await expect(save).toBeVisible();
    /* It is the focused control, because it is the thing to do first. */
    await expect(save).toBeFocused();

    const download = await Promise.all([page.waitForEvent("download"), save.click()]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/^planner-recovery-\d{4}-\d{2}-\d{2}\.json$/);

    /* What comes out is the notebook, not a fragment or a wrapper — it has to be
       the same shape Settings → Import accepts. */
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const recovered = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    expect(recovered.schemaVersion).toBe(8);
    expect(recovered.tasks.some((task) => task.title === "Work I would hate to lose")).toBe(true);

    await expect(page.getByText("SETTINGS → IMPORT RESTORES IT")).toBeVisible();
  });

  test("the export reads storage, not the app that just failed", async ({ page }) => {
    /* The crash is in rendering, so React state is unusable — the fallback must
       go to the device for the data instead. */
    await seedPlanner(page, notebookWith("Straight from storage"));
    await breakRendering(page);
    await page.reload();

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STATE_KEY);
    expect(stored).toContain("Straight from storage");
    await expect(page.getByRole("button", { name: "SAVE A COPY" })).toBeVisible();
  });

  test("with nothing stored it does not pretend there is something to rescue", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await breakRendering(page);
    await page.reload();

    await expect(page.getByText("No saved notebook was found")).toBeVisible();
    await expect(page.getByRole("button", { name: "SAVE A COPY" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "RELOAD" })).toBeVisible();
  });

  test("the reason is on screen, not only in a console nobody opens on a phone", async ({ page }) => {
    await breakRendering(page);
    await page.goto("/");
    await page.getByText("WHAT HAPPENED").click();
    await expect(page.getByText("injected render failure")).toBeVisible();
  });

  test("recovering is possible: reload once the cause is gone", async ({ page }) => {
    await seedPlanner(page, notebookWith("Survived the crash"));
    await breakRendering(page);
    await page.reload();
    await expect(page.getByRole("alert")).toBeVisible();

    /* The injection is per-page-load, so a reload without it is the app coming
       back — and the notebook is still there. */
    await page.evaluate(() => window.localStorage.setItem("nbmp:ui:actionsOpen", "true"));
    const clean = await page.context().newPage();
    await clean.goto("/");
    await expect(clean.getByTestId("day-stream")).toBeVisible();
    await expect(clean.getByText("Survived the crash").first()).toBeVisible();
  });
});
