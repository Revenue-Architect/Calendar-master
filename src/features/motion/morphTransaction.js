/**
 * Calendar Master — Morph Transaction State Machine
 *
 * Coordinates multi-phase spatial transitions (measure, open, in-flight reversal,
 * reconfigure, validate, commit, destination-wait, close, cancel, settle, idle).
 * Enforces transition legality matrix and isolates stale callbacks by run ID and state.
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

const VALID_TRANSITIONS = Object.freeze({
  [MORPH_STATES.IDLE]: [MORPH_STATES.MEASURING, MORPH_STATES.OPENING],
  [MORPH_STATES.MEASURING]: [MORPH_STATES.OPENING, MORPH_STATES.IDLE, MORPH_STATES.CANCELLING],
  [MORPH_STATES.OPENING]: [MORPH_STATES.OPEN, MORPH_STATES.CANCELLING],
  [MORPH_STATES.OPEN]: [MORPH_STATES.RECONFIGURING, MORPH_STATES.VALIDATING, MORPH_STATES.CLOSING],
  [MORPH_STATES.RECONFIGURING]: [MORPH_STATES.OPEN, MORPH_STATES.VALIDATING, MORPH_STATES.CLOSING],
  [MORPH_STATES.VALIDATING]: [MORPH_STATES.OPEN, MORPH_STATES.COMMITTING, MORPH_STATES.CLOSING],
  [MORPH_STATES.COMMITTING]: [MORPH_STATES.DESTINATION_WAIT, MORPH_STATES.CLOSING, MORPH_STATES.SETTLED],
  [MORPH_STATES.DESTINATION_WAIT]: [MORPH_STATES.CLOSING, MORPH_STATES.SETTLED],
  [MORPH_STATES.CLOSING]: [MORPH_STATES.SETTLED],
  [MORPH_STATES.CANCELLING]: [MORPH_STATES.SETTLED],
  [MORPH_STATES.SETTLED]: [MORPH_STATES.IDLE],
});

const PROGRESS_STATES = Object.freeze(
  new Set([
    MORPH_STATES.OPENING,
    MORPH_STATES.CLOSING,
    MORPH_STATES.CANCELLING,
  ])
);

export function createMorphTransaction({
  onStateChange,
} = {}) {
  let state = MORPH_STATES.IDLE;
  let currentRunId = 0;
  let currentKey = null;
  let sourceSnapshot = null;
  let targetSnapshot = null;
  let inFlightProgress = 0;

  function canTransitionTo(nextState) {
    const allowed = VALID_TRANSITIONS[state];
    return allowed ? allowed.includes(nextState) : false;
  }

  function transitionTo(nextState, runId) {
    if (runId != null && runId !== currentRunId) {
      return false; // Stale callback
    }
    if (!canTransitionTo(nextState)) {
      return false; // Illegal transition
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

  function startMeasure({ key, source } = {}) {
    if (state !== MORPH_STATES.IDLE) return false;
    currentRunId += 1;
    currentKey = key || null;
    sourceSnapshot = source || null;
    targetSnapshot = null;
    inFlightProgress = 0;
    return transitionTo(MORPH_STATES.MEASURING, currentRunId) ? currentRunId : false;
  }

  function startOpen({ key, source, runId } = {}) {
    if (state === MORPH_STATES.IDLE) {
      currentRunId += 1;
      currentKey = key || null;
      sourceSnapshot = source || null;
      targetSnapshot = null;
      inFlightProgress = 0;
      return transitionTo(MORPH_STATES.OPENING, currentRunId) ? currentRunId : false;
    }
    if (state === MORPH_STATES.MEASURING) {
      if (runId != null && runId !== currentRunId) return false;
      if (key) currentKey = key;
      if (source) sourceSnapshot = source;
      return transitionTo(MORPH_STATES.OPENING, currentRunId) ? currentRunId : false;
    }
    return false;
  }

  function settleOpen(runId) {
    if (runId != null && runId !== currentRunId) return false;
    if (state !== MORPH_STATES.OPENING) return false;
    inFlightProgress = 1;
    return transitionTo(MORPH_STATES.OPEN, currentRunId);
  }

  function startReconfigure({ runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    return transitionTo(MORPH_STATES.RECONFIGURING, currentRunId);
  }

  function cancelReconfigure({ runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    return transitionTo(MORPH_STATES.OPEN, currentRunId);
  }

  function startValidate({ runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    return transitionTo(MORPH_STATES.VALIDATING, currentRunId);
  }

  function failValidate({ runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    return transitionTo(MORPH_STATES.OPEN, currentRunId);
  }

  function startCommit({ runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    return transitionTo(MORPH_STATES.COMMITTING, currentRunId);
  }

  function waitForDestination({ runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    return transitionTo(MORPH_STATES.DESTINATION_WAIT, currentRunId);
  }

  function resolveDestination({ target, runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    if (target) targetSnapshot = target;
    return transitionTo(MORPH_STATES.CLOSING, currentRunId);
  }

  function fallbackDestination({ runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    return transitionTo(MORPH_STATES.CLOSING, currentRunId);
  }

  function startClose({ target, runId } = {}) {
    if (runId != null && runId !== currentRunId) return false;
    if (target) targetSnapshot = target;

    if (state === MORPH_STATES.OPENING || state === MORPH_STATES.MEASURING) {
      // In-flight reversal
      return transitionTo(MORPH_STATES.CANCELLING, currentRunId);
    }
    return transitionTo(MORPH_STATES.CLOSING, currentRunId);
  }

  function settleClose(runId) {
    if (runId != null && runId !== currentRunId) return false;
    if (
      state !== MORPH_STATES.CLOSING &&
      state !== MORPH_STATES.CANCELLING &&
      state !== MORPH_STATES.COMMITTING &&
      state !== MORPH_STATES.DESTINATION_WAIT
    ) {
      return false;
    }

    inFlightProgress = 0;

    // 1. Emit SETTLED state with existing snapshots so observers can read final state
    const settled = transitionTo(MORPH_STATES.SETTLED, currentRunId);
    if (!settled) return false;

    // 2. Task 7: Clear transaction data BEFORE transitioning to IDLE
    currentKey = null;
    sourceSnapshot = null;
    targetSnapshot = null;
    inFlightProgress = 0;

    // 3. Emit IDLE state with clean null data
    transitionTo(MORPH_STATES.IDLE, currentRunId);
    return true;
  }

  function setProgress(p, runId) {
    if (runId != null && runId !== currentRunId) return false;
    if (!PROGRESS_STATES.has(state)) return false;
    inFlightProgress = Math.max(0, Math.min(1, p));
    return true;
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
    startMeasure,
    startOpen,
    settleOpen,
    startReconfigure,
    cancelReconfigure,
    startValidate,
    failValidate,
    startCommit,
    waitForDestination,
    resolveDestination,
    fallbackDestination,
    startClose,
    settleClose,
    setProgress,
    getSnapshot,
  };
}
