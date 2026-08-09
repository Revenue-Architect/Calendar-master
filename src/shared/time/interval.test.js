import assert from "node:assert/strict";
import test from "node:test";

import { assertHalfOpenInterval, intersectsHalfOpen } from "./interval.js";

const numericCompare = (left, right) => left - right;

test("touching half-open intervals do not overlap", () => {
  assert.equal(intersectsHalfOpen(0, 10, 10, 20, numericCompare), false);
  assert.equal(intersectsHalfOpen(0, 11, 10, 20, numericCompare), true);
});

test("half-open intervals reject empty and reversed bounds", () => {
  assert.throws(() => assertHalfOpenInterval(10, 10, numericCompare), /after start/);
  assert.throws(() => assertHalfOpenInterval(11, 10, numericCompare), /after start/);
});
