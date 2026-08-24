import { expect, test } from "@playwright/test";
import { openPlanner, quickAdd, seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { createSubtask, createTask, updateTask } from "../../src/domains/tasks/index.js";
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

async function dispatchTouch(session, type, x, y) {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: .5 }],
  });
}

test.describe("mobile timeline focus", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("intentional timeline scrolling collapses chrome while preserving the date", async ({ page }) => {
    const today = await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    const chrome = page.getByTestId("timeline-chrome");
    const stream = page.getByTestId("day-stream");
    await expect(chrome, "initial auto-positioning must leave navigation expanded").toHaveAttribute("data-collapsed", "false");
    const before = await stream.boundingBox();
    const box = before;
    const x = box.x + 90;
    const y = box.y + Math.min(180, box.height / 2);
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x, y + 12);
    await stream.evaluate((node) => { node.scrollTop += 32; node.dispatchEvent(new Event("scroll")); });
    await dispatchTouch(session, "touchEnd", x, y);
    await session.detach();

    await expect(chrome).toHaveAttribute("data-collapsed", "true");
    await expect(page.getByTestId("day-heading")).toBeVisible();
    await expect(page.getByTestId("day-heading")).toHaveAttribute("data-date", today);
    await expect.poll(async () => (await stream.boundingBox()).height).toBeGreaterThan(before.height + 60);
  });

  test("returning near midnight expands timeline chrome", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    const chrome = page.getByTestId("timeline-chrome");
    const stream = page.getByTestId("day-stream");
    const box = await stream.boundingBox();
    const x = box.x + 90;
    const y = box.y + Math.min(180, box.height / 2);
    const session = await page.context().newCDPSession(page);

    await dispatchTouch(session, "touchStart", x, y);
    await dispatchTouch(session, "touchMove", x, y + 12);
    await stream.evaluate((node) => { node.scrollTop += 32; node.dispatchEvent(new Event("scroll")); });
    await dispatchTouch(session, "touchEnd", x, y);
    await expect(chrome).toHaveAttribute("data-collapsed", "true");

    const focusedBox = await stream.boundingBox();
    const returnX = focusedBox.x + 90;
    const returnY = focusedBox.y + 100;
    await dispatchTouch(session, "touchStart", returnX, returnY);
    await dispatchTouch(session, "touchMove", returnX, returnY + 40);
    await dispatchTouch(session, "touchEnd", returnX, returnY + 40);
    /* Momentum can reach midnight after the finger is already up. Expansion is
       tied to the stream position, not to an active touch record. */
    await stream.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event("scroll")); });
    await session.detach();

    await expect(chrome).toHaveAttribute("data-collapsed", "false");
  });

  test("scrolling down from midnight keeps a collapsed header collapsed", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    const chrome = page.getByTestId("timeline-chrome");
    const stream = page.getByTestId("day-stream");
    const toggle = page.getByTestId("timeline-focus-toggle");

    /* Put the stream at the restore boundary, then explicitly collapse it so
       the next gesture tests only the direction of travel. */
    await stream.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event("scroll")); });
    await expect(chrome).toHaveAttribute("data-collapsed", "false");
    await toggle.click();
    await expect(chrome).toHaveAttribute("data-collapsed", "true");

    const box = await stream.boundingBox();
    const session = await page.context().newCDPSession(page);
    await dispatchTouch(session, "touchStart", box.x + 90, box.y + 120);
    await dispatchTouch(session, "touchMove", box.x + 90, box.y + 132);
    await stream.evaluate((node) => { node.scrollTop = 32; node.dispatchEvent(new Event("scroll")); });
    await dispatchTouch(session, "touchEnd", box.x + 90, box.y + 120);
    await session.detach();

    await expect(chrome).toHaveAttribute("data-collapsed", "true");
  });

  test("the date heading explicitly toggles timeline focus", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    const chrome = page.getByTestId("timeline-chrome");
    const toggle = page.getByTestId("timeline-focus-toggle");

    await toggle.click();
    await expect(chrome).toHaveAttribute("data-collapsed", "true");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(chrome).toHaveAttribute("data-collapsed", "false");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("the manual focus control interpolates both collapse and restore", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    const chrome = page.getByTestId("timeline-chrome");
    const toggle = page.getByTestId("timeline-focus-toggle");
    const expandedHeight = (await chrome.boundingBox()).height;

    await toggle.click();
    await page.waitForTimeout(70);
    const collapsingHeight = (await chrome.boundingBox()).height;
    expect(collapsingHeight).toBeGreaterThan(1);
    expect(collapsingHeight).toBeLessThan(expandedHeight - 1);

    await expect.poll(async () => (await chrome.boundingBox()).height).toBeLessThan(1);
    await toggle.click();
    await page.waitForTimeout(70);
    const restoringHeight = (await chrome.boundingBox()).height;
    expect(restoringHeight).toBeGreaterThan(1);
    expect(restoringHeight).toBeLessThan(expandedHeight - 1);
    await expect.poll(async () => (await chrome.boundingBox()).height).toBeGreaterThan(expandedHeight - 1);
  });

  test("focus mode keeps the header's visual layer in the same smooth path", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    const chrome = page.getByTestId("timeline-chrome");
    const inner = chrome.locator(".nb-timeline-chrome-inner");
    const toggle = page.getByTestId("timeline-focus-toggle");

    const motion = await chrome.evaluate((node) => {
      const style = getComputedStyle(node);
      const innerStyle = getComputedStyle(node.querySelector(".nb-timeline-chrome-inner"));
      return {
        height: style.transitionProperty,
        duration: style.transitionDuration,
        innerTransform: innerStyle.transitionProperty,
        innerDuration: innerStyle.transitionDuration,
      };
    });
    expect(motion.height).toContain("height");
    expect(motion.duration).toContain("0.3s");
    expect(motion.innerTransform).toContain("transform");
    expect(motion.innerTransform).toContain("opacity");
    expect(motion.innerDuration).toContain("0.3s");

    await toggle.click();
    await page.waitForTimeout(70);
    const collapsingOpacity = await inner.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity));
    expect(collapsingOpacity).toBeGreaterThan(0);
    expect(collapsingOpacity).toBeLessThan(1);

    await expect.poll(async () => Number.parseFloat(await inner.evaluate((node) => getComputedStyle(node).opacity))).toBeLessThan(0.1);
    await toggle.click();
    await page.waitForTimeout(70);
    const restoringOpacity = await inner.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity));
    expect(restoringOpacity).toBeGreaterThan(0);
    expect(restoringOpacity).toBeLessThan(1);
  });

  test("the week timeline shares focus collapse and restores at midnight", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();

    const chrome = page.getByTestId("timeline-chrome");
    const toggle = page.getByTestId("timeline-focus-toggle");
    const stream = page.getByTestId("week-grid").locator(".nb-s").first();
    await expect(toggle).toBeVisible();

    const session = await page.context().newCDPSession(page);
    const box = await stream.boundingBox();
    await dispatchTouch(session, "touchStart", box.x + 90, box.y + 120);
    await dispatchTouch(session, "touchMove", box.x + 90, box.y + 132);
    await stream.evaluate((node) => { node.scrollTop += 32; node.dispatchEvent(new Event("scroll")); });
    await dispatchTouch(session, "touchEnd", box.x + 90, box.y + 120);
    await expect(chrome).toHaveAttribute("data-collapsed", "true");
    await stream.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event("scroll")); });
    await expect(chrome).toHaveAttribute("data-collapsed", "false");

    await toggle.click();
    await expect(chrome).toHaveAttribute("data-collapsed", "true");
    await page.keyboard.press("F");
    await expect(chrome).toHaveAttribute("data-collapsed", "false");
  });
});

