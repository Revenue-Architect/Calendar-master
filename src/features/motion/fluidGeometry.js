function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function fluidPillBox(containerRect, activeRect) {
  return {
    left: finite(activeRect.left) - finite(containerRect.left),
    top: finite(activeRect.top) - finite(containerRect.top),
    width: Math.max(0, finite(activeRect.width)),
    height: Math.max(0, finite(activeRect.height)),
  };
}

export function fluidPillStretch(previousBox, nextBox) {
  if (!previousBox || !nextBox) return 1;
  const distance = Math.abs(finite(previousBox.left) - finite(nextBox.left));
  return 1 + Math.min(0.18, distance / 400);
}

/* The uniform scale is the one the animation uses, and the reason is worth
 * stating: a container that grows from 0.23 wide and 0.12 tall does not just
 * change shape, it stretches everything inside it. Measured on a phone, the
 * composer opened at an aspect ratio 1.95x wrong and spent 380ms un-squashing —
 * every label and field distorted and re-rasterising the whole way. That is what
 * "it zooms in and glitches" was.
 *
 * The clamp made it worse rather than safer. A 28px button against a 437px panel
 * is a true ratio of 0.064; the floor lifted it to 0.12 while the width ratio
 * stayed at its honest 0.234, so the floor itself was manufacturing most of the
 * distortion.
 *
 * Width is the axis to keep. A sheet growing out of a button reads as that
 * button widening into a panel, so matching its width anchors the gesture; the
 * height follows proportionally and the rounded corners do the rest. `scaleX`
 * and `scaleY` are still returned — they describe the two rectangles honestly,
 * and something may yet want them — but nothing should animate a container on
 * both at once with content inside it.
 */
export function fluidMorphFromRects(triggerRect, panelRect) {
  const triggerCenterX = finite(triggerRect.left) + finite(triggerRect.width) / 2;
  const triggerCenterY = finite(triggerRect.top) + finite(triggerRect.height) / 2;
  const panelCenterX = finite(panelRect.left) + finite(panelRect.width) / 2;
  const panelCenterY = finite(panelRect.top) + finite(panelRect.height) / 2;
  const scale = (from, to) => Math.max(0.12, Math.min(1, to > 0 ? from / to : 1));

  return {
    translateX: triggerCenterX - panelCenterX,
    translateY: triggerCenterY - panelCenterY,
    scale: scale(finite(triggerRect.width), finite(panelRect.width)),
    scaleX: scale(finite(triggerRect.width), finite(panelRect.width)),
    scaleY: scale(finite(triggerRect.height), finite(panelRect.height)),
  };
}
