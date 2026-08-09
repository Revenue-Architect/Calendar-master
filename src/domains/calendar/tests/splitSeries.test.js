import assert from "node:assert/strict";
import test from "node:test";

import { splitSeries } from "../commands/seriesCommands.js";
import { resolveOccurrenceAlias } from "../recurrence/splitSeries.js";
import { makeOccurrenceId } from "../recurrence/occurrenceIdentity.js";

const series = {
  id: "series-1", title: "Course", calendarId: "calendar-default", revision: 1,
  timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-01T09:00", endLocal: "2026-08-01T10:00" },
  recurrence: { frequency: "daily", interval: 1, count: 5, missingDatePolicy: "skip" },
};

test("splitSeries assigns remaining count and future exceptions to a new series", () => {
  const futureId = makeOccurrenceId(series.id, "2026-08-04T09:00");
  const state = {
    events: [series],
    eventExceptions: [{
      id: "future-exception", type: "modified", seriesId: series.id,
      occurrenceId: futureId, recurrenceAnchor: "2026-08-04T09:00",
      patch: { title: "Special" }, revision: 1,
    }],
    occurrenceAliases: [],
  };
  const thirdId = makeOccurrenceId(series.id, "2026-08-03T09:00");
  const result = splitSeries(state, thirdId, { title: "New future" }, { newSeriesId: "series-2" });
  assert.equal(result.state.events.find((event) => event.id === "series-1").recurrence.count, 2);
  assert.equal(result.state.events.find((event) => event.id === "series-2").recurrence.count, 3);
  assert.equal(result.state.eventExceptions.find((item) => item.id === "future-exception").seriesId, "series-2");
  assert.equal(result.state.events.find((event) => event.id === "series-2").title, "New future");
  assert.equal(result.state.occurrenceAliases.length, 3);
});

test("alias resolution follows chains and rejects cycles", () => {
  assert.deepEqual(resolveOccurrenceAlias([{ from: "a", to: "b" }, { from: "b", to: "c" }], "a"), { status: "resolved", occurrenceId: "c", hops: 2 });
  assert.deepEqual(resolveOccurrenceAlias([{ from: "a", to: "b" }, { from: "b", to: "a" }], "a"), { status: "cycle", occurrenceId: "a" });
});

test("a failed split leaves all input collections untouched", () => {
  const state = { events: [series], eventExceptions: [], occurrenceAliases: [] };
  const before = structuredClone(state);
  assert.throws(() => splitSeries(state, makeOccurrenceId(series.id, "2026-09-01T09:00"), {}, { newSeriesId: "series-2" }), /not generated/);
  assert.deepEqual(state, before);
});
