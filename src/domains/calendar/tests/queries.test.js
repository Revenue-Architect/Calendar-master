import test from "node:test";
import assert from "node:assert/strict";

import {
  getCalendarDensity,
  getEventsForDay,
  getEventsForRange,
  getNextEvent,
} from "../queries/calendarQueries.js";

const daily = {
  id: "daily",
  date: "2026-08-09",
  title: "Daily",
  start: 540,
  dur: 30,
  repeat: { freq: "daily", interval: 1 },
};

test("range queries return chronological occurrences with stable IDs", () => {
  const result = getEventsForRange([daily], "2026-08-09", "2026-08-11");
  assert.deepEqual(result.map((event) => event.id), [
    "daily@2026-08-09",
    "daily@2026-08-10",
    "daily@2026-08-11",
  ]);
});

test("day queries sort all-day events before timed events", () => {
  const events = [
    { id: "late", date: "2026-08-09", title: "Late", start: 900, dur: 30 },
    { id: "all-day", date: "2026-08-09", title: "Holiday", allDay: true, start: 0, dur: 0 },
    { id: "early", date: "2026-08-09", title: "Early", start: 480, dur: 30 },
  ];
  assert.deepEqual(getEventsForDay(events, "2026-08-09").map((event) => event.id), [
    "all-day",
    "early",
    "late",
  ]);
});

test("density counts visible occurrences without mutating its input", () => {
  const events = [daily];
  assert.equal(getCalendarDensity(events, "2026-08-10"), 1);
  assert.equal(events[0].id, "daily");
});

test("next event ignores all-day and already-started events", () => {
  const events = [
    { id: "all-day", date: "2026-08-09", title: "Holiday", allDay: true, start: 0, dur: 0 },
    { id: "past", date: "2026-08-09", title: "Past", start: 480, dur: 30 },
    { id: "next", date: "2026-08-09", title: "Next", start: 600, dur: 30 },
  ];
  assert.equal(getNextEvent(events, "2026-08-09", 540).id, "next");
  assert.equal(getNextEvent(events, "2026-08-09", 700), null);
});

test("range queries reject an end before the start", () => {
  assert.throws(
    () => getEventsForRange([], "2026-08-11", "2026-08-09"),
    /end date must be on or after start date/,
  );
});
