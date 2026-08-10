import assert from "node:assert/strict";
import test from "node:test";

import { makeOccurrenceId } from "../../calendar/index.js";
import { resolveSearchTarget } from "./resolveSearchTarget.js";

const movedOccurrenceId = makeOccurrenceId("series", "2026-08-01T09:00");

const state = {
  events: [{
    id: "series", title: "Moved meeting", calendarId: "calendar-default",
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-01T09:00", endLocal: "2026-08-01T09:30" },
    recurrence: { frequency: "daily", interval: 1, count: 1, missingDatePolicy: "skip" },
  }],
  eventExceptions: [{
    id: "move", type: "moved", seriesId: "series", occurrenceId: movedOccurrenceId,
    recurrenceAnchor: "2026-08-01T09:00", revision: 1,
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-12T11:00", endLocal: "2026-08-12T11:30" },
  }],
  occurrenceAliases: [],
  tasks: [{
    id: "habit", title: "Walk", status: "open", parentTaskId: null,
    planned: { date: "2026-08-01", startMinute: null, estimateMinutes: null },
    deadline: { date: null, minute: null }, followUpDate: null,
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
  }],
  taskExceptions: [],
  notes: [{
    id: "archived", kind: "standalone", title: "Old note", date: null,
    blocks: [], tags: [], links: [], pinned: false, archived: true,
  }],
};

test("opens a moved recurring event at its actual occurrence date", () => {
  const target = resolveSearchTarget(state, {
    kind: "event", target: { entityId: "series" },
  }, { todayDate: "2026-08-10" });

  assert.deepEqual(target, {
    status: "available", kind: "event", entityId: "series",
    occurrenceId: movedOccurrenceId, date: "2026-08-12",
  });
});

test("opens the next recurring task occurrence without UI-built identity", () => {
  const target = resolveSearchTarget(state, {
    kind: "task", target: { entityId: "habit" },
  }, { todayDate: "2026-08-10" });

  assert.deepEqual(target, {
    status: "available", kind: "task", entityId: "habit",
    occurrenceId: "habit@2026-08-10", date: "2026-08-10",
  });
});

test("reports an archived note selected from stale UI state", () => {
  assert.deepEqual(resolveSearchTarget(state, {
    kind: "note", target: { entityId: "archived" },
  }, { todayDate: "2026-08-10" }), {
    status: "unavailable", kind: "note", entityId: "archived", reason: "archived",
  });
});
