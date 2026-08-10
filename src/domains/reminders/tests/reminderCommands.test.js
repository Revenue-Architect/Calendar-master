import assert from "node:assert/strict";
import test from "node:test";

import { deliverReminder, dismissReminder, snoozeReminder } from "../commands/reminderCommands.js";
import { createScheduledReminder } from "../model/reminder.js";
import { getDueReminders } from "../queries/reminderQueries.js";

const record = (id, scheduledFor) => ({
  ...createScheduledReminder({
    source: { domain: "task", entityId: id, occurrenceId: null, intentId: "r" },
    title: id, body: "", scheduledFor,
  }, { now: "2026-08-10T08:00" }),
});

test("delivers only recent due records and caps a burst", () => {
  const records = [
    record("a", "2026-08-10T08:55"), record("b", "2026-08-10T08:56"),
    record("c", "2026-08-10T08:57"), record("d", "2026-08-10T08:58"),
    record("old", "2026-08-10T07:00"),
  ];

  assert.deepEqual(getDueReminders(records, "2026-08-10T09:00").map((item) => item.source.entityId), ["a", "b", "c"]);
});

test("delivery, snooze, and dismissal change only the ledger", () => {
  const first = record("a", "2026-08-10T08:55");
  const delivered = deliverReminder([first], first.id, { now: "2026-08-10T09:00" });
  assert.equal(delivered[0].status, "delivered");
  assert.equal(delivered[0].attemptCount, 1);

  const snoozed = snoozeReminder([first], first.id, { now: "2026-08-10T09:00", until: "2026-08-10T09:15" });
  assert.equal(snoozed[0].status, "snoozed");
  assert.equal(snoozed[0].scheduledFor, "2026-08-10T09:15");

  const dismissed = dismissReminder(snoozed, first.id, { now: "2026-08-10T09:01" });
  assert.equal(dismissed[0].status, "dismissed");
});
