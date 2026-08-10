import assert from "node:assert/strict";
import test from "node:test";

import {
  getCalendarBriefing,
  getCalendarConflicts,
  getFreeSlotsForDay,
  getTimedBusyIntervals,
  getVisibleCalendarIds,
  getVisibleOccurrencesForRange,
} from "../queries/planningQueries.js";
import { makeOccurrenceId } from "../recurrence/occurrenceIdentity.js";
import { localDateTimeToEpochMinutes } from "../../../shared/time/localDateTime.js";

const calendars = [
  { id: "work", status: "active", isVisible: true, includeInAvailability: true },
  { id: "private", status: "active", isVisible: false, includeInAvailability: true },
  { id: "reference", status: "active", isVisible: true, includeInAvailability: false },
  { id: "old", status: "archived", isVisible: true, includeInAvailability: true },
];

const timed = (id, calendarId, start, end, recurrence = null) => ({
  id, title: id, calendarId, recurrence,
  timing: { kind: "timed", timeZoneMode: "floating", startLocal: start, endLocal: end },
});

const state = {
  calendars,
  events: [
    timed("focus", "work", "2026-08-10T09:00", "2026-08-10T10:00"),
    timed("review", "work", "2026-08-10T09:30", "2026-08-10T10:30"),
    timed("hidden", "private", "2026-08-10T10:30", "2026-08-10T11:00"),
    timed("reference", "reference", "2026-08-10T11:00", "2026-08-10T12:00"),
    timed("retired", "old", "2026-08-10T12:00", "2026-08-10T13:00"),
    timed("daily", "work", "2026-08-01T14:00", "2026-08-01T14:30", {
      frequency: "daily", interval: 1, missingDatePolicy: "skip",
    }),
    {
      id: "away", title: "Away", calendarId: "work", recurrence: null,
      timing: { kind: "all-day", startDate: "2026-08-10", endDateExclusive: "2026-08-11" },
    },
  ],
  eventExceptions: [{
    id: "moved", type: "moved", seriesId: "daily",
    occurrenceId: makeOccurrenceId("daily", "2026-08-10T14:00"),
    recurrenceAnchor: "2026-08-10T14:00", revision: 1,
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-10T15:00", endLocal: "2026-08-10T15:30" },
  }],
  occurrenceAliases: [],
};

test("visible occurrence reads exclude hidden or inactive calendars while retaining moved recurrence identities", () => {
  const occurrences = getVisibleOccurrencesForRange(state, "2026-08-10", "2026-08-11");

  assert.deepEqual(occurrences.map((entry) => entry.id), [
    "away",
    "focus",
    "review",
    "reference",
    makeOccurrenceId("daily", "2026-08-10T14:00"),
  ]);
  assert.equal(occurrences.at(-1).timing.startLocal, "2026-08-10T15:00");
});

test("busy intervals honour include-in-availability and keep all-day context separate", () => {
  const busy = getTimedBusyIntervals(state, "2026-08-10", "2026-08-11");
  assert.deepEqual(busy.map((entry) => entry.id), [
    "focus", "review", makeOccurrenceId("daily", "2026-08-10T14:00"),
  ]);
  assert.equal(busy.some((entry) => entry.calendarId === "reference"), false);
});

test("busy intervals clip a cross-midnight event to the requested range", () => {
  const overnight = {
    ...state,
    events: [...state.events, timed("overnight", "work", "2026-08-09T23:30", "2026-08-10T01:00")],
  };
  const interval = getTimedBusyIntervals(overnight, "2026-08-10", "2026-08-11")
    .find((entry) => entry.id === "overnight");

  assert.equal(interval.start, localDateTimeToEpochMinutes("2026-08-10T00:00"));
  assert.equal(interval.end, localDateTimeToEpochMinutes("2026-08-10T01:00"));
});

test("conflicts use positive half-open overlap and exclude adjacent or hidden events", () => {
  const conflicts = getCalendarConflicts(state, "2026-08-10", "2026-08-11");

  assert.deepEqual(conflicts.map((entry) => [entry.left.id, entry.right.id, entry.overlapMinutes]), [
    ["focus", "review", 30],
  ]);
});

test("free slots are chronological suggestions inside the working window and never include hidden time", () => {
  const slots = getFreeSlotsForDay(state, "2026-08-10", {
    startMinute: 540, endMinute: 960, minimumDurationMinutes: 30,
  });

  assert.deepEqual(slots.map((slot) => [slot.startMinute, slot.endMinute]), [
    [630, 900], [930, 960],
  ]);
});

test("briefing remains factual and preserves occurrence identity", () => {
  const briefing = getCalendarBriefing(state, "2026-08-10", {
    currentMinute: 480,
    workingHours: { startMinute: 540, endMinute: 960, minimumDurationMinutes: 30 },
  });

  assert.equal(briefing.eventCount, 5);
  assert.equal(briefing.allDay.length, 1);
  assert.equal(briefing.busyMinutes, 180);
  assert.equal(briefing.firstTimed.id, "focus");
  assert.equal(briefing.nextTimed.id, "focus");
  assert.equal(briefing.conflicts.length, 1);
  assert.equal(briefing.scheduleVariance.status, "unavailable");
});

test("a notebook that declares no calendars is not filtered to nothing", () => {
  /* Filtering against an empty roster would erase the whole notebook, and do it
     silently. No roster means nothing to hide by. */
  const rosterless = {
    events: [{
      id: "solo", calendarId: "calendar-default", title: "Standup",
      timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-10T09:00", endLocal: "2026-08-10T09:30" },
      recurrence: null,
    }],
    eventExceptions: [], occurrenceAliases: [],
  };
  assert.equal(getVisibleOccurrencesForRange(rosterless, "2026-08-10", "2026-08-11").length, 1);
  assert.equal(getTimedBusyIntervals(rosterless, "2026-08-10", "2026-08-11").length, 1);
  assert.deepEqual(getVisibleCalendarIds(rosterless), []);
});

test("an explicit calendarIds request still narrows a rosterless notebook", () => {
  const rosterless = {
    events: [
      {
        id: "a", calendarId: "cal-a", title: "A",
        timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-10T09:00", endLocal: "2026-08-10T09:30" },
        recurrence: null,
      },
      {
        id: "b", calendarId: "cal-b", title: "B",
        timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-10T11:00", endLocal: "2026-08-10T11:30" },
        recurrence: null,
      },
    ],
    eventExceptions: [], occurrenceAliases: [],
  };
  const only = getVisibleOccurrencesForRange(rosterless, "2026-08-10", "2026-08-11", { calendarIds: ["cal-a"] });
  assert.deepEqual(only.map((occurrence) => occurrence.title), ["A"]);
});
