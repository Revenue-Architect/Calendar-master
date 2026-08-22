import { expect, test } from "@playwright/test";
import { seedPlanner, settledState, storedState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

/* The three things you do to an event on the day timeline: move it, resize it,
 * and join it. None of them had a test, which is how all three could vanish from
 * a build without anything going red — the code was simply not there any more,
 * and every remaining test still passed.
 *
 * These assert the *stored record*, not the pixels: a gesture that animates
 * beautifully and writes nothing is the failure being guarded against. */

const today = keyOf(new Date());
const LINK = "https://meet.example.com/abc-defg";
const HOUR_PX = 68;

function seeded({ link = null, startLocal = `${today}T10:00`, endLocal = `${today}T11:00` } = {}) {
  return createEvent(createBlankPlannerState({}), {
    calendarId: "calendar-default", title: "Standup", category: "PEOPLE",
    ...(link ? { link } : {}),
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal, endLocal,
    },
  }, { id: "evt-standup" }).state;
}

const timing = async (page, predicate, message) =>
  (await settledState(page, (s) => predicate(s.events[0].timing), message)).events[0].timing;

const card = (page) => page.locator('[data-event-id="evt-standup"]');

async function touchAt(session, type, x, y) {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: .5 }],
  });
}

test.describe("empty timeline touch intent", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("resting after a slow scroll cannot mature into a new event", async ({ page }) => {
    await seedPlanner(page, createBlankPlannerState({}));
    const stream = page.getByTestId("day-stream");
    const box = await stream.boundingBox();
    const x = box.x + 90;
    const y = box.y + Math.min(180, box.height / 2);
    const session = await page.context().newCDPSession(page);

    await touchAt(session, "touchStart", x, y);
    await stream.evaluate((node) => {
      node.scrollTop += 6; /* below the old 12 px touch-movement cancellation */
      node.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(720);
    await touchAt(session, "touchEnd", x, y);
    await session.detach();

    await expect(page.getByTestId("sheet"), "scrolling must cancel creation for the whole touch sequence").toHaveCount(0);
  });

  test("a stationary empty hold still creates after the safer delay", async ({ page }) => {
    await seedPlanner(page, createBlankPlannerState({}));
    const box = await page.getByTestId("day-stream").boundingBox();
    const x = box.x + 90;
    const y = box.y + Math.min(180, box.height / 2);
    const session = await page.context().newCDPSession(page);

    await touchAt(session, "touchStart", x, y);
    await page.waitForTimeout(540);
    await touchAt(session, "touchEnd", x, y);
    await session.detach();

    await expect(page.getByTestId("sheet")).toBeVisible();
    await expect(page.getByTestId("sheet").getByRole("tab", { name: "EVENT", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("timeline-draft-preview"), "the placement preview should remain under the composer").toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("timeline-draft-preview")).toBeHidden();
  });
});

test("a stationary desktop draft release aborts cleanly", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await seedPlanner(page, createBlankPlannerState({}));
  const stream = page.getByTestId("day-stream");
  const box = await stream.boundingBox();
  const x = box.x + 90;
  const y = box.y + Math.min(180, box.height / 2);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(360);
  await page.mouse.up();

  await expect(page.getByTestId("sheet"), "an unchanged empty draft should be aborted").toHaveCount(0);
  expect(pageErrors, "canvas release must not throw while aborting an unchanged draft").toEqual([]);
});

test.describe("moving an event on the timeline", () => {
  test("an immediate desktop drag moves it to the hour it was dropped on", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const box = await card(page).boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + HOUR_PX * 2, { steps: 15 });
    await page.mouse.up();

    const moved = await timing(page, (t) => t.startLocal.endsWith("12:00"), "the drag never moved the event");
    expect(moved.startLocal).toBe(`${today}T12:00`);
    /* Moving is not resizing: the hour it lasts is the hour it lasted. */
    expect(moved.endLocal).toBe(`${today}T13:00`);
  });

  test("an immediate desktop drag from a semantic touch grip still moves an eligible Event", async ({ page }) => {
    await seedPlanner(page, seeded({ startLocal: `${today}T10:00`, endLocal: `${today}T12:00` }));
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const grip = event.locator('[data-touch-resize="end"]');
    await expect(grip, "the eligible Event is missing its semantic touch grip").toHaveCount(1);
    const box = await grip.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + HOUR_PX, { steps: 12 });
    await page.mouse.up();

    const moved = await timing(page, (t) => t.startLocal.endsWith("11:00"), "a mouse drag from the semantic grip did not move the Event");
    expect(moved.endLocal, "a desktop move must preserve the eligible Event duration").toBe(`${today}T13:00`);
  });

  test("a stationary desktop Event hold stays a click candidate", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const event = card(page);
    const box = await event.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const before = (await storedState(page)).events[0].timing;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(360);
    await expect(event, "a stationary mouse press must not auto-lift an Event").not.toHaveClass(/nb-timeline-lane-active/);
    await page.mouse.up();

    const after = await settledState(page, (state) => state.events.length === 1);
    expect(after.events[0].timing).toEqual(before);
    await expect(page.getByTestId("sheet"), "a stationary Event release remains a click").toBeVisible();
  });

  test("pointer cancellation leaves an active Event unchanged", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const box = await card(page).boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const before = (await storedState(page)).events[0].timing;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + HOUR_PX, { steps: 4 });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
    })));
    await page.mouse.up();

    const after = (await settledState(page, (state) => state.events.length === 1)).events[0].timing;
    expect(after, "pointer cancellation must not persist an Event move").toEqual(before);
    await expect(page.getByTestId("sheet")).toHaveCount(0);

    const nextCard = card(page);
    await nextCard.scrollIntoViewIfNeeded();
    const next = await nextCard.boundingBox();
    await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
    await page.mouse.down();
    await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2 + HOUR_PX, { steps: 8 });
    await page.mouse.up();
    const recovered = await settledState(page, (state) => state.events[0].timing.startLocal === `${today}T11:00`, "the next Event drag did not recover after cancellation");
    expect(recovered.events[0].timing.startLocal).toBe(`${today}T11:00`);
  });

  test("a tiny desktop tremor remains a click and opens the inspector", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const box = await card(page).boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1);
    await page.mouse.up();
    await expect(page.getByTestId("sheet")).toBeVisible();
    const still = (await settledState(page, (s) => s.events.length === 1)).events[0].timing;
    expect(still.startLocal).toBe(`${today}T10:00`);
  });

  test.describe("touch ownership", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("touch scrolling from an Event does not reschedule or inspect it", async ({ page }) => {
      await seedPlanner(page, seeded());
      const event = card(page);
      await event.scrollIntoViewIfNeeded();
      const stream = page.getByTestId("day-stream");
      const beforeScroll = await stream.evaluate((node) => node.scrollTop);
      const before = (await storedState(page)).events[0].timing;
      const box = await event.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const session = await page.context().newCDPSession(page);

      await touchAt(session, "touchStart", x, y);
      await touchAt(session, "touchMove", x, y + 80);
      await expect.poll(() => stream.evaluate((node, initial) => Math.abs(node.scrollTop - initial), beforeScroll), {
        message: "vertical Event touch should physically scroll the Day timeline",
      }).toBeGreaterThan(1);
      await touchAt(session, "touchMove", x, y + 150);
      await touchAt(session, "touchEnd", x, y + 150);
      await session.detach();

      const after = (await settledState(page, (state) => state.events.length === 1)).events[0].timing;
      expect(after, "scrolling from an Event must not write its timing").toEqual(before);
      await expect(page.getByTestId("sheet"), "scrolling from an Event must not inspect it").toHaveCount(0);
    });

    test("a held touch Event moves after the lift threshold", async ({ page }) => {
      await seedPlanner(page, seeded());
      const event = card(page);
      await event.scrollIntoViewIfNeeded();
      const box = await event.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const session = await page.context().newCDPSession(page);

      await touchAt(session, "touchStart", x, y);
      await page.waitForTimeout(340);
      await touchAt(session, "touchMove", x, y + HOUR_PX * 2);
      await touchAt(session, "touchEnd", x, y + HOUR_PX * 2);
      await session.detach();

      const moved = await timing(page, (value) => value.startLocal.endsWith("12:00"), "the held touch Event did not move");
      expect(moved.endLocal).toBe(`${today}T13:00`);
    });
  });

  test("opening an event detaches it from the pointer so a later click cannot reschedule it", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const box = await card(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId("sheet")).toBeVisible();
    const before = (await storedState(page)).events[0].timing;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + HOUR_PX * 3, { steps: 12 });
    await page.getByTestId("sheet").click({ position: { x: 24, y: 24 } });
    const after = (await storedState(page)).events[0].timing;
    expect(after, "a click inside the open event must not write a new time").toEqual(before);
  });

  test("a lift that never moved still opens the event instead of leaving a live drag", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const box = await card(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(360);
    await page.mouse.up();
    await expect(page.getByTestId("sheet")).toBeVisible();
    const before = (await storedState(page)).events[0].timing;
    await page.mouse.move(box.x + box.width / 2, box.y + HOUR_PX * 3, { steps: 10 });
    await page.mouse.click(20, 20);
    const after = (await storedState(page)).events[0].timing;
    expect(after.startLocal, "releasing an unmoved lift must not leave a drag that writes later").toBe(before.startLocal);
  });
});

