import test from "node:test";
import assert from "node:assert/strict";
import { createTimelineTouchScrollLock } from "./timelineTouchScrollLock.js";

function node(scrollTop = 40) {
  return { scrollTop, style: { overflowAnchor: "auto" } };
}

test("acquire snapshots the stream and enforces its scroll position", () => {
  const stream = node(120);
  const lock = createTimelineTouchScrollLock();
  assert.equal(lock.acquire(1, stream, { touchId: 7 }), true);
  assert.equal(stream.style.overflowAnchor, "none");
  stream.scrollTop = 240;
  assert.equal(lock.enforce(1, { node: stream, touchId: 7 }), true);
  assert.equal(stream.scrollTop, 120);
  assert.equal(lock.lockedScrollTop(1, { node: stream, touchId: 7 }), 120);
});

test("stale sequence and foreign touch operations cannot affect the active lock", () => {
  const first = node(10);
  const second = node(20);
  const lock = createTimelineTouchScrollLock();
  assert.equal(lock.acquire(1, first, { touchId: 1 }), true);
  assert.equal(lock.acquire(2, second, { touchId: 2 }), false);
  first.scrollTop = 99;
  assert.equal(lock.enforce(1, { node: first, touchId: 2 }), false);
  assert.equal(first.scrollTop, 99);
  assert.equal(lock.release(2, { node: first, touchId: 1 }), false);
  assert.equal(lock.isActive(1, { node: first, touchId: 1 }), true);
});

test("release restores inline state, accepts node replacement cleanup, and is idempotent", () => {
  const stream = node(80);
  const replacement = node(90);
  const lock = createTimelineTouchScrollLock();
  assert.equal(lock.acquire(9, stream, { touchId: 3 }), true);
  stream.style.overflowAnchor = "auto";
  assert.equal(lock.releaseNode(9, replacement), false);
  assert.equal(lock.releaseNode(9, stream), true);
  assert.equal(stream.style.overflowAnchor, "auto");
  assert.equal(lock.release(9, { node: stream, touchId: 3 }), false);
  assert.equal(lock.snapshot(), null);
});

