import test from "node:test";
import assert from "node:assert/strict";

import {
  CalendarValidationError,
  normalizeEventInput,
} from "../model/event.js";

test("timed events require a title, valid date, start, and positive in-day duration", () => {
  assert.throws(
    () => normalizeEventInput({ title: " ", date: "2026-08-09", start: 540, dur: 60 }),
    CalendarValidationError,
  );
  assert.throws(
    () => normalizeEventInput({ title: "Meeting", date: "2026-08-09", start: 1430, dur: 30 }),
    /must end within the day/,
  );
  assert.throws(
    () => normalizeEventInput({ title: "Meeting", date: "2026-02-30", start: 540, dur: 30 }),
    /valid date key/,
  );
});

test("all-day input normalizes timing and rejects an end before its start", () => {
  const event = normalizeEventInput({
    title: " Offsite ",
    date: "2026-08-09",
    allDay: true,
    endDate: "2026-08-10",
    start: 600,
    dur: 90,
  });
  assert.equal(event.title, "Offsite");
  assert.equal(event.start, 0);
  assert.equal(event.dur, 0);
  assert.throws(
    () => normalizeEventInput({ title: "Offsite", date: "2026-08-09", allDay: true, endDate: "2026-08-08" }),
    /end date must be on or after event date/,
  );
});

test("recurrence and reminders are normalized without mutating input", () => {
  const input = {
    title: "Standup",
    date: "2026-08-03",
    start: 540,
    dur: 30,
    alerts: [30, 5, 30],
    repeat: { freq: "weekly", interval: 1, byDay: [3, 1, 3], until: "2026-12-31" },
  };
  const event = normalizeEventInput(input);
  assert.deepEqual(event.alerts, [5, 30]);
  assert.deepEqual(event.repeat.byDay, [1, 3]);
  assert.deepEqual(input.alerts, [30, 5, 30]);
  assert.deepEqual(input.repeat.byDay, [3, 1, 3]);
});

test("unsupported recurrence rules fail with structured issues", () => {
  assert.throws(
    () => normalizeEventInput({
      title: "Yearly",
      date: "2026-08-09",
      start: 540,
      dur: 30,
      repeat: { freq: "yearly", interval: 1 },
    }),
    (error) => error instanceof CalendarValidationError
      && error.issues.some((issue) => issue.field === "repeat.freq"),
  );
});
