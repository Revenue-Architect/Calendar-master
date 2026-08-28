function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/* A contextual Event Inspector is an overlay, never a timeline reflow. This
 * resolves the visual destination from the transaction's semantic source so its
 * resting position describes an expansion of that card—not a generic modal. */
export function contextualEventInspectorGeometry(sourceRect, {
  viewportWidth,
  viewportHeight,
  naturalHeight = 0,
  inset = 16,
  minWidth = 320,
  preferredWidth = 440,
  minVisibleHeight = 280,
  contextBounds = null,
} = {}) {
  if (!sourceRect || !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) return null;
  const sourceLeft = Number(sourceRect.left ?? sourceRect.x);
  const sourceTop = Number(sourceRect.top ?? sourceRect.y);
  const sourceWidth = Number(sourceRect.width);
  if (![sourceLeft, sourceTop, sourceWidth].every(Number.isFinite)) return null;

  /* Week has a real adjacent Actions rail. Keep the visual carrier inside
     the timeline plane when that plane is available; this is presentation
     geometry only and never changes the calendar's logical coordinates. */
  const hasContextBounds = contextBounds
    && Number.isFinite(Number(contextBounds.left))
    && Number.isFinite(Number(contextBounds.right))
    && Number(contextBounds.right) > Number(contextBounds.left);
  const boundaryLeft = hasContextBounds
    ? Math.max(inset, Number(contextBounds.left))
    : inset;
  const boundaryRight = hasContextBounds
    ? Math.min(viewportWidth - inset, Number(contextBounds.right))
    : viewportWidth - inset;
  const availableWidth = Math.max(0, boundaryRight - boundaryLeft);
  const width = clamp(
    /* A wide Day card must not contract into a popup: retaining its visible
       width is what makes the object read as an expansion. Narrow Week cards
       instead grow into a comfortably editable contextual surface. */
    sourceWidth >= preferredWidth ? sourceWidth : preferredWidth,
    Math.min(minWidth, availableWidth),
    availableWidth,
  );
  /* Wide Day cards keep their leading edge; narrow Week cards grow around the
     source until clamping makes a nearer edge the more faithful relationship. */
  const preferredLeft = sourceWidth >= preferredWidth
    ? sourceLeft
    : sourceLeft - (width - sourceWidth) / 2;
  const left = clamp(preferredLeft, boundaryLeft, boundaryRight - width);

  const resolvedHeight = Math.max(minVisibleHeight, Number(naturalHeight) || 0);
  const maxHeight = Math.max(0, Math.min(resolvedHeight, viewportHeight - inset * 2));
  /* Object continuity wins over a modal-style minimum-height guarantee. A low
     Event stays exactly where it was clicked; if the viewport cannot hold the
     whole Inspector, the existing internal scroller is the safe constraint. */
  const top = clamp(sourceTop, inset, viewportHeight - inset);
  const visibleHeight = Math.max(0, viewportHeight - top - inset);

  return { left, top, width, maxHeight: visibleHeight };
}
