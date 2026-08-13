import { expect, test } from "@playwright/test";
import { openPlanner, seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { addDaysToKey, keyOf } from "../../src/shared/time/dateKey.js";

/* Interaction details that are invisible to a unit test and obvious to a person:
 * a shortcut that types into the field it just opened, a control that lands on
 * top of another, a marker that covers the thing it is marking. Each of these
 * was found by looking at the running app, so each gets a test that looks at the
 * running app. */

const pad = (n) => String(n).padStart(2, "0");

test.describe("keyboard shortcuts", () => {
  for (const [key, kind] of [["n", "event"], ["a", "task"]]) {
    test(`${key.toUpperCase()} opens the composer without typing "${key}" into it`, async ({ page }) => {
      await openPlanner(page);
      await page.keyboard.press(key);
      const composer = page.getByTestId("composer");
      await expect(composer).toBeVisible();
      await expect(composer).toHaveAttribute("data-composer-kind", kind);
      /* The shortcut opens a sheet whose first field autofocuses; without
         preventDefault the same keystroke lands in that field. */
      await expect(composer.getByRole("textbox").first()).toHaveValue("");
    });
  }
});

test.describe("the Actions column header", () => {
  test("its controls sit in a row rather than on top of each other", async ({ page }) => {
    await openPlanner(page);
    const column = page.getByTestId("actions-column");
    const collapse = column.getByTestId("actions-collapse");
    await expect(collapse).toBeVisible();

    const add = await column.getByRole("button", { name: "+ ADD" }).boundingBox();
    const box = await collapse.boundingBox();
    const overlaps = !(box.x >= add.x + add.width || box.x + box.width <= add.x)
      && !(box.y >= add.y + add.height || box.y + box.height <= add.y);
    expect(overlaps, "COLLAPSE is drawn over + ADD").toBe(false);
  });

  test("exactly one collapse control is on screen", async ({ page }) => {
    await openPlanner(page);
    await expect(page.locator('[data-test="actions-collapse"]:visible')).toHaveCount(1);
  });
});

test.describe("the now marker", () => {
  test("stays out of a live event's card", async ({ page }) => {
    /* An event that is running right now, long enough that the marker falls well
       inside it. The marker used to be drawn at the card's left edge, on top of
       the elapsed fill it is meant to be reading. */
    const now = new Date();
    const today = keyOf(now);
    /* Build the fixture around the actual minute, including the next local day
       when the test runs near midnight. The previous hour-only fixture stopped
       at 23:30, so a run at 23:31+ silently produced a non-live event and the
       assertion looked for the compact gutter marker that is only used by a
       live event. */
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    const startMinute = Math.max(0, nowMinute - 60);
    const endTotal = nowMinute + 60;
    const endKey = endTotal >= 1440 ? addDaysToKey(today, 1) : today;
    const endMinute = endTotal % 1440;
    const localTime = (key, minute) => `${key}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
    const state = createEvent(createBlankPlannerState({}), {
      calendarId: "calendar-default", title: "Live workshop", category: "DEEP WORK",
      timing: {
        kind: "timed", timeZoneMode: "floating",
        startLocal: localTime(today, startMinute), endLocal: localTime(endKey, endMinute),
      },
    }, { id: "evt-live" }).state;
    await seedPlanner(page, state);

    const card = page.locator("[data-event-id='evt-live']");
    await expect(card).toBeVisible();
    const marker = page.getByText(/^\d{1,2}:\d{2}$/).first();
    await expect(marker, "the marker should render in its compact gutter form").toBeVisible();

    const cardBox = await card.boundingBox();
    const markerBox = await marker.boundingBox();
    /* Entirely to the left of the card — in the hour gutter, where every other
       time label on this surface lives. */
    expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(cardBox.x + 1);
  });
});

test.describe("sheets", () => {
  test("a long sheet keeps its content clear of the rounded bottom edge", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("settings");
    await page.getByTestId("palette-cmd-settings").click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    const scrolls = await sheet.evaluate((n) => n.scrollHeight > n.clientHeight + 2);
    expect(scrolls, "settings should be long enough to scroll").toBe(true);

    /* The panel is rounded, so the scrollbar track is held back past the corners
       and the content is padded deeper than the radius. Both are style rules; the
       thing worth asserting is that the last row is reachable and fully visible
       once scrolled to the end. */
    await sheet.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(200);
    const last = sheet.getByText("Celebrations");
    await expect(last).toBeVisible();
    const lastBox = await last.boundingBox();
    const sheetBox = await sheet.boundingBox();
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height - 8);
  });
});
