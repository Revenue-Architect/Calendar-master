import assert from "node:assert/strict";
import test from "node:test";

import { loadReminderRecords, saveReminderRecords } from "./reminderStore.js";

const record = {
  id: "rem:task|task-1|series|r|2026-08-10T09:00",
  sourceKey: "task|task-1|series|r",
  source: { domain: "task", entityId: "task-1", occurrenceId: null, intentId: "r" },
  title: "Task", body: "", scheduledFor: "2026-08-10T09:00", status: "scheduled",
  attemptCount: 0, lastErrorCategory: null, createdAt: null, updatedAt: null,
  deliveredAt: null, dismissedAt: null, snoozedAt: null,
};

function port(value = null) {
  let stored = value;
  return {
    get: async () => stored == null ? null : { value: stored },
    set: async (_key, value) => { stored = value; },
    value: () => stored,
  };
}

test("missing reminder storage reads as an empty ledger", async () => {
  assert.deepEqual(await loadReminderRecords(port()), []);
});

test("reminder records round-trip through their own storage key", async () => {
  const storage = port();
  await saveReminderRecords(storage, [record]);
  assert.deepEqual(await loadReminderRecords(storage), [record]);
});

test("malformed reminder storage is rejected rather than silently discarded", async () => {
  await assert.rejects(() => loadReminderRecords(port("not-json")), /invalid JSON/);
  await assert.rejects(() => loadReminderRecords(port("{}")), /array/);
});
