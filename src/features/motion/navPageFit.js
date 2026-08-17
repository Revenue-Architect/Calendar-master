/* Fit the open navigation page as a recessed card inside the remaining shell.
 *
 * The page must stay transform-only — never width/left/top — but it also must
 * keep every edge on screen. Sliding a full-width surface to the right is what
 * clipped the app into a half-page. */

export function navPageFit({
  viewportWidth,
  viewportHeight,
  navWidth = 304,
  gap = 18,
  marginTop = 18,
  marginRight = 22,
  marginBottom = 18,
} = {}) {
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { x: navWidth + gap, y: marginTop, scale: 1 };
  }
  const availW = Math.max(0, width - navWidth - gap - marginRight);
  const availH = Math.max(0, height - marginTop - marginBottom);
  const scale = Math.min(availW / width, availH / height);
  return {
    x: navWidth + gap,
    y: marginTop,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}
