import { test, expect } from "@playwright/test";
import { openPlanner, seedPlanner } from "./helpers.js";

/* The view switch listens on the section wrapping every surface in the app, so
 * the question these ask is not "does swiping change the view" but "does it
 * change the view when the finger belonged to something else".
 *
 * Both cases below shipped broken: completing an Action left the task open and
 * threw the view sideways, and dragging a horizontal scroller navigated instead
 * of scrolling. Each assertion is a pair — the near gesture did what it meant
 * to, and the view did not move — because either half alone passes for the
 * wrong reason.
 */

const activeView = (page) => page.locator('[role="tab"][aria-selected="true"]').getAttribute("aria-label");

/** One finger, both event streams, the way a real touchscreen delivers them. */
async function fingerDrag(page, selector, fromRatio, toRatio) {
  await page.evaluate(({ selector, fromRatio, toRatio }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`no element for ${selector}`);
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const x0 = r.left + r.width * fromRatio;
    const x1 = r.left + r.width * toRatio;
    const pe = (type, x) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
      clientX: x, clientY: y, isPrimary: true,
    }));
    const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const te = (type, x) => el.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === "touchend" ? [] : [mk(x)],
      targetTouches: type === "touchend" ? [] : [mk(x)],
      changedTouches: [mk(x)],
    }));
    pe("pointerdown", x0); te("touchstart", x0);
    for (let i = 1; i <= 10; i += 1) {
      const x = x0 + ((x1 - x0) * i) / 10;
      pe("pointermove", x); te("touchmove", x);
    }
    pe("pointerup", x1); te("touchend", x1);
  }, { selector, fromRatio, toRatio });
  await page.waitForTimeout(150);
}

test.describe("a gesture belongs to the nearest control that wants it", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("completing an Action does not also change the view", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "ACTIONS" }).click();

    const card = page.locator("[data-task]").first();
    await expect(card).toBeVisible();
    const before = await activeView(page);

    await fingerDrag(page, "[data-task] .nb-action-card", 0.1, 0.9);

    expect(await activeView(page), "completing an Action must not navigate").toBe(before);
  });

  test("scrolling the any-time row does not change the view", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    /* Scoped inside the section on purpose. The day ribbon carries the same
       attribute but sits outside it, so an unscoped selector would match a
       scroller the view switch could never have heard from and pass whatever
       the code did. */
    const selector = '.nb-main > section [data-owns-swipe="scroller"]';
    const row = page.locator(selector).first();
    await expect(row, "the any-time row is the surface under test").toBeVisible();

    const before = await activeView(page);
    await fingerDrag(page, selector, 0.9, 0.1);
    expect(await activeView(page), "scrolling a row must not navigate").toBe(before);
  });

  /* A horizontal drag turns the day, and only ever that. All three views are
     anchored to the selected day, so there is no surface where the gesture
     should mean something else, and changing view belongs to the pill nav.
     Asserted on each view in turn, and each asserts the pair — the day moved and
     the view did not — because either half alone passes for a build that has
     handed the gesture back to the view list. */
  for (const view of ["TIMELINE", "AGENDA", "ACTIONS"]) {
    test(`a drag on ${view} turns the day and never changes view`, async ({ page }) => {
      await openPlanner(page);
      if (view !== "TIMELINE") {
        await page.getByRole("tab", { name: view, exact: true }).click();
        await page.waitForTimeout(500);
      }
      const heading = page.getByTestId("day-heading");
      const beforeDay = await heading.getAttribute("data-date");
      const beforeView = await activeView(page);

      await fingerDrag(page, ".nb-main > section", 0.9, 0.1);

      expect(await heading.getAttribute("data-date"), "the drag must turn the day").not.toBe(beforeDay);
      expect(await activeView(page), "the drag must leave the view alone").toBe(beforeView);
    });
  }

  test("every horizontal scroller in the body declares itself", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    const undeclared = await page.evaluate(() => {
      const section = document.querySelector(".nb-main > section");
      if (!section) return [];
      const out = [];
      for (const el of section.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        const scrollsX = el.scrollWidth > el.clientWidth + 2
          && (cs.overflowX === "auto" || cs.overflowX === "scroll");
        if (scrollsX && !el.closest("[data-owns-swipe]")) {
          out.push((el.className?.toString?.() || el.tagName).slice(0, 60));
        }
      }
      return out;
    });
    expect(undeclared, "a scroller inside the body that does not claim its own swipe will be hijacked by the view switch").toEqual([]);
  });
});