test.describe("desktop timeline focus", () => {
  test("exposes the focus control, preserves the date, and reclaims bottom space", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));

    const chrome = page.getByTestId("timeline-chrome");
    const heading = page.getByTestId("day-heading");
    const toggle = page.getByTestId("timeline-focus-toggle");
    const main = page.locator("main.nb-main");
    const expandedHeight = (await chrome.boundingBox()).height;

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-keyshortcuts", "F");
    await expect(main).toHaveCSS("padding-bottom", "12px");

    await toggle.click();
    await expect(chrome).toHaveAttribute("data-collapsed", "true");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveAttribute("data-date", await keyOf(new Date()));
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await chrome.boundingBox()).height).toBeLessThan(1);

    await page.keyboard.press("F");
    await expect(chrome).toHaveAttribute("data-collapsed", "false");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(async () => (await chrome.boundingBox()).height).toBeGreaterThan(expandedHeight - 1);
  });

  test("lists F and does not let it fire while a sheet is open or being edited", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    const chrome = page.getByTestId("timeline-chrome");

    await page.keyboard.press("?");
    const shortcuts = page.getByTestId("shortcut-sheet");
    await expect(shortcuts.getByText("Focus timeline", { exact: true })).toBeVisible();
    await page.keyboard.press("f");
    await expect(chrome).toHaveAttribute("data-collapsed", "false");
    await page.keyboard.press("Escape");
    await expect(shortcuts).toBeHidden();

    await page.keyboard.press("n");
    await expect(page.getByTestId("composer")).toBeVisible();
    await page.keyboard.press("f");
    await expect(chrome).toHaveAttribute("data-collapsed", "false");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("composer")).toBeHidden();
  });

  test("keeps the control out of non-timeline views", async ({ page }) => {
    await atTime(page, 10, 0);
    await seedPlanner(page, createBlankPlannerState({}));
    const toggle = page.getByTestId("timeline-focus-toggle");
    const main = page.locator("main.nb-main");

    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await expect(toggle).toHaveCount(0);
    await expect(main).toHaveCSS("padding-bottom", "32px");

    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    await expect(toggle).toBeVisible();
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(main).toHaveCSS("padding-bottom", "32px");

    await page.getByTestId("zoom-in").click();
    await expect(toggle).toBeVisible();
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(toggle).toHaveCount(0);
    await expect(main).toHaveCSS("padding-bottom", "32px");
  });
});

