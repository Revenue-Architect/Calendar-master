import test from "node:test";
import assert from "node:assert/strict";

import { packEventLanes } from "../layout/packEventLanes.js";

test("separate collision clusters do not inherit each other's lane count", () => {
  const packed = packEventLanes([
    { id: "a", start: 540, dur: 60 },
    { id: "b", start: 570, dur: 60 },
    { id: "c", start: 720, dur: 30 },
  ]);
  assert.deepEqual(packed.map(({ id, lane, cols }) => ({ id, lane, cols })), [
    { id: "a", lane: 0, cols: 2 },
    { id: "b", lane: 1, cols: 2 },
    { id: "c", lane: 0, cols: 1 },
  ]);
});

test("fully nested events receive distinct lanes within one cluster", () => {
  const packed = packEventLanes([
    { id: "outer", start: 540, dur: 180 },
    { id: "inner-a", start: 570, dur: 30 },
    { id: "inner-b", start: 600, dur: 30 },
  ]);
  assert.deepEqual(packed.map(({ id, lane, cols }) => ({ id, lane, cols })), [
    { id: "outer", lane: 0, cols: 2 },
    { id: "inner-a", lane: 1, cols: 2 },
    { id: "inner-b", lane: 1, cols: 2 },
  ]);
});

test("packing is immutable and deterministically orders ties by ID", () => {
  const events = [
    { id: "b", start: 540, dur: 30 },
    { id: "a", start: 540, dur: 30 },
  ];
  const packed = packEventLanes(events);
  assert.deepEqual(packed.map((event) => event.id), ["a", "b"]);
  assert.equal(events[0].lane, undefined);
});
