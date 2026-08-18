import test from "node:test";
import assert from "node:assert/strict";
import { navPageFit } from "./navPageFit.js";

test("the recessed page keeps every edge on a desktop viewport", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  const right = 1280 - fit.right;
  const bottom = 900 - fit.bottom;
  assert.ok(fit.left >= 304, "it must clear the drawer");
  assert.ok(fit.top >= 18, "it must keep a top margin");
  assert.ok(right <= 1280 - 12, `right edge ${right} ran off-screen`);
  assert.ok(bottom <= 900 - 12, `bottom edge ${bottom} ran off-screen`);
});

test("a missing viewport falls back instead of inventing NaN", () => {
  const fit = navPageFit({});
  assert.equal(Number.isFinite(fit.scale), true);
  assert.equal(Number.isFinite(fit.left), true);
  assert.equal(Number.isFinite(fit.top), true);
});

test("top, right and bottom recess stay similar on a desktop viewport", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  assert.ok(Math.abs(fit.bottom - fit.top) < 8, `bottom ${fit.bottom} vs top ${fit.top}`);
  assert.ok(Math.abs(fit.right - fit.top) < 12, `right ${fit.right} vs top ${fit.top}`);
  assert.ok(fit.left >= 304, "it must still clear the drawer");
});
