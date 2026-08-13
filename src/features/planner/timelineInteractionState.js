/* Exclusive owner + commit/cancel lifecycle for one pointer or touch sequence.
 *
 * Coordinate arithmetic stays in timelineGesture.js. This module only answers:
 * is a press still a press, who owns it, what snapshot must come back if the
 * browser revokes the gesture, and whether the following click is still a tap.
 *
 * Surfaces keep their own event plumbing. They must not invent a second owner
 * or persist from a cancel path.
 */

import { gestureChangedAnything, movedEnoughToCancelHold } from "./timelineGesture.js";

export const INTERACTION_PHASES = Object.freeze({
  idle: "idle",
  armed: "armed",
  active: "active",
  committed: "committed",
  cancelled: "cancelled",
});

export const INTERACTION_OWNERS = Object.freeze({
  dayStream: "day-stream",
  capturedCard: "captured-card",
  weekGrid: "week-grid",
  external: "external",
});

export const INTERACTION_ORIGINS = Object.freeze({
  eventBody: "event-body",
  eventStart: "event-start",
  eventEnd: "event-end",
  actionBody: "action-body",
  actionCheck: "action-check",
  actionResize: "action-resize",
  join: "join",
  empty: "empty",
});

const CLICK_SUPPRESS_MS = 350;

function cloneSnapshot(value) {
  if (value == null || typeof value !== "object") return value ?? null;
  return { ...value };
}

function nowMs() {
  return Date.now();
}

export function createIdleInteraction() {
  return {
    phase: INTERACTION_PHASES.idle,
    owner: null,
    surface: null,
    input: null,
    origin: null,
    mode: null,
    id: null,
    before: null,
    proposal: null,
    suppressNextClick: false,
    suppressUntil: 0,
    sequence: 0,
  };
}

export function isIdleInteraction(state) {
  return !state || state.phase === INTERACTION_PHASES.idle;
}

export function clickFollowsCancelledArm(state, at = nowMs()) {
  return Boolean(state?.suppressNextClick && at < Number(state.suppressUntil || 0));
}

export function armInteraction(state, {
  owner,
  surface,
  input,
  origin,
  mode = null,
  id = null,
  before = null,
} = {}) {
  if (!owner || !origin) return state ?? createIdleInteraction();
  return {
    phase: INTERACTION_PHASES.armed,
    owner,
    surface: surface ?? null,
    input: input ?? null,
    origin,
    mode,
    id,
    before: cloneSnapshot(before),
    proposal: cloneSnapshot(before),
    suppressNextClick: false,
    suppressUntil: 0,
    sequence: (state?.sequence ?? 0) + 1,
  };
}

export function activateInteraction(state, proposal = state?.proposal) {
  if (!state || state.phase !== INTERACTION_PHASES.armed) return state ?? createIdleInteraction();
  return {
    ...state,
    phase: INTERACTION_PHASES.active,
    proposal: cloneSnapshot(proposal ?? state.proposal ?? state.before),
    suppressNextClick: true,
    suppressUntil: nowMs() + CLICK_SUPPRESS_MS,
  };
}

export function updateInteractionProposal(state, proposal) {
  if (!state || state.phase !== INTERACTION_PHASES.active) return state ?? createIdleInteraction();
  return { ...state, proposal: cloneSnapshot(proposal) };
}

export function activateWithMovement(state, proposal) {
  const active = activateInteraction(state, proposal);
  if (active.phase !== INTERACTION_PHASES.active) return active;
  return updateInteractionProposal(active, proposal);
}

export function shouldYieldArmedHold(originPoint, point, threshold) {
  return movedEnoughToCancelHold(originPoint, point, threshold);
}

export function cancelArmedInteraction(state) {
  if (!state || state.phase !== INTERACTION_PHASES.armed) return state ?? createIdleInteraction();
  return {
    ...createIdleInteraction(),
    sequence: state.sequence,
    suppressNextClick: true,
    suppressUntil: nowMs() + CLICK_SUPPRESS_MS,
  };
}

export function cancelActiveInteraction(state) {
  if (!state || (state.phase !== INTERACTION_PHASES.active && state.phase !== INTERACTION_PHASES.armed)) {
    return state ?? createIdleInteraction();
  }
  return {
    ...createIdleInteraction(),
    sequence: state.sequence,
    phase: INTERACTION_PHASES.cancelled,
    owner: state.owner,
    surface: state.surface,
    origin: state.origin,
    mode: state.mode,
    id: state.id,
    before: cloneSnapshot(state.before),
    proposal: cloneSnapshot(state.before),
    suppressNextClick: true,
    suppressUntil: nowMs() + CLICK_SUPPRESS_MS,
  };
}

export function restoreCancelledInteraction(state) {
  if (!state || state.phase !== INTERACTION_PHASES.cancelled) return createIdleInteraction();
  return {
    ...createIdleInteraction(),
    sequence: state.sequence,
    suppressNextClick: true,
    suppressUntil: state.suppressUntil,
  };
}

export function commitInteraction(state) {
  if (!state || state.phase !== INTERACTION_PHASES.active) return { state: state ?? createIdleInteraction(), shouldPersist: false };
  const shouldPersist = gestureChangedAnything(state.before, state.proposal);
  return {
    shouldPersist,
    state: {
      ...createIdleInteraction(),
      sequence: state.sequence,
      phase: shouldPersist ? INTERACTION_PHASES.committed : INTERACTION_PHASES.idle,
      owner: state.owner,
      origin: state.origin,
      mode: state.mode,
      id: state.id,
      before: cloneSnapshot(state.before),
      proposal: cloneSnapshot(state.proposal),
      suppressNextClick: true,
      suppressUntil: nowMs() + CLICK_SUPPRESS_MS,
    },
  };
}

export function finishCommittedInteraction(state) {
  return {
    ...createIdleInteraction(),
    sequence: state?.sequence ?? 0,
    suppressNextClick: true,
    suppressUntil: state?.suppressUntil ?? nowMs() + CLICK_SUPPRESS_MS,
  };
}

export function interactionOwnerAllows(state, owner) {
  if (!state || state.phase === INTERACTION_PHASES.idle) return true;
  return state.owner === owner;
}

export function resolveShortEventEdge(pointerY, top, height) {
  if (!Number.isFinite(pointerY) || !Number.isFinite(top) || !Number.isFinite(height) || height <= 0) {
    return "end";
  };
  const mid = top + height / 2;
  return pointerY < mid ? "start" : "end";
}

export function createScrollSession({ timeoutMs = 180 } = {}) {
  let active = false;
  let timer = null;
  const clear = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    begin() {
      clear();
      active = true;
    },
    end() {
      clear();
      timer = setTimeout(() => {
        active = false;
        timer = null;
      }, timeoutMs);
    },
    expire() {
      clear();
      active = false;
    },
    isActive() {
      return active;
    },
  };
}
