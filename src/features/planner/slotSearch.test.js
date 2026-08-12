import assert from "node:assert/strict";
import test from "node:test";

import { findOpenSlots } from "./slotSearch.js";

const calendars = [
  { id: "work", status: "active", isVisible: true, includeInAvailability: true },
  { id: "private", status: "active", isVisible: false, includeInAvailability: true },
  { id: "reference", status: "active", isVisible: true, includeInAvailability: false },
  { id: "old", status: "archived", isVisible: true, includeInAvailability: true },
];

const timed = (id, calendarId, startLocal, endLocal) => ({
  id, title: id, calendarId, recurrence: null,
  timing: { kind: "timed", timeZoneMode: "floating", startLocal, endLocal },
});

const baseState = (events, tasks = []) => ({
  calendars,
  events,
  eventExceptions: [],
  occurrenceAliases: [],
  tasks,
  taskExceptions: [],
});

const D0 = "2026-08-10";
const opts = { fromDate: D0, durationMinutes: 60, days: 2, windowStartMinute: 540, windowEndMinute: 1020 };

test("slots come only from gaps between availability-relevant events", () => {
  const state = baseState([
    timed("morning", "work", `${D0}T09:00`, `${D0}T11:00`),
    timed("afternoon", "work", `${D0}T13:00`, `${D0}T17:00`),
  ]);
  const slots = findOpenSlots(state, { ...opts, days: 1 });
  assert.deepEqual(slots, [{ date: D0, start: 660, dur: 60 }]);
});

test("hidden, non-availability and archived calendars never block a slot", () => {
  const state = baseState([
    timed("hidden", "private", `${D0}T09:00`, `${D0}T17:00`),
    timed("reference", "reference", `${D0}T09:00`, `${D0}T17:00`),
    timed("retired", "old", `${D0}T09:00`, `${D0}T17:00`),
  ]);
  const slots = findOpenSlots(state, { ...opts, days: 1, limit: 1 });
  assert.deepEqual(slots, [{ date: D0, start: 540, dur: 60 }]);
});

test("overlapping busy intervals merge instead of opening a phantom gap", () => {
  const state = baseState([
    timed("a", "work", `${D0}T09:00`, `${D0}T12:00`),
    timed("b", "work", `${D0}T10:00`, `${D0}T16:00`),
  ]);
  const slots = findOpenSlots(state, { ...opts, days: 1 });
  assert.deepEqual(slots, [{ date: D0, start: 960, dur: 60 }]);
});

test("a cross-midnight event blocks the start of the next day", () => {
  const state = baseState([
    timed("overnight", "work", "2026-08-10T23:00", "2026-08-11T10:00"),
  ]);
  const slots = findOpenSlots(state, { ...opts, days: 2, limit: 10 });
  assert.deepEqual(slots, [
    { date: "2026-08-10", start: 540, dur: 60 },
    { date: "2026-08-11", start: 600, dur: 60 },
  ]);
});

test("a gap exactly the requested duration qualifies; one minute short does not", () => {
  const exact = baseState([
    timed("a", "work", `${D0}T09:00`, `${D0}T10:00`),
    timed("b", "work", `${D0}T11:00`, `${D0}T17:00`),
  ]);
  assert.deepEqual(findOpenSlots(exact, { ...opts, days: 1 }), [{ date: D0, start: 600, dur: 60 }]);

  const short = baseState([
    timed("a", "work", `${D0}T09:00`, `${D0}T10:00`),
    timed("b", "work", `${D0}T10:59`, `${D0}T17:00`),
  ]);
  assert.deepEqual(findOpenSlots(short, { ...opts, days: 1 }), []);
});

test("today's slots start at now rounded up, never in the past", () => {
  const state = baseState([]);
  const slots = findOpenSlots(state, { ...opts, days: 1, currentMinute: 700 });
  assert.deepEqual(slots, [{ date: D0, start: 705, dur: 60 }]);
});

test("a visible week skips prior dates and anchors now to the actual today", () => {
  const state = baseState([]);
  const slots = findOpenSlots(state, {
    ...opts,
    fromDate: D0,
    todayDate: "2026-08-11",
    currentMinute: 700,
    days: 3,
    limit: 2,
  });
  assert.deepEqual(slots, [
    { date: "2026-08-11", start: 705, dur: 60 },
    { date: "2026-08-12", start: 540, dur: 60 },
  ]);
});

test("a fully booked horizon yields no slots", () => {
  const state = baseState([
    timed("d1", "work", `${D0}T08:00`, `${D0}T18:00`),
    timed("d2", "work", "2026-08-11T08:00", "2026-08-11T18:00"),
  ]);
  assert.deepEqual(findOpenSlots(state, { ...opts, days: 2 }), []);
});

test("timed actions block their estimated span", () => {
  const state = baseState([], [{
    id: "prep", title: "Prep", status: "open",
    planned: { date: D0, startMinute: 540, estimateMinutes: 120 },
    deadline: null, recurrence: null, checklist: [],
  }]);
  const slots = findOpenSlots(state, { ...opts, days: 1, limit: 1 });
  assert.deepEqual(slots, [{ date: D0, start: 660, dur: 60 }]);
});
