import { expect, test } from "@playwright/test";
import { seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

/* A hidden calendar has to be hidden on every surface at once.
 *
 * The failure this guards against is not a crash but an inconsistency: an event
 * present on the day and in the agenda while the week grid and month peek
 * correctly leave it out. Each view is a separate read, so only exercising all of
 * them together proves they agree. */

const today = keyOf(new Date());

function twoCalendars({ hidden = false } = {}) {
  const blank = createBlankPlannerState({});
  const withRoster = {
    ...blank,
    calendars: [
      ...blank.calendars,
      {
        id: "cal-side", name: "Side", status: "active", role: "owner",
        isDefault: false, isVisible: !hidden, includeInAvailability: !hidden,
      },
    ],
  };
  const mine = createEvent(withRoster, {
    calendarId: "calendar-default", title: "Mine", category: "DEEP WORK",
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${today}T09:00`, endLocal: `${today}T09:30` },
  }, { id: "evt-mine" }).state;
  return createEvent(mine, {
    calendarId: "cal-side", title: "Theirs", category: "DEEP WORK",
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${today}T11:00`, endLocal: `${today}T11:30` },
  }, { id: "evt-theirs" }).state;
}

/* Every surface, asserted the same way, so a view that disagrees is obvious. */
async function surfaces(page) {
  const seen = {};
  seen.day = await page.getByText("Theirs", { exact: true }).count();

  await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
  await page.waitForTimeout(200);
  seen.agenda = await page.getByText("Theirs", { exact: true }).count();

  await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
  await page.getByTestId("zoom-out").click();
  await expect(page.getByTestId("week-grid")).toBeVisible();
  seen.week = await page.getByText("Theirs", { exact: true }).count();

  await page.getByTestId("zoom-in").click();
  await expect(page.getByTestId("day-stream")).toBeVisible();
  return seen;
}

test.describe("calendar visibility", () => {
  test("a visible calendar shows on every surface", async ({ page }) => {
    await seedPlanner(page, twoCalendars());
    const seen = await surfaces(page);
    expect(seen.day).toBeGreaterThan(0);
    expect(seen.agenda).toBeGreaterThan(0);
    expect(seen.week).toBeGreaterThan(0);
  });

  test("a hidden calendar is hidden on every surface, not just some", async ({ page }) => {
    await seedPlanner(page, twoCalendars({ hidden: true }));
    const seen = await surfaces(page);
    expect(seen, "the hidden calendar leaked into a surface").toEqual({ day: 0, agenda: 0, week: 0 });
    /* The visible calendar is untouched — this is a filter, not an outage. */
    await expect(page.getByText("Mine", { exact: true }).first()).toBeVisible();
  });
});