test.describe("resizing an event on the timeline", () => {
  test("dragging the bottom edge changes how long it lasts, not when it starts", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const handle = page.locator('[data-resize-edge="end"]').first();
    await expect(handle, "the resize handle is missing from the card").toBeVisible();

    const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + HOUR_PX, { steps: 12 });
    await page.mouse.up();

    const grown = await timing(page, (t) => !t.endLocal.endsWith("11:00"), "the resize never changed the duration");
    expect(grown.startLocal, "resizing must not move the start").toBe(`${today}T10:00`);
    const minutes = (v) => Number(v.slice(11, 13)) * 60 + Number(v.slice(14, 16));
    expect(minutes(grown.endLocal) - minutes(grown.startLocal)).toBeGreaterThan(60);
  });

  test("it can be shortened as well as lengthened", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const hb = await page.locator('[data-resize-edge="end"]').first().boundingBox();

    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y - HOUR_PX / 2, { steps: 12 });
    await page.mouse.up();

    const shrunk = await timing(page, (t) => !t.endLocal.endsWith("11:00"), "the resize never shortened it");
    const minutes = (v) => Number(v.slice(11, 13)) * 60 + Number(v.slice(14, 16));
    expect(minutes(shrunk.endLocal) - minutes(shrunk.startLocal)).toBeLessThan(60);
    expect(minutes(shrunk.endLocal) - minutes(shrunk.startLocal)).toBeGreaterThan(0);
  });
});

