/* Fit the open navigation page as a recessed card with even black borders.
 *
 * The page keeps its full layout: it travels on transform and a clip eats the
 * frame, so nothing reflows. The catch is that the clip is measured from the
 * element, not the viewport — translating the page moves the cut with it. So a
 * thick top border cannot come from the cut alone without slicing into the
 * HUD, which is where the hamburger lives, 8px from the page's own top edge.
 *
 * Splitting it fixes both at once. The border you see is travel plus cut; the
 * clearance the hamburger gets is the cut alone. Keeping the cut shallow and
 * paying the rest in travel gives a 16px frame that still clears the button.
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
} = {}) {
  const left = navWidth + gap;
  const clipTop = Math.min(headroom, marginTop);
  const travelY = marginTop - clipTop;
  const fit = {
    travelX: left,
    travelY,
    clipTop,
    clipRight: marginRight + left,
    clipBottom: marginBottom + travelY,
    radius: 22,
    /* what the eye actually reads, once travel and cut are combined */
    frameTop: travelY + clipTop,
    frameRight: marginRight,
    frameBottom: marginBottom,
    frameLeft: left,
  };
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fit;
  }
  const travelX = Math.min(left, Math.max(0, width - marginRight - 1));
  return { ...fit, travelX, clipRight: marginRight + travelX, frameLeft: travelX };
}

export function navDrawerMotion(phase = "closed") {
  /* The drawer is always mounted, so it already has a resting transform to
     travel from. Only the open phase is revealed: closing and closed share the
     same target, so an interrupted close reverses from the current compositor
     position instead of revealing a second hidden transition. */
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
  travelX = 322,
  travelY = 12,
  clipTop = 4,
  clipRight = 344,
  clipBottom = 28,
  radius = 22,
} = {}) {
  if (!open) {
    return {
      transform: "translate3d(0px, 0px, 0)",
      clipPath: "inset(0px 0px 0px 0px round 0px)",
    };
  }
  return {
    transform: `translate3d(${travelX}px, ${travelY}px, 0)`,
    clipPath: `inset(${clipTop}px ${clipRight}px ${clipBottom}px 0px round ${radius}px)`,
    durationMs: 520,
    easing: "cubic-bezier(.22,.61,.36,1)",
  };
}
