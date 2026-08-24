import { expect, test } from "@playwright/test";
import { seedPlanner, settledState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";
import { addMinutesToLocalDateTime, localDateTimeToEpochMinutes } from "../../src/shared/time/localDateTime.js";

/* The timeline, under a finger.
 *
 * Every gesture on the day stream is delegated to one element and driven by raw
 * touch events, so none of it is reachable by the mouse paths the other specs
 * drive — and all of it can break while every one of those specs stays green.
 * It did: three separate ways at once, and between them the answer to "why can I
 * not touch my events any more" on a phone.
 *
 * These drive real touch sequences through CDP rather than Playwright's
 * `tap()`/`click()`, because the distinction that matters here is between a tap,
 * a hold and a drag — and only a real sequence of touchstart/move/end has that.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const today = keyOf(new Date());
const HOUR_PX = 68;

function seeded() {
  return createEvent(createBlankPlannerState({}), {
    calendarId: "calendar-default", title: "Standup", category: "PEOPLE",
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal: `${today}T10:00`, endLocal: `${today}T12:00`,
    },
  }, { id: "evt-standup" }).state;
}

function denseEvents() {
  let state = createBlankPlannerState({});
  for (let index = 0; index < 4; index += 1) {
    const result = createEvent(state, {
      calendarId: "calendar-default", title: index === 0 ? "Center body move target" : `Dense overlap ${index}`,
      category: "PEOPLE",
      timing: {
        kind: "timed", timeZoneMode: "floating",
        startLocal: `${today}T10:00`, endLocal: `${today}T12:00`,
      },
    }, { id: `evt-dense-${index}` });
    state = result.state;
  }
  return state;
}

function linkedSeeded() {
  return createEvent(createBlankPlannerState({}), {
    calendarId: "calendar-default", title: "Linked planning session", category: "PEOPLE",
    link: "https://meet.example.test/planning",
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal: `${today}T10:00`, endLocal: `${today}T12:00`,
    },
  }, { id: "evt-linked" }).state;
}

function compactAction() {
  const state = createBlankPlannerState({});
  const planned = createTask(state.tasks, {
    id: "task-touch-compact", title: "Resize me directly",
    planned: { date: today, startMinute: 10 * 60, estimateMinutes: 15 },
  });
  return { ...state, tasks: planned.tasks };
}

function scheduledAction({ id = "task-touch-hold", title = "Move the brief", estimateMinutes = 60 } = {}) {
  const state = createBlankPlannerState({});
  const planned = createTask(state.tasks, {
    id, title,
    planned: { date: today, startMinute: 10 * 60, estimateMinutes },
  });
  return { ...state, tasks: planned.tasks };
}

function scheduledActionsForReorder() {
  const state = createBlankPlannerState({});
  let tasks = createTask(state.tasks, {
    id: "task-reorder-a", title: "Move me after the sibling",
    planned: { date: today, startMinute: 10 * 60, estimateMinutes: 60 },
  }).tasks;
  for (let index = 0; index < 8; index += 1) {
    tasks = createTask(tasks, { id: `task-filler-${index}`, title: `Filler ${index + 1}` }).tasks;
  }
  tasks = createTask(tasks, {
    id: "task-reorder-b", title: "Reorder target",
    planned: { date: today, startMinute: 12 * 60, estimateMinutes: 60 },
  }).tasks;
  return { ...state, tasks };
}

function shortEvent(durationMinutes) {
  const startLocal = `${today}T10:00`;
  return createEvent(createBlankPlannerState({}), {
    calendarId: "calendar-default", title: `${durationMinutes}-minute body`, category: "PEOPLE",
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal, endLocal: addMinutesToLocalDateTime(startLocal, durationMinutes),
    },
  }, { id: `evt-short-${durationMinutes}` }).state;
}

const card = (page) => page.locator('[data-event-id="evt-standup"]');
const sheets = (page) => page.locator('[data-test="sheet"]');

/* A finger, described exactly: where it lands, how long it stays, where it goes. */
async function finger(page, { x, y, holdMs = 0, to = null, steps = 8 }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  if (holdMs) await page.waitForTimeout(holdMs);
  if (to) {
    for (let step = 1; step <= steps; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + ((to.x - x) * step) / steps, y: y + ((to.y - y) * step) / steps }],
      });
      await page.waitForTimeout(16);
    }
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(400);
}

async function closeAnySheet(page) {
  for (let i = 0; i < 4 && (await sheets(page).count()); i += 1) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}

const stored = (page, predicate, message) => settledState(page, (s) => predicate(s.events[0].timing), message);