test("the day timeline has no standalone FREE labels", async ({ page }) => {
  await atTime(page, 9, 30);
  await seedPlanner(page, createBlankPlannerState({}));
  await expect(page.getByTestId("day-stream").getByText("FREE", { exact: true })).toHaveCount(0);
});

test.describe("short mobile timeline density", () => {
  test.use({ viewport: { width: 489, height: 601 }, hasTouch: true, isMobile: true });

  test("a three-hour event can fit wholly inside the timeline viewport", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.getByRole("button", { name: "Next day" }).click();

    const stream = page.getByTestId("day-stream");
    const workshop = page.locator("[data-event-id]").filter({ hasText: "Roadmap workshop" });
    await expect(workshop).toHaveCount(1);
    const [streamBox, workshopBox] = await Promise.all([stream.boundingBox(), workshop.boundingBox()]);

    expect(streamBox).not.toBeNull();
    expect(workshopBox).not.toBeNull();
    /* If the card itself is taller than its scrolling viewport, no scroll
       position can show the complete block. That is the literal clipping seen
       in the short in-app browser. */
    expect(workshopBox.height).toBeLessThanOrEqual(streamBox.height - 4);
  });

  test("a short meeting keeps its title when it shares a narrow lane", async ({ page }) => {
    /* The next day must be a weekday: Standup repeats Monday through Friday,
       and an unpinned clock eventually turned this into a Saturday fixture with
       no Standup card to inspect. */
    await page.clock.setFixedTime(new Date(2026, 7, 10, 9, 30, 0, 0));
    await openPlanner(page, { keepSample: true });
    await page.getByRole("button", { name: "Next day" }).click();

    /* Standup overlaps Roadmap workshop and also carries recurrence, alert, JOIN,
       conflict and time metadata. Those badges used to consume its entire lane,
       leaving the title at exactly zero pixels wide. */
    const standup = page.locator("[data-event-id]").filter({ hasText: "Standup" });
    const title = standup.getByText("Standup", { exact: true });
    await standup.scrollIntoViewIfNeeded();
    const [cardBox, titleBox, width] = await Promise.all([
      standup.boundingBox(),
      title.boundingBox(),
      title.evaluate((node) => ({ visible: node.clientWidth, needed: node.scrollWidth })),
    ]);

    expect(width.visible, "secondary badges must yield before the event title").toBeGreaterThanOrEqual(width.needed);
    expect(titleBox.y, "the title must start inside the short card").toBeGreaterThanOrEqual(cardBox.y - 1);
    expect(titleBox.y + titleBox.height, "the title must end inside the short card")
      .toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  });

  test("events and actions at the same time share lanes without covering each other", async ({ page }) => {
    const today = await atTime(page, 9, 30);
    const blank = createBlankPlannerState({});
    const first = createEvent(blank, {
      calendarId: "calendar-default", title: "Design review", category: "WORK",
      timing: {
        kind: "timed", timeZoneMode: "floating",
        startLocal: `${today}T09:00`, endLocal: `${today}T10:00`,
      },
    }, { id: "evt-design" }).state;
    const second = createEvent(first, {
      calendarId: "calendar-default", title: "Partner call", category: "WORK",
      timing: {
        kind: "timed", timeZoneMode: "floating",
        startLocal: `${today}T09:00`, endLocal: `${today}T10:00`,
      },
    }, { id: "evt-partner" }).state;
    const scheduled = createTask(second.tasks, {
      id: "task-brief", title: "Finish brief",
      planned: { date: today, startMinute: 9 * 60, estimateMinutes: 60 },
    });
    await seedPlanner(page, { ...second, tasks: scheduled.tasks });

    const cards = [
      page.locator('[data-event-id="evt-design"]'),
      page.locator('[data-event-id="evt-partner"]'),
      page.locator('[data-task-chip="task-brief"]'),
    ];
    const boxes = await Promise.all(cards.map(async (card) => {
      await expect(card).toBeVisible();
      return card.boundingBox();
    }));

    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        expect(horizontalOverlap, `cards ${left} and ${right} cover each other`).toBeLessThanOrEqual(1);
      }
    }

    const transitionProperties = await cards[0].evaluate((node) => getComputedStyle(node).transitionProperty);
    expect(transitionProperties).toContain("left");
    expect(transitionProperties).toContain("width");
  });
});

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
    const bar = page.getByRole("progressbar", { name: /steps (done|complete)/ }).first();
    await expect(bar).toBeVisible();
    await expect(bar.locator("> span")).toHaveCount(5);
    await expect(bar).toHaveAttribute("aria-valuenow", "2");
    await expect(bar).toHaveAttribute("aria-valuemax", "5");
  });

  test("the Action edit sheet uses the same segmented progress", async ({ page }) => {
    await seedPlanner(page, withSteps(2, 5));
    await page.getByRole("button", { name: "Ship the release" }).first().click();

    const sheet = page.getByTestId("sheet");
    const bar = sheet.getByRole("progressbar", { name: /steps (done|complete)/ });
    await expect(bar).toBeVisible();
    await expect(bar.locator("> span")).toHaveCount(5);
    await expect(bar).toHaveAttribute("aria-valuenow", "2");
    await expect(bar).toHaveAttribute("aria-valuemax", "5");
  });

  test("the segments are evenly sized, so the count is readable at a glance", async ({ page }) => {
    await seedPlanner(page, withSteps(1, 4));
    const widths = await page.getByRole("progressbar").first().locator("> span")
      .evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().width)));
    expect(widths).toHaveLength(4);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  const fills = (page) => page.locator('[role="progressbar"] > span > span').first()
    .locator("xpath=../..").locator("> span > span");

  test("ticking a step fills exactly one more segment", async ({ page }) => {
    await seedPlanner(page, withSteps(2, 5));
    const bar = page.getByRole("progressbar").first();
    const filled = async () => bar.locator("> span > span").evaluateAll(
      (nodes) => nodes.filter((n) => n.getBoundingClientRect().width > 1).length,
    );
    expect(await filled()).toBe(2);

    await page.getByRole("button", { name: /Step 3/ }).first().click();
    await page.waitForTimeout(700);
    await expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(await filled()).toBe(3);
  });

  test("segments fill by count, whichever step was ticked", async ({ page }) => {
    /* A checklist is a quantity of work remaining, not an ordered pipeline. A
       bar that lit segment five because you started at the bottom would be
       reporting the order you worked in rather than how much is left. */
    await seedPlanner(page, withSteps(0, 5));
    const bar = page.getByRole("progressbar").first();
    const widths = async () => bar.locator("> span > span").evaluateAll(
      (nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().width)),
    );
    expect((await widths()).every((w) => w === 0)).toBe(true);

    /* Tick the last step. The first segment is the one that fills. */
    await page.getByRole("button", { name: /Step 5/ }).first().click();
    await page.waitForTimeout(700);
    const after = await widths();
    expect(after[0]).toBeGreaterThan(1);
    expect(after.slice(1).every((w) => w <= 1)).toBe(true);
  });

  test("a segment grows rather than switching on", async ({ page }) => {
    await seedPlanner(page, withSteps(0, 5));
    const bar = page.getByRole("progressbar").first();
    const firstWidth = async () => bar.locator("> span > span").first()
      .evaluate((n) => n.getBoundingClientRect().width);

    await page.getByRole("button", { name: /Step 1/ }).first().click();
    await page.waitForTimeout(60);
    const midway = await firstWidth();
    await page.waitForTimeout(700);
    const settled = await firstWidth();

    /* Caught between empty and full: a colour swap would only ever be one or the
       other. */
    expect(settled).toBeGreaterThan(1);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(settled);
  });

  test("an action with no steps shows no bar at all", async ({ page }) => {
    await seedPlanner(page, withSteps(0, 0));
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });

  test("a subtask-only Action shows a SUBTASKS track and no STEPS track", async ({ page }) => {
    let state = createBlankPlannerState({});
    const parent = createTask(state.tasks, { id: "task-release", title: "Ship the release", planned: { date: keyOf(new Date()) } });
    state = { ...state, tasks: parent.tasks };
    state = { ...state, tasks: createSubtask(state.tasks, "task-release", { id: "child-a", title: "Pull data" }).tasks };
    state = { ...state, tasks: createSubtask(state.tasks, "task-release", { id: "child-b", title: "Rebuild math" }).tasks };
    await seedPlanner(page, state);

    const card = page.getByTestId("actions-column").locator("[data-task='task-release'] .nb-action-card");
    await expect(card.getByTestId("action-progress-subtasks")).toBeVisible();
    await expect(card.getByTestId("action-progress-checklist")).toHaveCount(0);
    await expect(card.getByTestId("action-progress-subtasks").getByText("SUBTASKS", { exact: true })).toBeVisible();
    await expect(card.getByRole("progressbar", { name: /0 of 2 subtasks complete/ })).toBeVisible();
  });

  test("mixed work shows STEPS then SUBTASKS as separate tracks", async ({ page }) => {
    let state = withSteps(2, 4);
    state = { ...state, tasks: createSubtask(state.tasks, "task-release", { id: "child-a", title: "Pull data" }).tasks };
    state = { ...state, tasks: createSubtask(state.tasks, "task-release", { id: "child-b", title: "Rebuild math" }).tasks };
    await seedPlanner(page, state);

    const card = page.getByTestId("actions-column").locator("[data-task='task-release'] .nb-action-card");
    const labels = card.locator("[data-test='action-progress'] .nb-data");
    await expect(card.getByTestId("action-progress-checklist")).toBeVisible();
    await expect(card.getByTestId("action-progress-subtasks")).toBeVisible();
    await expect(card.getByTestId("action-progress-checklist").getByText("STEPS", { exact: true })).toBeVisible();
    await expect(card.getByTestId("action-progress-subtasks").getByText("SUBTASKS", { exact: true })).toBeVisible();
    const order = await card.locator("[data-test='action-progress'] [data-test^='action-progress-']").evaluateAll(
      (nodes) => nodes.map((node) => node.getAttribute("data-test")),
    );
    expect(order).toEqual(["action-progress-checklist", "action-progress-subtasks"]);
    await expect(card.getByRole("progressbar", { name: /2 of 4 checklist steps complete/ })).toBeVisible();
    await expect(card.getByRole("progressbar", { name: /0 of 2 subtasks complete/ })).toBeVisible();
    expect(labels).toBeTruthy();
  });

  test("reduced motion fills a step immediately", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedPlanner(page, withSteps(0, 3));
    const bar = page.getByRole("progressbar").first();
    await page.getByRole("button", { name: /Step 1/ }).first().click();
    await page.waitForTimeout(20);
    const width = await bar.locator("> span > span").first().evaluate((n) => n.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(1);
  });

  test("a cancelled subtask is absent from the subtask denominator", async ({ page }) => {
    let state = createBlankPlannerState({});
    const parent = createTask(state.tasks, { id: "task-release", title: "Ship the release", planned: { date: keyOf(new Date()) } });
    state = { ...state, tasks: parent.tasks };
    state = { ...state, tasks: createSubtask(state.tasks, "task-release", { id: "child-a", title: "Keep me" }).tasks };
    state = { ...state, tasks: createSubtask(state.tasks, "task-release", { id: "child-b", title: "Cancel me" }).tasks };
    state = {
      ...state,
      tasks: state.tasks.map((task) => (task.id === "child-b" ? { ...task, status: "cancelled" } : task)),
    };
    await seedPlanner(page, state);

    const card = page.getByTestId("actions-column").locator("[data-task='task-release'] .nb-action-card");
    await expect(card.getByRole("progressbar", { name: /0 of 1 subtasks complete/ })).toBeVisible();
  });
});

