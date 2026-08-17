import { test, expect } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test.describe("the compact view switcher", () => {
  test.use({ hasTouch: true });

  test("grows one word, keeps icon-sized neighbours, and never moves the plate off the active tab", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);

    const timeline = page.getByTestId("view-mode-timeline");
    const actions = page.getByTestId("view-mode-actions");
    await expect(timeline).toHaveAttribute("aria-selected", "true");
    expect((await timeline.getByTestId("view-mode-label").boundingBox()).width,
      "active TIMELINE must keep a readable word").toBeGreaterThan(20);
    expect((await actions.boundingBox()).width,
      "inactive ACTIONS is an icon, not a third word").toBeLessThan(56);

    const paint = async (tab) => tab.evaluate((node) => ({
      width: node.getBoundingClientRect().width,
      fill: getComputedStyle(node).backgroundColor,
      indicator: node.parentElement.querySelector('[data-test="pill-indicator"]'),
    }));

    const timelinePaint = await paint(timeline);
    const actionsPaint = await paint(actions);
    expect(timelinePaint.width, "active TIMELINE occupies the word slot").toBeGreaterThan(100);
    expect(actionsPaint.width, "inactive ACTIONS occupies the icon slot").toBeLessThan(40);
    expect(timelinePaint.indicator, "compact mode has no travelling plate").toBeNull();

    const accent = await page.getByTestId("new-entry").evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(timelinePaint.fill, "the active tab is the accent surface").toBe(accent);
    expect(actionsPaint.fill, "an inactive tab is not the accent").not.toBe(accent);

    await actions.click();
    await expect(actions).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(400);
    const after = await paint(actions);
    expect(after.width).toBeGreaterThan(100);
    expect(after.fill).toBe(accent);
    expect((await timeline.evaluate((node) => node.getBoundingClientRect().width))).toBeLessThan(40);
  });

  test("the reserved track leaves the month navigator its lane", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const zoomOut = page.getByTestId("zoom-out");
    const before = (await zoomOut.boundingBox()).width;
    await page.getByTestId("view-mode-actions").click();
    await page.waitForTimeout(400);
    expect((await zoomOut.boundingBox()).width,
      "WEEK / MONTH must survive the pill expansion").toBeCloseTo(before, 0);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
  });

  test("an icon-only tab still takes a finger", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    /* The 44px floor is `.nb-tap::after`, not the drawn box — the control stays
       the size it was drawn so the navigator does not eat the timeline's rows.
       See the comment at Planner.jsx:4008. */
    const target = await page.getByTestId("view-mode-agenda").evaluate((node) => {
      const after = getComputedStyle(node, "::after");
      return { coarse: window.matchMedia("(pointer: coarse)").matches, height: after.height, width: after.width };
    });
    expect(target.coarse, "this assertion is meaningless without a coarse pointer").toBe(true);
    expect(parseFloat(target.height)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(target.width)).toBeGreaterThanOrEqual(44);
  });

  test("the word wipes rather than the track resizing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const props = await page.getByTestId("view-mode-agenda").getByTestId("view-mode-label")
      .evaluate((node) => getComputedStyle(node).transitionProperty);
    expect(props, "a compact word is revealed by a clip, never by a track animation").toContain("clip-path");
    expect(props).not.toContain("grid-template-columns");
    expect(props).not.toContain("width");
  });

  test("the active compact tab grows along the reserved slot, not in one frame", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const actions = page.getByTestId("view-mode-actions");
    await actions.click();
    const width = await actions.evaluate((node) => {
      const tween = node.getAnimations().find((animation) => animation.transitionProperty === "width")
        || node.getAnimations().find((animation) => animation.playState === "running");
      if (!tween?.effect) return node.getBoundingClientRect().width;
      tween.pause();
      const duration = Number(tween.effect.getTiming().duration || 0);
      if (duration > 0) tween.currentTime = duration * 0.4;
      return node.getBoundingClientRect().width;
    });
    expect(width, "mid-flight the tab is between the icon slot and the word slot").toBeGreaterThan(40);
    expect(width).toBeLessThan(100);
  });
});

test("desktop keeps three words and a travelling plate", async ({ page }) => {
  await openPlanner(page);
  for (const key of ["timeline", "agenda", "actions"]) {
    const label = page.getByTestId(`view-mode-${key}`).getByTestId("view-mode-label");
    expect((await label.boundingBox()).width, `${key} must keep its word on a wide header`).toBeGreaterThan(20);
  }
  await expect(page.getByTestId("view-mode")).not.toHaveAttribute("data-compact", "icon");
});
test("a keyboard pick does not travel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  const agenda = page.getByTestId("view-mode-agenda");
  await agenda.focus();
  await page.keyboard.press("Enter");
  await expect(agenda).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("view-mode")).toHaveAttribute("data-motion", "instant");
  const props = await agenda.evaluate((node) => ({
    tab: getComputedStyle(node).transitionProperty,
    label: getComputedStyle(node.querySelector('[data-test="view-mode-label"]')).transitionProperty,
    transform: getComputedStyle(node).transform,
  }));
  expect(props.tab).toBe("none");
  expect(props.label).toBe("none");
  expect(props.transform === "none" || props.transform === "matrix(1, 0, 0, 1, 0, 0)").toBeTruthy();
});

test("reduced motion applies the end state with no travel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  await page.getByTestId("view-mode-actions").click();
  const actions = page.getByTestId("view-mode-actions");
  await expect(actions).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("view-mode")).toHaveAttribute("data-motion", "instant");
  const width = await page.getByTestId("view-mode").evaluate((list) => {
    const active = list.querySelector('[aria-selected="true"]');
    return active.getBoundingClientRect().width;
  });
  expect(width, "reduced motion lands the active tab on the word slot").toBeGreaterThan(100);
  expect((await actions.getByTestId("view-mode-label").boundingBox()).width).toBeGreaterThan(20);
});

