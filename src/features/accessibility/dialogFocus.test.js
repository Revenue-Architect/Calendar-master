import assert from "node:assert/strict";
import test from "node:test";

import { applyScrollSnapshot, nextDialogFocusIndex, restoreAncestorScroll, snapshotAncestorScroll, verticalScrollDelta } from "./dialogFocus.js";

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
