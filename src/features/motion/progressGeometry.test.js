import assert from "node:assert/strict";
import test from "node:test";

import { progressSegmentStates } from "./progressGeometry.js";

test("fills segments from the left by count, not by item identity", () => {
  assert.deepEqual(progressSegmentStates(1, 4), [true, false, false, false]);
  assert.deepEqual(progressSegmentStates(3, 4), [true, true, true, false]);
});

test("clamps malformed counts to the available segments", () => {
  assert.deepEqual(progressSegmentStates(-1, 3), [false, false, false]);
  assert.deepEqual(progressSegmentStates(9, 3), [true, true, true]);
  assert.deepEqual(progressSegmentStates(1, 0), []);
});
