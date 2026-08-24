/* Pure touch-role classification for the Day timeline.
 *
 * Desktop resize overlays deliberately keep their broad hit area. Touch needs
 * a narrower semantic affordance so an ordinary card grab remains a move. This
 * module only reads DOM markers and geometry; it never owns an interaction. */

export const TOUCH_TARGET_KINDS = Object.freeze({
  eventBody: "event-body",
  eventMove: "event-move",
  eventResize: "event-resize",
  actionBody: "action-body",
  actionMove: "action-move",
  actionEstimate: "action-estimate",
  complete: "complete",
  link: "link",
  empty: "empty",
});

export const EVENT_TOUCH_GRIP_SIZE = 44;
export const EVENT_TOUCH_GRIP_MIN_HEIGHT = EVENT_TOUCH_GRIP_SIZE * 2;
export const EVENT_TOUCH_BODY_MIN_WIDTH = EVENT_TOUCH_GRIP_SIZE;
export const EVENT_TOUCH_GRIP_MIN_WIDTH = EVENT_TOUCH_GRIP_SIZE * 3 + EVENT_TOUCH_BODY_MIN_WIDTH;
export const EVENT_JOIN_LANE = 56;
export const EVENT_JOIN_INSET = 4;
export const EVENT_JOIN_RESERVATION = EVENT_JOIN_LANE + EVENT_JOIN_INSET;
/* The visible completion mark is smaller, but the coarse-pointer owner is a
 * real 44px lane. Keeping the lane itself coarse-sized avoids the global
 * `.nb-tap::after` expansion spilling into the adjacent move control. */
export const ACTION_COMPLETION_LANE = 44;
export const ACTION_ESTIMATE_LANE = 48;
export const ACTION_MOVE_MIN_WIDTH = 44;
export const ACTION_TOUCH_BODY_MIN_WIDTH = 44;

const finite = (value) => Number.isFinite(value) ? value : 0;

/** Whether disjoint 44px corner grips can leave a 44px body gutter. */
export function canExposeEventTouchResize({ height, width, hasJoin = false } = {}) {
  return finite(height) >= EVENT_TOUCH_GRIP_MIN_HEIGHT
    && finite(width) >= EVENT_TOUCH_GRIP_MIN_WIDTH + (hasJoin ? EVENT_JOIN_RESERVATION : 0);
}

/** A move-only Event control is shown only when its body remains readable. */
export function canExposeEventTouchMove({ height, width, hasJoin = false, hasResize = false } = {}) {
  const controls = hasResize ? EVENT_TOUCH_GRIP_SIZE * 3 : EVENT_TOUCH_GRIP_SIZE;
  return finite(height) >= EVENT_TOUCH_GRIP_SIZE
    && finite(width) >= controls + EVENT_TOUCH_BODY_MIN_WIDTH + (hasJoin ? EVENT_JOIN_RESERVATION : 0);
}

/** A directly resizable Action must leave a real coarse-pointer body lane. */
export function canExposeActionTouchResize({ width, hasEstimate } = {}) {
  return Boolean(hasEstimate)
    && finite(width) >= ACTION_COMPLETION_LANE + ACTION_ESTIMATE_LANE + ACTION_MOVE_MIN_WIDTH + ACTION_TOUCH_BODY_MIN_WIDTH;
}

/** An Action move lane is opt-in only when completion and the body can coexist. */
export function canExposeActionTouchMove({ width, hasEstimate = false } = {}) {
  return finite(width) >= ACTION_COMPLETION_LANE + ACTION_MOVE_MIN_WIDTH
    + (hasEstimate ? ACTION_ESTIMATE_LANE : 0) + ACTION_TOUCH_BODY_MIN_WIDTH;
}

function closest(node, selector) {
  return node?.closest?.(selector) ?? null;
}

function attr(node, name) {
  return node?.getAttribute?.(name) ?? null;
}

/**
 * Classify the element under a touch. `data-resize` alone is intentionally not
 * a touch resize marker: it belongs to the desktop/pen edge overlays.
 */
export function classifyTimelineTouchTarget(target) {
  /* A DOM anchor itself also has a string `.target` property (`_blank` for JOIN).
     Prefer node-like values before unwrapping an Event so an anchor cannot turn
     into an empty-space classification. */
  const node = typeof target?.getAttribute === "function" && typeof target?.closest === "function"
    ? target
    : target?.target ?? target;
  if (!node) return { kind: TOUCH_TARGET_KINDS.empty, edge: null, node: null };

  const complete = closest(node, "[data-timeline-complete]");
  if (complete) return { kind: TOUCH_TARGET_KINDS.complete, edge: null, node: complete };

  const link = closest(node, "a[href], [data-join]");
  if (link) return { kind: TOUCH_TARGET_KINDS.link, edge: null, node: link };

  const grip = closest(node, "[data-touch-resize]");
  if (grip) {
    const edge = attr(grip, "data-touch-resize");
    if (edge === "start" || edge === "end") {
      return { kind: TOUCH_TARGET_KINDS.eventResize, edge, node: grip };
    }
  }

  const estimate = closest(node, "[data-action-estimate]");
  if (estimate) return { kind: TOUCH_TARGET_KINDS.actionEstimate, edge: "end", node: estimate };

  const move = closest(node, "[data-touch-move]");
  if (move) {
    const event = closest(move, "[data-event-id]");
    return { kind: event ? TOUCH_TARGET_KINDS.eventMove : TOUCH_TARGET_KINDS.actionMove, edge: null, node: move };
  }

  const event = closest(node, "[data-event-id]");
  if (event) return { kind: TOUCH_TARGET_KINDS.eventBody, edge: null, node: event };

  const action = closest(node, "[data-task-chip]");
  if (action) return { kind: TOUCH_TARGET_KINDS.actionBody, edge: null, node: action };

  return { kind: TOUCH_TARGET_KINDS.empty, edge: null, node: null };
}