test.describe("the timeline survives the day changing under it", () => {
  /* The gestures are installed once, on whatever element the ref held at the
     time. The page wrapper is keyed on the day turn, so stepping to another day
     builds a new stream node and leaves the listeners on the old one — which is
     no longer in the document. Every touch gesture on the timeline stops
     working, silently, and stays broken until the tab is reloaded. A mouse never
     noticed: its handlers are React props that every render puts back. */
  for (const [label, go] of [
    ["a day turn", async (page) => {
      await page.getByRole("button", { name: "Next day" }).click();
      await page.waitForTimeout(700);
      await page.getByRole("button", { name: "Previous day" }).click();
      await page.waitForTimeout(700);
    }],
    ["a change of zoom", async (page) => {
      await page.getByTestId("zoom-out").click();
      await page.waitForTimeout(700);
      await page.getByTestId("zoom-in").click();
      await page.waitForTimeout(700);
    }],
  ]) {
    test(`a card still opens after ${label}`, async ({ page }) => {
      await seedPlanner(page, seeded());
      await card(page).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      /* It works before, so what follows is about the navigation and not about
         the card. */
      let box = await card(page).boundingBox();
      await finger(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await expect(sheets(page), "the card did not open even before navigating").toHaveCount(1);
      await closeAnySheet(page);

      await go(page);

      await card(page).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      box = await card(page).boundingBox();
      await finger(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await expect(sheets(page), `touch stopped working after ${label}`).toHaveCount(1);
    });
  }
});

test.describe("a resize grip is part of the card it sits on", () => {
  /* Touching a grip used to begin the resize on contact — no hold, no movement.
     Two things followed. A tap that landed on one opened and finished a gesture
     that changed nothing, so the card did not open: the top 8px and bottom 12px
     of every card were dead, which on a short card is a third of it, and the top
     strip is where the title sits. And a finger that began a scroll on a card's
     bottom edge resized the event instead of scrolling the day. */

  test("a tap on the top grip opens the card", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card(page).boundingBox();

    await finger(page, { x: box.x + box.width / 2, y: box.y + 3 });
    await expect(sheets(page), "the top edge of the card swallowed the tap").toHaveCount(1);
  });

  test("a tap on the bottom grip opens the card", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card(page).boundingBox();

    await finger(page, { x: box.x + box.width / 2, y: box.y + box.height - 3 });
    await expect(sheets(page), "the bottom edge of the card swallowed the tap").toHaveCount(1);
  });

  test("a swipe that starts on a grip does not resize the event", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card(page).boundingBox();

    /* Straight up from the bottom edge with no hold: a scroll, by any reading.
       This used to shorten a two-hour event to thirty minutes. */
    await finger(page, {
      x: box.x + box.width / 2,
      y: box.y + box.height - 4,
      to: { x: box.x + box.width / 2, y: box.y + box.height - 4 - HOUR_PX * 2 },
    });

    const state = await settledState(page, () => true, "the notebook never settled");
    expect(state.events[0].timing.endLocal, "a swipe shortened the event").toBe(`${today}T12:00`);
    expect(state.events[0].timing.startLocal).toBe(`${today}T10:00`);
  });

  test("and the browser is allowed to scroll from a grip", async ({ page }) => {
    /* The other half of the same fix, and not observable through behaviour here:
       synthesised touch does not drive an inner scroll container in headless
       Chromium, so what a swipe *did* is testable and what the day did in
       response is not. The permission is, though — and it was `none`, which is
       the browser being told this strip handles its own gestures and must never
       pan. A grip that waits for a hold has no business saying that. */
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const grips = page.locator('[data-event-id="evt-standup"] [data-resize]');
    await expect(grips, "the card has no grips to check").not.toHaveCount(0);
    const actions = await grips.evaluateAll((els) => els.map((e) => getComputedStyle(e).touchAction));
    for (const action of actions) {
      expect(action, "a grip still forbids the day from scrolling under it").not.toBe("none");
      expect(action, "a grip does not allow the vertical pan the card behind it does").toMatch(/pan-y|auto|manipulation/);
    }
  });

  /* A resize follows the finger's absolute position, not a delta from where it
     started — so a grip pressed a few pixels inside the edge lands a few minutes
     short of a whole hour. The hour is not the claim; which end moved is. */
  const minutesInto = (local) => {
    const [h, m] = local.split("T")[1].split(":").map(Number);
    return h * 60 + m;
  };

  test("an ordinary one-hour Event keeps full-width mouse edges and centred touch cues", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlanner(page, seeded({
      startLocal: `${today}T10:00`,
      endLocal: `${today}T11:00`,
    }));
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const start = event.locator('[data-touch-resize="start"]');
    const end = event.locator('[data-touch-resize="end"]');
    const desktopStart = event.locator('[data-resize-edge="start"]:not([data-touch-resize])');
    const desktopEnd = event.locator('[data-resize-edge="end"]:not([data-touch-resize])');
    await expect(start, "a normal one-hour Event must remain touch-resizable at its start").toHaveCount(1);
    await expect(end, "a normal one-hour Event must remain touch-resizable at its end").toHaveCount(1);

    const [eventBox, startBox, endBox, desktopStartBox, desktopEndBox] = await Promise.all([
      event.boundingBox(), start.boundingBox(), end.boundingBox(), desktopStart.boundingBox(), desktopEnd.boundingBox(),
    ]);
    expect(eventBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    expect(desktopStartBox).not.toBeNull();
    expect(desktopEndBox).not.toBeNull();
    expect(desktopStartBox.width, "mouse start resize must span the Event").toBeGreaterThan(eventBox.width - 2);
    expect(desktopEndBox.width, "mouse end resize must span the Event").toBeGreaterThan(eventBox.width - 2);
    expect(startBox.width, "touch start resize must stay local to its visible cue").toBeLessThanOrEqual(44);
    expect(endBox.width, "touch end resize must stay local to its visible cue").toBeLessThanOrEqual(44);
    expect(startBox.x + startBox.width / 2).toBeCloseTo(eventBox.x + eventBox.width / 2, 0);
    expect(endBox.x + endBox.width / 2).toBeCloseTo(eventBox.x + eventBox.width / 2, 0);
    expect(startBox.height, "the start edge must leave a readable move body").toBeLessThanOrEqual(12);
    expect(endBox.height, "the end edge must leave a readable move body").toBeLessThanOrEqual(14);
    await expect(event.locator("[data-touch-move]"), "the Event body itself is the move surface").toHaveCount(0);
  });

  test("a hold on the bottom grip still resizes, which is what it is for", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card(page).locator('[data-touch-resize="end"]').boundingBox();

    await finger(page, {
      x: box.x + box.width / 2,
      y: box.y + box.height - 4,
      holdMs: 500,
      to: { x: box.x + box.width / 2, y: box.y + box.height - 4 + HOUR_PX },
    });

    const timing = (await stored(page, (t) => t.endLocal !== `${today}T12:00`, "the hold never resized the event")).events[0].timing;
    expect(timing.startLocal, "resizing the end moved the start").toBe(`${today}T10:00`);
    expect(minutesInto(timing.endLocal), "the end did not follow the finger by about an hour")
      .toBeGreaterThan(minutesInto(`${today}T12:45`));
  });

  test("a hold on the top grip moves the start, not the end", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card(page).locator('[data-touch-resize="start"]').boundingBox();

    const session = await page.context().newCDPSession(page);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(500);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + HOUR_PX }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();

    const timing = (await stored(page, (t) => t.startLocal !== `${today}T10:00`, "the hold never moved the start")).events[0].timing;
    expect(timing.endLocal, "resizing the start moved the end").toBe(`${today}T12:00`);
    expect(minutesInto(timing.startLocal), "the start did not follow the finger by about an hour")
      .toBeGreaterThan(minutesInto(`${today}T10:45`));
  });

  test("a held upper-card body touch moves the Event", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const titleBox = await card(page).locator("span[title]").first().boundingBox();
    const session = await page.context().newCDPSession(page);
    const x = titleBox.x + titleBox.width / 2;
    const y = titleBox.y + titleBox.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(340);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + HOUR_PX }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();

    const timing = (await settledState(page, (state) => state.events[0].timing.startLocal !== `${today}T10:00`, "the upper body touch did not move the Event")).events[0].timing;
    expect(timing.startLocal).toBe(`${today}T11:00`);
    expect(timing.endLocal, "an upper body move must preserve duration").toBe(`${today}T13:00`);
  });

  test("a held lower-card body touch moves the Event", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card(page).boundingBox();
    const session = await page.context().newCDPSession(page);
    const x = box.x + box.width / 2;
    const y = box.y + box.height - 16;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(340);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + HOUR_PX }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();

    const timing = (await settledState(page, (state) => state.events[0].timing.startLocal !== `${today}T10:00`, "the lower body touch did not move the Event")).events[0].timing;
    expect(timing.startLocal).toBe(`${today}T11:00`);
    expect(timing.endLocal, "a lower body move must preserve duration").toBe(`${today}T13:00`);
  });

  test("eligible Events expose disjoint semantic touch resize controls", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const start = card(page).locator('[data-touch-resize="start"]');
    const end = card(page).locator('[data-touch-resize="end"]');
    await expect(start, "an eligible Event needs an explicit start touch grip").toHaveCount(1);
    await expect(end, "an eligible Event needs an explicit end touch grip").toHaveCount(1);
    await expect(start).toHaveAttribute("aria-hidden", "true");
    await expect(end).toHaveAttribute("aria-hidden", "true");
    const [cardBox, startBox, endBox] = await Promise.all([card(page).boundingBox(), start.boundingBox(), end.boundingBox()]);
    expect(cardBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    expect(startBox.width).toBeLessThanOrEqual(44);
    expect(endBox.width).toBeLessThanOrEqual(44);
    expect(startBox.x + startBox.width / 2).toBeCloseTo(cardBox.x + cardBox.width / 2, 0);
    expect(endBox.x + endBox.width / 2).toBeCloseTo(cardBox.x + cardBox.width / 2, 0);
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(endBox.y);
  });

  test("the Event point grid exposes visible resize ownership without hiding body content", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const controls = event.locator('[data-touch-resize]');
    await expect(controls, "an eligible Event needs two semantic controls").toHaveCount(2);
    const cues = event.locator('[data-test^="timeline-event-resize-cue-"]');
    await expect(cues, "resize ownership must have a rendered cue").toHaveCount(2);

    const pointGrid = await event.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const title = node.querySelector("span[title]");
      const titleRect = title?.getBoundingClientRect() ?? rect;
      const points = [
        ["title", titleRect.left + titleRect.width / 2, titleRect.top + titleRect.height / 2],
        ["center", rect.left + rect.width / 2, rect.top + rect.height / 2],
        ["lower-body", rect.left + rect.width / 2, rect.bottom - Math.min(20, rect.height / 3)],
      ];
      return points.map(([label, x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return {
          label,
          resize: hit?.closest?.("[data-touch-resize]")?.getAttribute("data-touch-resize") ?? null,
          event: hit?.closest?.("[data-event-id]")?.getAttribute("data-event-id") ?? null,
        };
      });
    });

    for (const point of pointGrid) {
      expect(point.event, `${point.label} must remain inside the Event`).toBe("evt-standup");
      expect(point.resize, `${point.label} must remain a move surface`).toBeNull();
    }
    const cueStyles = await cues.evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderTopColor, opacity: style.opacity };
    }));
    for (const style of cueStyles) {
      expect(style.opacity, "the resize cue must not be transparent").not.toBe("0");
      expect(style.background === "rgba(0, 0, 0, 0)" && style.border === "rgba(0, 0, 0, 0)", "the semantic resize target cannot be invisible").toBe(false);
    }
  });

  test("a dense Event body stays readable and falls back to body movement", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlanner(page, denseEvents());
    const event = page.locator('[data-event-id="evt-dense-0"]');
    await event.scrollIntoViewIfNeeded();
    const geometry = await event.evaluate((node) => {
      const card = node.getBoundingClientRect();
      const title = node.querySelector("span[title]");
      const titleRect = title?.getBoundingClientRect();
      const hit = titleRect
        ? document.elementFromPoint(titleRect.left + titleRect.width / 2, titleRect.top + titleRect.height / 2)
        : null;
      return {
        card,
        title: titleRect,
        laneWidth: card.width,
        hitEvent: hit?.closest?.("[data-event-id]")?.getAttribute("data-event-id") ?? null,
        hitResize: hit?.closest?.("[data-touch-resize]")?.getAttribute("data-touch-resize") ?? null,
        hitMove: hit?.closest?.("[data-touch-move]") != null,
      };
    });
    expect(geometry.laneWidth, "the fixture must exercise a dense lane, not a full-width card").toBeLessThan(220);
    expect(geometry.laneWidth, "the fixture must exercise the dense readable-body boundary").toBeLessThan(88);
    expect(geometry.title, "the dense Event title must remain measurable").not.toBeNull();
    expect(geometry.title.width, "the dense Event title must remain visible in the body fallback").toBeGreaterThan(0);
    expect(geometry.hitEvent).toBe("evt-dense-0");
    expect(geometry.hitResize, "a visible title point must remain Event-body owned").toBeNull();
    expect(geometry.hitMove, "a visible title point must remain outside the move control").toBe(false);
    await expect(event.locator("[data-touch-move]"), "a dense Event must leave its move lane to the readable body").toHaveCount(0);

    const before = (await settledState(page, () => true, "the dense fixture never settled")).events.find((item) => item.id === "evt-dense-0").timing;
    const title = geometry.title;
    await finger(page, {
      x: title.left + title.width / 2,
      y: title.top + title.height / 2,
      holdMs: 340,
      to: { x: title.left + title.width / 2, y: title.top + title.height / 2 + HOUR_PX },
    });
    const timing = (await settledState(page, (state) => state.events.find((item) => item.id === "evt-dense-0")?.timing.startLocal !== before.startLocal, "the dense Event title did not move the Event")).events.find((item) => item.id === "evt-dense-0").timing;
    expect(timing.startLocal).toBe(`${today}T11:00`);
    expect(timing.endLocal, "the dense body move must preserve Event duration").toBe(`${today}T13:00`);
  });

  test("a linked Event keeps JOIN and end resize controls in separate lanes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPlanner(page, linkedSeeded());
    const event = page.locator('[data-event-id="evt-linked"]');
    const join = event.getByRole("link", { name: "Join Linked planning session" });
    await event.scrollIntoViewIfNeeded();
    await expect(join).toBeVisible();
    const start = event.locator('[data-resize-edge="start"]:not([data-touch-resize])');
    const end = event.locator('[data-resize-edge="end"]:not([data-touch-resize])');
    await expect(start).toHaveCount(1);
    await expect(end).toHaveCount(1);
    const [cardBox, startBox, endBox, joinBox] = await Promise.all([
      event.boundingBox(), start.boundingBox(), end.boundingBox(), join.boundingBox(),
    ]);
    expect(cardBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    expect(joinBox).not.toBeNull();
    expect(startBox.x).toBeCloseTo(cardBox.x, 0);
    expect(endBox.x + endBox.width, "the resize edge must span the full Event width").toBeCloseTo(cardBox.x + cardBox.width, 0);
    expect(joinBox.x + joinBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    const titlePoint = await event.locator("span[title]").boundingBox();
    const ownership = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return {
        event: hit?.closest?.("[data-event-id]")?.getAttribute("data-event-id") ?? null,
        resize: hit?.closest?.("[data-touch-resize]")?.getAttribute("data-touch-resize") ?? null,
        join: hit?.closest?.("[data-join]")?.getAttribute("data-join") ?? null,
      };
    }, { x: titlePoint.x + titlePoint.width / 2, y: titlePoint.y + titlePoint.height / 2 });
    expect(ownership.event).toBe("evt-linked");
    expect(ownership.resize).toBeNull();
    expect(ownership.join).toBeNull();
  });

  test("the active Event owns the Day scroll position after lift", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const stream = page.getByTestId("day-stream");
    const box = await event.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(340);
    const beforeLock = await stream.evaluate((node) => node.scrollTop);
    await stream.evaluate((node) => {
      node.scrollTop += 120;
      node.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "active Event ownership must restore forced Day scroll drift",
    }).toBe(beforeLock);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + HOUR_PX }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();

    const timing = (await settledState(page, (state) => state.events[0].timing.startLocal !== `${today}T10:00`, "the active Event never committed after the scroll-lock check")).events[0].timing;
    expect(timing.startLocal).toBe(`${today}T11:00`);
    expect(timing.endLocal).toBe(`${today}T13:00`);
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "the Day stream moved underneath the active Event",
    }).toBe(beforeLock);
  });

  test("a second finger cancels the active Event and unlocks the stream", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const stream = page.getByTestId("day-stream");
    const before = (await settledState(page, () => true, "the notebook never settled")).events[0].timing;
    const box = await event.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 0, x, y }] });
    await page.waitForTimeout(340);
    const beforeLock = await stream.evaluate((node) => node.scrollTop);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 0, x, y: y + 12 }, { id: 1, x: x + 24, y: y + 12 }],
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();

    const state = await settledState(page, (stored) => stored.events[0].timing.startLocal === before.startLocal, "a second finger must cancel without persisting the Event");
    expect(state.events[0].timing).toEqual(before);
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "the cancelled Event must release the Day stream lock",
    }).toBe(beforeLock);
    await expect(event).not.toHaveClass(/nb-timeline-lane-active/);
  });

  test("a stationary second touch cancels immediately without a follow-up move", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const stream = page.getByTestId("day-stream");
    const before = (await settledState(page, () => true, "the notebook never settled")).events[0].timing;
    const box = await event.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 0, x, y }] });
    await page.waitForTimeout(340);
    const beforeLock = await stream.evaluate((node) => node.scrollTop);
    /* This is deliberately a stationary second touch. There is no touchmove
       after it, so touchstart must terminate the existing owner itself. */
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 0, x, y }, { id: 1, x: x + 24, y }],
    });

    await expect(event, "a second touch must clear the rendered active state immediately").not.toHaveClass(/nb-timeline-lane-active/);
    const state = await settledState(page, (stored) => stored.events[0].timing.startLocal === before.startLocal, "a stationary second touch must not persist the Event");
    expect(state.events[0].timing).toEqual(before);
    const movedScroll = await stream.evaluate((node) => {
      node.scrollTop += 40;
      node.dispatchEvent(new Event("scroll"));
      return node.scrollTop;
    });
    expect(movedScroll, "the cancelled Event must release the Day stream lock").toBeGreaterThan(beforeLock);

    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await event.scrollIntoViewIfNeeded();
    const next = await event.boundingBox();
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 2, x: next.x + next.width / 2, y: next.y + next.height / 2 }] });
    await page.waitForTimeout(340);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 2, x: next.x + next.width / 2, y: next.y + next.height / 2 + HOUR_PX }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
    const moved = (await settledState(page, (stored) => stored.events[0].timing.startLocal === `${today}T11:00`, "the next touch interaction did not work after second-touch cancellation")).events[0].timing;
    expect(moved.endLocal).toBe(`${today}T13:00`);
  });

  test("a non-owner terminal touch cancels without committing the active Event", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const stream = page.getByTestId("day-stream");
    const before = (await settledState(page, () => true, "the notebook never settled")).events[0].timing;
    const box = await event.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      /* Chromium may emit a compatibility pointercancel when a second contact
         appears. Block that separate path so this CDP case proves the native
         touchend foreign-identifier cleanup on its own. */
      const block = (event) => event.stopImmediatePropagation();
      window.__blockTouchPointerCompatibility = block;
      window.addEventListener("pointercancel", block, true);
      window.addEventListener("pointerup", block, true);
    });

    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 0, x, y }] });
    await page.waitForTimeout(340);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 0, x, y: y + HOUR_PX }] });
    /* Keep the owner stationary in the protocol while ending only a foreign
       touch. This exercises the terminal identifier guard without a later
       move to accidentally make cancellation look successful. */
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 0, x, y: y + HOUR_PX }, { id: 1, x: x + 24, y: y + HOUR_PX }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [{ id: 1, x: x + 24, y: y + HOUR_PX }],
    });

    await expect(event, "a non-owner terminal touch must clear the rendered active state").not.toHaveClass(/nb-timeline-lane-active/);
    const state = await settledState(page, (stored) => stored.events[0].timing.startLocal === before.startLocal, "a non-owner end must not persist the active Event");
    expect(state.events[0].timing).toEqual(before);
    const beforeLock = await stream.evaluate((node) => node.scrollTop);
    const movedScroll = await stream.evaluate((node) => {
      node.scrollTop += 40;
      node.dispatchEvent(new Event("scroll"));
      return node.scrollTop;
    });
    expect(movedScroll, "the non-owner end must release the Day stream lock").toBeGreaterThan(beforeLock);

    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.evaluate(() => {
      window.removeEventListener("pointercancel", window.__blockTouchPointerCompatibility, true);
      window.removeEventListener("pointerup", window.__blockTouchPointerCompatibility, true);
    });
    await event.scrollIntoViewIfNeeded();
    const next = await event.boundingBox();
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 2, x: next.x + next.width / 2, y: next.y + next.height / 2 }] });
    await page.waitForTimeout(340);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 2, x: next.x + next.width / 2, y: next.y + next.height / 2 + HOUR_PX }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
    const moved = (await settledState(page, (stored) => stored.events[0].timing.startLocal === `${today}T11:00`, "the next touch interaction did not work after non-owner cancellation")).events[0].timing;
    expect(moved.endLocal).toBe(`${today}T13:00`);
  });
});

