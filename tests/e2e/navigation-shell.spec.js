import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test.describe("the floating navigation shell", () => {
  test("opens a labelled floating shell and restores focus after Escape", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("nav-toggle");
    const shell = page.getByTestId("nav-shell");
    const surface = page.getByTestId("app-surface");

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(shell).toHaveAttribute("data-nav-state", "open");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expect(surface).toHaveClass(/nb-app-surface-open/);

    await page.keyboard.press("Escape");
    await expect(shell).toHaveAttribute("data-nav-state", "closed");
    await expect(trigger).toBeFocused();
  });

  test("destinations call existing planner actions and close navigation", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await page.getByRole("button", { name: "Actions", exact: true }).click();

    await expect(page.getByRole("tab", { name: "ACTIONS", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("shortcuts move into the side navigation", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await page.getByRole("button", { name: "Shortcuts", exact: true }).click();

    await expect(page.getByRole("dialog", { name: "SHORTCUTS" })).toBeVisible();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("outside press closes the panel", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await page.getByTestId("app-surface").click({ position: { x: 700, y: 500 } });
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("mobile resolves the open calendar into a return rail", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await expect(page.getByTestId("new-entry")).toBeVisible();
    await page.getByTestId("nav-toggle").click();

    const surface = page.getByTestId("app-surface");
    await expect(surface).toHaveClass(/nb-app-surface-open/);
    await expect(surface).toHaveCSS("border-top-left-radius", "16px");
    await expect(page.getByTestId("mobile-calendar-return")).toBeVisible();
    await page.getByTestId("mobile-calendar-return").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("desktop nav keeps the page as a recessed card instead of clipping the right edge", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlanner(page);
    const surface = page.getByTestId("app-surface");
    const before = await surface.boundingBox();
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    await expect(surface).toHaveClass(/nb-app-surface-open/);
    await page.waitForTimeout(380);
    const measured = await surface.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const clip = style.clipPath || "";
      const nums = [...clip.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      const top = nums[0] ?? 0;
      const right = nums[1] ?? 0;
      const bottom = nums[2] ?? 0;
      return {
        left: box.left,
        right: box.right - right,
        top: box.top + top,
        bottom: box.bottom - bottom,
        width: box.width - right,
        height: box.height - top - bottom,
        radius: style.borderTopLeftRadius,
        transform: style.transform,
        clipPath: style.clipPath,
        layoutWidth: node.offsetWidth,
      };
    });
    expect(before).not.toBeNull();
    expect(measured.left, "the recessed page must sit to the right of the drawer").toBeGreaterThan(240);
    expect(measured.right, "the recessed page must keep a right margin instead of running off-screen").toBeLessThan(1280 - 12);
    expect(measured.top, "the recessed page must keep a top margin").toBeGreaterThan(8);
    expect(measured.bottom, "the recessed page must keep a bottom margin").toBeLessThan(900 - 8);
    expect(measured.width, "the recessed card must stay fully on screen").toBeLessThan(before.width - 40);
    expect(measured.radius).not.toBe("0px");
    const topGap = measured.top;
    const rightGap = 1280 - measured.right;
    const bottomGap = 900 - measured.bottom;
    expect(Math.abs(bottomGap - topGap), `bottom recess ${bottomGap} vs top ${topGap}`).toBeLessThan(12);
    expect(Math.abs(rightGap - topGap), `right recess ${rightGap} vs top ${topGap}`).toBeLessThan(16);
    expect(measured.transform, "the page must travel on X, not reflow").toMatch(/matrix|translate/);
    expect(measured.clipPath, "even borders come from a clip, not leftover height").not.toBe("none");
    expect(Math.round(measured.layoutWidth), "layout width stays full so glyphs do not reflow").toBe(1280);
  });

  test("mobile morphs the calendar without reflowing its layout", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 601 });
    await openPlanner(page);

    const shell = page.getByTestId("nav-shell");
    const surface = page.getByTestId("app-surface");
    const before = await surface.boundingBox();
    await page.getByTestId("nav-toggle").click();
    await expect(shell).toHaveAttribute("data-nav-state", "open");
    const after = await surface.boundingBox();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    /* A visual rail is allowed to reveal only its 44px touch target, but the calendar itself must
       keep its full layout width. Animating width from 390px to 40px makes every
       grid, card and label reflow on every frame — the glitch this guards. */
    expect(Math.round(after.width)).toBe(Math.round(before.width));
    await expect(surface).not.toHaveCSS("clip-path", "none");
  });

  test("the navigation trigger uses one press scale channel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 601 });
    await openPlanner(page);

    const trigger = page.getByTestId("nav-toggle");
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressed = await trigger.evaluate((node) => {
      const style = getComputedStyle(node);
      return { transform: style.transform, scale: style.scale };
    });
    await page.mouse.up();

    /* The global press system owns `scale`. The older nb-tap transform used to
       multiply it by another .97, producing a 6% double-shrink and two release
       curves every time the side menu opened. */
    expect(pressed.scale).not.toBe("none");
    expect(pressed.transform).toBe("none");
  });

  test("closing completes from the surface transition", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 601 });
    await openPlanner(page);

    const shell = page.getByTestId("nav-shell");
    const surface = page.getByTestId("app-surface");
    await page.getByTestId("nav-toggle").click();
    await expect(shell).toHaveAttribute("data-nav-state", "open");
    await page.getByTestId("mobile-calendar-return").click();
    await expect(shell).toHaveAttribute("data-nav-state", "closing");

    /* CSS owns the actual duration. The old 320ms JavaScript timer ended a
       340ms surface transition early and could also hide reverse-staggered nav
       items mid-flight. Completing from transitionend keeps those clocks one. */
    await surface.dispatchEvent("transitionend", { propertyName: "transform" });
    expect(await shell.getAttribute("data-nav-state")).toBe("closed");
  });

  test("reduced motion retains navigation semantics without staged movement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();

    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  });
});
