import assert from "node:assert/strict";
import test from "node:test";

import { generateRecurrenceAnchors } from "../recurrence/expandRecurrence.js";
import { makeOccurrenceId, parseOccurrenceId } from "../recurrence/occurrenceIdentity.js";

function timedEvent(id, startLocal, recurrence) {
  return {
    id, title: id, calendarId: "calendar-default",
    timing: { kind: "timed", timeZoneMode: "floating", startLocal, endLocal: `${startLocal.slice(0, 11)}10:00` },
    recurrence,
  };
}

test("occurrence IDs round-trip delimiter and unicode characters", () => {
  const id = makeOccurrenceId("series@west/✓", "2026-08-10T09:00");
  assert.deepEqual(parseOccurrenceId(id), { seriesId: "series@west/✓", anchor: "2026-08-10T09:00" });
});

test("last Monday and leap-day skip generate literal expected anchors", () => {
  const lastMonday = timedEvent("monthly", "2026-01-26T09:00", {
    frequency: "monthly", interval: 1, byWeekday: [{ weekday: 1, ordinal: -1 }], missingDatePolicy: "skip",
  });
  assert.deepEqual(generateRecurrenceAnchors(lastMonday, "2026-01-01", "2026-04-01"), [
    "2026-01-26T09:00", "2026-02-23T09:00", "2026-03-30T09:00",
  ]);
  const leap = {
    id: "leap", title: "Leap", calendarId: "calendar-default",
    timing: { kind: "all-day", startDate: "2024-02-29", endDateExclusive: "2024-03-01" },
    recurrence: { frequency: "yearly", interval: 1, byMonth: [2], byMonthDay: [29], missingDatePolicy: "skip" },
  };
  assert.deepEqual(generateRecurrenceAnchors(leap, "2027-01-01", "2029-01-01"), ["2028-02-29"]);
});

test("count is consumed from the series start before the query range", () => {
  const event = timedEvent("counted", "2026-08-01T09:00", { frequency: "daily", interval: 1, count: 3, missingDatePolicy: "skip" });
  assert.deepEqual(generateRecurrenceAnchors(event, "2026-08-02", "2026-08-10"), ["2026-08-02T09:00", "2026-08-03T09:00"]);
});
