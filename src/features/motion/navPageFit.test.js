import test from "node:test";
import assert from "node:assert/strict";
import { navPageFit, navPageMotion, navDrawerMotion } from "./navPageFit.js";

const HUD_TOP = 8; /* the header's own padding, where the hamburger starts */

test("the recessed page keeps every edge on a desktop viewport", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  assert.ok(fit.travelX >= 304, "it must clear the drawer");
  assert.equal(fit.frameLeft, fit.travelX);
  assert.equal(1280 - (fit.travelX + 1280 - fit.clipRight), fit.frameRight);
});

test("a missing viewport falls back instead of inventing NaN", () => {
  const fit = navPageFit({});
  assert.equal(Number.isFinite(fit.travelX), true);
  assert.equal(Number.isFinite(fit.travelY), true);
  assert.equal(Number.isFinite(fit.clipTop), true);
});

test("the black frame reads even on every side", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  assert.equal(fit.frameTop, 16);
  assert.equal(fit.frameBottom, 16);
  assert.ok(Math.abs(fit.frameRight - fit.frameTop) <= 6, `right ${fit.frameRight} vs top ${fit.frameTop}`);
});

test("a thicker frame never eats into the hamburger", () => {
  /* The cut is what reaches the HUD; travel carries the page down with it.
     Clearance is the header's own padding minus the cut, and it has to stay
     positive however thick the border gets. */
  for (const marginTop of [8, 16, 24, 40]) {
    const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900, marginTop });
    assert.ok(HUD_TOP - fit.clipTop > 0, `margin ${marginTop} cut ${fit.clipTop} into the hamburger`);
    assert.equal(fit.frameTop, marginTop, `margin ${marginTop} did not produce its own frame`);
  }
});

test("the open page travels on X instead of shrinking its layout box", () => {
  const closed = navPageMotion({ open: false });
  const open = navPageMotion({ open: true, travelX: 322, travelY: 12, clipTop: 4, clipRight: 344, clipBottom: 28, radius: 22 });
  assert.equal(closed.transform, "translate3d(0px, 0px, 0)");
  assert.equal(closed.clipPath, "inset(0px 0px 0px 0px round 0px)");
  assert.equal(open.transform, "translate3d(322px, 12px, 0)");
  assert.equal(open.clipPath, "inset(4px 344px 28px 0px round 22px)");
  assert.equal(open.durationMs, 520);
});

test("the drawer travels on the same beat as the page, not a frame later", () => {
  assert.equal(navDrawerMotion("closed").transform, "translate3d(-36%, 0px, 0)");
  assert.equal(navDrawerMotion("opening").transform, "translate3d(0%, 0px, 0)");
  assert.equal(navDrawerMotion("open").transform, "translate3d(0%, 0px, 0)");
  assert.equal(navDrawerMotion("closing").transform, "translate3d(0%, 0px, 0)");
});

test("open labels stagger in instead of arriving as one slab", () => {
  const closed = navDrawerMotion("closed");
  const open = navDrawerMotion("open");
  assert.equal(closed.itemOpacity, 0);
  assert.equal(closed.itemDelayMs, 0);
  assert.equal(open.itemOpacity, 1);
  assert.equal(open.itemDelayMs, 30);
  /* eight slots, so the last label has to land before the card settles */
  assert.ok(open.itemDelayMs * 7 + 260 < navPageMotion({ open: true }).durationMs + 40);
});
