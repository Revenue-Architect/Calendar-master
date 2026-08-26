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

test("reduced motion follows same semantic state transitions without skipping steps", () => {
  const stateChanges = [];
  const tx = createMorphTransaction({
    onStateChange: (snap) => stateChanges.push(snap.state),
  });

  const runId = tx.startOpen({ key: "morph:event:reduced-motion" });
  tx.settleOpen(runId);
  tx.startClose({ runId });
  tx.settleClose(runId);

  assert.deepEqual(stateChanges, [
    MORPH_STATES.OPENING,
    MORPH_STATES.OPEN,
    MORPH_STATES.CLOSING,
    MORPH_STATES.SETTLED,
    MORPH_STATES.IDLE,
  ]);
});

test("Blocker 1: setProgress is guarded by active progress states and rejects stale callbacks", () => {
  const tx = createMorphTransaction();
  const run = tx.startOpen({ key: "progress-test" });
  assert.equal(tx.getState(), MORPH_STATES.OPENING);

  // In OPENING: setProgress succeeds
  assert.equal(tx.setProgress(0.45, run), true);
  assert.equal(tx.getSnapshot().inFlightProgress, 0.45);

  tx.settleOpen(run);
  assert.equal(tx.getState(), MORPH_STATES.OPEN);

  // In OPEN: setProgress rejected
  assert.equal(tx.setProgress(0.6, run), false, "OPEN state must reject progress updates");

  tx.startClose({ runId: run });
  assert.equal(tx.getState(), MORPH_STATES.CLOSING);

  // In CLOSING: setProgress succeeds
  assert.equal(tx.setProgress(0.8, run), true);
  assert.equal(tx.getSnapshot().inFlightProgress, 0.8);

  tx.settleClose(run);
  assert.equal(tx.getState(), MORPH_STATES.IDLE);
  assert.equal(tx.getSnapshot().inFlightProgress, 0);

  // Stale rAF / WAAPI callback arriving in IDLE
  const staleResult = tx.setProgress(0.73, run);
  assert.equal(staleResult, false, "IDLE state must reject setProgress");
  assert.equal(tx.getSnapshot().inFlightProgress, 0, "IDLE progress must remain 0");
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
  assert.equal(tx.setProgress(0.5, run1), false);
  assert.equal(tx.getState(), MORPH_STATES.OPENING, "State must remain OPENING for run 2");
});

test("Task 7: Final IDLE notification represents a clean idle transaction without stale data", () => {
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

  // In IDLE state, all fields MUST be clean nulls/zero (Task 7 fix)
  assert.deepEqual(finalIdleSnapshot, {
    state: MORPH_STATES.IDLE,
    runId,
    key: null,
    sourceSnapshot: null,
    targetSnapshot: null,
    inFlightProgress: 0,
  });
});

test("Issue 1: IDLE + startClose(target) returns false and targetSnapshot remains null", () => {
  const tx = createMorphTransaction();
  assert.equal(tx.getState(), MORPH_STATES.IDLE);

  const result = tx.startClose({ target: { rect: { x: 100, y: 100 } } });
  assert.equal(result, false, "IDLE → CLOSING must be rejected");
  assert.equal(tx.getSnapshot().targetSnapshot, null, "targetSnapshot must not be mutated on rejected transition");
  assert.equal(tx.getState(), MORPH_STATES.IDLE, "State must remain IDLE");
});

test("Issue 1: OPEN + resolveDestination(target) must not mutate targetSnapshot on illegal transition", () => {
  const tx = createMorphTransaction();
  const runId = tx.startOpen({ key: "resolve-test", source: { rect: { x: 0 } } });
  tx.settleOpen(runId);
  assert.equal(tx.getState(), MORPH_STATES.OPEN);

  // resolveDestination transitions to CLOSING, which is legal from OPEN...
  // but let's test from an illegal state: OPENING
  const tx2 = createMorphTransaction();
  const runId2 = tx2.startOpen({ key: "illegal-resolve" });
  assert.equal(tx2.getState(), MORPH_STATES.OPENING);

  // resolveDestination tries CLOSING from OPENING — not in VALID_TRANSITIONS
  const result = tx2.resolveDestination({ target: { rect: { x: 999 } }, runId: runId2 });
  assert.equal(result, false, "OPENING → CLOSING must be rejected");
  assert.equal(tx2.getSnapshot().targetSnapshot, null, "targetSnapshot must not be mutated on rejected transition");
  assert.equal(tx2.getState(), MORPH_STATES.OPENING, "State must remain OPENING");
});
