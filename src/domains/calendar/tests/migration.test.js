import assert from "node:assert/strict";
import test from "node:test";

import { migrateV4ToV5 } from "../migrations/migrateV4ToV5.js";
import { validatePlannerStateV5 } from "../migrations/validatePlannerStateV5.js";

test("v4 inclusive all-day range becomes exclusive v5 timing", () => {
  const state = {
    events: [{ id: "offsite", title: "Offsite", date: "2026-08-11", endDate: "2026-08-13", allDay: true, start: 0, dur: 0 }],
    tasks: [], notes: [], overrides: {},
  };
  const migrated = migrateV4ToV5(state);
  assert.deepEqual(migrated.events[0].timing, {
    kind: "all-day", startDate: "2026-08-11", endDateExclusive: "2026-08-14",
  });
  assert.equal(migrated.events[0].calendarId, "calendar-default");
  assert.equal("date" in migrated.events[0], false);
});

test("v4 timed duration rolls over into the next local day", () => {
  const state = {
    events: [{ id: "late", title: "Late", date: "2026-08-09", start: 1410, dur: 90 }],
    tasks: [{ id: "task", date: "2026-08-09", title: "Keep task shape" }],
    notes: [], overrides: {},
  };
  const migrated = migrateV4ToV5(state);
  assert.deepEqual(migrated.events[0].timing, {
    kind: "timed", timeZoneMode: "floating",
    startLocal: "2026-08-09T23:30", endLocal: "2026-08-10T01:00",
  });
  assert.deepEqual(migrated.tasks, state.tasks);
});

test("calendar overrides become exceptions while task overrides remain", () => {
  const state = {
    events: [{ id: "series", title: "Series", date: "2026-08-09", start: 540, dur: 30, repeat: { freq: "daily", interval: 1 } }],
    tasks: [{ id: "habit", date: "2026-08-09", title: "Habit" }], notes: [],
    overrides: {
      "series@2026-08-10": { deleted: true },
      "habit@2026-08-10": { done: true },
    },
  };
  const migrated = migrateV4ToV5(state);
  assert.equal(migrated.eventExceptions[0].type, "cancelled");
  assert.deepEqual(migrated.overrides, { "habit@2026-08-10": { done: true } });
  assert.equal(migrated.events[0].recurrence.frequency, "daily");
});

test("v5 validation rejects malformed collections and timing", () => {
  assert.throws(() => validatePlannerStateV5({ schemaVersion: 5 }), /calendars/);
  assert.throws(() => validatePlannerStateV5({
    schemaVersion: 5, calendars: [{ id: "calendar-default" }],
    events: [{ id: "x", title: "X", calendarId: "calendar-default" }],
    eventExceptions: [], occurrenceAliases: [], tasks: [], notes: [], overrides: {},
  }), /timing/);
});
