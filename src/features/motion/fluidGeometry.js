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
 * `insetX`/`insetY` are the distance from each edge of the panel to that starting
 * rectangle. They are clamped at zero: a trigger wider than the panel it opens
 * has nothing to inset, and a negative inset would grow the clip beyond the box.
 */
export function fluidMorphFromRects(triggerRect, panelRect) {
  const triggerCenterX = finite(triggerRect.left) + finite(triggerRect.width) / 2;
  const triggerCenterY = finite(triggerRect.top) + finite(triggerRect.height) / 2;
  const panelCenterX = finite(panelRect.left) + finite(panelRect.width) / 2;
  const panelCenterY = finite(panelRect.top) + finite(panelRect.height) / 2;
  /* The clip is centred in the panel and the panel is centred on the trigger, so
     one inset per axis describes both edges. */
  const inset = (from, to) => Math.max(0, (finite(to) - finite(from)) / 2);

  return {
    translateX: triggerCenterX - panelCenterX,
    translateY: triggerCenterY - panelCenterY,
    insetX: inset(triggerRect.width, panelRect.width),
    insetY: inset(triggerRect.height, panelRect.height),
  };
}
