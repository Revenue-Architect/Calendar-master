import assert from "node:assert/strict";
import test from "node:test";

import {
  anchoredFluidMorphFromRects,
  effectiveFluidSourceRadius,
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

test("effective source radius is bounded by the physical trigger box", () => {
  assert.equal(effectiveFluidSourceRadius({ width: 39, height: 28 }, 999), 14);
  assert.equal(effectiveFluidSourceRadius({ width: 120, height: 40 }, 12), 12);
  assert.equal(effectiveFluidSourceRadius({ width: 120, height: 40 }, 0), 0);
  assert.equal(effectiveFluidSourceRadius({ width: 120, height: 40 }, Number.NaN), 20);
});

test("sheet morph starts from the trigger's anchored edges", () => {
  assert.deepEqual(
    anchoredFluidMorphFromRects(
      { left: 20, top: 10, width: 40, height: 20 },
      { left: 100, top: 100, width: 400, height: 500 },
    ),
    { translateX: -80, translateY: -90, insetTop: 0, insetRight: 360, insetBottom: 480, insetLeft: 0,
      sourceRadius: 10, targetRadius: 24, anchorX: "left", anchorY: "top" },
  );
});

test("a trigger bigger than the panel insets nothing rather than inverting", () => {
  const geometry = anchoredFluidMorphFromRects(
    { left: 0, top: 0, width: 900, height: 60 },
    { left: 100, top: 100, width: 400, height: 500 },
  );
  assert.equal(geometry.insetTop, 0);
  assert.equal(geometry.insetBottom, 440);
  assert.equal(geometry.insetLeft, 0);
  assert.equal(geometry.insetRight, 0);
});

test("the morph never reports a scale — a sheet's contents are not resampled", () => {
  const geometry = anchoredFluidMorphFromRects(
    { left: 0, top: 0, width: 40, height: 20 },
    { left: 0, top: 0, width: 400, height: 500 },
  );
  assert.deepEqual(Object.keys(geometry).sort(), [
    "anchorX", "anchorY", "insetBottom", "insetLeft", "insetRight", "insetTop",
    "sourceRadius", "targetRadius", "translateX", "translateY",
  ]);
});

const startVisibleRect = (geometry, panelRect) => ({
  left: panelRect.left + geometry.translateX + geometry.insetLeft,
  top: panelRect.top + geometry.translateY + geometry.insetTop,
  width: panelRect.width - geometry.insetLeft - geometry.insetRight,
  height: panelRect.height - geometry.insetTop - geometry.insetBottom,
});

const assertAnchoredStart = (triggerRect, panelRect, options = {}) => {
  const geometry = anchoredFluidMorphFromRects(triggerRect, panelRect, options);
  const visible = startVisibleRect(geometry, panelRect);
  for (const inset of [geometry.insetTop, geometry.insetRight, geometry.insetBottom, geometry.insetLeft]) {
    assert.ok(inset >= 0, `inset must not be negative: ${inset}`);
  }
  if (triggerRect.width <= panelRect.width) {
    assert.ok(Math.abs(visible.left - triggerRect.left) < 0.001);
  } else if (geometry.anchorX === "right") {
    assert.ok(Math.abs(visible.left + visible.width - (triggerRect.left + triggerRect.width)) < 0.001);
  } else {
    assert.ok(Math.abs(visible.left - triggerRect.left) < 0.001);
  }
  if (triggerRect.height <= panelRect.height) {
    assert.ok(Math.abs(visible.top - triggerRect.top) < 0.001);
  } else if (geometry.anchorY === "bottom") {
    assert.ok(Math.abs(visible.top + visible.height - (triggerRect.top + triggerRect.height)) < 0.001);
  } else {
    assert.ok(Math.abs(visible.top - triggerRect.top) < 0.001);
  }
  assert.ok(Math.abs(visible.width - Math.min(triggerRect.width, panelRect.width)) < 0.001);
  assert.ok(Math.abs(visible.height - Math.min(triggerRect.height, panelRect.height)) < 0.001);
  assert.deepEqual(
    [geometry.insetTop, geometry.insetRight, geometry.insetBottom, geometry.insetLeft]
      .map((value) => Object.is(value, -0) ? 0 : value),
    [geometry.anchorY === "top" ? 0 : panelRect.height - Math.min(triggerRect.height, panelRect.height),
      geometry.anchorX === "right" ? 0 : panelRect.width - Math.min(triggerRect.width, panelRect.width),
      geometry.anchorY === "bottom" ? 0 : panelRect.height - Math.min(triggerRect.height, panelRect.height),
      geometry.anchorX === "left" ? 0 : panelRect.width - Math.min(triggerRect.width, panelRect.width)],
  );
  return geometry;
};

test("anchored morph keeps a top-right source attached while it opens left and down", () => {
  const trigger = { left: 700, top: 20, width: 100, height: 40 };
  const panel = { left: 200, top: 100, width: 500, height: 600 };
  const geometry = assertAnchoredStart(trigger, panel, { sourceRadius: 999, targetRadius: 24 });

  assert.equal(geometry.anchorX, "right");
  assert.equal(geometry.anchorY, "top");
  assert.equal(geometry.translateX, 100);
  assert.equal(geometry.translateY, -80);
  assert.equal(geometry.sourceRadius, 20);
  assert.equal(geometry.targetRadius, 24);
});

test("anchored morph supports a top-left source", () => {
  const geometry = assertAnchoredStart(
    { left: 20, top: 20, width: 80, height: 40 },
    { left: 100, top: 100, width: 500, height: 600 },
  );
  assert.equal(geometry.anchorX, "left");
  assert.equal(geometry.anchorY, "top");
  assert.deepEqual(
    [geometry.insetTop, geometry.insetRight, geometry.insetBottom, geometry.insetLeft],
    [0, 420, 560, 0],
  );
});

test("anchored morph supports a bottom-right source", () => {
  const geometry = assertAnchoredStart(
    { left: 700, top: 700, width: 80, height: 40 },
    { left: 200, top: 100, width: 500, height: 600 },
  );
  assert.equal(geometry.anchorX, "right");
  assert.equal(geometry.anchorY, "bottom");
  assert.deepEqual(
    [geometry.insetTop, geometry.insetRight, geometry.insetBottom, geometry.insetLeft],
    [560, 0, 0, 420],
  );
});

test("anchored morph supports a bottom-left source", () => {
  const geometry = assertAnchoredStart(
    { left: 20, top: 700, width: 80, height: 40 },
    { left: 100, top: 100, width: 500, height: 600 },
  );
  assert.equal(geometry.anchorX, "left");
  assert.equal(geometry.anchorY, "bottom");
  assert.deepEqual(
    [geometry.insetTop, geometry.insetRight, geometry.insetBottom, geometry.insetLeft],
    [560, 420, 0, 0],
  );
});

test("anchored morph clamps source sizes larger than the true-size panel", () => {
  const geometry = assertAnchoredStart(
    { left: 10, top: 20, width: 900, height: 700 },
    { left: 100, top: 100, width: 400, height: 500 },
  );
  assert.ok(geometry.insetTop >= 0);
  assert.ok(geometry.insetRight >= 0);
  assert.ok(geometry.insetBottom >= 0);
  assert.ok(geometry.insetLeft >= 0);
  const visible = startVisibleRect(geometry, { left: 100, top: 100, width: 400, height: 500 });
  assert.equal(visible.width, 400);
  assert.equal(visible.height, 500);
});

test("anchored morph keeps subpixel rectangles stable and derives its source window", () => {
  const trigger = { left: 12.25, top: 611.5, width: 97.5, height: 41.25 };
  const panel = { left: 83.75, top: 147.125, width: 431.5, height: 528.875 };
  const geometry = assertAnchoredStart(trigger, panel, { sourceRadius: 12.5, targetRadius: 24 });

  assert.equal(geometry.sourceRadius, 12.5);
  assert.equal(geometry.targetRadius, 24);
  const visible = startVisibleRect(geometry, panel);
  assert.deepEqual(
    { width: visible.width, height: visible.height },
    { width: trigger.width, height: trigger.height },
  );
});

test("ordinary trigger morphs remain centered and symmetric", () => {
  assert.deepEqual(
    fluidMorphFromRects(
      { left: 700, top: 20, width: 100, height: 40 },
      { left: 200, top: 100, width: 500, height: 600 },
    ),
    { translateX: 300, translateY: -360, insetX: 200, insetY: 280 },
  );
});
