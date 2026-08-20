/* Fit the open navigation page as a recessed card with explicit frame and carrier geometry.
 *
 * Geometry contract:
 * - frame: { top, right, bottom, left, radius }
 *   The visible rectangular rounded mask in viewport coordinates.
 *   Desktop: top 24px, right 22px, bottom 24px, left 322px, radius 22px.
 * - carrier: { x, y }
 *   Translation of planner content inside the frame mask.
 *   Desktop: x 322px, y 20px (24px marginTop minus 4px headroom).
 * - mobile: { railWidth, edgeGap, x }
 *   Mobile rail geometry contract.
 *
 * The visible right edge is directly animated from 0px -> 22px viewport inset,
 * never derived from a cancellation of large transform and clip values.
 */

const HEADROOM = 4;

export function navPageFit({
  viewportWidth,
  viewportHeight,
  navWidth = 304,
  gap = 18,
  marginTop = 24,
  marginRight = 22,
  marginBottom = 24,
  headroom = HEADROOM,
  mobileBreakpoint = 640,
  railWidth = 44,
  edgeGap = 0,
} = {}) {
  const left = navWidth + gap;
  const clipTop = Math.min(headroom, marginTop);
  const travelY = marginTop - clipTop;
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  const hasViewport = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;

  const travelX = hasViewport
    ? Math.min(left, Math.max(0, width - marginRight - 1))
    : left;

  const mobileRailX = hasViewport
    ? Math.max(0, width - railWidth - edgeGap)
    : Math.max(0, 390 - railWidth - edgeGap);

  const frameTop = marginTop;
  const frameRight = marginRight;
  const frameBottom = marginBottom;
  const frameLeft = travelX;
  const frameRadius = 22;

  const frame = {
    top: frameTop,
    right: frameRight,
    bottom: frameBottom,
    left: frameLeft,
    radius: frameRadius,
  };

  const carrier = {
    x: travelX,
    y: travelY,
  };

  const mobile = {
    railWidth,
    edgeGap,
    x: mobileRailX,
  };

  return {
    frame,
    carrier,
    mobile,
    /* Flat backwards-compatible aliases for existing callers/tests */
    travelX,
    travelY,
    clipTop,
    clipRight: frameRight,
    clipBottom: frameBottom,
    radius: frameRadius,
    frameTop,
    frameRight,
    frameBottom,
    frameLeft,
  };
}

/* Mobile uses the same normalized progress as the frame and content carrier.
 * Keeping this pure makes the alignment contract testable without a browser:
 * at p=1 the rail's right edge meets the carrier's left edge, while the frame
 * reveals exactly one rail width. */
export function navMobileMotion({
  progress = 0,
  mobile = { railWidth: 44, edgeGap: 0, x: 346 },
} = {}) {
  const p = Math.min(1, Math.max(0, Number(progress) || 0));
  const railWidth = Number(mobile.railWidth) || 44;
  const frameLeft = (Number(mobile.x) || 0) * p;
  const carrierX = ((Number(mobile.x) || 0) + railWidth) * p;
  const railX = -railWidth + carrierX;
  return {
    frame: {
      top: 14 * p,
      right: 0,
      bottom: 14 * p,
      left: frameLeft,
      radius: 16 * p,
    },
    carrier: { x: carrierX, y: 0 },
    rail: { x: railX, right: railX + railWidth },
    visibleRailWidth: railWidth * p,
    gap: 0,
  };
}

export function navDrawerMotion(phase = "closed") {
  const revealed = phase === "open";
  return {
    transform: revealed ? "translate3d(0%, 0px, 0)" : "translate3d(-36%, 0px, 0)",
    itemOpacity: revealed ? 1 : 0,
    itemDelayMs: revealed ? 30 : 0,
    itemDurationMs: revealed ? 260 : 520,
  };
}

export function navPageMotion({
  open = false,
  frame = { top: 24, right: 22, bottom: 24, left: 322, radius: 22 },
  carrier = { x: 322, y: 20 },
  travelX,
  travelY,
  clipTop,
  clipRight,
  clipBottom,
  radius,
} = {}) {
  const fTop = clipTop ?? frame?.top ?? 24;
  const fRight = clipRight ?? frame?.right ?? 22;
  const fBottom = clipBottom ?? frame?.bottom ?? 24;
  const fLeft = travelX ?? frame?.left ?? 322;
  const fRadius = radius ?? frame?.radius ?? 22;
  const cX = travelX ?? carrier?.x ?? 322;
  const cY = travelY ?? carrier?.y ?? 20;

  if (!open) {
    return {
      carrierTransform: "translate3d(0px, 0px, 0)",
      viewportClipPath: "inset(0px 0px 0px 0px round 0px)",
      transform: "translate3d(0px, 0px, 0)",
      clipPath: "inset(0px 0px 0px 0px round 0px)",
      durationMs: 520,
      easing: "cubic-bezier(.22,.61,.36,1)",
    };
  }
  return {
    carrierTransform: `translate3d(${cX}px, ${cY}px, 0)`,
    viewportClipPath: `inset(${fTop}px ${fRight}px ${fBottom}px ${fLeft}px round ${fRadius}px)`,
    transform: `translate3d(${cX}px, ${cY}px, 0)`,
    clipPath: `inset(${fTop}px ${fRight}px ${fBottom}px ${fLeft}px round ${fRadius}px)`,
    durationMs: 520,
    easing: "cubic-bezier(.22,.61,.36,1)",
  };
}
