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

test("sheet morph starts centred on the trigger, clipped to the trigger's size", () => {
  assert.deepEqual(
    fluidMorphFromRects(
      { left: 20, top: 10, width: 40, height: 20 },
      { left: 100, top: 100, width: 400, height: 500 },
    ),
    /* Panel centre travels to the trigger centre, and the clip leaves exactly a
       40x20 window in the middle of a 400x500 panel: (400-40)/2, (500-20)/2. */
    { translateX: -260, translateY: -330, insetX: 180, insetY: 240 },
  );
});

test("a trigger bigger than the panel insets nothing rather than inverting", () => {
  const geometry = fluidMorphFromRects(
    { left: 0, top: 0, width: 900, height: 60 },
    { left: 100, top: 100, width: 400, height: 500 },
  );
  assert.equal(geometry.insetX, 0);
  assert.equal(geometry.insetY, 220);
});

test("the morph never reports a scale — a sheet's contents are not resampled", () => {
  const geometry = fluidMorphFromRects(
    { left: 0, top: 0, width: 40, height: 20 },
    { left: 0, top: 0, width: 400, height: 500 },
  );
  assert.deepEqual(Object.keys(geometry).sort(), ["insetX", "insetY", "translateX", "translateY"]);
});