test.describe("Timeline Action progress", () => {
  const scheduledWithWork = ({ estimateMinutes = 60, checklist = [], children = [] } = {}) => {
    let state = createBlankPlannerState({});
    const created = createTask(state.tasks, {
      id: "task-timeline-progress",
      title: "Review launch brief",
      planned: { date: keyOf(new Date()), startMinute: 13 * 60, estimateMinutes },
      checklist,
    });
    state = { ...state, tasks: created.tasks };
    for (const child of children) {
      state = { ...state, tasks: createSubtask(state.tasks, "task-timeline-progress", {
        id: child.id, title: child.title,
      }).tasks };
      if (child.status) {
        state = {
          ...state,
          tasks: state.tasks.map((task) => (task.id === child.id ? { ...task, status: child.status } : task)),
        };
      }
    }
    return state;
  };

  for (const minutes of [15, 30, 60, 120]) {
    test(`${minutes}-minute Action shows compact checklist and subtask rails in the body lane`, async ({ page }) => {
      await seedPlanner(page, scheduledWithWork({
        estimateMinutes: minutes,
        checklist: [
          { id: "s1", title: "Step 1", done: true, order: 0 },
          { id: "s2", title: "Step 2", done: false, order: 1 },
        ],
        children: [{ id: "c1", title: "Child", status: "open" }],
      }));

      const lane = page.getByTestId("timeline-action-lane");
      await lane.scrollIntoViewIfNeeded();
      const rails = lane.getByTestId("timeline-action-progress");
      await expect(rails).toBeVisible();
      await expect(lane.getByRole("progressbar", { name: /checklist steps complete/ })).toBeVisible();
      await expect(lane.getByRole("progressbar", { name: /subtasks complete/ })).toBeVisible();
      const height = await lane.evaluate((node) => node.getBoundingClientRect().height);
      const complete = lane.locator("[data-timeline-complete]");
      const estimate = lane.getByTestId("timeline-action-resize");
      const railBox = await rails.boundingBox();
      const completeBox = await complete.boundingBox();
      expect(railBox).not.toBeNull();
      expect(completeBox).not.toBeNull();
      expect(railBox.x).toBeGreaterThanOrEqual(completeBox.x + completeBox.width - 1);
      if (await estimate.count()) {
        const estimateBox = await estimate.boundingBox();
        expect(estimateBox).not.toBeNull();
        expect(railBox.x + railBox.width).toBeLessThanOrEqual(estimateBox.x + 1);
      }
      expect(height).toBeGreaterThanOrEqual(44);

      const owner = await page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return {
          progress: hit?.closest?.("[data-test='timeline-action-progress']") != null
            && getComputedStyle(hit.closest("[data-test='timeline-action-progress']")).pointerEvents !== "none",
          chip: hit?.closest?.("[data-task-chip]") != null,
          complete: hit?.closest?.("[data-timeline-complete]") != null,
          estimate: hit?.closest?.("[data-action-estimate]") != null,
        };
      }, { x: railBox.x + railBox.width / 2, y: railBox.y + railBox.height / 2 });
      expect(owner.progress, "progress rails must not steal the hit").toBe(false);
      expect(owner.chip || owner.complete, "the body or complete owner remains under the rail").toBe(true);
    });
  }
});


