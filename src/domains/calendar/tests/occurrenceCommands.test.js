import assert from "node:assert/strict";
import test from "node:test";

import {
  addOccurrence,
  cancelOccurrence,
  modifyOccurrence,
  moveOccurrence,
  restoreOccurrence,
} from "../commands/occurrenceCommands.js";
import { makeOccurrenceId } from "../recurrence/occurrenceIdentity.js";

const series = {
  id: "series-1", title: "Standup", calendarId: "calendar-default", revision: 1,
  timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-01T09:00", endLocal: "2026-08-01T09:30" },
  recurrence: { frequency: "daily", interval: 1, count: 5, missingDatePolicy: "skip" },
};
const occurrenceId = makeOccurrenceId(series.id, "2026-08-02T09:00");
const state = () => ({ events: [series], eventExceptions: [], occurrenceAliases: [] });

test("moving an occurrence changes timing but preserves its recurrence anchor", () => {
  const movedTiming = { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-04T11:00", endLocal: "2026-08-04T11:30" };
  const result = moveOccurrence(state(), occurrenceId, movedTiming, { id: "exception-1" });
  assert.equal(result.exception.recurrenceAnchor, "2026-08-02T09:00");
  assert.equal(result.exception.type, "moved");
  assert.deepEqual(result.exception.timing, movedTiming);
});

test("cancel and restore preserve exact prior exception state", () => {
  const modified = modifyOccurrence(state(), occurrenceId, { title: "Late standup" }, { id: "exception-1" });
  const beforeCancel = modified.state;
  const cancelled = cancelOccurrence(beforeCancel, occurrenceId, { id: "exception-2" });
  const restored = restoreOccurrence(cancelled.state, cancelled.removed);
  assert.deepEqual(restored.state.eventExceptions, beforeCancel.eventExceptions);
});

test("added occurrences do not require a generated recurrence anchor", () => {
  const result = addOccurrence(state(), series.id, {
    title: "Bonus", calendarId: "calendar-default",
    timing: { kind: "all-day", startDate: "2026-08-10", endDateExclusive: "2026-08-11" },
  }, { id: "added-1", occurrenceId: "bonus-occurrence" });
  assert.equal(result.exception.type, "added");
  assert.equal(result.exception.occurrenceId, "bonus-occurrence");
});

test("expected revision conflicts do not mutate state", () => {
  const before = state();
  assert.throws(() => cancelOccurrence(before, occurrenceId, { id: "x", expectedSeriesRevision: 9 }), /revision conflict/);
  assert.deepEqual(before.eventExceptions, []);
});
