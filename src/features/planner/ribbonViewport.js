/* Pure geometry and lifecycle helpers for the rolling Week/Day ribbon.
 *
 * The ribbon is a real horizontal scroll surface. Keeping these decisions out
 * of the component makes the two important contracts explicit: positioning is
 * successful only after the selected cell is inside the usable viewport, and a
 * zero-width/disconnected surface is a recoverable state rather than success.
 */

export const RIBBON_POSITION_STATES = Object.freeze({
  idle: "idle",
  positioning: "positioning",
  settled: "settled",
  blockedZeroWidth: "blocked-zero-width",
});

export const RIBBON_MAX_POSITION_RETRIES = 4;
export const RIBBON_RADIUS_DAYS = 366;
export const RIBBON_SHIFT_DAYS = 366;
export const RIBBON_EDGE_BUFFER_DAYS = 14;
export const RIBBON_FALLBACK_CELL_WIDTH = 80;
export const RIBBON_RENDER_BUFFER_DAYS = 18;
export const RIBBON_RENDER_WINDOW_DAYS = 56;

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

/**
 * Returns the fractional day coordinate at the visual centre of a ribbon.
 * This is deliberately independent of the rendered window: a cell-width
 * change must preserve the date under the user's eyes, not the old pixels.
 */
export function ribbonLogicalCenter({ scrollLeft, clientWidth, cellWidth } = {}) {
  if (!finitePositive(clientWidth) || !finitePositive(cellWidth)) return null;
  const scroll = Number(scrollLeft);
  if (!Number.isFinite(scroll)) return null;
  return (scroll + Number(clientWidth) / 2) / Number(cellWidth);
}

/**
 * Converts a logical ribbon centre back into pixels for the new geometry.
 * The result is clamped so a responsive transition can never overscroll.
 */
export function ribbonScrollLeftForLogicalCenter({
  logicalCenter,
  clientWidth,
  cellWidth,
  maxScrollLeft,
} = {}) {
  if (!Number.isFinite(Number(logicalCenter))
    || !finitePositive(clientWidth)
    || !finitePositive(cellWidth)) return null;
  const raw = Number(logicalCenter) * Number(cellWidth) - Number(clientWidth) / 2;
  const max = Number.isFinite(Number(maxScrollLeft))
    ? Math.max(0, Number(maxScrollLeft))
    : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(max, raw));
}

function connected(node) {
  return Boolean(node && (node.isConnected !== false));
}

export function ribbonIntersection(strip, cell, inset = 24) {
  if (!connected(strip) || !connected(cell)) {
    return { ok: false, status: "missing-node", inset: 0 };
  }
  const stripWidth = Number(strip.clientWidth) || 0;
  const cellWidth = Number(cell.offsetWidth || cell.getBoundingClientRect?.().width) || 0;
  if (stripWidth <= 0 || cellWidth <= 0) {
    return { ok: false, status: RIBBON_POSITION_STATES.blockedZeroWidth, inset: 0 };
  }
  /* A narrow phone viewport cannot provide a 24px inset around a cell wider
     than the remaining content box. Use the largest usable inset in that case,
     while retaining the full 24px contract on normal viewports. */
  const usableInset = Math.min(Math.max(0, Number(inset) || 0), Math.max(0, (stripWidth - cellWidth) / 2));
  const left = Number(strip.scrollLeft) || 0;
  const right = left + stripWidth;
  const cellLeft = Number(cell.offsetLeft) || 0;
  const cellRight = cellLeft + cellWidth;
  const inside = cellLeft >= left + usableInset - 1
    && cellRight <= right - usableInset + 1;
  return {
    ok: inside,
    status: inside ? RIBBON_POSITION_STATES.settled : "outside-viewport",
    inset: usableInset,
    left,
    right,
    cellLeft,
    cellRight,
  };
}

export function ribbonRevealTarget(strip, cell, { center = false, inset = 24 } = {}) {
  const result = ribbonIntersection(strip, cell, inset);
  if (result.status === "missing-node" || result.status === RIBBON_POSITION_STATES.blockedZeroWidth) {
    return { ...result, target: null, changed: false };
  }
  const cellWidth = Number(cell.offsetWidth || cell.getBoundingClientRect?.().width) || 0;
  const maxScroll = Math.max(0, (Number(strip.scrollWidth) || 0) - (Number(strip.clientWidth) || 0));
  const cellLeft = Number(cell.offsetLeft) || 0;
  const cellRight = cellLeft + cellWidth;
  const current = Number(strip.scrollLeft) || 0;
  let target = current;
  if (center) target = cellLeft - (strip.clientWidth - cellWidth) / 2;
  else if (cellLeft < current + result.inset) target = cellLeft - result.inset;
  else if (cellRight > current + strip.clientWidth - result.inset) {
    target = cellRight - strip.clientWidth + result.inset;
  }
  target = Math.max(0, Math.min(maxScroll, Math.round(target)));
  return { ...result, target, changed: Math.abs(target - current) >= 1 };
}

/**
 * Which rendered day owns the ribbon's single keyboard tab stop.
 *
 * The selected day owns it whenever it is rendered. It is not always rendered:
 * browsing the strip moves the virtual window off the selection deliberately,
 * and PR #10 preserves that state rather than recentering. Giving every other
 * cell `tabIndex=-1` in that state left the ribbon with no keyboard entry at
 * all, so the browse position supplies a fallback anchor instead — derived from
 * the logical centre the viewport already tracks, not from a second geometry
 * model, and never by moving the selection.
 *
 * Returns an absolute day index (the same coordinate space as the rendered
 * window), or null when nothing is rendered.
 */
export function ribbonKeyboardAnchorIndex({
  selectedIndex,
  windowStart,
  windowLength,
  logicalCenter,
} = {}) {
  const start = Math.max(0, Math.round(Number(windowStart) || 0));
  const length = Math.round(Number(windowLength) || 0);
  if (!(length > 0)) return null;
  const last = start + length - 1;

  const selected = Number(selectedIndex);
  if (Number.isFinite(selected) && selected >= start && selected <= last) {
    return Math.round(selected);
  }

  /* `Number(null)` is 0, and the viewport's remembered centre starts as null —
     coercing it would silently anchor an unmeasured ribbon at its far left. */
  const centre = logicalCenter == null || logicalCenter === "" ? NaN : Number(logicalCenter);
  if (Number.isFinite(centre)) {
    return Math.max(start, Math.min(last, Math.round(centre)));
  }
  /* No measurement yet — the middle of what is rendered is still reachable and
     still inside the window, which is all the contract requires. */
  return start + Math.floor(length / 2);
}

export function nextRibbonRetry(retries, max = RIBBON_MAX_POSITION_RETRIES) {
  const current = Math.max(0, Number(retries) || 0);
  if (current >= max) return null;
  return current + 1;
}