test.describe("short timed cards keep their details inside the block", () => {
  test("a 10-minute Event shows its range and a 10-minute Action shows its estimate", async ({ page }) => {
    const today = keyOf(new Date());
    const blank = createBlankPlannerState({});
    const withEvent = createEvent(blank, {
      calendarId: "calendar-default", title: "Standup ping", category: "PEOPLE",
      timing: {
        kind: "timed", timeZoneMode: "floating",
        startLocal: `${today}T08:00`, endLocal: `${today}T08:10`,
      },
    }, { id: "evt-ten" }).state;
    const scheduled = createTask(withEvent.tasks, {
      id: "task-ten", title: "Send standup note",
      planned: { date: today, startMinute: 9 * 60, estimateMinutes: 10 },
    });
    await seedPlanner(page, { ...withEvent, tasks: scheduled.tasks });

    const eventCard = page.locator('[data-event-id="evt-ten"]');
    const actionCard = page.locator('[data-task-chip="task-ten"]');
    await expect(eventCard).toBeVisible();
    await expect(actionCard).toBeVisible();

    const eventRange = eventCard.getByText("8:00 AM", { exact: false });
    await expect(eventRange, "short Event must still name its end, not only its start").toContainText("8:10 AM");
    await expect(actionCard.getByText("10m", { exact: true }), "short Action must still show its estimate").toBeVisible();

    const inside = async (host, child, label) => {
      const [card, detail] = await Promise.all([host.boundingBox(), child.boundingBox()]);
      expect(card, label + " card missing").not.toBeNull();
      expect(detail, label + " detail missing").not.toBeNull();
      expect(detail.y, label + " starts above the card").toBeGreaterThanOrEqual(card.y - 1);
      expect(detail.y + detail.height, label + " is clipped by the card")
        .toBeLessThanOrEqual(card.y + card.height + 1);
    };
    await inside(eventCard, eventCard.getByText(/8:00 AM.*8:10 AM/), "Event range");
    await inside(actionCard, actionCard.getByText("10m", { exact: true }), "Action estimate");
  });
});

