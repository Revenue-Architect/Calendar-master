import assert from "node:assert/strict";
import test from "node:test";

import {
  fluidMorphFromRects,
  fluidPillBox,
  fluidPillStretch,
} from "./fluidGeometry.js";

test("fluid pill geometry is relative to its container", () => {
  assert.deepEqual(
    fluidPillBox(
      { left: 100, top: 40 },
      { left: 164, top: 46, width: 96, height: 32 },
    ),
    { left: 64, top: 6, width: 96, height: 32 },
  );
});

test("fluid pill stretch grows with travel and stays bounded", () => {
  assert.equal(fluidPillStretch({ left: 0 }, { left: 0 }), 1);
  assert.equal(fluidPillStretch({ left: 0 }, { left: 52 }), 1.13);
  assert.equal(fluidPillStretch({ left: 0 }, { left: 1000 }), 1.18);
});

test("sheet morph starts at the trigger center and clamps tiny scales", () => {
  assert.deepEqual(
    fluidMorphFromRects(
      { left: 20, top: 10, width: 40, height: 20 },
      { left: 100, top: 100, width: 400, height: 500 },
    ),
    { translateX: -260, translateY: -330, scale: 0.12, scaleX: 0.12, scaleY: 0.12 },
  );
});
