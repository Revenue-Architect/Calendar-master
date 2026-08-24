import assert from "node:assert/strict";
import test from "node:test";

import {
  progressSegmentStates,
  progressSegmentDelay,
  holdProgress,
  holdRatchetStep,
  holdRadialDashOffset,
} from "./progressGeometry.js";

test("fills segments from the left by count, not by item identity", () => {
  assert.deepEqual(progressSegmentStates(1, 4), [true, false, false, false]);
  assert.deepEqual(progressSegmentStates(3, 4), [true, true, true, false]);
});

test("clamps malformed counts to the available segments", () => {
  assert.deepEqual(progressSegmentStates(-1, 3), [false, false, false]);
  assert.deepEqual(progressSegmentStates(9, 3), [true, true, true]);
  assert.deepEqual(progressSegmentStates(1, 0), []);
});

test("segment stagger only delays newly filled segments and caps the cascade", () => {
  assert.equal(progressSegmentDelay(0, 2, 3), 0);
  assert.equal(progressSegmentDelay(2, 2, 3), 0);
  assert.equal(progressSegmentDelay(3, 2, 4), 60);
  assert.equal(progressSegmentDelay(9, 0, 10), 160);
  assert.ok(progressSegmentDelay(5, 0, 10) <= 160);
});

test("holdProgress clamps accurately between 0 and 1", () => {
  assert.equal(holdProgress(0, 640), 0);
  assert.equal(holdProgress(320, 640), 0.5);
  assert.equal(holdProgress(640, 640), 1);
  assert.equal(holdProgress(1000, 640), 1);
  assert.equal(holdProgress(-100, 640), 0);
});

test("holdRatchetStep narrows step size as completion nears", () => {
  assert.equal(holdProgress(0, 640), 0);
  assert.equal(holdProgress(320, 640), 0.5);
  assert.equal(holdProgress(640, 640), 1);
  assert.equal(holdProgress(1000, 640), 1);
  assert.equal(holdProgress(-100, 640), 0);

  // Ratchet steps should decrease monotonically from start to finish
  const startStep = holdRatchetStep(0);
  const midStep = holdRatchetStep(0.5);
  const endStep = holdRatchetStep(1);
  assert.ok(startStep > midStep);
  assert.ok(midStep > endStep);
  assert.equal(Math.round(startStep * 100) / 100, 0.17);
  assert.equal(Math.round(endStep * 100) / 100, 0.06);

  // Radial dash offset should shrink from full circumference (2*PI*13) to 0
  const fullCircumference = 2 * Math.PI * 13;
  assert.equal(holdRadialDashOffset(13, 0), fullCircumference);
  assert.equal(holdRadialDashOffset(13, 1), 0);
  assert.equal(holdRadialDashOffset(13, 0.5), fullCircumference * 0.5);
});