test.describe("stable Event edge and body touch ownership", () => {
  const minutesInto = (local) => {
    const [h, m] = local.split("T")[1].split(":").map(Number);
    return h * 60 + m;
  };
  const disjoint = (a, b, label) => {
    const separate = a.x + a.width <= b.x + 0.5
      || b.x + b.width <= a.x + 0.5
      || a.y + a.height <= b.y + 0.5
      || b.y + b.height <= a.y + 0.5;
    expect(separate, label).toBe(true);
  };
  const controlGeometry = async (locator) => {
    const box = await locator.boundingBox();
    expect(box, "a direct Event control has no measurable box").not.toBeNull();
    const style = await locator.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { touchAction: computed.touchAction, opacity: computed.opacity, visibility: computed.visibility };
    });
    return { box, style };
  };

  test("the Event body moves after lift without a special move plate", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    await expect(event.locator("[data-touch-move]"), "the readable Event body is the move owner").toHaveCount(0);
    const box = await event.boundingBox();
    expect(box, "the Event body is not measurable").not.toBeNull();
    const stream = page.getByTestId("day-stream");
    const beforeScroll = await stream.evaluate((node) => node.scrollTop);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await finger(page, { x, y, holdMs: 340, to: { x, y: y + HOUR_PX } });

    const timing = (await stored(page, (t) => t.startLocal !== `${today}T10:00`, "held Event body move never changed start")).events[0].timing;
    expect(timing.startLocal).toBe(`${today}T11:00`);
    expect(timing.endLocal, "an Event body move must preserve duration").toBe(`${today}T13:00`);
    expect(timing.startLocal.startsWith(`${today}T`) && timing.endLocal.startsWith(`${today}T`), "a same-Day body move must keep the date").toBe(true);
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "the Day stream moved under an active Event body move",
    }).toBe(beforeScroll);
    await expect(sheets(page), "an Event body move must not inspect the card").toHaveCount(0);
  });

  /* These waits characterize the product clock well beyond the 300ms lift.
     They are not synchronization delays: each sequence must remain a live move
     candidate however long the finger stays down after lift. */
  for (const holdMs of [600, 1000]) {
    test(`an Event body still moves after a ${holdMs}ms hold`, async ({ page }) => {
      await seedPlanner(page, seeded());
      const event = card(page);
      await event.scrollIntoViewIfNeeded();
      const title = event.locator("span[title]").first();
      const box = await title.boundingBox();
      expect(box, "the Event body is not measurable").not.toBeNull();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      await finger(page, { x, y, holdMs, to: { x, y: y + HOUR_PX } });

      const timing = (await stored(page, (value) => value.startLocal === `${today}T11:00`, `the Event body stopped moving after ${holdMs}ms`)).events[0].timing;
      expect(timing.startLocal).toBe(`${today}T11:00`);
      expect(timing.endLocal, "a long-held Event move must preserve duration").toBe(`${today}T13:00`);
      await expect(sheets(page), "a long-held Event move must not inspect").toHaveCount(0);
    });
  }

  test("a stationary 1000ms Event hold releases as inspect without writing", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const before = (await settledState(page, () => true, "the notebook never settled")).events[0].timing;
    const title = event.locator("span[title]").first();
    const box = await title.boundingBox();
    expect(box, "the Event body is not measurable").not.toBeNull();

    await finger(page, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      holdMs: 1000,
    });

    const after = (await settledState(page, () => true, "the notebook never settled after the stationary Event hold")).events[0].timing;
    expect(after, "a stationary Event hold must not write").toEqual(before);
    await expect(sheets(page), "a stationary Event hold must open its inspector on release").toHaveCount(1);
  });

  test("the Event start edge resizes after lift", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const start = event.locator('[data-touch-resize="start"]');
    const box = await start.boundingBox();
    expect(box, "the Event start control is not measurable").not.toBeNull();
    const stream = page.getByTestId("day-stream");
    const beforeScroll = await stream.evaluate((node) => node.scrollTop);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await finger(page, { x, y, holdMs: 340, to: { x, y: y + HOUR_PX } });

    const timing = (await stored(page, (t) => t.startLocal !== `${today}T10:00`, "held Event start resize never moved the start")).events[0].timing;
    expect(timing.endLocal, "resizing the start moved the end").toBe(`${today}T12:00`);
    expect(minutesInto(timing.startLocal), "the start did not follow the finger")
      .toBeGreaterThan(minutesInto(`${today}T10:00`));
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "the Day stream moved under an active Event start resize",
    }).toBe(beforeScroll);
  });

  test("the Event end edge resizes after lift", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const end = event.locator('[data-touch-resize="end"]');
    const box = await end.boundingBox();
    expect(box, "the Event end control is not measurable").not.toBeNull();
    const stream = page.getByTestId("day-stream");
    const beforeScroll = await stream.evaluate((node) => node.scrollTop);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await finger(page, { x, y, holdMs: 340, to: { x, y: y + HOUR_PX } });

    const timing = (await stored(page, (t) => t.endLocal !== `${today}T12:00`, "held Event end resize never moved the end")).events[0].timing;
    expect(timing.startLocal, "resizing the end moved the start").toBe(`${today}T10:00`);
    expect(minutesInto(timing.endLocal), "the end did not follow the finger")
      .toBeGreaterThan(minutesInto(`${today}T12:00`));
    await expect.poll(() => stream.evaluate((node) => node.scrollTop), {
      message: "the Day stream moved under an active Event end resize",
    }).toBe(beforeScroll);
  });

  test("a tap or 2px tremor on Event resize controls inspects without writing", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const before = (await settledState(page, () => true, "the notebook never settled")).events[0].timing;
    const controls = [
      ["start resize", event.locator('[data-touch-resize="start"]')],
      ["end resize", event.locator('[data-touch-resize="end"]')],
    ];

    for (const [label, locator] of controls) {
      expect(await locator.count(), `eligible Events need an explicit ${label} control`).toBe(1);
      const box = await locator.boundingBox();
      expect(box, `the Event ${label} control is not measurable`).not.toBeNull();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      await finger(page, { x, y });
      await expect(sheets(page), `a tap on the Event ${label} control must inspect`).toHaveCount(1);
      let state = await settledState(page, () => true, "the notebook never settled after a direct-control tap");
      expect(state.events[0].timing, `a tap on the Event ${label} control must not write`).toEqual(before);
      await closeAnySheet(page);

      await finger(page, { x, y, to: { x: x + 2, y }, steps: 2 });
      await expect(sheets(page), `a 2px tremor on the Event ${label} control must inspect`).toHaveCount(1);
      state = await settledState(page, () => true, "the notebook never settled after a direct-control tremor");
      expect(state.events[0].timing, `a 2px tremor on the Event ${label} control must not write`).toEqual(before);
      await closeAnySheet(page);
    }
  });

  test("a tap or 2px tremor on the Event body inspects without writing", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const before = (await settledState(page, () => true, "the notebook never settled")).events[0].timing;
    await expect(event.locator("[data-touch-move]"), "the body must not be fragmented by a move plate").toHaveCount(0);
    const box = await event.boundingBox();
    expect(box, "the Event body is not measurable").not.toBeNull();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await finger(page, { x, y });
    await expect(sheets(page), "a tap on the Event body must inspect").toHaveCount(1);
    let state = await settledState(page, () => true, "the notebook never settled after a body tap");
    expect(state.events[0].timing, "a tap on the Event body must not write").toEqual(before);
    await closeAnySheet(page);

    await finger(page, { x, y, to: { x: x + 2, y }, steps: 2 });
    await expect(sheets(page), "a 2px tremor on the Event body must inspect").toHaveCount(1);
    state = await settledState(page, () => true, "the notebook never settled after a body tremor");
    expect(state.events[0].timing, "a 2px tremor on the Event body must not write").toEqual(before);
  });

  test("the Event card remains keyboard and click inspectable", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page).getByRole("button", { name: "Standup" });
    await event.focus();
    await page.keyboard.press("Enter");
    await expect(sheets(page), "keyboard activation must inspect the Event").toHaveCount(1);
    await closeAnySheet(page);
    await event.click();
    await expect(sheets(page), "mouse activation must inspect the Event").toHaveCount(1);
  });

  test("pre-lift touch scrolling from Event body physically moves the Day without writing or inspecting", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const stream = page.getByTestId("day-stream");
    const beforeScroll = await stream.evaluate((node) => node.scrollTop);
    const before = (await settledState(page, () => true, "the notebook never settled")).events[0].timing;
    const title = event.locator("span[title]").first();
    const box = await title.boundingBox();
    expect(box, "the Event title is not measurable").not.toBeNull();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const ownership = await page.evaluate(({ x: px, y: py }) => {
      const hit = document.elementFromPoint(px, py);
      return {
        event: hit?.closest?.("[data-event-id]")?.getAttribute("data-event-id") ?? null,
        move: hit?.closest?.("[data-touch-move]") != null,
        resize: hit?.closest?.("[data-touch-resize]")?.getAttribute("data-touch-resize") ?? null,
        join: hit?.closest?.("[data-join], a[href]") != null,
      };
    }, { x, y });
    expect(ownership.event).toBe("evt-standup");
    expect(ownership.move, "body-scroll coverage must start outside the explicit move control").toBe(false);
    expect(ownership.resize, "body-scroll coverage must start outside resize").toBeNull();
    expect(ownership.join).toBe(false);

    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    /* This is deliberately inside the 300ms lift window. It characterizes the
       product clock; the movement below, not this delay, synchronizes the test. */
    await page.waitForTimeout(150);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 80 }] });
    await expect.poll(() => stream.evaluate((node, initial) => Math.abs(node.scrollTop - initial), beforeScroll), {
      message: "vertical Event body touch should physically scroll the Day timeline",
    }).toBeGreaterThan(1);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 150 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();

    const after = (await settledState(page, () => true, "the notebook never settled after Event body scroll")).events[0].timing;
    expect(after, "scrolling from Event body must not write the Event").toEqual(before);
    await expect(sheets(page), "scrolling from Event body must not inspect it").toHaveCount(0);
  });

  test("touch-start scroll authorization expires after the touch sequence", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const title = event.locator("span[title]").first();
    const box = await title.boundingBox();
    expect(box, "the Event body is not measurable").not.toBeNull();

    await finger(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect(sheets(page), "the control touch sequence must finish as a tap").toHaveCount(1);
    await closeAnySheet(page);
    const chrome = page.getByTestId("timeline-chrome");
    const stream = page.getByTestId("day-stream");
    await expect(chrome).toHaveAttribute("data-collapsed", "false");

    /* Layout code can move the stream without user intent. Once touchend has
       closed the authorization window, that later scroll must not impersonate
       the old finger and collapse the Timeline chrome. */
    await stream.evaluate((node) => {
      node.scrollTop += 120;
      node.dispatchEvent(new Event("scroll"));
    });
    await expect(chrome, "a completed touch sequence left scroll authorization live")
      .toHaveAttribute("data-collapsed", "false");
  });

  test("Event mouse edges stay full-width while touch cues stay local and leave JOIN authoritative", async ({ page }) => {
    await seedPlanner(page, linkedSeeded());
    const event = page.locator('[data-event-id="evt-linked"]');
    await event.scrollIntoViewIfNeeded();
    const start = event.locator('[data-touch-resize="start"]');
    const end = event.locator('[data-touch-resize="end"]');
    const desktopStart = event.locator('[data-resize-edge="start"]:not([data-touch-resize])');
    const desktopEnd = event.locator('[data-resize-edge="end"]:not([data-touch-resize])');
    const join = event.getByRole("link", { name: "Join Linked planning session" });
    await expect(start).toHaveCount(1);
    await expect(end).toHaveCount(1);
    await expect(join).toBeVisible();

    const [startGeom, endGeom] = await Promise.all([controlGeometry(start), controlGeometry(end)]);
    const [desktopStartBox, desktopEndBox, eventBox] = await Promise.all([
      desktopStart.boundingBox(), desktopEnd.boundingBox(), event.boundingBox(),
    ]);
    const joinBox = await join.boundingBox();
    expect(eventBox, "the Event has no measurable box").not.toBeNull();
    expect(desktopStartBox, "the desktop start edge has no measurable box").not.toBeNull();
    expect(desktopEndBox, "the desktop end edge has no measurable box").not.toBeNull();
    expect(joinBox, "JOIN has no measurable box").not.toBeNull();
    expect(desktopStartBox.width, "desktop start resize must span the Event").toBeGreaterThan(eventBox.width - 2);
    expect(desktopEndBox.width, "desktop end resize must span the Event").toBeGreaterThan(eventBox.width - 2);

    for (const [label, geom] of [["start resize", startGeom], ["end resize", endGeom]]) {
      expect(geom.box.width, `the Event ${label} touch cue must stay local`).toBeLessThanOrEqual(44);
      expect(geom.box.height, `the Event ${label} edge must leave a body move lane`).toBeLessThanOrEqual(12);
      expect(geom.style.visibility).not.toBe("hidden");
      expect(geom.style.opacity, `the Event ${label} cue must not be transparent`).not.toBe("0");
      expect(geom.style.touchAction, `the Event ${label} edge must permit vertical scroll before lift`).toMatch(/pan-y|auto|manipulation/);
    }

    disjoint(startGeom.box, endGeom.box, "Event start resize overlaps end resize");

    const hits = await page.evaluate((points) => points.map(([label, x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return {
        label,
        resize: hit?.closest?.("[data-touch-resize]")?.getAttribute("data-touch-resize") ?? null,
        join: hit?.closest?.("[data-join], a[href]") != null,
      };
    }), [
      ["start", startGeom.box.x + startGeom.box.width / 2, startGeom.box.y + startGeom.box.height / 2],
      ["end", endGeom.box.x + endGeom.box.width / 2, endGeom.box.y + endGeom.box.height / 2],
      ["join", joinBox.x + joinBox.width / 2, joinBox.y + joinBox.height / 2],
    ]);
    const byLabel = Object.fromEntries(hits.map((hit) => [hit.label, hit]));
    expect(byLabel.start.resize).toBe("start");
    expect(byLabel.start.join).toBe(false);
    expect(byLabel.end.resize).toBe("end");
    expect(byLabel.end.join).toBe(false);
    expect(byLabel.join.join, "JOIN center must remain JOIN-owned").toBe(true);
    expect(byLabel.join.resize).toBeNull();
  });

  test("Event body ownership is continuous between the two resize edges", async ({ page }) => {
    await seedPlanner(page, linkedSeeded());
    const event = page.locator('[data-event-id="evt-linked"]');
    await event.scrollIntoViewIfNeeded();
    const start = event.locator('[data-touch-resize="start"]');
    const end = event.locator('[data-touch-resize="end"]');
    const join = event.getByRole("link", { name: "Join Linked planning session" });
    await expect(event.locator("[data-touch-move]"), "the Event body must not be fragmented by a move plate").toHaveCount(0);
    await expect(start).toHaveCount(1);
    await expect(end).toHaveCount(1);
    await expect(join).toBeVisible();
    const [startGeom, endGeom] = await Promise.all([controlGeometry(start), controlGeometry(end)]);
    const joinBox = await join.boundingBox();
    expect(joinBox, "JOIN has no measurable box").not.toBeNull();
    const eventBox = await event.boundingBox();
    const points = await page.evaluate(({ box, joinLeft }) => [0.3, 0.55, 0.75].map((fraction) => {
      const node = document.elementFromPoint(box.x + Math.min(box.width * fraction, joinLeft - box.x - 8), box.y + box.height / 2);
      return {
        event: node?.closest?.("[data-event-id]")?.getAttribute("data-event-id") ?? null,
        move: node?.closest?.("[data-touch-move]") != null,
        resize: node?.closest?.("[data-touch-resize]")?.getAttribute("data-touch-resize") ?? null,
        join: node?.closest?.("[data-join], a[href]") != null,
      };
    }), { box: eventBox, joinLeft: joinBox.x });
    for (const point of points) {
      expect(point.event).toBe("evt-linked");
      expect(point.move).toBe(false);
      expect(point.resize).toBeNull();
      expect(point.join).toBe(false);
    }
  });
});

