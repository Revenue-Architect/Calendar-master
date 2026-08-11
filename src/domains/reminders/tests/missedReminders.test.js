import assert from "node:assert/strict";
import test from "node:test";

import {
  MISSED_LOOKBACK_MINUTES,
  createScheduledReminder,
  getDueReminders,
  getExpiredReminders,
  getMissedReminders,
  markRemindersMissed,
} from "../index.js";

/* The gap these close: a reminder whose moment passed while the notebook was
   closed was never delivered and never cancelled. `getDueReminders` will not
   return it — five minutes late is the whole window — so it sat in the ledger as
   `scheduled` for ever, and nothing ever mentioned it. */

const NOW = "2026-08-11T09:00";
const at = (scheduledFor, id = scheduledFor) => createScheduledReminder({
  source: { domain: "event", entityId: `evt-${id}`, occurrenceId: null, intentId: "alert:0" },
  title: `Reminder ${id}`,
  body: "Starting now",
  scheduledFor,
}, { now: "2026-08-01T00:00" });

test("a reminder that came due while nothing was running is reported, not fired", () => {
  const records = [at("2026-08-11T07:30")];
  assert.deepEqual(getDueReminders(records, NOW), [], "an hour and a half late is not due");
  const missed = getMissedReminders(records, NOW);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].scheduledFor, "2026-08-11T07:30");
});

test("the two windows do not overlap: what is due is not also missed", () => {
  /* Inside the grace it is an alarm; outside it, a report. Never both, or the
     same reminder would ring and be listed as having been missed. */
  const records = [at("2026-08-11T08:57"), at("2026-08-11T08:50")];
  const due = getDueReminders(records, NOW).map((r) => r.scheduledFor);
  const missed = getMissedReminders(records, NOW).map((r) => r.scheduledFor);
  assert.deepEqual(due, ["2026-08-11T08:57"]);
  assert.deepEqual(missed, ["2026-08-11T08:50"]);
  assert.equal(due.filter((v) => missed.includes(v)).length, 0);
});

test("a reminder still in the future is neither", () => {
  const records = [at("2026-08-11T11:00")];
  assert.deepEqual(getDueReminders(records, NOW), []);
  assert.deepEqual(getMissedReminders(records, NOW), []);
});

test("the most recently missed comes first", () => {
  const records = [at("2026-08-09T09:00"), at("2026-08-11T06:00"), at("2026-08-10T09:00")];
  assert.deepEqual(
    getMissedReminders(records, NOW).map((r) => r.scheduledFor),
    ["2026-08-11T06:00", "2026-08-10T09:00", "2026-08-09T09:00"],
  );
});

test("older than the lookback is expired, not missed", () => {
  /* Reopening a notebook after a month must not produce a wall of things you
     long ago stopped caring about — but they cannot stay active either, or every
     open re-examines them for the life of the notebook. */
  const old = at("2026-07-01T09:00");
  const recent = at("2026-08-10T09:00");
  const records = [old, recent];
  assert.deepEqual(getMissedReminders(records, NOW).map((r) => r.id), [recent.id]);
  assert.deepEqual(getExpiredReminders(records, NOW).map((r) => r.id), [old.id]);
});

test("the lookback boundary belongs to exactly one of them", () => {
  const boundary = "2026-07-28T09:00"; /* exactly 14 days before NOW */
  const records = [at(boundary)];
  assert.equal(getMissedReminders(records, NOW).length, 1, "on the boundary it is still worth reporting");
  assert.equal(getExpiredReminders(records, NOW).length, 0);
  assert.equal(MISSED_LOOKBACK_MINUTES, 14 * 24 * 60);
});

test("marking them missed takes them out of every window for good", () => {
  const records = [at("2026-08-11T07:30"), at("2026-08-10T09:00")];
  const marked = markRemindersMissed(records, records.map((r) => r.id), { now: NOW });
  assert.deepEqual(marked.map((r) => r.status), ["missed", "missed"]);
  assert.deepEqual(getMissedReminders(marked, NOW), []);
  assert.deepEqual(getDueReminders(marked, NOW), []);
  assert.deepEqual(getExpiredReminders(marked, NOW), []);
});

test("a missed reminder does not claim it reached anyone", () => {
  const records = [at("2026-08-11T07:30")];
  const [marked] = markRemindersMissed(records, [records[0].id], { now: NOW });
  assert.equal(marked.status, "missed");
  assert.equal(marked.deliveredAt, null, "nothing was delivered");
  assert.equal(marked.attemptCount, 0, "and nothing was attempted");
});

test("marking ids the ledger has never heard of is a no-op, not a throw", () => {
  /* The set is gathered from the same ledger it is applied to, but a reconcile
     can land in between. That is not an error worth crashing an open on. */
  const records = [at("2026-08-11T07:30")];
  assert.deepEqual(markRemindersMissed(records, ["nope"], { now: NOW }), records);
  assert.deepEqual(markRemindersMissed(records, [], { now: NOW }), records);
  assert.deepEqual(markRemindersMissed(records, null, { now: NOW }), records);
});

test("a snoozed reminder can be missed too", () => {
  /* Snoozing moves the schedule; if the notebook closes before the new time, the
     snooze is exactly as missable as the original. */
  const records = [{ ...at("2026-08-11T06:00"), status: "snoozed", scheduledFor: "2026-08-11T06:30" }];
  assert.deepEqual(getMissedReminders(records, NOW).map((r) => r.scheduledFor), ["2026-08-11T06:30"]);
});

test("statuses that are already finished are left alone", () => {
  for (const status of ["delivered", "dismissed", "cancelled", "superseded", "failed", "missed"]) {
    const records = [{ ...at("2026-08-11T07:30"), status }];
    assert.deepEqual(getMissedReminders(records, NOW), [], `${status} should not be reported as missed`);
    assert.deepEqual(getExpiredReminders(records, NOW), [], `${status} should not expire again`);
  }
});
