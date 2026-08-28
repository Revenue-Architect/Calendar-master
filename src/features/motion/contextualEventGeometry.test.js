import test from "node:test";
import assert from "node:assert/strict";

import { contextualEventInspectorGeometry } from "./contextualEventGeometry.js";

test("wide Day Event keeps its leading edge and grows downward when the viewport permits", () => {
  const geometry = contextualEventInspectorGeometry(
    { left: 84, top: 210, width: 980, height: 66 },
    { viewportWidth: 1200, viewportHeight: 820, naturalHeight: 620 },
  );

  assert.deepEqual(geometry, { left: 84, top: 210, width: 980, maxHeight: 594 });
});

test("narrow Week Event expands around its source and clamps inside the viewport", () => {
  const geometry = contextualEventInspectorGeometry(
    { left: 18, top: 260, width: 72, height: 44 },
    { viewportWidth: 420, viewportHeight: 780, naturalHeight: 560 },
  );

  assert.deepEqual(geometry, { left: 16, top: 260, width: 388, maxHeight: 504 });
});

test("narrow Week Event stays inside the timeline plane instead of covering the Actions rail", () => {
  const geometry = contextualEventInspectorGeometry(
    { left: 500, top: 260, width: 84, height: 44 },
    {
      viewportWidth: 1200,
      viewportHeight: 820,
      naturalHeight: 560,
      contextBounds: { left: 20, right: 668 },
    },
  );

  assert.deepEqual(geometry, { left: 228, top: 260, width: 440, maxHeight: 544 });
});

test("a low Event keeps its source top and lets the viewport cap the expanded Inspector", () => {
  const geometry = contextualEventInspectorGeometry(
    { left: 90, top: 700, width: 160, height: 52 },
    { viewportWidth: 900, viewportHeight: 820, naturalHeight: 640 },
  );

  assert.equal(geometry.top, 700);
  assert.equal(geometry.maxHeight, 104);
  assert.equal(geometry.left, 16);
});

test("missing geometry has no contextual destination", () => {
  assert.equal(contextualEventInspectorGeometry(null, { viewportWidth: 1000, viewportHeight: 800 }), null);
});
