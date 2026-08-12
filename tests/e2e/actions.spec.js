import { expect, test } from "@playwright/test";
import { openPlanner, quickAdd, storedState } from "./helpers.js";

/* The Actions column can be collapsed, restored, and swapped for a full-screen
 * view. Two things about it are only observable in a browser: that the collapsed
 * state survives a reload (it is written to its own localStorage key, not the
 * notebook), and that pressing on an action to read it does not start a drag —
 * the panel's press-and-hold is the same gesture as "I am scrolling this list". */

test.describe("the actions column", () => {
  test("completing an action sends tactile feedback", async ({ page }) => {
    await page.addInitScript(() => {
      window.__calendarMasterVibrations = [];
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (pattern) => { window.__calendarMasterVibrations.push(pattern); return true; },
      });
    });
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await page.getByText("Walk 8k steps", { exact: true }).first().click();
    await page.getByTestId("sheet").getByRole("button", { name: "MARK COMPLETE" }).click();

    await expect.poll(() => page.evaluate(() => window.__calendarMasterVibrations)).toContainEqual([8, 30, 14]);
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
