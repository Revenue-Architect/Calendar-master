/**
 * Calendar Master — Morph Transaction State Machine
 *
 * Coordinates multi-phase spatial transitions (open, in-flight reversal, commit, cancel).
 * Ensures stale async callbacks never mutate the current transaction state.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §7
 */

export const MORPH_STATES = Object.freeze({
  IDLE: "idle",
  MEASURING: "measuring",
  OPENING: "opening",
  OPEN: "open",
  RECONFIGURING: "reconfiguring",
  VALIDATING: "validating",
  COMMITTING: "committing",
  DESTINATION_WAIT: "destination-wait",
  CLOSING: "closing",
  CANCELLING: "cancelling",
  SETTLED: "settled",
});

export function createMorphTransaction({
  onStateChange,
} = {}) {
  let state = MORPH_STATES.IDLE;
  let currentRunId = 0;
  let currentKey = null;
  let sourceSnapshot = null;
  let targetSnapshot = null;
  let inFlightProgress = 0;

  function transitionTo(nextState, runId) {
    if (runId != null && runId !== currentRunId) {
      return false; // Ignore stale callbacks
    }
    state = nextState;
    if (typeof onStateChange === "function") {
      onStateChange({
        state,
        runId: currentRunId,
        key: currentKey,
        sourceSnapshot,
        targetSnapshot,
        inFlightProgress,
      });
    }
    return true;
  }

  function startOpen({ key, source }) {
    currentRunId += 1;
    currentKey = key;
    sourceSnapshot = source || null;
    targetSnapshot = null;
    inFlightProgress = 0;
    transitionTo(MORPH_STATES.OPENING, currentRunId);
    return currentRunId;
  }

  function settleOpen(runId) {
    if (runId === currentRunId && state === MORPH_STATES.OPENING) {
      inFlightProgress = 1;
      return transitionTo(MORPH_STATES.OPEN, runId);
    }
    return false;
  }

  function startClose({ target, runId } = {}) {
    // If runId not specified, start closing the active transaction
    if (runId != null && runId !== currentRunId) return false;
    if (target) targetSnapshot = target;

    if (state === MORPH_STATES.OPENING) {
      // In-flight reversal
      return transitionTo(MORPH_STATES.CANCELLING, currentRunId);
    }
    return transitionTo(MORPH_STATES.CLOSING, currentRunId);
  }

  function startCommit({ runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    return transitionTo(MORPH_STATES.COMMITTING, currentRunId);
  }

  function settleClose(runId) {
    if (runId === currentRunId) {
      inFlightProgress = 0;
      transitionTo(MORPH_STATES.SETTLED, runId);
      transitionTo(MORPH_STATES.IDLE, runId);
      currentKey = null;
      sourceSnapshot = null;
      targetSnapshot = null;
      return true;
    }
    return false;
  }

  function setProgress(p, runId) {
    if (runId != null && runId !== currentRunId) return;
    inFlightProgress = Math.max(0, Math.min(1, p));
  }

  function getSnapshot() {
    return {
      state,
      runId: currentRunId,
      key: currentKey,
      sourceSnapshot,
      targetSnapshot,
      inFlightProgress,
    };
  }

  return {
    getState: () => state,
    getRunId: () => currentRunId,
    startOpen,
    settleOpen,
    startClose,
    startCommit,
    settleClose,
    setProgress,
    getSnapshot,
  };
}
