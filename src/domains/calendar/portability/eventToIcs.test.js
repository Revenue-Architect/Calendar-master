import assert from "node:assert/strict";
import test from "node:test";

import { eventToIcs, eventsToIcs } from "./eventToIcs.js";

const eventForUi = (event) => {
  if (!event?.timing) return event;
  if (event.timing.kind === "all-day") {
    return { ...event, allDay: true, date: event.timing.startDate, start: 0, dur: 1440 };
  }
  return {
    ...event,
    allDay: false,
    date: event.timing.startLocal.slice(0, 10),
    start: 540,
    dur: 60,
    repeat: event.recurrence
      ? { freq: event.recurrence.frequency, interval: event.recurrence.interval || 1 }
      : null,
  };
};

const link = (value) => (String(value || "").startsWith("http") ? value : "");

test("all-day events use VALUE=DATE and the exclusive end", () => {
  const lines = eventToIcs({
    id: "trip",
    title: "Offsite",
    timing: { kind: "all-day", startDate: "2026-08-09", endDateExclusive: "2026-08-11" },
  }, eventForUi);
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260809"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20260811"));
  assert.ok(!lines.some((line) => /DTSTART:\d{8}T/.test(line)));
});

test("timed floating events do not append a leftover 00 onto the minute", () => {
  const lines = eventToIcs({
    id: "block",
    title: "Deep work",
    timing: {
      kind: "timed",
      timeZoneMode: "floating",
      startLocal: "2026-08-09T09:00",
      endLocal: "2026-08-09T10:30",
    },
  }, eventForUi);
  assert.ok(lines.includes("DTSTART:20260809T090000"));
  assert.ok(lines.includes("DTEND:20260809T103000"));
  assert.ok(!lines.includes("DTSTART:20260809T09000000"));
});

test("zoned events carry TZID rather than pretending to be UTC", () => {
  const lines = eventToIcs({
    id: "call",
    title: "Standup",
    timing: {
      kind: "timed",
      timeZoneMode: "zoned",
      timeZone: "America/Toronto",
      startLocal: "2026-08-09T09:00",
      endLocal: "2026-08-09T09:25",
      startOffset: "-04:00",
      endOffset: "-04:00",
    },
  }, eventForUi);
  assert.ok(lines.includes("DTSTART;TZID=America/Toronto:20260809T090000"));
  assert.ok(lines.includes("DTEND;TZID=America/Toronto:20260809T092500"));
});

test("one unreadable event is skipped instead of aborting the calendar", () => {
  const { ics, skipped } = eventsToIcs([
    {
      id: "ok",
      title: "Lunch",
      timing: {
        kind: "timed",
        timeZoneMode: "floating",
        startLocal: "2026-08-09T12:00",
        endLocal: "2026-08-09T13:00",
      },
    },
    { id: "broken", title: "???", timing: { kind: "timed" } },
    null,
  ], eventForUi, link);
  assert.equal(skipped, 2);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Lunch/);
  assert.doesNotMatch(ics, /SUMMARY:\?\?\?/);
  assert.match(ics, /END:VCALENDAR/);
});

test("legacy date/start events still export without a timing record", () => {
  const lines = eventToIcs({
    id: "legacy",
    title: "Legacy lunch",
    date: "2026-08-09",
    start: 780,
    dur: 55,
    allDay: false,
  }, eventForUi);
  assert.ok(lines.includes("DTSTART:20260809T130000"));
  assert.ok(lines.includes("DTEND:20260809T135500"));
});
