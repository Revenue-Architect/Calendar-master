function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/* The Timeline Lens is deliberately presentation-only.  It calculates a
 * compositor translation for already-rendered timeline paint; it never feeds
 * into Event top/duration/lane calculations, scroll height, or gesture math. */
export function eventTimelineLensDisplacement({
  sourceHeight,
  expandedHeight,
  spacing = 12,
  state = "open",
  reducedMotion = false,
} = {}) {
  if (reducedMotion || state === "idle" || state === "closing" || state === "cancelling") {
    return 0;
  }
  return Math.max(0, finite(expandedHeight) - finite(sourceHeight) + finite(spacing));
}

export function isTimelineLensTargetBelowSource(targetRect, sourceRect) {
  const targetTop = Number(targetRect?.top);
  const sourceBottom = Number(sourceRect?.bottom);
  return Number.isFinite(targetTop) && Number.isFinite(sourceBottom) && targetTop >= sourceBottom;
}
