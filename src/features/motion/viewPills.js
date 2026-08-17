/* Compact view-pill geometry is computed, never measured.
 *
 * A fixed-width wrap stops ResizeObserver from firing, and a useLayoutEffect
 * read of offsetWidth lands before the box has changed. Together those left
 * the accent plate 61px right and 59px narrow, permanently. Slot left/width,
 * the indicator box, and the FLIP delta are therefore pure functions of the
 * active index so compact mode never has to touch the DOM to know where
 * anything should be. */

/* Tailwind's `sm` is min-width 640px and the chrome's own compact rules are
   max-width 639px, so a `max-width: 640px` query would claim compact on the one
   pixel where the stylesheet has already gone wide. */
export const VIEW_PILL_COMPACT_MAX = 639.98;

/* 13px glyph in a slot that clears the icon on both sides. */
export const VIEW_PILL_ICON = 30;
/* TIMELINE measures ~70.5px at --t-label (13px, .1em tracking); 84 leaves room
   for a fallback face if Jost has not loaded. */
export const VIEW_PILL_WORD = 84;
/* Today's tabs are contiguous — measured left edges 103 / 197 / 285 against
   widths 94.5 / 88.4 / 91.6. Compact keeps that. */
export const VIEW_PILL_GAP = 0;

const defaults = ({
  icon = VIEW_PILL_ICON,
  gap = VIEW_PILL_GAP,
  word = VIEW_PILL_WORD,
  count = 3,
} = {}) => ({ icon, gap, word, count });

export function viewPillSlotWidth(active, {
  icon = VIEW_PILL_ICON,
  word = VIEW_PILL_WORD,
} = {}) {
  return icon + (active ? word : 0);
}

export function viewPillTrackWidth(options) {
  const { icon, gap, word, count } = defaults(options);
  return icon * count + gap * Math.max(0, count - 1) + word;
}

export function viewPillSlots({
  count = 3,
  activeIndex = 0,
  icon = VIEW_PILL_ICON,
  gap = VIEW_PILL_GAP,
  word = VIEW_PILL_WORD,
} = {}) {
  const slots = [];
  let left = 0;
  for (let index = 0; index < count; index += 1) {
    const width = icon + (index === activeIndex ? word : 0);
    slots.push({ left, width });
    left += width + (index < count - 1 ? gap : 0);
  }
  return slots;
}

export function viewPillIndicatorBox({
  count = 3,
  activeIndex = 0,
  height = 25,
  icon = VIEW_PILL_ICON,
  gap = VIEW_PILL_GAP,
  word = VIEW_PILL_WORD,
} = {}) {
  const slot = viewPillSlots({ count, activeIndex, icon, gap, word })[activeIndex]
    ?? { left: 0, width: icon + word };
  return { left: slot.left, top: 0, width: slot.width, height };
}

export function viewPillFlipOffset({
  count = 3,
  fromIndex = 0,
  toIndex = 0,
  index = 0,
  icon = VIEW_PILL_ICON,
  gap = VIEW_PILL_GAP,
  word = VIEW_PILL_WORD,
} = {}) {
  const from = viewPillSlots({ count, activeIndex: fromIndex, icon, gap, word })[index];
  const to = viewPillSlots({ count, activeIndex: toIndex, icon, gap, word })[index];
  if (!from || !to) return 0;
  return from.left - to.left;
}

/* Which edge a word is squeezed from depends on which side of the active tab it
 * sits on, because the thing doing the squeezing is the tab that just grew.
 *
 * A tab to the LEFT of the active one is being pushed left, so the pressure
 * comes from its right: inset(0 100% 0 0) eats it from the right edge inward.
 * A tab to the RIGHT is being pushed right, so the pressure comes from its
 * left: inset(0 0 0 100%) eats it from the left edge inward.
 *
 * The first pass clipped from the right in both cases. Forwards that reads
 * correctly by accident — the growing tab really is to the right. Backwards it
 * inverts: the word collapses away from the very thing pushing it, which is
 * what made Actions → Timeline feel wrong while Timeline → Actions looked fine.
 *
 * The active tab needs no special case. It transitions out of whichever
 * direction-correct collapsed state it was already in, so it opens from the
 * side it is growing from. */
export function viewPillLabelClip(active, position = "left") {
  if (active) return "inset(0 0 0 0)";
  return position === "right" ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
}

/** Where tab `index` sits relative to the active tab. */
export function viewPillLabelSide(index, activeIndex) {
  return index > activeIndex ? "right" : "left";
}
