import test from "node:test";
import assert from "node:assert/strict";
import {
  RIBBON_POSITION_STATES,
  RIBBON_MAX_POSITION_RETRIES,
  nextRibbonRetry,
  ribbonIntersection,
  ribbonLogicalCenter,
  ribbonRevealTarget,
  ribbonScrollLeftForLogicalCenter,
} from "./ribbonViewport.js";

function surface({ width = 320, scrollLeft = 0, scrollWidth = 1600 } = {}) {
  return { clientWidth: width, scrollLeft, scrollWidth, isConnected: true };
}

function cell({ left = 40, width = 80 } = {}) {
  return { offsetLeft: left, offsetWidth: width, isConnected: true };
}

test("ribbon readiness requires a usable selected-cell intersection", () => {
  const strip = surface();
  assert.equal(ribbonIntersection(strip, cell({ left: 0 })).ok, false);
  strip.scrollLeft = 0;
  assert.equal(ribbonIntersection(strip, cell({ left: 80 })).ok, true);
  assert.equal(ribbonIntersection(strip, cell({ left: 80 })).status, RIBBON_POSITION_STATES.settled);
});

test("zero-width or disconnected nodes stay recoverable instead of reporting success", () => {
  assert.equal(ribbonIntersection(surface({ width: 0 }), cell()).status, RIBBON_POSITION_STATES.blockedZeroWidth);
  assert.equal(ribbonIntersection(surface(), { ...cell(), isConnected: false }).status, "missing-node");
});

test("reveal target respects the 24px inset and clamps to scroll bounds", () => {
  const strip = surface({ scrollLeft: 0, scrollWidth: 700 });
  const target = ribbonRevealTarget(strip, cell({ left: 300 }), { inset: 24 });
  assert.equal(target.target, 84);
  assert.equal(target.changed, true);
  assert.equal(ribbonRevealTarget(surface({ scrollLeft: 1000, scrollWidth: 320 }), cell({ left: 40 })).target, 0);
});

test("positioning retries are bounded", () => {
  let retries = 0;
  for (let i = 0; i < RIBBON_MAX_POSITION_RETRIES; i += 1) retries = nextRibbonRetry(retries);
  assert.equal(retries, RIBBON_MAX_POSITION_RETRIES);
  assert.equal(nextRibbonRetry(retries), null);
});

test("logical centre survives responsive cell-width changes", () => {
  const logicalCenter = ribbonLogicalCenter({ scrollLeft: 480, clientWidth: 320, cellWidth: 96 });
  assert.equal(logicalCenter, 6.666666666666667);
  assert.equal(ribbonScrollLeftForLogicalCenter({
    logicalCenter,
    clientWidth: 320,
    cellWidth: 80,
    maxScrollLeft: 5_000,
  }), 373.33333333333337);
  assert.equal(ribbonScrollLeftForLogicalCenter({
    logicalCenter,
    clientWidth: 320,
    cellWidth: 64,
    maxScrollLeft: 5_000,
  }), 266.6666666666667);
  assert.equal(ribbonScrollLeftForLogicalCenter({
    logicalCenter,
    clientWidth: 320,
    cellWidth: 96,
    maxScrollLeft: 5_000,
  }), 480);
});

test("logical centre preserves fractional positions and clamps both edges", () => {
  const logicalCenter = ribbonLogicalCenter({ scrollLeft: 17.5, clientWidth: 321, cellWidth: 80 });
  assert.equal(logicalCenter, (17.5 + 321 / 2) / 80);
  assert.equal(ribbonScrollLeftForLogicalCenter({
    logicalCenter: 0.25,
    clientWidth: 390,
    cellWidth: 64,
    maxScrollLeft: 2_000,
  }), 0);
  assert.equal(ribbonScrollLeftForLogicalCenter({
    logicalCenter: 100,
    clientWidth: 390,
    cellWidth: 64,
    maxScrollLeft: 2_000,
  }), 2_000);
});

test("logical centre rejects invalid dimensions", () => {
  assert.equal(ribbonLogicalCenter({ scrollLeft: 0, clientWidth: 0, cellWidth: 80 }), null);
  assert.equal(ribbonLogicalCenter({ scrollLeft: 0, clientWidth: 320, cellWidth: 0 }), null);
  assert.equal(ribbonLogicalCenter({ scrollLeft: Number.NaN, clientWidth: 320, cellWidth: 80 }), null);
  assert.equal(ribbonScrollLeftForLogicalCenter({
    logicalCenter: 1,
    clientWidth: 0,
    cellWidth: 80,
    maxScrollLeft: 100,
  }), null);
});
