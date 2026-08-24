/* Pure touch-role classification for the Day timeline. The Event's full-width
 * boundary strips are stable semantic resize targets; the readable Event and
 * Action faces remain continuous hold-to-move candidates. This module only
 * reads DOM markers; it never owns an interaction. */

export const TOUCH_TARGET_KINDS = Object.freeze({
  eventBody: "event-body",
  eventResize: "event-resize",
  actionBody: "action-body",
  actionEstimate: "action-estimate",
  complete: "complete",
  link: "link",
  empty: "empty",
});

/* The visible completion mark is smaller, but the coarse-pointer owner is a
 * real 44px lane. Keeping the lane itself coarse-sized avoids the global
 * `.nb-tap::after` expansion spilling into the adjacent Action body. */
export const ACTION_COMPLETION_LANE = 44;
export const ACTION_ESTIMATE_LANE = 48;
export const ACTION_TOUCH_BODY_MIN_WIDTH = 44;

/** A directly resizable Action must leave a real coarse-pointer body lane. */
export function canExposeActionTouchResize({ width, hasEstimate } = {}) {
  return Boolean(hasEstimate)
    && Number.isFinite(width)
    && width >= ACTION_COMPLETION_LANE + ACTION_ESTIMATE_LANE + ACTION_TOUCH_BODY_MIN_WIDTH;
}

function closest(node, selector) {
  return node?.closest?.(selector) ?? null;
}

function attr(node, name) {
  return node?.getAttribute?.(name) ?? null;
}

/**
 * Classify the element under a touch. `data-resize` alone is intentionally not
 * a touch resize marker: only the stable semantic Event edge owns touch resize.
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

  const event = closest(node, "[data-event-id]");
  if (event) return { kind: TOUCH_TARGET_KINDS.eventBody, edge: null, node: event };

  const action = closest(node, "[data-task-chip]");
  if (action) return { kind: TOUCH_TARGET_KINDS.actionBody, edge: null, node: action };

  return { kind: TOUCH_TARGET_KINDS.empty, edge: null, node: null };
}
