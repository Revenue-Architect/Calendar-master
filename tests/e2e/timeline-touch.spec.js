import { expect, test } from "@playwright/test";
import { seedPlanner, settledState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { createTask } from "../../src/domains/tasks/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

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

function compactAction() {
  const state = createBlankPlannerState({});
  const planned = createTask(state.tasks, {
    id: "task-touch-compact", title: "Resize me directly",
    planned: { date: today, startMinute: 10 * 60, estimateMinutes: 15 },
  });
  return { ...state, tasks: planned.tasks };
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

  test("a held upper-card touch outside the centered grip moves the Event", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card(page).boundingBox();
    const session = await page.context().newCDPSession(page);
    const x = box.x + 12;
    const y = box.y + 4;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(340);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + HOUR_PX }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();

    const timing = (await settledState(page, (state) => state.events[0].timing.startLocal !== `${today}T10:00`, "the upper body touch did not move the Event")).events[0].timing;
    expect(timing.startLocal).toBe(`${today}T11:00`);
    expect(timing.endLocal, "an upper body move must preserve duration").toBe(`${today}T13:00`);
  });

  test("a held lower-card touch outside the centered grip moves the Event", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card(page).boundingBox();
    const session = await page.context().newCDPSession(page);
    const x = box.x + 12;
    const y = box.y + box.height - 4;
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
    const boxes = await Promise.all([start.boundingBox(), end.boundingBox()]);
    expect(boxes[0].y + boxes[0].height).toBeLessThanOrEqual(boxes[1].y);
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

test.describe("the visible Action estimate owns a direct resize on touch", () => {
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
