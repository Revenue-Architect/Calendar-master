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
  eventMove: "event-move",
  eventStart: "event-start",
  eventEnd: "event-end",
  actionBody: "action-body",
  actionMove: "action-move",
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
    proposalChanged: false,
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
    proposalChanged: false,
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
    /* Activation itself is not evidence that a held card moved.  The touch
       path activates after the lift timer, before it has necessarily produced
       a proposal frame; updateInteractionProposal records the first real
       change below. */
    proposalChanged: false,
    suppressNextClick: true,
    suppressUntil: nowMs() + CLICK_SUPPRESS_MS,
  };
}

export function updateInteractionProposal(state, proposal) {
  if (!state || state.phase !== INTERACTION_PHASES.active) return state ?? createIdleInteraction();
  const nextProposal = cloneSnapshot(proposal);
  return {
    ...state,
    proposal: nextProposal,
    /* Keep history instead of deriving this from the final drop.  A deliberate
       move that returns to its origin is still a gesture and must not fall back
       to an inspector click on release. */
    proposalChanged: Boolean(
      state.proposalChanged || gestureChangedAnything(state.before, nextProposal),
    ),
  };
}

/** Preserve whether a live item ever left its initial proposal. */
export function recordTimelineGestureProposalHistory(gesture, next, interaction, dateKey) {
  return Boolean(
    gesture?.proposalChanged
    || interaction?.proposalChanged
    || gestureChangedAnything(
      { start: gesture?.was?.start ?? gesture?.start, duration: gesture?.was?.dur ?? gesture?.dur },
      { start: next?.start, duration: next?.dur },
    )
    || (next?.overDay && next.overDay !== dateKey)
    || (next?.overTask && next.overTask !== gesture?.id),
  );
}

/** A timed lift with no manipulation still resolves to the item's tap action. */
export function timelineTouchReleaseIntent(gesture, interaction, dateKey) {
  const itemGesture = gesture?.kind === "event" || gesture?.kind === "task";
  if (gesture?.touchId == null || !itemGesture) return "finish";
  const changed = recordTimelineGestureProposalHistory(gesture, gesture, interaction, dateKey);
  return changed ? "finish" : "inspect";
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

export function settleInteraction(state) {
  return finishCommittedInteraction(commitInteraction(state).state);
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
      if (!active) return;
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

/* Whether a scroll gesture should collapse the day chrome, restore it, or leave
 * it alone.
 *
 * Extracted as a pure decision because the two bugs it replaces were both
 * invisible from the outside and unreachable from a browser test: the stream
 * auto-positions to the current hour on open, and synthetic wheel input does not
 * move it, so neither state could be driven from an e2e harness. Pure input in,
 * verdict out, is testable.
 *
 * Restore is positional and deliberately so: the chrome comes back when the
 * timeline is back at its own top — midnight — and not before. An earlier pass
 * restored on any upward gesture, which is the right rule for a web page whose
 * header is incidental, and the wrong one here. This header is the day's
 * identity; returning it mid-scroll means it appears while you are still reading
 * 3pm, which is noise. Arriving at the top is the moment it is wanted again.
 *
 * Collapse and restore share one threshold, so the two are exact inverses and
 * there is no band where neither fires. What made the original feel broken was
 * never the threshold — it was the manual latch in the caller, and a restore
 * line at max(48, hourHeight) that sat far below where collapse armed.
 */
export function timelineChromeIntent({ previousScrollTop, nextScrollTop, triggerPx = 24 }) {
  if (nextScrollTop <= triggerPx) return "restore";
  if (nextScrollTop > previousScrollTop + 1 && nextScrollTop > triggerPx) return "collapse";
  return "none";
}

/* Past the soft limit a drag keeps moving, just less and less of it.
 *
 * The clamp this replaces stopped the page dead at 140px. Nothing physical stops
 * like that, and the dead zone reads as the gesture having broken rather than
 * having reached its end. Excess travel is scaled so the edge is felt as
 * resistance instead of a wall.
 */
export function rubberBand(delta, softLimit, resistance = 0.32) {
  const magnitude = Math.abs(delta);
  if (magnitude <= softLimit) return delta;
  const excess = magnitude - softLimit;
  return Math.sign(delta) * (softLimit + excess * resistance);
}

/* Whether a swipe has earned its commit.
 *
 * Distance alone was the only test, so a confident flick that covered 50px was
 * silently ignored while a slow drag of 65px succeeded — the opposite of what
 * the hand expects. Velocity is measured in pixels per millisecond; 0.11 is the
 * threshold Sonner uses for the same judgement, and a flick clears it easily
 * while a deliberate slow drag never does.
 */
export function shouldCommitSwipe({ delta, elapsedMs, distanceThreshold, velocityThreshold = 0.11 }) {
  if (Math.abs(delta) >= distanceThreshold) return true;
  if (!elapsedMs || elapsedMs <= 0) return false;
  return Math.abs(delta) / elapsedMs > velocityThreshold;
}
