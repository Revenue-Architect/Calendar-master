import test from "node:test";
import assert from "node:assert/strict";

import {
  createEvent,
  deleteEvent,
  moveEvent,
  resizeEvent,
  restoreEvent,
  updateEvent,
} from "../commands/calendarCommands.js";

const timedInput = () => ({
  title: "Planning",
  date: "2026-08-09",
  start: 540,
  dur: 60,
  alerts: [],
});

const dailyEvent = () => ({
  id: "daily",
  ...timedInput(),
  repeat: { freq: "daily", interval: 1 },
});

const stateWithDailyEvent = () => ({ events: [dailyEvent()], overrides: {} });

test("createEvent is immutable and emits EventCreated", () => {
  const before = { events: [], overrides: {} };
  const result = createEvent(before, timedInput(), { id: "event-1" });
  assert.equal(before.events.length, 0);
  assert.equal(result.state.events[0].id, "event-1");
  assert.equal(result.event.id, "event-1");
  assert.equal(result.domainEvents[0].type, "EventCreated");
});

test("createEvent rejects duplicate identity", () => {
  const before = { events: [{ id: "event-1", ...timedInput() }], overrides: {} };
  assert.throws(() => createEvent(before, timedInput(), { id: "event-1" }), /already exists/);
});

test("updating one occurrence stores an exception without changing its series", () => {
  const before = stateWithDailyEvent();
  const result = updateEvent(
    before,
    "daily@2026-08-10",
    { start: 600 },
    { scope: "occurrence" },
  );
  assert.equal(before.overrides["daily@2026-08-10"], undefined);
  assert.equal(result.state.events[0].start, 540);
  assert.equal(result.state.overrides["daily@2026-08-10"].start, 600);
  assert.equal(result.domainEvents[0].type, "OccurrenceChanged");
});

test("updating a series from an occurrence changes the base event", () => {
  const result = updateEvent(
    stateWithDailyEvent(),
    "daily@2026-08-10",
    { title: "New series title" },
    { scope: "series" },
  );
  assert.equal(result.state.events[0].title, "New series title");
  assert.deepEqual(result.state.overrides, {});
});

test("editing a series from an occurrence preserves its original start date", () => {
  const result = updateEvent(
    stateWithDailyEvent(),
    "daily@2026-08-10",
    { title: "New title", date: "2026-08-10" },
    { scope: "series" },
  );
  assert.equal(result.state.events[0].date, "2026-08-09");
});

test("moving one occurrence preserves series identity in an exception", () => {
  const result = moveEvent(
    stateWithDailyEvent(),
    "daily@2026-08-10",
    { date: "2026-08-12", start: 600 },
    { scope: "occurrence" },
  );
  assert.equal(result.state.events[0].date, "2026-08-09");
  assert.deepEqual(result.state.overrides["daily@2026-08-10"], {
    date: "2026-08-12",
    start: 600,
  });
  assert.equal(result.domainEvents[0].type, "EventMoved");
});

test("moving a final occurrence beyond the series until date does not extend recurrence", () => {
  const before = stateWithDailyEvent();
  before.events[0].repeat.until = "2026-08-10";
  const result = moveEvent(
    before,
    "daily@2026-08-10",
    { date: "2026-08-12" },
    { scope: "occurrence" },
  );
  assert.equal(result.state.overrides["daily@2026-08-10"].date, "2026-08-12");
  assert.equal(result.state.events[0].repeat.until, "2026-08-10");
});

test("resize rejects an event that would cross midnight in Phase 1", () => {
  const state = {
    events: [{ id: "late", ...timedInput(), start: 1380, dur: 30 }],
    overrides: {},
  };
  assert.throws(() => resizeEvent(state, "late", 90), /must end within the day/);
});

test("deleting and restoring one occurrence changes only its exception", () => {
  const removed = deleteEvent(
    stateWithDailyEvent(),
    "daily@2026-08-10",
    { scope: "occurrence" },
  );
  assert.equal(removed.state.overrides["daily@2026-08-10"].deleted, true);
  assert.equal(removed.removed.kind, "occurrence");
  const restored = restoreEvent(removed.state, removed.removed);
  assert.equal(restored.state.overrides["daily@2026-08-10"], undefined);
});

test("deleting and restoring a series also restores its exceptions", () => {
  const before = {
    events: [dailyEvent()],
    overrides: { "daily@2026-08-10": { start: 600 } },
  };
  const removed = deleteEvent(before, "daily", { scope: "series" });
  assert.equal(removed.state.events.length, 0);
  assert.deepEqual(removed.state.overrides, {});
  const restored = restoreEvent(removed.state, removed.removed);
  assert.equal(restored.state.events[0].id, "daily");
  assert.deepEqual(restored.state.overrides, before.overrides);
});

test("commands preserve unrelated planner state", () => {
  const before = { ...stateWithDailyEvent(), tasks: [{ id: "task-1" }], xp: 90 };
  const result = updateEvent(before, "daily", { title: "Changed" }, { scope: "series" });
  assert.equal(result.state.tasks, before.tasks);
  assert.equal(result.state.xp, 90);
});
