/* Fit the open navigation page as a recessed card with even black borders.
 *
 * The page keeps its full layout. It travels on X and a clip eats a matching
 * frame, so top/right/bottom stay similar without leftover-height gutters and
 * without reflowing the planner on every frame. */

export function navPageFit({
  viewportWidth,
  viewportHeight,
  navWidth = 304,
  gap = 18,
  marginTop = 18,
  marginRight = 22,
  marginBottom = 18,
} = {}) {
  const left = navWidth + gap;
  const fallback = {
    x: left,
    y: 0,
    scale: 1,
    top: marginTop,
    right: marginRight,
    bottom: marginBottom,
    left,
    travelX: left,
    clipTop: marginTop,
    clipRight: marginRight + left,
    clipBottom: marginBottom,
    radius: 22,
  };
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  return {
    ...fallback,
    left: Math.min(left, Math.max(0, width - marginRight - 1)),
    travelX: Math.min(left, Math.max(0, width - marginRight - 1)),
  };
}

export function navPageMotion({
  open = false,
  travelX = 322,
  clipTop = 18,
  clipRight = 344,
  clipBottom = 18,
  radius = 22,
} = {}) {
  if (!open) {
    return {
      transform: "translate3d(0px, 0px, 0)",
      clipPath: "inset(0px 0px 0px 0px round 0px)",
    };
  }
  return {
    transform: `translate3d(${travelX}px, 0px, 0)`,
    clipPath: `inset(${clipTop}px ${clipRight}px ${clipBottom}px 0px round ${radius}px)`,
  };
}