test.describe("cards sit where their time is", () => {
  test("a week card puts its title at the top of the block, not the middle", async ({ page }) => {
    /* A button centres its contents vertically — the browser's own layout for
       buttons, which does not care that this one is a two-hour block. The title of
       a 9-to-11 event sat 55px down the card, level with 10 o'clock. */
    await openPlanner(page, { keepSample: true });
    await page.keyboard.press("[");
    await expect(page.getByTestId("week-grid")).toBeVisible();

    const offsets = await page.evaluate(() => [...document.querySelectorAll('[data-test="week-event"]')]
      .map((card) => {
        const title = card.querySelector("span");
        if (!title) return null;
        const cr = card.getBoundingClientRect();
        return { height: cr.height, offset: title.getBoundingClientRect().top - cr.top };
      })
      .filter((row) => row && row.height > 40));

    expect(offsets.length, "the sample week should have some cards tall enough to test").toBeGreaterThan(0);
    for (const { height, offset } of offsets) {
      expect(offset, `a ${Math.round(height)}px card put its title ${Math.round(offset)}px down`).toBeLessThan(8);
    }
  });
});

test.describe("the Day keeps a stable flexible-work landmark", () => {
  test("an empty Day still renders ANY TIME without an empty horizontal scroller", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 601 });
    await seedPlanner(page, createBlankPlannerState({}));

    await expect(page.getByText("ANY TIME", { exact: true }), "the Day landmark must remain findable when no Action is flexible").toBeVisible();
    await expect(page.getByTestId("any-time-empty"), "the empty shelf needs a compact neutral state").toBeVisible();
    await expect(page.getByTestId("any-time-row"), "an empty shelf must not claim horizontal scrolling").toHaveCount(0);
    const stream = page.getByTestId("day-stream");
    await expect(stream, "the persistent shelf must leave the Timeline mounted").toBeVisible();
    const capacity = await stream.evaluate((node) => {
      const canvas = node.firstElementChild;
      const hourHeight = canvas.getBoundingClientRect().height / 24;
      return {
        height: node.getBoundingClientRect().height,
        visibleHours: node.getBoundingClientRect().height / hourHeight,
      };
    });
    expect(capacity.height, "the persistent shelf must leave a real short-viewport Timeline").toBeGreaterThanOrEqual(180);
    expect(capacity.visibleHours, "the short viewport must retain at least three visible Timeline hours").toBeGreaterThanOrEqual(3);

    await page.getByRole("button", { name: "WEEK", exact: true }).click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await expect(page.getByText("ANY TIME", { exact: true }), "the flexible-work shelf remains Day-only").toHaveCount(0);
  });
});

