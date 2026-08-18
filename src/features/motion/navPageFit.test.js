import test from "node:test";
import assert from "node:assert/strict";
import { navPageFit, navPageMotion } from "./navPageFit.js";

test("the recessed page keeps every edge on a desktop viewport", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  const motion = navPageMotion({ open: true, ...fit });
  assert.ok(fit.travelX >= 304, "it must clear the drawer");
  assert.ok(fit.clipTop >= 6, "it must keep a top margin");
  assert.ok(fit.clipTop <= 10, "the top clip must not eat the hamburger");
  assert.match(motion.transform, /translate3d\(/);
  assert.match(motion.clipPath, /inset\(/);
});

test("a missing viewport falls back instead of inventing NaN", () => {
  const fit = navPageFit({});
  assert.equal(Number.isFinite(fit.travelX), true);
  assert.equal(Number.isFinite(fit.clipTop), true);
});

test("top, right and bottom recess stay similar on a desktop viewport", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  assert.ok(Math.abs(fit.clipBottom - fit.clipTop) < 8, `bottom ${fit.clipBottom} vs top ${fit.clipTop}`);
  assert.ok(fit.clipRight >= fit.travelX + 18, `right clip ${fit.clipRight} must include travel ${fit.travelX}`);
  assert.ok(fit.travelX >= 304, "it must still clear the drawer");
});

test("the open page travels on X instead of shrinking its layout box", () => {
  const closed = navPageMotion({ open: false });
  const open = navPageMotion({
    open: true,
    travelX: 322,
    clipTop: 8,
    clipRight: 344,
    clipBottom: 8,
    radius: 22,
  });
  assert.equal(closed.transform, "translate3d(0px, 0px, 0)");
  assert.equal(closed.clipPath, "inset(0px 0px 0px 0px round 0px)");
  assert.equal(open.transform, "translate3d(322px, 0px, 0)");
  assert.equal(open.clipPath, "inset(8px 344px 8px 0px round 22px)");
  assert.equal(open.durationMs, 480);
});
