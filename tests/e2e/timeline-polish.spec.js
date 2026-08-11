import { expect, test } from "@playwright/test";
import { openPlanner, quickAdd, seedPlanner } from "./helpers.js";
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
    const bar = page.getByRole("progressbar", { name: /steps done/ }).first();
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
      const el = [...document.querySelectorAll("div.overflow-x-auto")].find((n) => n.scrollWidth > 0 && n.querySelector("button"));
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
      const el = [...document.querySelectorAll("div.overflow-x-auto")].find((n) => n.scrollWidth - n.clientWidth > 2 && n.querySelector("button"));
      return el ? getComputedStyle(el).maskImage : "no overflowing row";
    });
    expect(many, "an overflowing row should fade at the end it can scroll towards").toContain("gradient");
  });
});