test.describe("rows that scroll sideways say so", () => {
  test("the any-time row fades only when there is more past the edge", async ({ page }) => {
    /* No scrollbar and no cue makes a scrolling row look like a broken one: the
       last chip is cut in half against the panel's corner and nothing suggests
       swiping. The fade has to be conditional, though — on a row that already
       fits it would just be a chip with a dimmed corner. */
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);

    await quickAdd(page, "Buy milk");
    await expect(page.getByText("Buy milk").first()).toBeVisible();

    const oneChip = await page.evaluate(() => {
      const el = document.querySelector('[data-test="any-time-row"]');
      return el ? { overflowing: el.scrollWidth - el.clientWidth > 2, mask: getComputedStyle(el).maskImage } : null;
    });
    expect(oneChip, "the any-time row should exist once something is undated").not.toBeNull();
    if (!oneChip.overflowing) {
      expect(oneChip.mask, "a row that fits must not be masked").toBe("none");
    }

    /* Enough chips that the row cannot possibly fit at 390px. */
    for (const name of ["Call the bank about the transfer", "Renew the parking permit", "Book the dentist appointment", "Order more printer paper"]) {
      await quickAdd(page, name);
    }
    await page.waitForTimeout(300);
    const many = await page.evaluate(() => {
      const el = document.querySelector('[data-test="any-time-row"]');
      if (!el || el.scrollWidth - el.clientWidth <= 2) return "no overflowing any-time row";
      return el ? getComputedStyle(el).maskImage : "no overflowing row";
    });
    expect(many, "an overflowing row should fade at the end it can scroll towards").toContain("gradient");
  });
});