test.describe("short Event body touch ownership", () => {
  for (const durationMinutes of [10, 15, 16, 20, 23, 30]) {
    test(`a ${durationMinutes}-minute Event keeps a body move surface between its resize cues`, async ({ page }) => {
      await seedPlanner(page, shortEvent(durationMinutes));
      const event = page.locator(`[data-event-id="evt-short-${durationMinutes}"]`);
      await event.scrollIntoViewIfNeeded();
      const before = (await settledState(page, () => true, "the short Event never settled")).events[0].timing;
      const eventBox = await event.boundingBox();
      expect(eventBox, "the short Event is not measurable").not.toBeNull();
      const point = { x: eventBox.x + eventBox.width / 2, y: eventBox.y + eventBox.height / 2 };
      const ownership = await page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return {
          event: hit?.closest?.("[data-event-id]")?.getAttribute("data-event-id") ?? null,
          resize: hit?.closest?.("[data-touch-resize]")?.getAttribute("data-touch-resize") ?? null,
        };
      }, point);
      expect(ownership.event).toBe(`evt-short-${durationMinutes}`);

      await finger(page, { x: point.x, y: point.y, holdMs: 340, to: { x: point.x, y: point.y + HOUR_PX } });

      const state = await settledState(page, () => true, `the ${durationMinutes}-minute Event never settled after its body gesture`);
      const timing = state.events[0].timing;
      expect.soft(ownership.resize, "the short Event center must be body-owned, not a resize edge").toBeNull();
      expect.soft(timing.startLocal, "the short Event center must persist a body move").toBe(`${today}T11:00`);
      const beforeDuration = localDateTimeToEpochMinutes(before.endLocal) - localDateTimeToEpochMinutes(before.startLocal);
      const afterDuration = localDateTimeToEpochMinutes(timing.endLocal) - localDateTimeToEpochMinutes(timing.startLocal);
      expect.soft(afterDuration, "a short Event body move must preserve duration").toBe(beforeDuration);
    });
  }
});

