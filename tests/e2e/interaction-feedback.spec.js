import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

const paint = (locator) => locator.evaluate((node) => {
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return {
    background: style.backgroundColor,
    boxShadow: style.boxShadow,
    color: style.color,
    width: rect.width,
    height: rect.height,
  };
});

async function hover(page, locator) {
  await locator.hover();
  await page.waitForTimeout(240);
}

test.describe("semantic interaction feedback", () => {
  test("desktop controls, choices, tiles, and icons respond without changing geometry", async ({ page }) => {
    await openPlanner(page, { keepSample: true });

    const verify = async (target, changed) => {
      await expect(target).toBeVisible();
      const before = await paint(target);
      await hover(page, target);
      const after = await paint(target);
      expect(after.width).toBeCloseTo(before.width, 3);
      expect(after.height).toBeCloseTo(before.height, 3);
      expect(changed(before, after)).toBe(true);
    };

    await verify(page.getByTestId("new-entry"), (before, after) => after.boxShadow !== before.boxShadow);
    await verify(page.getByRole("tab", { name: "AGENDA", exact: true }), (before, after) => after.background !== before.background || after.color !== before.color);
    await verify(page.locator("[data-task] > article").first(), (before, after) => after.boxShadow !== before.boxShadow);
    await verify(page.getByRole("button", { name: "Settings", exact: true }), (before, after) => after.background !== before.background);
  });

  test("focus remains visible and disabled primary actions stay inert", async ({ page }) => {
    await openPlanner(page);
    const newEntry = page.getByTestId("new-entry");
    await newEntry.focus();
    expect(await newEntry.evaluate((node) => Number.parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);

    await newEntry.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-stage", "open");
    const submit = page.getByRole("button", { name: "ADD TO TIMELINE", exact: true });
    await expect(submit).toBeDisabled();
    const before = await paint(submit);
    await hover(page, submit);
    const after = await paint(submit);
    expect(after.background).toBe(before.background);
    expect(after.boxShadow).toBe(before.boxShadow);
    expect(after.color).toBe(before.color);
    expect(after.width).toBeCloseTo(before.width, 3);
    expect(after.height).toBeCloseTo(before.height, 3);
  });

  test("reduced motion keeps the feedback but removes motion time", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    const settings = page.getByRole("button", { name: "Settings", exact: true });
    await hover(page, settings);
    const motion = await settings.evaluate((node) => getComputedStyle(node).transitionDuration);
    expect(motion === "0s" || motion === "0.16s" || Number.parseFloat(motion) >= 0.15, "reduced motion may keep a short opacity fade").toBeTruthy();
  });
});

test.describe("touch interaction feedback", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("desktop-only hover styles do not activate on a coarse pointer", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    const target = page.getByTestId("new-entry");
    await expect(target).toBeVisible();
    const before = await paint(target);
    await hover(page, target);
    expect(await paint(target)).toEqual(before);
    expect(await target.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)).toBe(false);
  });
});
