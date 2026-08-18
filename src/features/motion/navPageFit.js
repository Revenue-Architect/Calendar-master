/* Fit the open navigation page as a recessed card with even black borders.
 *
 * A uniform scale that clears the drawer leaves leftover height as a fat
 * bottom gutter. The even frame is an inset: the page is laid out inside
 * that rectangle, so nothing is clipped and top/right/bottom stay similar. */

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
    y: marginTop,
    scale: 1,
    top: marginTop,
    right: marginRight,
    bottom: marginBottom,
    left,
  };
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  return {
    ...fallback,
    left: Math.min(left, Math.max(0, width - marginRight - 1)),
  };
}
