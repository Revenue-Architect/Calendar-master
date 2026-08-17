/* What a drag on a timeline means, without a timeline.
 *
 * Move and resize live twice — once in the day stream, once in the week grid —
 * and the two copies have drifted apart twice now. The same movement-cancels-
 * the-hold defect was found and fixed in each of them, separately, weeks apart.
 * That is the definition of code that should be one thing.
 *
 * So the arithmetic lives here, as functions over numbers: given where a gesture
 * started, where the pointer is, and what the item was, what should the item
 * become. No DOM, no React, no clock. The surfaces keep their own event
 * plumbing — a scroll container and a column grid genuinely differ — but they no
 * longer each own a private idea of what a five-minute snap is or how short an
 * event may get.
 *
 * Every function returns a whole proposed shape rather than a delta, because a
 * delta has to be applied to something, and "the thing it is applied to" is
 * exactly what goes stale mid-drag.
 */

export const MINUTES_PER_DAY = 1440;
/* Five minutes: fine enough to land on a real time, coarse enough that a hand
   moving a few pixels does not produce 11:07. */
export const SNAP_MINUTES = 5;
/* How long a press has to sit still before it becomes a drag. */
export const LIFT_MS = 300;
/* Empty canvas is different from an existing object: the same press creates a
   new record, so it waits through the pause that naturally happens at the end
   of a slow scroll. Existing cards keep the quicker manipulation threshold. */
export const EMPTY_SPACE_LIFT_MS = 500;
/* How far a press may travel before it stops being a press. Below this a hand
   is holding still; above it, the surface is being scrolled. */
export const HOLD_CANCEL_PX = 8;
export const ACTION_SWIPE_COMMIT_PX = 64;
/* Floors, per kind. An event shorter than ten minutes is almost always a
   mis-drag; an action's estimate is a unit of work and rounds coarser. */
export const MIN_EVENT_MINUTES = 10;
export const MIN_TASK_MINUTES = 15;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

export function snapMinute(minute, step = SNAP_MINUTES) {
  const size = Number.isFinite(step) && step > 0 ? step : SNAP_MINUTES;
  return clamp(Math.round(finite(minute) / size) * size, 0, MINUTES_PER_DAY);
}

export function minimumFor(kind) {
  return kind === "task" ? MIN_TASK_MINUTES : MIN_EVENT_MINUTES;
}

/** Has this press travelled far enough to stop being a press? */
/** A mouse/pen drag is only live while a button is actually down. Touch keeps its own end/cancel path. */
export function pointerButtonsHeld(event) {
  if (!event) return false;
  if (event.pointerType === "touch") return true;
  if (typeof event.buttons === "number") return event.buttons > 0;
  return true;
}

export function movedEnoughToCancelHold(origin, point, threshold = HOLD_CANCEL_PX) {
  if (!origin || !point) return false;
  return Math.hypot(finite(point.x) - finite(origin.x), finite(point.y) - finite(origin.y)) > threshold;
}

export function liftDelayForTimelineTarget(targetKind) {
  return targetKind === "empty" ? EMPTY_SPACE_LIFT_MS : LIFT_MS;
}

export function timelineTouchIntent(origin, point, threshold = 12, dominance = 1.4) {
  if (!origin || !point) return "pending";
  const dx = finite(point.x) - finite(origin.x);
  const dy = finite(point.y) - finite(origin.y);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= threshold && ax > ay * dominance) return "horizontal";
  if (ay >= threshold && ay > ax * dominance) return "vertical";
  return "pending";
}

export function shouldCommitActionSwipe(origin, point) {
  if (!origin || !point || timelineTouchIntent(origin, point) !== "horizontal") return false;
  return finite(point.x) - finite(origin.x) >= ACTION_SWIPE_COMMIT_PX;
}

/**
 * Moving: the block keeps its length and finds a new start.
 *
 * `grab` is where inside the block the pointer took hold, so a card picked up by
 * its middle does not jump its top to the cursor.
 */
export function proposeMove({ pointerMinute, grab = 0, duration }) {
  const length = clamp(Math.round(finite(duration, 0)), 0, MINUTES_PER_DAY);
  const start = snapMinute(finite(pointerMinute) - finite(grab));
  return { start: clamp(start, 0, MINUTES_PER_DAY - length), duration: length };
}

/**
 * Resizing from the bottom: the start is fixed, the end follows the pointer.
 */
export function proposeResizeEnd({ start, pointerMinute, kind = "event" }) {
  const top = clamp(Math.round(finite(start)), 0, MINUTES_PER_DAY);
  const floor = minimumFor(kind);
  const duration = clamp(snapMinute(finite(pointerMinute) - top), floor, MINUTES_PER_DAY - top);
  return { start: top, duration };
}

/**
 * Resizing from the top: the *end* is fixed and the start follows the pointer,
 * so the block grows upward. Written as "keep the end" rather than "change the
 * start and the duration together", because that is the thing a person dragging
 * a top edge is holding still in their head — and computing it any other way
 * lets a rounding step move the end by a minute.
 */
export function proposeResizeStart({ start, duration, pointerMinute, kind = "event" }) {
  const end = clamp(Math.round(finite(start)) + Math.round(finite(duration)), 0, MINUTES_PER_DAY);
  const floor = minimumFor(kind);
  const top = clamp(snapMinute(pointerMinute), 0, end - floor);
  return { start: top, duration: end - top };
}

/** One entry point, so a caller never has to remember which mode means what. */
export function proposeGesture(mode, input) {
  if (mode === "resize-start") return proposeResizeStart(input);
  if (mode === "resize-end") return proposeResizeEnd(input);
  return proposeMove(input);
}

/**
 * Did this gesture actually change anything?
 *
 * A drop that lands where it started must not write, must not push an undo
 * entry, and must not flash a toast — the difference between "I moved it back"
 * and "I changed my mind" is invisible to the user and should be invisible to
 * the record too.
 */
export function gestureChangedAnything(before, after) {
  if (!before || !after) return false;
  return before.start !== after.start
    || before.duration !== after.duration
    || (before.date ?? null) !== (after.date ?? null);
}

/**
 * Can this item be resized at all?
 *
 * An action with no estimate has no length to drag — it is a point on the day,
 * not a block — so it moves but shows no handles. Giving it handles would invite
 * a gesture that has nothing to change.
 */
export function isResizable(item, kind = "event") {
  if (!item) return false;
  if (kind !== "task") return true;
  return Number.isFinite(item.planned?.estimateMinutes) && item.planned.estimateMinutes > 0;
}
