import assert from "node:assert/strict";
import test from "node:test";

import {
  awardTaskCompletion,
  createMotivationLedger,
  normalizeMotivationLedger,
  reverseLatestTaskAward,
} from "./ledger.js";

const award = {
  id: "award-1",
  source: { domain: "task", entityId: "task-1", occurrenceId: null },
  amount: 40,
  occurredAt: "2026-08-10T09:00",
  planningDate: "2026-08-10",
};

test("initializes an auditable opening balance for legacy xp", () => {
  const ledger = createMotivationLedger({ openingBalance: 90 });
  assert.deepEqual(ledger.entries[0], {
    id: "legacy-opening-balance:v1", kind: "opening-balance", reason: "legacy-opening-balance",
    amount: 90, policyVersion: "reward-v1", source: null, occurredAt: null,
    planningDate: null, reversalOf: null,
  });
});

test("awards a completion idempotently and reverses the active source award", () => {
  const first = awardTaskCompletion(createMotivationLedger(), award);
  const retry = awardTaskCompletion(first, award);
  const reversed = reverseLatestTaskAward(retry, award.source, {
    id: "reverse-1", occurredAt: "2026-08-10T10:00",
  });

  assert.equal(retry.entries.length, 1);
  assert.equal(reversed.entries.length, 2);
  assert.equal(reversed.entries[1].amount, -40);
  assert.equal(reversed.entries[1].reversalOf, "award-1");
});

test("does not create a second active award when a completion action is retried with a new id", () => {
  const first = awardTaskCompletion(createMotivationLedger(), award);
  const retry = awardTaskCompletion(first, { ...award, id: "award-retry" });

  assert.equal(retry.entries.length, 1);
});

test("a later completion can earn again after a reversal", () => {
  const completed = awardTaskCompletion(createMotivationLedger(), award);
  const reopened = reverseLatestTaskAward(completed, award.source, { id: "reverse-1" });
  const recompleted = awardTaskCompletion(reopened, {
    ...award, id: "award-2", occurredAt: "2026-08-10T11:00",
  });

  assert.deepEqual(recompleted.entries.map((entry) => entry.amount), [40, -40, 40]);
});

test("rejects an orphaned or malformed reversal rather than accepting an unverifiable audit trail", () => {
  const reversal = {
    id: "reverse-1", kind: "reversal", reason: "task-reopened", amount: -40,
    policyVersion: "reward-v1", source: award.source, occurredAt: null,
    planningDate: "2026-08-10", reversalOf: "missing-award",
  };

  assert.throws(() => normalizeMotivationLedger({ schemaVersion: 1, entries: [reversal] }), /references an unknown award/);
  assert.throws(() => normalizeMotivationLedger({
    schemaVersion: 1,
    entries: [{ ...reversal, reversalOf: null }],
  }), /requires an award reference/);
});
