import assert from "node:assert/strict";
import test from "node:test";

import { busyFractionForDay, projectDayPeek, projectPlannerWeek } from "./weekProjection.js";

const calendars = [
  { id: "work", status: "active", isVisible: true, includeInAvailability: true },
  { id: "private", status: "active", isVisible: false, includeInAvailability: true },
  { id: "reference", status: "active", isVisible: true, includeInAvailability: false },
  { id: "old", status: "archived", isVisible: true, includeInAvailability: true },
  { id: "gone", status: "disconnected", isVisible: true, includeInAvailability: true },
];

const timed = (id, calendarId, startLocal, endLocal) => ({
  id, title: id, calendarId, recurrence: null,
  timing: { kind: "timed", timeZoneMode: "floating", startLocal, endLocal },
});

const WEEK_START = "2026-08-09";
const D1 = "2026-08-10";

const state = {
  calendars,
  events: [
    timed("meeting", "work", `${D1}T09:00`, `${D1}T10:00`),
    timed("context", "reference", `${D1}T11:00`, `${D1}T12:00`),
    timed("hidden", "private", `${D1}T13:00`, `${D1}T14:00`),
    timed("retired", "old", `${D1}T14:00`, `${D1}T15:00`),
    timed("lost", "gone", `${D1}T15:00`, `${D1}T16:00`),
    {
      id: "away", title: "Away", calendarId: "work", recurrence: null,
      timing: { kind: "all-day", startDate: D1, endDateExclusive: "2026-08-11" },
    },
    {
      id: "away-hidden", title: "Hidden away", calendarId: "private", recurrence: null,
      timing: { kind: "all-day", startDate: D1, endDateExclusive: "2026-08-11" },
    },
  ],
  eventExceptions: [],
  occurrenceAliases: [],
  tasks: [{
    id: "prep", title: "Prep", status: "open",
    planned: { date: D1, startMinute: 480, estimateMinutes: 30 },
    deadline: null, recurrence: null, checklist: [],
  }],
  taskExceptions: [],
};

const mapEvent = (occurrence) => ({
  ...occurrence,
  start: occurrence.timing.kind === "timed"
    ? Number(occurrence.timing.startLocal.slice(11, 13)) * 60 + Number(occurrence.timing.startLocal.slice(14, 16))
    : 0,
  dur: 60,
});

test("week buckets show visible calendars only; hidden, archived and disconnected are absent", () => {
  const week = projectPlannerWeek(state, { weekStart: WEEK_START, mapEvent });
  assert.equal(week.length, 7);
  const day = week.find((entry) => entry.key === D1);
  assert.deepEqual(day.timed.map((e) => e.id).sort(), ["context", "meeting"]);
  assert.deepEqual(day.allDay.map((e) => e.id), ["away"]);
  assert.deepEqual(day.tasks.map((t) => t.id), ["prep"]);
  assert.equal(week.filter((entry) => entry.key !== D1).every((entry) => entry.timed.length === 0), true);
});

test("week timed events carry lane packing", () => {
  const week = projectPlannerWeek(state, { weekStart: WEEK_START, mapEvent });
  const day = week.find((entry) => entry.key === D1);
  for (const event of day.timed) {
    assert.equal(Number.isInteger(event.lane), true);
    assert.equal(event.cols >= 1, true);
  }
});

test("multi-day events land once per covered day, not piled onto their first day", () => {
  const spanning = {
    ...state,
    events: [
      ...state.events,
      {
        id: "offsite", title: "Offsite", calendarId: "work", recurrence: null,
        timing: { kind: "all-day", startDate: "2026-08-12", endDateExclusive: "2026-08-15" },
      },
      timed("redeye", "work", "2026-08-11T23:00", "2026-08-12T01:00"),
    ],
  };
  const week = projectPlannerWeek(spanning, { weekStart: WEEK_START, mapEvent });
  const offsiteDays = week.filter((entry) => entry.allDay.some((e) => e.id === "offsite")).map((entry) => entry.key);
  assert.deepEqual(offsiteDays, ["2026-08-12", "2026-08-13", "2026-08-14"]);
  for (const key of offsiteDays) {
    const day = week.find((entry) => entry.key === key);
    assert.equal(day.allDay.filter((e) => e.id === "offsite").length, 1);
  }
  const redeyeDays = week.filter((entry) => entry.timed.some((e) => e.id === "redeye")).map((entry) => entry.key);
  assert.deepEqual(redeyeDays, ["2026-08-11", "2026-08-12"]);
});

test("day peek honours calendar visibility and sorts timed events", () => {
  const peek = projectDayPeek(state, D1, { mapEvent });
  assert.deepEqual(peek.timed.map((e) => e.id), ["meeting", "context"]);
  assert.deepEqual(peek.allDay.map((e) => e.id), ["away"]);
  assert.deepEqual(peek.tasks.map((t) => t.id), ["prep"]);
});

test("busy fraction counts availability-relevant events only, merging overlaps", () => {
  /* One availability hour out of a 16h window; the visible-but-non-availability
     "context" hour and every hidden/inactive calendar contribute nothing. */
  assert.equal(busyFractionForDay(state, D1), 60 / 960);

  const overlapped = {
    ...state,
    events: [...state.events, timed("double", "work", `${D1}T09:30`, `${D1}T10:00`)],
  };
  assert.equal(busyFractionForDay(overlapped, D1), 60 / 960);
});

test("a clear day reads as fully free", () => {
  assert.equal(busyFractionForDay(state, "2026-08-12"), 0);
});
