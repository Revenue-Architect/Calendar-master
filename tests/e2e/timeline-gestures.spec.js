import { expect, test } from "@playwright/test";
import { seedPlanner, settledState } from "./helpers.js";
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

function seeded({ link = null } = {}) {
  return createEvent(createBlankPlannerState({}), {
    calendarId: "calendar-default", title: "Standup", category: "PEOPLE",
    ...(link ? { link } : {}),
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal: `${today}T10:00`, endLocal: `${today}T11:00`,
    },
  }, { id: "evt-standup" }).state;
}

const timing = async (page, predicate, message) =>
  (await settledState(page, (s) => predicate(s.events[0].timing), message)).events[0].timing;

const card = (page) => page.locator('[data-event-id="evt-standup"]');

test.describe("moving an event on the timeline", () => {
  test("press, hold, and drag moves it to the hour it was dropped on", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const box = await card(page).boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(600); /* past the lift threshold */
    await page.mouse.move(box.x + box.width / 2, box.y + 10 + HOUR_PX * 2, { steps: 15 });
    await page.waitForTimeout(80);
    await page.mouse.up();

    const moved = await timing(page, (t) => t.startLocal.endsWith("12:00"), "the drag never moved the event");
    expect(moved.startLocal).toBe(`${today}T12:00`);
    /* Moving is not resizing: the hour it lasts is the hour it lasted. */
    expect(moved.endLocal).toBe(`${today}T13:00`);
  });

  test("a press with no hold leaves it where it was", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const box = await card(page).boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 10 + HOUR_PX * 2, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(700);

    const still = (await settledState(page, (s) => s.events.length === 1)).events[0].timing;
    expect(still.startLocal).toBe(`${today}T10:00`);
  });
});

test.describe("resizing an event on the timeline", () => {
  test("dragging the bottom edge changes how long it lasts, not when it starts", async ({ page }) => {
    await seedPlanner(page, seeded());
    await card(page).scrollIntoViewIfNeeded();
    const handle = page.locator("[data-resize]").first();
    await expect(handle, "the resize handle is missing from the card").toBeVisible();

    const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
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
    const hb = await page.locator("[data-resize]").first().boundingBox();

    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.move(hb.x + hb.width / 2, hb.y - HOUR_PX / 2, { steps: 12 });
    await page.mouse.up();

    const shrunk = await timing(page, (t) => !t.endLocal.endsWith("11:00"), "the resize never shortened it");
    const minutes = (v) => Number(v.slice(11, 13)) * 60 + Number(v.slice(14, 16));
    expect(minutes(shrunk.endLocal) - minutes(shrunk.startLocal)).toBeLessThan(60);
    expect(minutes(shrunk.endLocal) - minutes(shrunk.startLocal)).toBeGreaterThan(0);
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
