import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openPlanner, seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { addDaysToKey, keyOf } from "../../src/shared/time/dateKey.js";

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
  /* Four defects found by reading the rendered app rather than the suite. Each
     assertion below was watched failing against the tree before its fix. */

  test("the closed navigation drawer is inert, not merely aria-hidden", async ({ page }) => {
    await openPlanner(page);
    const drawer = page.locator("#planner-navigation");
    await expect(drawer).toHaveAttribute("aria-hidden", "true");

    /* `inert=""` is a falsy boolean attribute and React drops it, which left six
       focusable controls inside an aria-hidden subtree: announced to nobody and
       still the first six stops of every keyboard traversal. */
    const state = await drawer.evaluate((node) => ({
      inert: node.inert,
      firstItemFocusable: (() => {
        const button = node.querySelector("button");
        button.focus();
        return document.activeElement === button;
      })(),
    }));
    expect(state.inert, "a hidden drawer must be inert").toBe(true);
    expect(state.firstItemFocusable, "no control inside aria-hidden may take focus").toBe(false);
  });

  test("opening the drawer moves the keyboard into it, and closing gives it back", async ({ page }) => {
    await openPlanner(page);
    /* Making the drawer genuinely inert broke this and nothing caught it: focus
       was requested in the same tick as the phase change, so it landed while the
       drawer was still inert and was dropped without an error. */
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    await expect(page.getByRole("button", { name: "Timeline", exact: true })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    await expect(page.getByTestId("nav-toggle")).toBeFocused();
  });

  test("the date ribbon is one tab stop, not one per day", async ({ page }) => {
    await openPlanner(page);
    /* The strip virtualises two years and refills as it scrolls, so a stop per
       cell walked the keyboard 30-plus days into the future before releasing it. */
    const cells = await page.evaluate(() => {
      const all = [...document.querySelectorAll("[data-day]")];
      return {
        rendered: all.length,
        tabbable: all.filter((node) => node.tabIndex >= 0).length,
        tabbableIsSelected: all.filter((node) => node.tabIndex >= 0)
          .every((node) => node.getAttribute("data-day") === document.querySelector("[data-day][tabindex='0']")?.getAttribute("data-day")),
      };
    });
    expect(cells.rendered, "the ribbon should render a window of days").toBeGreaterThan(10);
    expect(cells.tabbable, "only the selected day may hold the ribbon's tab stop").toBe(1);
    expect(cells.tabbableIsSelected).toBe(true);
  });

  test("the smart-view row says so when it scrolls past its edge", async ({ page }) => {
    /* A view renders only when it is selected, is TODAY, or has a non-zero count
       (ActionsPanel.jsx), so an empty notebook shows one chip and cannot overflow —
       which is what made the first version of this guard vacuous: it asserted the
       fade only `if (overflows)`, and overflows was false. Populate every view so
       the row is required to overflow, then assert both facts unconditionally. */
    const today = keyOf(new Date());
    const blank = createBlankPlannerState({});
    let tasks = blank.tasks;
    const add = (id, input) => { tasks = createTask(tasks, { id, title: `Chip ${id}`, ...input }).tasks; };
    add("sv-today", { planned: { date: today } });
    add("sv-upcoming", { planned: { date: addDaysToKey(today, 2) } });
    add("sv-deadline", { deadline: { date: addDaysToKey(today, 3) } });
    add("sv-overdue", { deadline: { date: addDaysToKey(today, -3) } });
    add("sv-someday", { someday: true });
    add("sv-unscheduled", {});
    add("sv-waiting", { status: "waiting" });
    add("sv-done", { status: "completed" });

    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPlanner(page, { ...blank, tasks });
    await expect(page.getByTestId("day-stream")).toBeVisible();

    /* ActionsPanel mounts twice — the desktop column and the full-view pane — so
       measure the instance that is actually on screen. */
    const row = page.getByTestId("smart-view-row").filter({ visible: true }).first();
    await expect(row).toBeVisible();
    const cue = await row.evaluate((node) => ({
      chips: node.querySelectorAll("button").length,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflows: node.scrollWidth > node.clientWidth + 2,
      mask: getComputedStyle(node).maskImage,
    }));

    expect(cue.chips, "every populated smart view should render a chip").toBe(10);
    expect(cue.overflows,
      `the fixture must overflow for this guard to mean anything (${cue.scrollWidth} vs ${cue.clientWidth})`)
      .toBe(true);
    /* Same cue the any-time row uses, and for the same reason: a row that scrolls
       with no scrollbar and no fade reads as a row that is broken. */
    expect(cue.mask, "an overflowing filter row must fade at its edge").not.toBe("none");
  });

  test("the inspector spends its accent on the action you came to take", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.locator("[data-event-id]").first().click();
    const primary = page.getByTestId("inspect-primary");
    await expect(primary).toBeVisible();
    const paint = await primary.evaluate((node) => ({
      label: node.textContent.trim(),
      background: getComputedStyle(node).backgroundColor,
    }));
    /* DUPLICATE is a rare errand. It must not be the loudest control in a sheet
       whose actual action is the EDIT EVENT pill in its header. */
    expect(paint.label).toBe("DUPLICATE");
    expect(paint.background, "DUPLICATE must not wear the accent")
      .toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });
  test("an event happening right now reads Now, not Ended", async ({ page }) => {
    /* `countdownLabel` takes a duration so it can tell "started" from "over", and
       this call site omitted it — so the branch that prints Now was unreachable
       and a live event's headline figure claimed it had Ended, while the sentence
       below it in the same sheet said otherwise.

       A test about time has to own the clock. Fixing it here rather than skipping
       near midnight is also what makes the assertion honest: the earlier
       time-of-day guard quietly removed this regression for part of every day. */
    const now = new Date("2026-08-23T12:00:00");
    await page.clock.setFixedTime(now);
    const today = keyOf(now);

    const seeded = createEvent(createBlankPlannerState({}), {
      title: "Happening now",
      cat: "DEEP WORK",
      alerts: [],
      calendarId: "calendar-default",
      timing: {
        kind: "timed",
        timeZoneMode: "floating",
        startLocal: `${today}T11:40`,
        endLocal: `${today}T12:20`,
      },
    }, { id: "evt-live" }).state;

    await seedPlanner(page, seeded);
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await page.locator('[data-event-id="evt-live"]').first().click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();

    const figure = await sheet.evaluate((node) => {
      const caption = [...node.querySelectorAll("*")]
        .find((el) => el.children.length === 0 && el.textContent.trim() === "STARTS");
      return caption?.parentElement?.querySelector("span")?.textContent?.trim() ?? null;
    });
    expect(figure, `${today} 11:40-12:20 with the clock fixed at 12:00`).toBe("Now");
  });
});
