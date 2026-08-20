import test from "node:test";
import assert from "node:assert/strict";
import { navMobileMotion, navPageFit, navPageMotion, navDrawerMotion } from "./navPageFit.js";

const HUD_TOP = 8; /* the header's own padding, where the hamburger starts */

test("the recessed page keeps explicit frame and carrier geometry on a desktop viewport", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  assert.ok(fit.carrier.x >= 304, "it must clear the drawer");
  assert.equal(fit.frame.left, 322);
  assert.equal(fit.frame.top, 24);
  assert.equal(fit.frame.right, 22);
  assert.equal(fit.frame.bottom, 24);
  assert.equal(fit.frame.radius, 22);
  assert.equal(fit.carrier.x, 322);
  assert.equal(fit.carrier.y, 20);
});

test("a missing viewport falls back safely instead of inventing NaN", () => {
  const fit = navPageFit({});
  assert.equal(Number.isFinite(fit.carrier.x), true);
  assert.equal(Number.isFinite(fit.carrier.y), true);
  assert.equal(Number.isFinite(fit.frame.top), true);
  assert.equal(Number.isFinite(fit.frame.right), true);
  assert.equal(Number.isFinite(fit.frame.bottom), true);
  assert.equal(Number.isFinite(fit.frame.left), true);
});

test("the direct frame reads even on every side", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  assert.equal(fit.frame.top, 24);
  assert.equal(fit.frame.bottom, 24);
  assert.equal(fit.frame.right, 22);
  assert.equal(fit.frame.left, 322);
  assert.ok(Math.abs(fit.frame.right - fit.frame.top) <= 6, `right ${fit.frame.right} vs top ${fit.frame.top}`);
});

test("a thicker frame never eats into the hamburger", () => {
  for (const marginTop of [8, 16, 24, 40]) {
    const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900, marginTop });
    assert.ok(HUD_TOP - fit.clipTop > 0, `margin ${marginTop} cut ${fit.clipTop} into the hamburger`);
    assert.equal(fit.frame.top, marginTop, `margin ${marginTop} did not produce its own frame`);
  }
});

test("returns explicit frame mask and carrier translation across responsive viewports", () => {
  // Desktop
  const desktop = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  assert.deepEqual(desktop.frame, { top: 24, right: 22, bottom: 24, left: 322, radius: 22 });
  assert.deepEqual(desktop.carrier, { x: 322, y: 20 });
  assert.equal(desktop.mobile.x, 1280 - 44);

  // Tablet (e.g. 768 x 1024)
  const tablet = navPageFit({ viewportWidth: 768, viewportHeight: 1024 });
  assert.equal(tablet.frame.left, 322);
  assert.equal(tablet.frame.right, 22);
  assert.equal(tablet.carrier.x, 322);

  // Phone (e.g. 390 x 844)
  const phone = navPageFit({ viewportWidth: 390, viewportHeight: 844 });
  assert.equal(phone.mobile.railWidth, 44);
  assert.equal(phone.mobile.edgeGap, 0);
  assert.equal(phone.mobile.x, 390 - 44);
  assert.equal(phone.mobile.x + phone.mobile.railWidth, 390);

  // Short height phone (e.g. 390 x 601)
  const shortPhone = navPageFit({ viewportWidth: 390, viewportHeight: 601 });
  assert.equal(shortPhone.mobile.x, 346);
});

test("mobile rail and carrier share one normalized progress geometry", () => {
  const fit = navPageFit({ viewportWidth: 390, viewportHeight: 844 });
  const closed = navMobileMotion({ progress: 0, mobile: fit.mobile });
  const halfway = navMobileMotion({ progress: 0.5, mobile: fit.mobile });
  const open = navMobileMotion({ progress: 1, mobile: fit.mobile });

  assert.equal(closed.frame.left, 0);
  assert.equal(closed.rail.x, -44);
  assert.equal(closed.carrier.x, 0);
  assert.equal(closed.visibleRailWidth, 0);

  assert.equal(halfway.frame.left, 173);
  assert.equal(halfway.rail.x, 151);
  assert.equal(halfway.carrier.x, 195);
  assert.equal(halfway.rail.right, halfway.carrier.x);
  assert.equal(halfway.visibleRailWidth, 22);
  assert.equal(halfway.gap, 0);

  assert.equal(open.frame.left, 346);
  assert.equal(open.rail.x, 346);
  assert.equal(open.carrier.x, 390);
  assert.equal(open.rail.right, open.carrier.x);
  assert.equal(open.rail.right, 390);
  assert.equal(open.visibleRailWidth, 44);

  for (const progress of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const sample = navMobileMotion({ progress, mobile: fit.mobile });
    assert.equal(sample.rail.right, sample.carrier.x, `rail/carrier seam at p=${progress}`);
    assert.equal(sample.gap, 0, `rail/carrier gap at p=${progress}`);
    assert.ok(sample.frame.left <= sample.rail.right, `frame must reveal the rail at p=${progress}`);
  }
});

test("navPageMotion creates direct viewport mask and carrier transform", () => {
  const closed = navPageMotion({ open: false });
  const open = navPageMotion({
    open: true,
    carrier: { x: 322, y: 20 },
    frame: { top: 24, right: 22, bottom: 24, left: 322, radius: 22 },
  });
  assert.equal(closed.carrierTransform, "translate3d(0px, 0px, 0)");
  assert.equal(closed.viewportClipPath, "inset(0px 0px 0px 0px round 0px)");
  assert.equal(open.carrierTransform, "translate3d(322px, 20px, 0)");
  assert.equal(open.viewportClipPath, "inset(24px 22px 24px 322px round 22px)");
  assert.equal(open.durationMs, 520);
});

test("only the open phase reveals the drawer and labels", () => {
  assert.equal(navDrawerMotion("closed").transform, "translate3d(-36%, 0px, 0)");
  assert.equal(navDrawerMotion("opening").transform, "translate3d(-36%, 0px, 0)");
  assert.equal(navDrawerMotion("open").transform, "translate3d(0%, 0px, 0)");
  assert.equal(navDrawerMotion("closing").transform, "translate3d(-36%, 0px, 0)");
  assert.equal(navDrawerMotion("closing").itemOpacity, 0);
  assert.equal(navDrawerMotion("closing").itemDelayMs, 0);
  assert.equal(navDrawerMotion("closing").itemDurationMs, navPageMotion({ open: true }).durationMs);
});

test("open labels stagger in instead of arriving as one slab", () => {
  const closed = navDrawerMotion("closed");
  const open = navDrawerMotion("open");
  assert.equal(closed.itemOpacity, 0);
  assert.equal(closed.itemDelayMs, 0);
  assert.equal(open.itemOpacity, 1);
  assert.equal(open.itemDelayMs, 30);
  assert.equal(open.itemDurationMs, 260);
  /* eight slots, so the last label has to land before the card settles */
  assert.ok(open.itemDelayMs * 7 + open.itemDurationMs < navPageMotion({ open: true }).durationMs + 40);
});
