import assert from "node:assert/strict";
import test from "node:test";

import { awardTaskCompletion, createMotivationLedger, reverseLatestTaskAward } from "../model/ledger.js";
import { getMotivationSummary } from "./motivationSummary.js";

function award(ledger, id, date) {
  return awardTaskCompletion(ledger, {
    id,
    source: { domain: "task", entityId: id, occurrenceId: null },
    amount: 30,
    occurredAt: `${date}T09:00`,
    planningDate: date,
  });
}

test("derives points, a versioned level, and neutral task-completion streaks", () => {
  let ledger = createMotivationLedger({ openingBalance: 280 });
  ledger = award(ledger, "a", "2026-08-08");
  ledger = award(ledger, "b", "2026-08-09");
  ledger = award(ledger, "c", "2026-08-10");
  const summary = getMotivationSummary(ledger, { todayDate: "2026-08-10" });

  assert.equal(summary.points, 370);
  assert.equal(summary.level, 2);
  assert.equal(summary.levelProgress, 70 / 300);
  assert.equal(summary.streak, 3);
});

test("reversed awards no longer contribute to totals or streaks", () => {
  let ledger = award(createMotivationLedger(), "a", "2026-08-09");
  ledger = award(ledger, "b", "2026-08-10");
  ledger = reverseLatestTaskAward(ledger, { domain: "task", entityId: "b", occurrenceId: null }, { id: "reverse-b" });
  const summary = getMotivationSummary(ledger, { todayDate: "2026-08-10" });

  assert.equal(summary.points, 30);
  assert.equal(summary.streak, 1);
});

test("disabled controls hide optional motivation display without altering the ledger", () => {
  const ledger = award(createMotivationLedger(), "a", "2026-08-10");
  const summary = getMotivationSummary(ledger, {
    todayDate: "2026-08-10",
    controls: { points: false, levels: false, streaks: false },
  });

  assert.equal(summary.points, null);
  assert.equal(summary.level, null);
  assert.equal(summary.streak, null);
  assert.equal(ledger.entries.length, 1);
});
