import assert from "node:assert/strict";
import test from "node:test";

import { getDayAggregate } from "./dayAggregate.js";
import { getOccurrencesForRange } from "../../calendar/index.js";

const TODAY = "2026-08-10";

function state() {
  return {
    events: [
      { id: "event-now", title: "Design review", date: TODAY, start: 600, dur: 30, allDay: false },
      { id: "event-later", title: "Roadmap review", date: TODAY, start: 780, dur: 30, allDay: false },
      { id: "event-past", title: "Yesterday", date: "2026-08-09", start: 600, dur: 30, allDay: false },
    ],
    overrides: {},
    tasks: [
      {
        id: "task-today", title: "Ship day aggregate", status: "open", parentTaskId: null,
        rank: 1, planned: { date: TODAY, startMinute: 660 }, deadline: { date: null }, recurrence: null,
      },
      {
        id: "task-late", title: "Resolve review feedback", status: "open", parentTaskId: null,
        rank: 2, planned: { date: null, startMinute: null }, deadline: { date: "2026-08-09" }, recurrence: null,
      },
    ],
    taskExceptions: [],
    notes: [
      {
        id: "note-daily", kind: "daily", date: TODAY, title: "Daily page", archived: false,
        pinned: false, links: [], blocks: [], updatedAt: "2026-08-10T08:00:00Z",
      },
      {
        id: "note-dated", kind: "standalone", date: TODAY, title: "Meeting prep", archived: false,
        pinned: false, links: [], blocks: [], updatedAt: "2026-08-10T09:00:00Z",
      },
    ],
  };
}

test("composes the selected day while preserving source identities", () => {
  const day = getDayAggregate(state(), {
    selectedDate: TODAY,
    todayDate: TODAY,
    currentMinute: 620,
  });

  assert.equal(day.date, TODAY);
  assert.equal(day.isToday, true);
  assert.deepEqual(day.events.map((item) => item.id), ["event-now", "event-later"]);
  assert.deepEqual(day.tasks.map((item) => item.id), ["task-today"]);
  assert.equal(day.dailyNote.id, "note-daily");
  assert.deepEqual(day.notes.map((item) => item.id), ["note-dated", "note-daily"]);
  assert.deepEqual(day.overdue.map((item) => item.id), ["task-late"]);
  assert.equal(day.nextEvent.id, "event-later");
  assert.equal(day.sections.events.status, "available");
  assert.equal(day.sections.tasks.status, "available");
  assert.equal(day.sections.notes.status, "available");
});

test("does not fabricate a next event for a selected day that is not today", () => {
  const day = getDayAggregate(state(), {
    selectedDate: "2026-08-09",
    todayDate: TODAY,
    currentMinute: 0,
  });

  assert.equal(day.isToday, false);
  assert.equal(day.nextEvent, null);
  assert.deepEqual(day.events.map((item) => item.id), ["event-past"]);
});

test("keeps usable sections when a source collection is unavailable", () => {
  const partial = state();
  delete partial.events;
  delete partial.notes;

  const day = getDayAggregate(partial, {
    selectedDate: TODAY,
    todayDate: TODAY,
    currentMinute: 0,
  });

  assert.equal(day.sections.events.status, "unavailable");
  assert.equal(day.sections.notes.status, "unavailable");
  assert.deepEqual(day.tasks.map((item) => item.id), ["task-today"]);
  assert.deepEqual(day.overdue.map((item) => item.id), ["task-late"]);
});

/* The day used to be read off the stored events rather than expanded from them, so
   a recurring series contributed nothing to it. The agenda expanded them anyway,
   which is what made tapping one there open an empty day. */
test("a recurring series reaches the day it recurs on", () => {
  const recurring = {
    events: [{
      id: "standup", calendarId: "calendar-default", title: "Standup",
      timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-03T11:30", endLocal: "2026-08-03T11:55" },
      recurrence: { frequency: "daily", interval: 1 },
    }],
    eventExceptions: [], occurrenceAliases: [], overrides: {},
    tasks: [], taskExceptions: [], notes: [],
  };
  const day = getDayAggregate(recurring, { selectedDate: TODAY, todayDate: TODAY, currentMinute: 0 });
  assert.equal(day.events.length, 1, "the series reaches a later day");
  assert.equal(day.nextEvent?.title, "Standup", "and can be what happens next");

  /* The id the day hands out has to be the id the agenda hands out, or opening an
     entry from one view cannot find it in the other. */
  const fromAgenda = getOccurrencesForRange(recurring, TODAY, "2026-08-11", { segments: true });
  assert.deepEqual(day.events.map((e) => e.id), fromAgenda.map((e) => e.id));
});

