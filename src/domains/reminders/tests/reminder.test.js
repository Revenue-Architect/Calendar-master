import assert from "node:assert/strict";
import test from "node:test";

import {
  createScheduledReminder,
  normalizeReminderRecord,
  reminderScheduleId,
} from "../model/reminder.js";

const intent = {
  source: { domain: "task", entityId: "task-1", occurrenceId: null, intentId: "reminder-1" },
  title: "Follow up with Ana",
  body: "15m before planned time",
  scheduledFor: "2026-08-10T08:45",
};

test("a schedule id is deterministic for one source intent and resolved time", () => {
  assert.equal(reminderScheduleId(intent), reminderScheduleId({ ...intent }));
  assert.notEqual(reminderScheduleId(intent), reminderScheduleId({ ...intent, scheduledFor: "2026-08-10T09:00" }));
});

test("a scheduled record keeps source identity and audit defaults", () => {
  const record = createScheduledReminder(intent, { now: "2026-08-10T08:00" });

  assert.equal(record.status, "scheduled");
  assert.equal(record.attemptCount, 0);
  assert.equal(record.source.entityId, "task-1");
  assert.equal(record.createdAt, "2026-08-10T08:00");
  assert.deepEqual(normalizeReminderRecord(record), record);
});

test("invalid reminder status and local delivery time are rejected", () => {
  assert.throws(() => normalizeReminderRecord({ ...createScheduledReminder(intent), status: "later" }), /status/);
  assert.throws(() => createScheduledReminder({ ...intent, scheduledFor: "2026-08-10T25:00" }), /scheduledFor/);
});
