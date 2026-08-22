import { expect, test } from "@playwright/test";
import { directMouseDrag, seedPlanner, settledState } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { keyOf, addDaysToKey } from "../../src/shared/time/dateKey.js";

/* Dragging one day of a repeating event must detach that day, not slide the whole
 * series. The write goes down a different branch from a one-off (an occurrence
 * exception rather than an event patch), and only a real drag reaches it. */

/* Started well before the week on screen, so every column of the current week is
   inside the series — a series that begins today would legitimately miss the days
   of this week that have already gone, and the counts below would be about the
   calendar rather than about the drag. */
const seriesStartDate = addDaysToKey(keyOf(new Date()), -30);

function seriesState() {
  const { state } = createEvent(createBlankPlannerState({}), {
    calendarId: "calendar-default",
    title: "Standup",
    category: "DEEP WORK",
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal: `${seriesStartDate}T10:00`, endLocal: `${seriesStartDate}T10:30`,
    },
    recurrence: { frequency: "daily", interval: 1, weekStart: 0, missingDatePolicy: "skip" },
  }, { id: "evt-standup" });
  return state;
}

test.describe("a repeating event in the week view", () => {
  test("appears on every day of the week", async ({ page }) => {
    await seedPlanner(page, seriesState());
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await expect(page.getByTestId("week-event")).toHaveCount(7);
  });

  test("dragging one day detaches that day and leaves the series alone", async ({ page }) => {
    await seedPlanner(page, seriesState());
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();

    const before = await settledState(page, (s) => s.events.length === 1);
    const seriesStart = before.events[0].timing.startLocal;
    const exceptionsBefore = (before.eventExceptions ?? []).length;

    const card = page.getByTestId("week-event").first();
    const cardDay = await card.evaluate((node) => node.closest("[data-week-day]").getAttribute("data-week-day"));
    const targetKey = addDaysToKey(cardDay, 2);
    const target = page.locator(`[data-week-day="${targetKey}"]`);
    await expect(target).toBeVisible();

    await directMouseDrag(page, card, target);

    const after = await settledState(
      page,
      (s) => (s.eventExceptions ?? []).length > exceptionsBefore,
      "dragging one occurrence never recorded an exception",
    );

    /* The series itself is untouched — this is the assertion that separates
       "moved one day" from "moved everything". */
    expect(after.events).toHaveLength(1);
    expect(after.events[0].timing.startLocal).toBe(seriesStart);
    expect(after.events[0].recurrence.frequency).toBe("daily");

    /* And the detached day is real, typed, and points back at its series. */
    const exception = after.eventExceptions.at(-1);
    expect(exception.seriesId).toBe("evt-standup");
    expect(["moved", "modified"]).toContain(exception.type);

    /* The week still shows seven — the moved day left one column and joined
       another, rather than vanishing. */
    await expect(page.getByTestId("week-event")).toHaveCount(7);
  });
});
