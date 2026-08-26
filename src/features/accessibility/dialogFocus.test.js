import assert from "node:assert/strict";
import test from "node:test";

import {
  applyScrollSnapshot,
  focusDialogOnOpen,
  getDialogFocusableElements,
  inertDialogSiblings,
  nextDialogFocusIndex,
  restoreAncestorScroll,
  snapshotAncestorScroll,
  verticalScrollDelta,
} from "./dialogFocus.js";

function fakeElement({ inert = false, hasInertAttribute = false, hidden = false, tabIndex = null } = {}) {
  const attributes = new Map();
  if (hasInertAttribute) attributes.set("inert", "");
  if (tabIndex != null) attributes.set("tabindex", String(tabIndex));
  return {
    inert,
    hidden,
    parentElement: null,
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    setAttribute(name) {
      attributes.set(name, "");
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
}

test("dialog focus starts predictably and wraps in both directions", () => {
  assert.equal(nextDialogFocusIndex(0, -1, false), -1);
  assert.equal(nextDialogFocusIndex(3, -1, false), 0);
  assert.equal(nextDialogFocusIndex(3, -1, true), 2);
  assert.equal(nextDialogFocusIndex(3, 2, false), 0);
  assert.equal(nextDialogFocusIndex(3, 0, true), 2);
  assert.equal(nextDialogFocusIndex(3, 1, false), 2);
});

test("dialog focus index rejects impossible counts and positions", () => {
  assert.throws(() => nextDialogFocusIndex(-1, 0, false), /count/);
  assert.throws(() => nextDialogFocusIndex(2, 2, false), /currentIndex/);
});

test("modal background inertness restores each sibling's prior state", () => {
  const alreadyInert = fakeElement({ inert: true, hasInertAttribute: true });
  const ordinary = fakeElement();
  const root = fakeElement();
  const parent = { children: [alreadyInert, root, ordinary] };
  root.parentElement = parent;

  const restore = inertDialogSiblings(root);
  assert.equal(alreadyInert.inert, true);
  assert.equal(ordinary.inert, true);
  assert.equal(ordinary.hasAttribute("inert"), true);

  restore();
  assert.equal(alreadyInert.inert, true);
  assert.equal(alreadyInert.hasAttribute("inert"), true);
  assert.equal(ordinary.inert, false);
  assert.equal(ordinary.hasAttribute("inert"), false);
});

test("stacked modal ownership keeps shared siblings inert until the last Sheet leaves", () => {
  const background = fakeElement();
  const lowerRoot = fakeElement();
  const upperRoot = fakeElement();
  const parent = { children: [background, lowerRoot, upperRoot] };
  lowerRoot.parentElement = parent;
  upperRoot.parentElement = parent;

  const restoreLower = inertDialogSiblings(lowerRoot);
  assert.equal(upperRoot.inert, true);
  const restoreUpper = inertDialogSiblings(upperRoot);
  assert.equal(upperRoot.inert, false);
  assert.equal(lowerRoot.inert, true);

  restoreLower();
  assert.equal(background.inert, true);
  assert.equal(background.hasAttribute("inert"), true);
  assert.equal(upperRoot.inert, false);

  restoreUpper();
  assert.equal(background.inert, false);
  assert.equal(background.hasAttribute("inert"), false);
  assert.equal(lowerRoot.inert, false);

  const restoreLowerAgain = inertDialogSiblings(lowerRoot);
  const restoreUpperAgain = inertDialogSiblings(upperRoot);
  restoreUpperAgain();
  assert.equal(background.inert, true);
  restoreLowerAgain();
  assert.equal(background.inert, false);
});

test("opening focus ignores hidden controls and does not steal focus inside the dialog", () => {
  const previousDocument = globalThis.document;
  const inside = fakeElement();
  const hidden = fakeElement({ hidden: true });
  const visible = fakeElement();
  let focusOptions = null;
  visible.focus = (options) => {
    focusOptions = options;
    globalThis.document.activeElement = visible;
  };
  const root = {
    contains(node) {
      return node === inside;
    },
    querySelectorAll() {
      return [hidden, visible];
    },
  };

  globalThis.document = { activeElement: inside };
  try {
    assert.equal(focusDialogOnOpen(root), false);
    assert.equal(focusOptions, null);

    globalThis.document.activeElement = null;
    assert.equal(focusDialogOnOpen(root), true);
    assert.deepEqual(focusOptions, { preventScroll: true });
    assert.equal(globalThis.document.activeElement, visible);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("dialog focus excludes inactive roving-tabindex controls", () => {
  const inactive = fakeElement({ tabIndex: -1 });
  const active = fakeElement({ tabIndex: 0 });
  const root = {
    querySelectorAll() {
      return [inactive, active];
    },
  };

  assert.deepEqual(getDialogFocusableElements(root), [active]);
});

test("a child already inside its scroller does not ask to move", () => {
  assert.equal(verticalScrollDelta({ top: 40, bottom: 80 }, { top: 0, bottom: 100 }), 0);
});

test("a child above its scroller reports a negative delta", () => {
  assert.equal(verticalScrollDelta({ top: -20, bottom: 10 }, { top: 0, bottom: 100 }), -20);
});

test("a child below its scroller reports a positive delta", () => {
  assert.equal(verticalScrollDelta({ top: 90, bottom: 130 }, { top: 0, bottom: 100 }), 30);
});

test("restoring ancestor scroll puts a shoved container back", () => {
  const parent = { scrollLeft: 180, scrollTop: 12, parentElement: null };
  const child = { scrollLeft: 0, scrollTop: 0, parentElement: parent };
  const restore = restoreAncestorScroll(child);
  parent.scrollLeft = 240;
  parent.scrollTop = 40;
  restore();
  assert.equal(parent.scrollLeft, 180);
  assert.equal(parent.scrollTop, 12);
});

test("a render-time snapshot can be applied after a later shove", () => {
  const shell = { scrollLeft: 0, scrollTop: 0, parentElement: null };
  const snapshots = snapshotAncestorScroll(shell);
  shell.scrollLeft = 320;
  assert.equal(applyScrollSnapshot(snapshots), true);
  assert.equal(shell.scrollLeft, 0);
});