test.describe("long-held Action body touch", () => {
  /* As above, 600ms and 1000ms are intentional product-clock dwell times, not
     waits for the page to become ready. */
  for (const holdMs of [600, 1000]) {
    test(`a scheduled Action body still moves after a ${holdMs}ms hold`, async ({ page }) => {
      await seedPlanner(page, scheduledAction({ id: `task-hold-${holdMs}` }));
      const action = page.locator(`[data-task-chip="task-hold-${holdMs}"]`);
      await action.scrollIntoViewIfNeeded();
      const title = action.locator(".nb-lead").first();
      const box = await title.boundingBox();
      expect(box, "the Action body is not measurable").not.toBeNull();
      const before = (await settledState(page, () => true, "the Action never settled")).tasks[0].planned;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      await finger(page, { x, y, holdMs, to: { x, y: y + HOUR_PX } });

      const state = await settledState(page, (stored) => stored.tasks[0].planned.startMinute === 11 * 60, `the Action body stopped moving after ${holdMs}ms`);
      expect(state.tasks[0].planned.startMinute).toBe(11 * 60);
      expect(state.tasks[0].planned.date, "a long-held Action move must preserve date").toBe(before.date);
      expect(state.tasks[0].planned.estimateMinutes, "a long-held Action move must preserve estimate").toBe(before.estimateMinutes);
      await expect(sheets(page), "a long-held Action move must not inspect").toHaveCount(0);
    });
  }

  test("a stationary 1000ms Action hold releases as inspect without writing", async ({ page }) => {
    await seedPlanner(page, scheduledAction({ id: "task-stationary-long", title: "Inspect the brief" }));
    const action = page.locator('[data-task-chip="task-stationary-long"]');
    await action.scrollIntoViewIfNeeded();
    const title = action.locator(".nb-lead").first();
    const box = await title.boundingBox();
    expect(box, "the Action body is not measurable").not.toBeNull();
    const before = (await settledState(page, () => true, "the Action never settled")).tasks[0].planned;

    await finger(page, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      holdMs: 1000,
    });

    const after = (await settledState(page, () => true, "the notebook never settled after the stationary Action hold")).tasks[0].planned;
    expect(after, "a stationary Action hold must not write").toEqual(before);
    await expect(sheets(page), "a stationary Action hold must open its inspector on release").toHaveCount(1);
  });
});

