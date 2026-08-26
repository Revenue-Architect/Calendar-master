const FOCUSABLE = [
  "button:not([disabled]):not([tabindex='-1'])",
  "[href]:not([tabindex='-1'])",
  "input:not([disabled]):not([tabindex='-1'])",
  "select:not([disabled]):not([tabindex='-1'])",
  "textarea:not([disabled]):not([tabindex='-1'])",
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
    && element.getAttribute("aria-hidden") !== "true"
    && element.getAttribute("tabindex") !== "-1");
}

/* A Sheet is rendered inside the app surface rather than in a document-level
   portal. The modal boundary is every sibling branch on the scrim's path to
   the app root: that includes the planner surface, an open navigation drawer,
   and other app-level controls. Keep one shared ownership record per element
   so concurrently mounted Sheets cannot restore a background that another
   Sheet still owns. */
const inertSiblingOwners = new Map();

export function inertDialogSiblings(root) {
  if (!root?.parentElement) return () => {};
  const documentElement = typeof document !== "undefined" ? document.documentElement : null;
  const siblings = [];
  const seen = new Set();
  let branch = root;
  while (branch?.parentElement && branch.parentElement !== documentElement) {
    const parent = branch.parentElement;
    for (const element of [...parent.children].filter((candidate) => candidate !== branch)) {
      if (seen.has(element)) continue;
      seen.add(element);
      siblings.push(element);
    }
    branch = parent;
  }

  const setInert = (element, value) => {
    if ("inert" in element) element.inert = value;
    if (value) element.setAttribute?.("inert", "");
    else element.removeAttribute?.("inert");
  };

  /* If a later Sheet is already present in the same sibling set, an earlier
     Sheet may have inerted its root while taking its own snapshot. The later
     Sheet is the active branch, so release those stale claims before it takes
     ownership of the surrounding branches. Its cleanup will make the earlier
     Sheet interactive again when it becomes the topmost remaining Sheet. */
  const releaseClaimsFor = (element) => {
    const record = inertSiblingOwners.get(element);
    if (!record) return;
    inertSiblingOwners.delete(element);
    if ("inert" in element) element.inert = record.inert;
    if (record.hadAttribute) element.setAttribute?.("inert", "");
    else element.removeAttribute?.("inert");
  };
  releaseClaimsFor(root);

  const owner = Symbol("sheet-modal");
  siblings.forEach((element) => {
    let record = inertSiblingOwners.get(element);
    if (!record) {
      record = {
        owners: new Set(),
        inert: Boolean(element.inert),
        hadAttribute: typeof element.hasAttribute === "function" && element.hasAttribute("inert"),
      };
      inertSiblingOwners.set(element, record);
    }
    record.owners.add(owner);
    setInert(element, true);
  });

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    siblings.forEach((element) => {
      const record = inertSiblingOwners.get(element);
      if (!record) return;
      record.owners.delete(owner);
      if (record.owners.size > 0) return;
      inertSiblingOwners.delete(element);
      if ("inert" in element) element.inert = record.inert;
      if (record.hadAttribute) element.setAttribute?.("inert", "");
      else element.removeAttribute?.("inert");
    });
  };
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
  focusable[nextIndex].focus({ preventScroll: true });
  return true;
}

/* Same reason on the way out: the opener was on screen when it was pressed, and
   the closing sheet is still folding back over it. */
export function restoreDialogFocus(element) {
  if (!element?.isConnected || typeof element.focus !== "function") return false;
  element.focus({ preventScroll: true });
  return true;
}

/* How far a child must move to sit inside its scroller.
   Kept as rect math so the palette can scroll its own list without asking
   the browser to walk transformed ancestors. */
export function verticalScrollDelta(childRect, parentRect) {
  if (!childRect || !parentRect) return 0;
  if (childRect.top < parentRect.top) return childRect.top - parentRect.top;
  if (childRect.bottom > parentRect.bottom) return childRect.bottom - parentRect.bottom;
  return 0;
}

export function scrollChildIntoContainer(element, container) {
  if (!element || !container) return false;
  const delta = verticalScrollDelta(element.getBoundingClientRect(), container.getBoundingClientRect());
  if (delta === 0) return false;
  container.scrollTop += delta;
  return true;
}

/* A sheet that autofocuses while it is still translated onto its trigger can
   make overflow:hidden ancestors change scrollLeft. That is the bounce that
   shoved the calendar and header date off-screen when Search opened beside
   the Actions column. Snapshot the page chrome — never inner stream/ribbon
   scrollers — and put it back after focus. */
export function snapshotAncestorScroll(fromNode) {
  const snapshots = [];
  const seen = new Set();
  const add = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    snapshots.push({
      node,
      left: node.scrollLeft || 0,
      top: node.scrollTop || 0,
    });
  };
  if (typeof document !== "undefined") {
    add(document.documentElement);
    add(document.body);
  }
  let node = fromNode;
  while (node) {
    add(node);
    node = node.parentElement;
  }
  return snapshots;
}

export function applyScrollSnapshot(snapshots) {
  if (!Array.isArray(snapshots)) return false;
  let changed = false;
  for (const entry of snapshots) {
    if (!entry?.node) continue;
    if (entry.node.scrollLeft !== entry.left) {
      entry.node.scrollLeft = entry.left;
      changed = true;
    }
    if (entry.node.scrollTop !== entry.top) {
      entry.node.scrollTop = entry.top;
      changed = true;
    }
  }
  return changed;
}

export function restoreAncestorScroll(fromNode) {
  const snapshots = snapshotAncestorScroll(fromNode);
  const restore = () => applyScrollSnapshot(snapshots);
  restore();
  return restore;
}
