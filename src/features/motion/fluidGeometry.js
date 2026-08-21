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

/* How a sheet grows out of the control that opened it — as a shape, never as a
 * zoom.
 *
 * There is no scale here, and that is the entire point. A panel animated from
 * `scale(0.23)` to `scale(1)` does not merely change shape: every word, field and
 * button inside it is drawn at a quarter size and magnified four times over the
 * length of the animation, re-rasterising the whole way. That is what "it zooms
 * in intensely and glitches" is, and it survives every correction to the numbers,
 * because the numbers were never the fault — scaling a container that has content
 * in it was. Two scales at once made it worse (the contents stretched as well as
 * grew); one scale made it better; neither could make it right.
 *
 * So the panel travels at its true size and is *revealed* instead. It starts
 * centred on the trigger, clipped to a rounded rectangle of exactly the trigger's
 * size, and the clip opens out to the panel's own edges. What the eye follows is
 * a button-shaped hole growing into a panel-shaped one — the same gesture the
 * scale was reaching for — while the text inside is laid out once, at its final
 * size, and never resampled. The clip is also the content reveal, so there is no
 * independent fade that can disconnect the panel from the card it came from.
 *
 * The asymmetric insets are the distances from each panel edge to that starting
 * rectangle. They are clamped at zero: a trigger wider than the panel it opens
 * has no extra clip area on that axis, and a negative inset would grow the clip
 * beyond the true-size box.
 */
export function anchoredFluidMorphFromRects(
  triggerRect = {},
  panelRect = {},
  { sourceRadius = 999, targetRadius = 24 } = {},
) {
  const triggerLeft = finite(triggerRect.left);
  const triggerTop = finite(triggerRect.top);
  const triggerWidth = Math.max(0, finite(triggerRect.width));
  const triggerHeight = Math.max(0, finite(triggerRect.height));
  const panelLeft = finite(panelRect.left);
  const panelTop = finite(panelRect.top);
  const panelWidth = Math.max(0, finite(panelRect.width));
  const panelHeight = Math.max(0, finite(panelRect.height));
  const triggerRight = triggerLeft + triggerWidth;
  const triggerBottom = triggerTop + triggerHeight;
  const panelRight = panelLeft + panelWidth;
  const panelBottom = panelTop + panelHeight;
  const triggerCenterX = triggerLeft + triggerWidth / 2;
  const triggerCenterY = triggerTop + triggerHeight / 2;
  const panelCenterX = panelLeft + panelWidth / 2;
  const panelCenterY = panelTop + panelHeight / 2;
  const anchorX = triggerCenterX > panelCenterX ? "right" : "left";
  const anchorY = triggerCenterY < panelCenterY ? "top" : "bottom";
  const visibleWidth = Math.min(triggerWidth, panelWidth);
  const visibleHeight = Math.min(triggerHeight, panelHeight);
  const horizontalInset = Math.max(0, panelWidth - visibleWidth);
  const verticalInset = Math.max(0, panelHeight - visibleHeight);

  return {
    translateX: anchorX === "right" ? triggerRight - panelRight : triggerLeft - panelLeft,
    translateY: anchorY === "top" ? triggerTop - panelTop : triggerBottom - panelBottom,
    insetTop: anchorY === "top" ? 0 : verticalInset,
    insetRight: anchorX === "right" ? 0 : horizontalInset,
    insetBottom: anchorY === "bottom" ? 0 : verticalInset,
    insetLeft: anchorX === "left" ? 0 : horizontalInset,
    sourceRadius: Math.max(0, finite(sourceRadius, 999)),
    targetRadius: Math.max(0, finite(targetRadius, 24)),
    anchorX,
    anchorY,
  };
}

/* Keep the old name as a compatibility export for composition-root imports. It
 * intentionally delegates to the one production implementation rather than
 * retaining a second symmetric geometry path. */
export function fluidMorphFromRects(triggerRect, panelRect, options) {
  return anchoredFluidMorphFromRects(triggerRect, panelRect, options);
}