test.describe("cross-surface Action touch ownership", () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: true, isMobile: false });

  test("a held Action can reorder over a sibling without becoming an inspector tap", async ({ page }) => {
    await seedPlanner(page, scheduledActionsForReorder());
    const column = page.getByTestId("actions-column");
    if (!(await column.isVisible())) await page.getByTestId("actions-restore").click();
    await expect(column).toBeVisible();

    const source = page.locator('[data-task-chip="task-reorder-a"]');
    const target = column.locator('[data-task="task-reorder-b"]');
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const sourceBox = await source.boundingBox();
    let targetBox = await target.boundingBox();
    expect(sourceBox, "the scheduled Action is not measurable").not.toBeNull();
    expect(targetBox, "the reorder target is not measurable").not.toBeNull();
    const sourcePoint = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };

    await column.evaluate((node, delta) => { node.scrollTop += delta; }, targetBox.y + targetBox.height / 2 - sourcePoint.y);
    targetBox = await target.boundingBox();
    expect(sourcePoint.y, "the target could not be aligned with an unchanged-time horizontal drop").toBeGreaterThan(targetBox.y + 2);
    expect(sourcePoint.y, "the target could not be aligned with an unchanged-time horizontal drop").toBeLessThan(targetBox.y + targetBox.height - 2);

    const before = await settledState(page, () => true, "the reorder fixture never settled");
    const beforeAction = before.tasks.find((task) => task.id === "task-reorder-a");
    await finger(page, {
      x: sourcePoint.x,
      y: sourcePoint.y,
      holdMs: 340,
      to: { x: targetBox.x + targetBox.width / 2, y: sourcePoint.y },
    });

    const after = await settledState(
      page,
      (state) => state.tasks.find((task) => task.id === "task-reorder-a").rank
        > state.tasks.find((task) => task.id === "task-reorder-b").rank,
      "the held Action never reordered over its sibling",
    );
    const moved = after.tasks.find((task) => task.id === "task-reorder-a");
    expect(moved.planned, "reordering must not reschedule the Action").toEqual(beforeAction.planned);
    await expect(sheets(page), "a semantic reorder must not become an inspector tap").toHaveCount(0);
  });
});

