import test from "node:test";
import assert from "node:assert/strict";
import {
  clampProgress,
  interpolateShellGeometry,
  interpolateSharedLayer,
  interpolateSharedElements,
  interpolateColor,
  isDestinationContentRevealed,
  suppressSourcePaint,
  restoreSourcePaint,
} from "./morphInterpolate.js";

function box(x, y, width, height) {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

const FROM = box(48, 120, 160, 52);
const TO = box(24, 40, 360, 480);
const MID = box(36, 80, 260, 266);
const FROM_RADIUS = 12;
const TO_RADIUS = 20;
const MID_RADIUS = 16;
const FROM_PAINT = { background: "rgb(36, 37, 42)" };
const TO_PAINT = { background: "rgb(10, 12, 20)" };
const TITLE_FROM = { text: "Design Sync", rect: box(56, 128, 88, 16), type: null };
const TITLE_TO = { text: "Design Sync", rect: box(48, 64, 200, 28), type: null };
const TITLE_MID = box(52, 96, 144, 22);
const META_FROM = { text: "10:00 AM", rect: box(148, 130, 48, 12) };
const META_TO = { text: "10:00 AM", rect: box(280, 70, 80, 16) };
const META_MID = box(214, 100, 64, 14);
const MARKER_FROM = { type: "progress-ring", rect: box(184, 126, 16, 16) };
const MARKER_TO = { type: "progress-ring", rect: box(348, 68, 20, 20) };
const MARKER_MID = box(266, 97, 18, 18);

function assertRectEqual(actual, expected, label) {
  assert.ok(actual, `${label} rect is missing`);
  for (const key of ["x", "y", "width", "height", "left", "top", "right", "bottom"]) {
    assert.equal(actual[key], expected[key], `${label} ${key}`);
  }
}

function assertNoScale(frame, label) {
  const transform = frame?.transform ?? frame?.rect?.transform ?? "";
  assert.ok(!String(transform).includes("scale"), `${label} must not use scale()`);
}

test("shell interpolation at t=0 matches source geometry", () => {
  const frame = interpolateShellGeometry(FROM, TO, 0, {
    fromRadius: FROM_RADIUS,
    toRadius: TO_RADIUS,
    fromPaint: FROM_PAINT,
    toPaint: TO_PAINT,
  });
  assertRectEqual(frame?.rect, FROM, "t=0 shell");
  assert.equal(frame.radius, FROM_RADIUS);
  assert.equal(frame.paint.background, FROM_PAINT.background);
  assertNoScale(frame, "t=0");
});

test("shell interpolation at t=1 matches destination geometry", () => {
  const frame = interpolateShellGeometry(FROM, TO, 1, {
    fromRadius: FROM_RADIUS,
    toRadius: TO_RADIUS,
    fromPaint: FROM_PAINT,
    toPaint: TO_PAINT,
  });
  assertRectEqual(frame?.rect, TO, "t=1 shell");
  assert.equal(frame.radius, TO_RADIUS);
  assert.equal(frame.paint.background, TO_PAINT.background);
  assertNoScale(frame, "t=1");
});

test("shell interpolation at t=0.5 is the literal midpoint, not the source origin", () => {
  const frame = interpolateShellGeometry(FROM, TO, 0.5, {
    fromRadius: FROM_RADIUS,
    toRadius: TO_RADIUS,
    fromPaint: FROM_PAINT,
    toPaint: TO_PAINT,
  });
  assert.equal(MID.x, (FROM.x + TO.x) / 2);
  assertRectEqual(frame?.rect, MID, "t=0.5 shell");
  assert.equal(frame.radius, MID_RADIUS);
  assert.notEqual(frame.rect.x, FROM.x);
  assertNoScale(frame, "t=0.5");
});

test("shell interpolation clamps outside 0..1", () => {
  const under = interpolateShellGeometry(FROM, TO, -2, { fromRadius: FROM_RADIUS, toRadius: TO_RADIUS });
  const over = interpolateShellGeometry(FROM, TO, 4, { fromRadius: FROM_RADIUS, toRadius: TO_RADIUS });
  assertRectEqual(under.rect, FROM, "clamped low");
  assertRectEqual(over.rect, TO, "clamped high");
  assert.equal(clampProgress(-1), 0);
  assert.equal(clampProgress(2), 1);
  assert.equal(clampProgress(Number.NaN), 0);
});

test("shared title/meta/marker interpolate their own viewport boxes at t=0.5", () => {
  const shared = interpolateSharedElements(
    { title: TITLE_FROM, meta: META_FROM, marker: MARKER_FROM },
    { title: TITLE_TO, meta: META_TO, marker: MARKER_TO },
    0.5,
  );
  assertRectEqual(shared.title.rect, TITLE_MID, "title t=.5");
  assertRectEqual(shared.meta.rect, META_MID, "meta t=.5");
  assertRectEqual(shared.marker.rect, MARKER_MID, "marker t=.5");
  assert.equal(shared.title.text, "Design Sync");
  assert.equal(shared.meta.text, "10:00 AM");
  assert.equal(shared.marker.type, "progress-ring");
  assertNoScale(shared.title, "title");
  assertNoScale(shared.meta, "meta");
  assertNoScale(shared.marker, "marker");
});

test("shared layers stay 1x and keep identity at endpoints", () => {
  const start = interpolateSharedLayer(TITLE_FROM, TITLE_TO, 0);
  const end = interpolateSharedLayer(TITLE_FROM, TITLE_TO, 1);
  assert.equal(start.text, "Design Sync");
  assert.equal(end.text, "Design Sync");
  assertRectEqual(start.rect, TITLE_FROM.rect, "title t=0");
  assertRectEqual(end.rect, TITLE_TO.rect, "title t=1");
  assertNoScale(start, "title start");
  assertNoScale(end, "title end");
});

test("material uses source color at t=0 and destination color at t=1", () => {
  assert.equal(interpolateColor(FROM_PAINT.background, TO_PAINT.background, 0), FROM_PAINT.background);
  assert.equal(interpolateColor(FROM_PAINT.background, TO_PAINT.background, 1), TO_PAINT.background);
  assert.equal(
    interpolateColor(FROM_PAINT.background, "not-a-color", 0.5),
    FROM_PAINT.background,
  );
});

test("destination-only content is hidden early and available at settled OPEN", () => {
  assert.equal(isDestinationContentRevealed({
    progress: 0,
    state: "opening",
    fromRect: FROM,
    toRect: TO,
  }), false);
  assert.equal(isDestinationContentRevealed({
    progress: 0.5,
    state: "opening",
    fromRect: FROM,
    toRect: TO,
  }), false);
  assert.equal(isDestinationContentRevealed({
    progress: 1,
    state: "open",
    fromRect: FROM,
    toRect: TO,
  }), true);
});

test("source opacity is restored to the pre-morph inline value", () => {
  const node = { style: { opacity: "0.6" } };
  suppressSourcePaint(node);
  assert.equal(node.style.opacity, "0");
  restoreSourcePaint(node);
  assert.equal(node.style.opacity, "0.6");
});

test("source paint restore does not invent opacity 1 when none was set", () => {
  const node = { style: { opacity: "" } };
  suppressSourcePaint(node);
  assert.equal(node.style.opacity, "0");
  restoreSourcePaint(node);
  assert.equal(node.style.opacity, "");
});