test.describe("resizing from the top edge", () => {
  /* The other half of the gesture. Without it, "this actually started earlier"
     took two moves — drag the block up, then drag its bottom back down — and the
     second one undid the first. */
  test("dragging the top edge changes when it starts, and keeps the end exactly", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const handle = page.locator('[data-resize-edge="start"]').first();
    await expect(handle, "the top resize handle is missing from the card").toBeVisible();

    const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y - HOUR_PX / 2, { steps: 12 });
    await page.mouse.up();

    const grown = await timing(page, (t) => !t.startLocal.endsWith("10:00"), "the top edge never moved the start");
    expect(grown.startLocal < `${today}T10:00`, "the start should have moved earlier").toBe(true);
    /* The whole point: the end is the thing being held still. */
    expect(grown.endLocal, "resizing from the top must not move the end").toBe(`${today}T11:00`);
  });

  test("the top of a card is still somewhere you can pick it up", async ({ page }) => {
    /* A full-width grab zone across the top of a card sits exactly on its title,
       which is the most natural place to take hold of it — so the gesture that
       means "move this" would have silently meant "start it earlier". */
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const box = await card(page).boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + 14);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 14 + HOUR_PX, { steps: 15 });
    await page.mouse.up();

    const moved = await timing(page, (t) => t.startLocal.endsWith("11:00"), "pressing near the title resized instead of moving");
    expect(moved.endLocal, "a move keeps the length").toBe(`${today}T12:00`);
  });
});

test.describe("touch Event resize", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a held touch on the bottom edge extends an Event without moving its start", async ({ page }) => {
    await seedPlanner(page, seeded({ startLocal: `${today}T10:00`, endLocal: `${today}T12:00` }));
    const event = card(page);
    await event.scrollIntoViewIfNeeded();
    const handle = event.locator('[data-touch-resize="end"]');
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);

    await touchAt(session, "touchStart", x, y);
    await page.waitForTimeout(340);
    await touchAt(session, "touchMove", x, y + HOUR_PX);
    await touchAt(session, "touchEnd", x, y + HOUR_PX);
    await session.detach();

    const resized = await timing(page, (value) => !value.endLocal.endsWith("11:00"), "the held touch Event resize did not change duration");
    expect(resized.startLocal).toBe(`${today}T10:00`);
    expect(resized.endLocal > `${today}T11:00`).toBe(true);
  });
});

test.describe("joining from the timeline", () => {
  test("JOIN opens the meeting instead of the event", async ({ page }) => {
    await seedPlanner(page, seeded({ link: LINK }));
    await card(page).scrollIntoViewIfNeeded();

    const join = card(page).locator(`a[href="${LINK}"]`);
    await expect(join, "the timeline card has no JOIN").toBeVisible();
    await expect(join).toHaveAttribute("target", "_blank");
    await expect(join).toHaveAttribute("rel", "noopener noreferrer");

    await join.click();
    await page.waitForTimeout(600);
    /* The whole point: the link is the action, not a way into the record. */
    await expect(page.getByTestId("sheet"), "JOIN opened the detail sheet").toHaveCount(0);
  });

  test("the card still opens the event everywhere that is not JOIN", async ({ page }) => {
    await seedPlanner(page, seeded({ link: LINK }));
    await card(page).scrollIntoViewIfNeeded();

    await card(page).getByText("Standup").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("textbox").first()).toHaveValue("Standup");
  });

  test("an event with no link shows no JOIN on the timeline", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    await expect(card(page).locator("a[href^='https']")).toHaveCount(0);
  });
});

test.describe("joining from the mobile timeline", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a touch on JOIN follows the meeting without opening the event sheet", async ({ page }) => {
    await seedPlanner(page, seeded({ link: LINK }));
    await card(page).scrollIntoViewIfNeeded();

    const join = card(page).locator(`a[href="${LINK}"]`);
    await expect(join).toBeVisible();
    const box = await join.boundingBox();
    const session = await page.context().newCDPSession(page);

    await touchAt(session, "touchStart", box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(80);
    await touchAt(session, "touchEnd", box.x + box.width / 2, box.y + box.height / 2);
    await session.detach();

    await page.waitForTimeout(350);
    await expect(page.getByTestId("sheet"), "a mobile JOIN tap opened the event sheet").toHaveCount(0);
  });
});