test.describe("the Event body remains desktop-draggable", () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

  test("a mouse drag from the Event body still moves the Event", async ({ page }) => {
    await seedPlanner(page, seeded());
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const box = await event.boundingBox();
    expect(box, "the Event body is not measurable for mouse drag").not.toBeNull();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + HOUR_PX, { steps: 5 });
    await page.mouse.up();

    const timing = (await stored(page, (t) => t.startLocal !== `${today}T10:00`, "mouse drag from the Event body did not change start")).events[0].timing;
    expect(timing.startLocal).toBe(`${today}T11:00`);
    expect(timing.endLocal).toBe(`${today}T13:00`);
  });
});

test.describe("the visible Action estimate owns a direct resize on touch", () => {
  test("compact Actions keep one body lane beside the 48px estimate owner", async ({ page }) => {
    for (const height of [844, 601]) {
      await page.setViewportSize({ width: 390, height });
      await seedPlanner(page, compactAction());
      const lane = page.getByTestId("timeline-action-lane");
      const estimate = page.getByTestId("timeline-action-resize");
      await expect(page.getByTestId("timeline-action-move"), "a compact Action must not fragment movement into a small plate").toHaveCount(0);
      await expect(estimate).toHaveCount(1);
      await estimate.scrollIntoViewIfNeeded();
    const [laneBox, estimateBox] = await Promise.all([lane.boundingBox(), estimate.boundingBox()]);
    expect(laneBox, "the compact Action lane is not measurable").not.toBeNull();
    expect(laneBox.height, "the compact Action outer lane must stay at its 44px layout minimum").toBeCloseTo(44, 0);
    expect(estimateBox, "the compact Action estimate control is not measurable").not.toBeNull();
    expect(estimateBox.width, "compact Action estimate control must retain its 48px lane").toBe(48);
    expect(estimateBox.height, "compact Action estimate control must be at least 44px tall").toBeGreaterThanOrEqual(44);
    const ownership = await lane.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const body = document.elementFromPoint(box.left + box.width * 0.55, box.top + box.height / 2);
      const estimate = document.elementFromPoint(box.right - 8, box.top + box.height / 2);
      return {
        body: {
          action: body?.closest?.("[data-task-chip]") != null,
          estimate: body?.closest?.("[data-action-estimate]") != null,
          move: body?.closest?.("[data-touch-move]") != null,
        },
        estimate: estimate?.closest?.("[data-action-estimate]") != null,
      };
    });
    expect(ownership.body.action).toBe(true);
    expect(ownership.body.estimate).toBe(false);
    expect(ownership.body.move).toBe(false);
    expect(ownership.estimate).toBe(true);
    }
  });

  test("a short Action resizes from its estimate without waiting for a long press", async ({ page }) => {
    await seedPlanner(page, compactAction());
    const estimate = page.getByTestId("timeline-action-resize");
    await estimate.scrollIntoViewIfNeeded();
    const box = await estimate.boundingBox();
    const before = await settledState(page, () => true, "the notebook never settled");

    await finger(page, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      to: { x: box.x + box.width / 2, y: box.y + box.height / 2 + HOUR_PX },
    });

    const after = await settledState(page, (state) => state.tasks[0].planned.estimateMinutes !== before.tasks[0].planned.estimateMinutes, "the estimate did not resize directly");
    expect(after.tasks[0].planned.startMinute).toBe(before.tasks[0].planned.startMinute);
  });
});

