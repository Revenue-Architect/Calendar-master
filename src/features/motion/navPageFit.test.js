import test from "node:test";
import assert from "node:assert/strict";
import { navPageFit } from "./navPageFit.js";

test("the recessed page keeps every edge on a desktop viewport", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  const right = fit.x + 1280 * fit.scale;
  const bottom = fit.y + 900 * fit.scale;
  assert.ok(fit.x >= 304, "it must clear the drawer");
  assert.ok(fit.y >= 18, "it must keep a top margin");
  assert.ok(right <= 1280 - 12, `right edge ${right} ran off-screen`);
  assert.ok(bottom <= 900 - 12, `bottom edge ${bottom} ran off-screen`);
  assert.ok(fit.scale < 1, "it must shrink to stay a card");
});

test("a missing viewport falls back instead of inventing NaN", () => {
  const fit = navPageFit({});
  assert.equal(Number.isFinite(fit.scale), true);
  assert.equal(Number.isFinite(fit.x), true);
});
