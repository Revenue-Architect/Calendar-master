import test from "node:test";
import assert from "node:assert/strict";
import { createMorphTransaction, MORPH_STATES } from "./morphTransaction.js";

test("morph transaction standard lifecycle: measure -> open -> settle -> close -> settled -> idle", () => {
  const stateChanges = [];
  const tx = createMorphTransaction({
    onStateChange: (snap) => stateChanges.push({ ...snap }),
  });

  assert.equal(tx.getState(), MORPH_STATES.IDLE);

  const runId = tx.startMeasure({ key: "morph:event:test", source: { rect: { x: 10, y: 10, width: 100, height: 50 } } });
  assert.equal(tx.getState(), MORPH_STATES.MEASURING);

  tx.startOpen({ runId });
  assert.equal(tx.getState(), MORPH_STATES.OPENING);

  tx.settleOpen(runId);
  assert.equal(tx.getState(), MORPH_STATES.OPEN);

  tx.startClose({ runId });
  assert.equal(tx.getState(), MORPH_STATES.CLOSING);

  tx.settleClose(runId);
  assert.equal(tx.getState(), MORPH_STATES.IDLE);

  // Verify transition sequence
  const states = stateChanges.map((s) => s.state);
  assert.deepEqual(states, [
    MORPH_STATES.MEASURING,
    MORPH_STATES.OPENING,
    MORPH_STATES.OPEN,
    MORPH_STATES.CLOSING,
    MORPH_STATES.SETTLED,
    MORPH_STATES.IDLE,
  ]);
});

test("morph transaction commit and destination-wait lifecycle", () => {
  const tx = createMorphTransaction();
  const runId = tx.startOpen({ key: "morph:task:new-task", source: { rect: { x: 50, y: 50 } } });
  tx.settleOpen(runId);

  // User edits and submits
  assert.ok(tx.startReconfigure({ runId }));
  assert.equal(tx.getState(), MORPH_STATES.RECONFIGURING);

  assert.ok(tx.startValidate({ runId }));
  assert.equal(tx.getState(), MORPH_STATES.VALIDATING);

  // Validation fails once -> reverts to OPEN
  assert.ok(tx.failValidate({ runId }));
  assert.equal(tx.getState(), MORPH_STATES.OPEN);

  // Validate again and pass -> commit
  assert.ok(tx.startValidate({ runId }));
  assert.ok(tx.startCommit({ runId }));
  assert.equal(tx.getState(), MORPH_STATES.COMMITTING);

  // Enter destination wait
  assert.ok(tx.waitForDestination({ runId }));
  assert.equal(tx.getState(), MORPH_STATES.DESTINATION_WAIT);

  // Destination resolves in DOM -> closes to target
  assert.ok(tx.resolveDestination({ target: { rect: { x: 50, y: 200 } }, runId }));
  assert.equal(tx.getState(), MORPH_STATES.CLOSING);

  assert.ok(tx.settleClose(runId));
  assert.equal(tx.getState(), MORPH_STATES.IDLE);
});

test("destination wait fallback on timeout", () => {
  const tx = createMorphTransaction();
  const runId = tx.startOpen({ key: "morph:slot:1" });
  tx.settleOpen(runId);
  tx.startCommit({ runId });
  tx.waitForDestination({ runId });

  // Timeout occurs before destination mounts
  assert.ok(tx.fallbackDestination({ runId }));
  assert.equal(tx.getState(), MORPH_STATES.CLOSING);

  tx.settleClose(runId);
  assert.equal(tx.getState(), MORPH_STATES.IDLE);
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

test("Task 6: transition matrix rejects illegal state transitions", () => {
  const tx = createMorphTransaction();

  // IDLE cannot jump directly to COMMITTING, CLOSING, or SETTLED
  assert.equal(tx.startCommit(), false, "IDLE -> COMMITTING must be rejected");
  assert.equal(tx.startClose(), false, "IDLE -> CLOSING must be rejected");
  assert.equal(tx.settleClose(), false, "IDLE -> SETTLED must be rejected");
  assert.equal(tx.getState(), MORPH_STATES.IDLE);

  // Open transaction
  const runId = tx.startOpen({ key: "test-illegal" });
  assert.equal(tx.getState(), MORPH_STATES.OPENING);

  // OPENING cannot jump directly to COMMITTING or RECONFIGURING
  assert.equal(tx.startCommit({ runId }), false, "OPENING -> COMMITTING must be rejected");
  assert.equal(tx.startReconfigure({ runId }), false, "OPENING -> RECONFIGURING must be rejected");

  tx.settleOpen(runId);
  assert.equal(tx.getState(), MORPH_STATES.OPEN);

  // OPEN cannot jump directly to SETTLED without CLOSING
  assert.equal(tx.settleClose(runId), false, "OPEN -> SETTLED must be rejected without closing");
});

test("Task 6: stale callbacks from older run IDs are strictly rejected", () => {
  const tx = createMorphTransaction();

  const run1 = tx.startOpen({ key: "item-1" });
  tx.settleOpen(run1);
  tx.startClose({ runId: run1 });
  tx.settleClose(run1);

  // Start a new transaction (run 2)
  const run2 = tx.startOpen({ key: "item-2" });
  assert.equal(tx.getState(), MORPH_STATES.OPENING);
  assert.equal(tx.getRunId(), run2);

  // Stale callbacks from run 1
  assert.equal(tx.settleOpen(run1), false);
  assert.equal(tx.startClose({ runId: run1 }), false);
  assert.equal(tx.settleClose(run1), false);
  assert.equal(tx.getState(), MORPH_STATES.OPENING, "State must remain OPENING for run 2");
});

test("Task 7: Final IDLE cleanup order ensures onStateChange receives null transaction data on IDLE", () => {
  let finalIdleSnapshot = null;
  let settledSnapshot = null;

  const tx = createMorphTransaction({
    onStateChange: (snap) => {
      if (snap.state === MORPH_STATES.SETTLED) {
        settledSnapshot = { ...snap };
      }
      if (snap.state === MORPH_STATES.IDLE) {
        finalIdleSnapshot = { ...snap };
      }
    },
  });

  const runId = tx.startOpen({
    key: "morph:event:cleanup-check",
    source: { rect: { x: 10, y: 20 } },
  });
  tx.settleOpen(runId);
  tx.startClose({
    runId,
    target: { rect: { x: 30, y: 40 } },
  });

  tx.settleClose(runId);

  // In SETTLED state, data was still present for listeners
  assert.ok(settledSnapshot);
  assert.equal(settledSnapshot.key, "morph:event:cleanup-check");
  assert.ok(settledSnapshot.sourceSnapshot);
  assert.ok(settledSnapshot.targetSnapshot);

  // In IDLE state, all fields MUST be clean nulls (Task 7 fix)
  assert.ok(finalIdleSnapshot);
  assert.equal(finalIdleSnapshot.state, MORPH_STATES.IDLE);
  assert.equal(finalIdleSnapshot.key, null, "currentKey must be null on IDLE");
  assert.equal(finalIdleSnapshot.sourceSnapshot, null, "sourceSnapshot must be null on IDLE");
  assert.equal(finalIdleSnapshot.targetSnapshot, null, "targetSnapshot must be null on IDLE");
  assert.equal(finalIdleSnapshot.inFlightProgress, 0, "inFlightProgress must be 0 on IDLE");
});