test.describe("nothing floats over the day that has no reason to", () => {
  /* The nudge is deliberately rare: it wants a notebook with something in it. */
  function heavy() {
    let state = createBlankPlannerState({});
    for (let i = 0; i < 6; i += 1) {
      state = createEvent(state, {
        calendarId: "calendar-default", title: `Standup ${i}`, category: "PEOPLE",
        timing: {
          kind: "timed", timeZoneMode: "floating",
          startLocal: `${today}T${String(8 + i).padStart(2, "0")}:00`,
          endLocal: `${today}T${String(8 + i).padStart(2, "0")}:30`,
        },
      }, { id: `evt-${i}` }).state;
    }
    return state;
  }

  test("the backup nudge sits in the page rather than across the timeline", async ({ page }) => {
    await seedPlanner(page, heavy());
    const nudge = page.getByTestId("backup-nudge");
    await expect(nudge, "the nudge never appeared, so this proves nothing").toHaveCount(1);
    const floating = await nudge.evaluate((node) => {
      for (let n = node; n && n !== document.body; n = n.parentElement) {
        const position = getComputedStyle(n).position;
        if (position === "fixed" || position === "sticky") return position;
      }
      return "in the page";
    });
    expect(floating, "the nudge is floating over the content again").toBe("in the page");

    /* And the timeline is reachable everywhere it is drawn. */
    const stream = page.getByTestId("day-stream");
    const box = await stream.boundingBox();
    for (const fraction of [0.2, 0.5, 0.8, 0.95]) {
      const owner = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el && el.closest('[data-test="day-stream"]') ? "the day" : "something over the day";
      }, [box.x + box.width * 0.6, box.y + box.height * fraction]);
      expect(owner, `something covers the timeline ${Math.round(fraction * 100)}% of the way down`).toBe("the day");
    }
  });
});
