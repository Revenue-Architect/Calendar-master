import assert from "node:assert/strict";
import test from "node:test";

import { nextDialogFocusIndex } from "./dialogFocus.js";

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
