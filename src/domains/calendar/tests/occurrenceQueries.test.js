import assert from "node:assert/strict";
import test from "node:test";

import {
  getNextEventOccurrence,
  getOccurrence,
  getOccurrencesForRange,
  getOrphanedExceptions,
  previewRecurrence,
} from "../queries/occurrenceQueries.js";
import { makeOccurrenceId } from "../recurrence/occurrenceIdentity.js";

const series = {
  id: "series", title: "Daily", calendarId: "calendar-default", revision: 1,
  timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-01T09:00", endLocal: "2026-08-01T09:30" },
  recurrence: { frequency: "daily", interval: 1, count: 3, missingDatePolicy: "skip" },
};

test("cancelled generated positions consume count but are absent from results", () => {
  const cancelled = {
    id: "cancelled", type: "cancelled", seriesId: series.id,
    occurrenceId: makeOccurrenceId(series.id, "2026-08-02T09:00"),
    recurrenceAnchor: "2026-08-02T09:00", revision: 1,
  };
  const state = { events: [series], eventExceptions: [cancelled], occurrenceAliases: [] };
  const result = getOccurrencesForRange(state, "2026-08-01", "2026-08-10");
  assert.deepEqual(result.map((item) => item.recurrenceAnchor), ["2026-08-01T09:00", "2026-08-03T09:00"]);
});

test("added occurrences do not consume count", () => {
  const added = {
    id: "add", type: "added", seriesId: series.id, occurrenceId: "bonus", revision: 1,
    event: { title: "Bonus", calendarId: "calendar-default", timing: { kind: "all-day", startDate: "2026-08-04", endDateExclusive: "2026-08-05" }, recurrence: null, alerts: [], revision: 1 },
  };
  const state = { events: [series], eventExceptions: [added], occurrenceAliases: [] };
  assert.equal(getOccurrencesForRange(state, "2026-08-01", "2026-08-10").length, 4);
});

test("aliases resolve old occurrence references", () => {
  const oldId = "old-occurrence";
  const currentId = makeOccurrenceId(series.id, "2026-08-01T09:00");
  const state = { events: [series], eventExceptions: [], occurrenceAliases: [{ from: oldId, to: currentId }] };
  assert.equal(getOccurrence(state, oldId).id, currentId);
});

test("preview is finite and orphan detection finds stale anchors", () => {
  assert.equal(previewRecurrence(series, 2).length, 2);
  const orphan = { id: "orphan", type: "cancelled", seriesId: series.id, occurrenceId: "stale", recurrenceAnchor: "2026-09-01T09:00", revision: 1 };
  const state = { events: [series], eventExceptions: [orphan], occurrenceAliases: [] };
  assert.deepEqual(getOrphanedExceptions(state, series.id).map((item) => item.id), ["orphan"]);
});

test("a moved occurrence appears only at its target range", () => {
  const moved = {
    id: "moved", type: "moved", seriesId: series.id,
    occurrenceId: makeOccurrenceId(series.id, "2026-08-01T09:00"),
    recurrenceAnchor: "2026-08-01T09:00", revision: 1,
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-10T11:00", endLocal: "2026-08-10T11:30" },
  };
  const state = { events: [series], eventExceptions: [moved], occurrenceAliases: [] };
  assert.equal(getOccurrencesForRange(state, "2026-08-01", "2026-08-02").length, 0);
  assert.equal(getOccurrencesForRange(state, "2026-08-10", "2026-08-11")[0].recurrenceAnchor, "2026-08-01T09:00");
});

test("finds a moved recurring event by its actual future date", () => {
  const movedId = makeOccurrenceId(series.id, "2026-08-01T09:00");
  const state = {
    events: [series],
    eventExceptions: [{
      id: "moved", type: "moved", seriesId: series.id, occurrenceId: movedId,
      recurrenceAnchor: "2026-08-01T09:00", revision: 1,
      timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-10T11:00", endLocal: "2026-08-10T11:30" },
    }],
    occurrenceAliases: [],
  };

  const occurrence = getNextEventOccurrence(state, series.id, "2026-08-04");
  assert.equal(occurrence.id, movedId);
  assert.equal(occurrence.timing.startLocal, "2026-08-10T11:00");
});

test("a non-recurring multi-day event is returned after its start date", () => {
  const trip = {
    id: "trip", title: "Trip", calendarId: "calendar-default", recurrence: null,
    timing: { kind: "all-day", startDate: "2026-08-01", endDateExclusive: "2026-08-04" },
  };
  const state = { events: [trip], eventExceptions: [], occurrenceAliases: [] };
  assert.equal(getOccurrencesForRange(state, "2026-08-03", "2026-08-04")[0].id, "trip");
});

test("a recurring multi-day occurrence is returned on its continuation day", () => {
  const trip = {
    id: "trips", title: "Trips", calendarId: "calendar-default",
    recurrence: { frequency: "weekly", interval: 1, missingDatePolicy: "skip" },
    timing: { kind: "all-day", startDate: "2026-08-03", endDateExclusive: "2026-08-05" },
  };
  const state = { events: [trip], eventExceptions: [], occurrenceAliases: [] };
  assert.equal(getOccurrencesForRange(state, "2026-08-04", "2026-08-05")[0].recurrenceAnchor, "2026-08-03");
});