test("a cancelled occurrence stays off the day", () => {
  const cancelled = {
    events: [{
      id: "standup", calendarId: "calendar-default", title: "Standup",
      timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-03T11:30", endLocal: "2026-08-03T11:55" },
      recurrence: { frequency: "daily", interval: 1 },
    }],
    eventExceptions: [{ id: "x", seriesId: "standup", recurrenceAnchor: `${TODAY}T11:30`, type: "cancelled" }],
    occurrenceAliases: [], overrides: {}, tasks: [], taskExceptions: [], notes: [],
  };
  const day = getDayAggregate(cancelled, { selectedDate: TODAY, todayDate: TODAY, currentMinute: 0 });
  assert.deepEqual(day.events, [], "an exception the old path could not even see");
});

/* A notebook with two calendars, one of them hidden. Every surface a user looks
   at must read through the visibility projection, or hidden work reappears on
   the day and the agenda while the week grid and month peek correctly leave it
   out — the same event present in one view and absent from another. */
function twoCalendarState({ hiddenStatus = {} } = {}) {
  return {
    calendars: [
      { id: "cal-main", name: "Main", status: "active", role: "owner", isDefault: true, isVisible: true, includeInAvailability: true },
      { id: "cal-other", name: "Other", status: "active", role: "owner", isDefault: false, isVisible: true, includeInAvailability: true, ...hiddenStatus },
    ],
    events: [
      {
        id: "event-main", calendarId: "cal-main", title: "Shown", category: "DEEP WORK",
        timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${TODAY}T09:00`, endLocal: `${TODAY}T09:30` },
        recurrence: null,
      },
      {
        id: "event-other", calendarId: "cal-other", title: "From the other calendar", category: "DEEP WORK",
        timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${TODAY}T11:00`, endLocal: `${TODAY}T11:30` },
        recurrence: null,
      },
    ],
    eventExceptions: [],
    occurrenceAliases: [],
    overrides: {},
    tasks: [],
    taskExceptions: [],
    notes: [],
  };
}

const titlesOn = (aggregate) => aggregate.events.map((event) => event.title);

test("the day reads both calendars while both are visible", () => {
  const aggregate = getDayAggregate(twoCalendarState(), { selectedDate: TODAY, todayDate: TODAY });
  assert.deepEqual(titlesOn(aggregate), ["Shown", "From the other calendar"]);
});

test("a hidden calendar is absent from the day", () => {
  const aggregate = getDayAggregate(
    twoCalendarState({ hiddenStatus: { isVisible: false } }),
    { selectedDate: TODAY, todayDate: TODAY },
  );
  assert.deepEqual(titlesOn(aggregate), ["Shown"]);
});

test("archived and disconnected calendars are absent from the day", () => {
  for (const status of ["archived", "disconnected"]) {
    const aggregate = getDayAggregate(
      twoCalendarState({ hiddenStatus: { status } }),
      { selectedDate: TODAY, todayDate: TODAY },
    );
    assert.deepEqual(titlesOn(aggregate), ["Shown"], status);
  }
});

test("a calendar excluded from availability still shows its events on the day", () => {
  /* Visibility and availability are different questions: this calendar must not
     block a slot, and must still be readable. */
  const aggregate = getDayAggregate(
    twoCalendarState({ hiddenStatus: { includeInAvailability: false } }),
    { selectedDate: TODAY, todayDate: TODAY },
  );
  assert.deepEqual(titlesOn(aggregate), ["Shown", "From the other calendar"]);
});

test("'what is next' skips an event on a hidden calendar", () => {
  const aggregate = getDayAggregate(
    twoCalendarState({ hiddenStatus: { isVisible: false } }),
    { selectedDate: TODAY, todayDate: TODAY, currentMinute: 10 * 60 },
  );
  assert.equal(aggregate.nextEvent, null, "the only later event was on the hidden calendar");
});

test("a caller can narrow the day to named calendars", () => {
  const aggregate = getDayAggregate(twoCalendarState(), {
    selectedDate: TODAY, todayDate: TODAY, calendarIds: ["cal-main"],
  });
  assert.deepEqual(titlesOn(aggregate), ["Shown"]);
});

test("a notebook with no calendars list still reads its events", () => {
  /* Pre-v5 notebooks have no `calendars`; they must not silently read as empty. */
  const legacy = state();
  const aggregate = getDayAggregate(legacy, { selectedDate: TODAY, todayDate: TODAY });
  assert.ok(aggregate.events.length > 0, "legacy events survive the projection");
});
