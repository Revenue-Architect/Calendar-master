import test from "node:test";
import assert from "node:assert/strict";
import { createMorphTransaction, MORPH_STATES } from "./morphTransaction.js";

test("morph transaction lifecycle: open -> settle -> close -> settled", () => {
  const tx = createMorphTransaction();
  assert.equal(tx.getState(), MORPH_STATES.IDLE);

  const runId = tx.startOpen({ key: "morph:event:test", source: { rect: { x: 10, y: 10 } } });
  assert.equal(tx.getState(), MORPH_STATES.OPENING);
  assert.equal(tx.getRunId(), runId);

  const openSettled = tx.settleOpen(runId);
  assert.ok(openSettled);
  assert.equal(tx.getState(), MORPH_STATES.OPEN);

  tx.startClose({ runId });
  assert.equal(tx.getState(), MORPH_STATES.CLOSING);

  const closeSettled = tx.settleClose(runId);
  assert.ok(closeSettled);
  assert.equal(tx.getState(), MORPH_STATES.IDLE);
});

test("morph transaction ignores stale callbacks from previous run IDs", () => {
  const tx = createMorphTransaction();

  const run1 = tx.startOpen({ key: "item-1" });
  tx.startClose({ runId: run1 });
  tx.settleClose(run1);

  // Start a new transaction
  const run2 = tx.startOpen({ key: "item-2" });
  assert.equal(tx.getState(), MORPH_STATES.OPENING);

  // Stale callback from run 1 attempts to settle
  const staleResult = tx.settleOpen(run1);
  assert.equal(staleResult, false);
  assert.equal(tx.getState(), MORPH_STATES.OPENING); // Unchanged!
});

test("in-flight interruption reverses opening directly into cancelling state", () => {
  const tx = createMorphTransaction();

  const runId = tx.startOpen({ key: "interrupted-item" });
  assert.equal(tx.getState(), MORPH_STATES.OPENING);

  // User closes mid-flight before settleOpen
  tx.startClose({ runId });
  assert.equal(tx.getState(), MORPH_STATES.CANCELLING);

  tx.settleClose(runId);
  assert.equal(tx.getState(), MORPH_STATES.IDLE);
});
