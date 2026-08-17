import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openPlanner, seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

async function expectNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(metrics.scrollWidth, `${label}: document overflow`).toBeLessThanOrEqual(metrics.clientWidth + 2);
  expect(metrics.bodyScrollWidth, `${label}: body overflow`).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

function largeNotebook(count = 1_000) {
  const blank = createBlankPlannerState({});
  let tasks = blank.tasks;
  for (let i = 0; i < count; i += 1) {
    tasks = createTask(tasks, {
      id: `quality-task-${i}`,
      title: `Task ${i} · مراجعة 東京 проект`,
      planned: { date: keyOf(new Date()) },
    }).tasks;
  }
  return { ...blank, tasks };
}

test.describe("resilience, accessibility, and quality gates", () => {
  test("native date and time fields have names, and Day has no blank zoom control", async ({ page }) => {
    await openPlanner(page);
    await expect(page.getByTestId("zoom-in")).toHaveCount(0);

    await page.getByTestId("new-entry").click();
    const composer = page.getByTestId("composer");
    await expect(composer).toBeVisible();
    const fields = composer.locator('input[type="date"], input[type="time"]');
    const labels = await fields.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((label) => label && label.trim().length > 0)).toBe(true);

    await page.keyboard.press("Escape");
    await page.getByTestId("new-entry").click();
    const actionComposer = page.getByTestId("composer");
    await actionComposer.getByRole("tab", { name: "ACTION", exact: true }).click();
    await actionComposer.getByRole("button", { name: /more options/i }).click();
    const actionFields = actionComposer.locator('input[type="date"], input[type="time"]');
    const actionLabels = await actionFields.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
    expect(actionLabels).toEqual(expect.arrayContaining(["Action date", "Action time", "Due date"]));
    await actionComposer.getByRole("button", { name: "DAILY", exact: true }).click();
    await expect(actionComposer.getByLabel("Repeat until")).toBeVisible();

    await page.keyboard.press("Escape");
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("zoom-in")).toBeVisible();
  });

  test("the first-use gesture hint is dismissible and the shortcuts sheet explains it", async ({ page }) => {
    await openPlanner(page, { showGestureHint: true });
    const hint = page.getByTestId("gesture-hint");
    await expect(hint).toBeVisible();
    await hint.getByRole("button", { name: "SHORTCUTS" }).click();
    const sheet = page.getByTestId("shortcut-sheet");
    await expect(sheet).toContainText("GESTURES");
    await expect(sheet).toContainText("Hold an empty slot to create");
    await expect(sheet).toContainText("Swipe a scheduled action right to complete it");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    /* Opening the orientation sheet is itself an acknowledgement, so the hint
       closes while the more complete reference is on screen. */
    await expect(hint).toBeHidden();

    /* Exercise the explicit GOT IT path in a fresh first-use state as well. */
    await page.evaluate(() => window.localStorage.removeItem("nbmp:ui:gestureHintSeen"));
    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    const reloadedHint = page.getByTestId("gesture-hint");
    await expect(reloadedHint).toBeVisible();
    await reloadedHint.getByTestId("gesture-hint-dismiss").click();
    await expect(reloadedHint).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await expect(page.getByTestId("gesture-hint")).toHaveCount(0);
  });

  test("blocked device storage keeps the notebook usable and offers a copy", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new Error("storage blocked"); },
      });
    });
    await page.goto("/");
    await expect(page.getByTestId("day-stream")).toBeVisible();
    const alert = page.getByTestId("storage-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Changes are staying in this tab only.");
    await expectNoHorizontalOverflow(page, "blocked storage mobile alert");
  });

  test("a damaged notebook can be exported without replacing its raw contents", async ({ page }) => {
    const damaged = createBlankPlannerState({});
    damaged.events = [{ id: "recovery-event", title: "Keep this important draft" }];
    damaged.tasks = "damaged-task-collection";
    await page.goto("/");
    await page.evaluate((value) => {
      window.localStorage.clear();
      window.localStorage.setItem("nbmp:state:v8", JSON.stringify(value));
    }, damaged);
    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await expect(page.getByTestId("storage-alert")).toContainText("SAVE A COPY");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("storage-alert").getByRole("button", { name: "SAVE A COPY" }).click();
    const download = await downloadPromise;
    const downloaded = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(downloaded.events).toEqual(damaged.events);
    expect(downloaded.tasks).toBe(damaged.tasks);
  });

  test("a supporting-store failure is scoped to Settings instead of claiming the notebook is lost", async ({ page }) => {
    await page.addInitScript(() => {
      window.storage = {
        get(key) {
          if (key === "nbmp:preferences:v1") return Promise.reject(new Error("preferences unavailable"));
          return Promise.resolve(null);
        },
        set() { return Promise.resolve(); },
        remove() { return Promise.resolve(); },
      };
    });
    await page.goto("/");
    await expect(page.getByTestId("day-stream")).toBeVisible();
    const firstRun = page.locator('[data-test="sheet"][data-sheet-title="Welcome"]');
    if (await firstRun.isVisible().catch(() => false)) await firstRun.getByRole("button", { name: "START EMPTY" }).click();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByTestId("supporting-storage-warning")).toBeVisible();
    await expect(page.getByTestId("storage-alert")).toHaveCount(0);
  });

  test("slow bootstrap shows a safe recovery path without mutating storage", async ({ page }) => {
    await page.addInitScript(() => {
      window.__qualityStorageWrites = 0;
      window.storage = {
        get() { return new Promise((resolve) => setTimeout(() => resolve(null), 3_000)); },
        set() { window.__qualityStorageWrites += 1; return Promise.resolve(); },
        remove() { return Promise.resolve(); },
      };
    });
    await page.goto("/");
    await expect(page.getByTestId("loading-recovery")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Your saved notebook has not been changed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "RELOAD" })).toBeVisible();
    expect(await page.evaluate(() => window.__qualityStorageWrites)).toBe(0);
  });

  test("mixed-script long copy remains readable at mobile width and RTL", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await page.getByTestId("new-entry").click();
    const title = page.getByTestId("composer").locator("input").first();
    await title.fill("Projektbesprechung東京レビューالعربية — a deliberately long mixed-script title");
    await expectNoHorizontalOverflow(page, "RTL mixed-script composer");

    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await page.evaluate(() => { document.body.style.zoom = "2"; });
    await expectNoHorizontalOverflow(page, "200% mobile reflow");
  });

  test("the Actions surface remains usable with 1,000 records", async ({ page }) => {
    test.setTimeout(45_000);
    await seedPlanner(page, largeNotebook());
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    const cards = page.locator("[data-task]");
    await expect.poll(() => cards.count(), { timeout: 30_000, intervals: [100, 250, 500] }).toBe(1_000);
    await expectNoHorizontalOverflow(page, "1,000-record Actions surface");
  });

  test("rapid timeline scrolling does not create long tasks or page errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openPlanner(page);
    await page.evaluate(() => {
      window.__qualityLongTasks = [];
      if ("PerformanceObserver" in window) {
        const observer = new PerformanceObserver((list) => {
          window.__qualityLongTasks.push(...list.getEntries().map((entry) => entry.duration));
        });
        observer.observe({ entryTypes: ["longtask"] });
        window.__qualityLongTaskObserver = observer;
      }
    });
    const stream = page.getByTestId("day-stream");
    const height = await stream.evaluate((node) => node.scrollHeight);
    for (let i = 0; i < 24; i += 1) {
      await stream.evaluate((node, top) => { node.scrollTop = top; node.dispatchEvent(new Event("scroll")); }, (height * i) / 24);
      await page.waitForTimeout(16);
    }
    const maxLongTask = await page.evaluate(() => {
      window.__qualityLongTaskObserver?.disconnect();
      return Math.max(0, ...(window.__qualityLongTasks || []));
    });
    expect(errors).toEqual([]);
    expect(maxLongTask).toBeLessThan(250);
  });
});
