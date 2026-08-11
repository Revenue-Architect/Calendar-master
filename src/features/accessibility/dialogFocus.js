const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function nextDialogFocusIndex(count, currentIndex, shiftKey = false) {
  if (!Number.isInteger(count) || count < 0) throw new TypeError("count must be a non-negative integer");
  if (!Number.isInteger(currentIndex) || currentIndex < -1 || currentIndex >= count) {
    throw new RangeError("currentIndex must be within the dialog focus list");
  }
  if (count === 0) return -1;
  if (currentIndex === -1) return shiftKey ? count - 1 : 0;
  return (currentIndex + (shiftKey ? -1 : 1) + count) % count;
}

export function getDialogFocusableElements(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter((element) => !element.hidden
    && element.getAttribute("aria-hidden") !== "true");
}

/* `preventScroll` is not a nicety here.
   This runs on the first frame of the sheet's entry animation, while the panel is
   still scaled down to a pill somewhere near the button that opened it. Focusing
   without it asks the browser to scroll a transformed, quarter-sized element into
   view inside a scroll container that is itself mid-animation — so it scrolls to a
   place that will not exist a frame later, and the sheet's contents visibly jump
   as it opens. The sheet is already the only thing on screen; there is nothing to
   scroll towards. */
export function focusDialogOnOpen(root) {
  if (!root || root.contains(document.activeElement)) return false;
  const first = getDialogFocusableElements(root)[0];
  if (!first) return false;
  first.focus({ preventScroll: true });
  return true;
}

export function trapDialogTab(event, root) {
  if (event.key !== "Tab") return false;
  const focusable = getDialogFocusableElements(root);
  const currentIndex = focusable.indexOf(document.activeElement);
  const nextIndex = nextDialogFocusIndex(focusable.length, currentIndex, event.shiftKey);
  if (nextIndex === -1) return false;
  event.preventDefault();
  focusable[nextIndex].focus();
  return true;
}

/* Same reason on the way out: the opener was on screen when it was pressed, and
   the closing sheet is still folding back over it. */
export function restoreDialogFocus(element) {
  if (!element?.isConnected || typeof element.focus !== "function") return false;
  element.focus({ preventScroll: true });
  return true;
}
