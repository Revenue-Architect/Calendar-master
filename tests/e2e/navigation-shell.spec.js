import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

function expectMonotonic(samples, key, direction, message) {
  const values = samples.map((sample) => sample[key]);
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (direction === "down") {
      expect(delta, `${message}: ${values.join(", ")}`).toBeLessThanOrEqual(1);
    } else {
      expect(delta, `${message}: ${values.join(", ")}`).toBeGreaterThanOrEqual(-1);
    }
  }
}

test.describe("the floating navigation shell", () => {
  test("drawer starts off-screen and labels stagger in", async ({ page }) => {
    await openPlanner(page);
    const shell = page.getByTestId("nav-shell");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const first = page.getByRole("button", { name: "Timeline", exact: true });
    const last = page.getByRole("button", { name: "Today", exact: true });

    const firstPaint = nav.evaluate((node) => new Promise((resolve) => {
      requestAnimationFrame(() => resolve(getComputedStyle(node).transform));
    }));
    await page.getByTestId("nav-toggle").click();
    const opening = await firstPaint;
    expect(opening, "opening must start from off-screen, not already settled").not.toBe("none");
    expect(opening).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
    await expect(shell).toHaveAttribute("data-nav-state", "open");
    const firstDelay = await first.evaluate((node) => getComputedStyle(node).transitionDelay);
    const lastDelay = await last.evaluate((node) => getComputedStyle(node).transitionDelay);
    expect(Number.parseFloat(lastDelay), "later labels must wait their turn").toBeGreaterThan(Number.parseFloat(firstDelay));
  });

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

  /* The calendar return rail is a complete, stationary child owned by the
     surface transform. It must not animate its own clip-path, transform, or opacity,
     and must remain fully visible and aligned during open and close transitions until
     closed travel has completed. */
  test("the calendar rail stays on the surface edge while it is revealed", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();

    const openSampled = await page.evaluate(() => {
      const surface = document.querySelector('[data-test="app-surface"]');
      const rail = document.querySelector('[data-test="mobile-calendar-return"]');
      const running = [...surface.getAnimations(), ...rail.getAnimations()];
      let span = 0;
      for (const a of running) span = Math.max(span, Number(a.effect?.getTiming().duration) || 0);
      const at = (fraction) => {
        for (const a of running) {
          a.pause();
          a.currentTime = span * fraction;
        }
        const surfaceBox = surface.getBoundingClientRect();
        const railBox = rail.getBoundingClientRect();
        const railStyle = getComputedStyle(rail);
        return {
          opacity: Number(railStyle.opacity),
          localX: Math.round(railBox.left - surfaceBox.left),
          width: Math.round(railBox.width),
          clipPath: railStyle.clipPath,
          visibility: railStyle.visibility,
          display: railStyle.display,
        };
      };
      const samples = { start: at(0), mid: at(0.5), end: at(1) };
      for (const a of running) {
        a.currentTime = span;
        a.play();
      }
      return {
        transitions: getComputedStyle(rail).transitionProperty,
        ...samples,
      };
    });

    expect(openSampled.transitions, "the rail must not animate its own clip-path").not.toContain("clip-path");
    expect(openSampled.transitions, "the rail must not receive a second X transform").not.toContain("transform");
    expect(openSampled.transitions, "the rail should stay solid rather than fade in").not.toContain("opacity");

    for (const [name, frame] of Object.entries({ start: openSampled.start, mid: openSampled.mid, end: openSampled.end })) {
      expect(frame.opacity, `the rail is solid at ${name}`).toBe(1);
      expect(Math.abs(frame.localX), `the rail remains aligned to the surface edge at ${name}`).toBeLessThanOrEqual(1);
      expect(frame.width, `the rail keeps its full 44px width at ${name}`).toBe(44);
      expect(frame.clipPath, `the rail has no clip-path at ${name}`).toBe("none");
      expect(frame.visibility, `the rail is visible at ${name}`).toBe("visible");
      expect(frame.display, `the rail is displayed at ${name}`).not.toBe("none");
    }

    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    await page.getByTestId("mobile-calendar-return").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closing");

    const closeSampled = await page.evaluate(() => {
      const surface = document.querySelector('[data-test="app-surface"]');
      const rail = document.querySelector('[data-test="mobile-calendar-return"]');
      const running = [...surface.getAnimations(), ...rail.getAnimations()];
      let span = 0;
      for (const a of running) span = Math.max(span, Number(a.effect?.getTiming().duration) || 0);
      const at = (fraction) => {
        for (const a of running) {
          a.pause();
          a.currentTime = span * fraction;
        }
        const surfaceBox = surface.getBoundingClientRect();
        const railBox = rail.getBoundingClientRect();
        const railStyle = getComputedStyle(rail);
        return {
          opacity: Number(railStyle.opacity),
          localX: Math.round(railBox.left - surfaceBox.left),
          width: Math.round(railBox.width),
          clipPath: railStyle.clipPath,
          visibility: railStyle.visibility,
          display: railStyle.display,
        };
      };
      const samples = { start: at(0), mid: at(0.5) };
      for (const a of running) {
        a.play();
      }
      return {
        transitions: getComputedStyle(rail).transitionProperty,
        ...samples,
      };
    });

    for (const [name, frame] of Object.entries({ start: closeSampled.start, mid: closeSampled.mid })) {
      expect(frame.opacity, `the rail is solid during close at ${name}`).toBe(1);
      expect(Math.abs(frame.localX), `the rail remains aligned to the surface edge during close at ${name}`).toBeLessThanOrEqual(1);
      expect(frame.width, `the rail keeps its full 44px width during close at ${name}`).toBe(44);
      expect(frame.clipPath, `the rail has no clip-path during close at ${name}`).toBe("none");
      expect(frame.visibility, `the rail remains visible during close at ${name}`).toBe("visible");
      expect(frame.display, `the rail remains displayed during close at ${name}`).not.toBe("none");
    }

    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    await expect(page.getByTestId("app-surface")).not.toHaveClass(/nb-app-surface-open/);

    const settled = await page.evaluate(() => {
      const rail = document.querySelector('[data-test="mobile-calendar-return"]');
      if (!rail) return { hidden: true, display: "none", visibility: "hidden" };
      const style = getComputedStyle(rail);
      return {
        display: style.display,
        visibility: style.visibility,
        hidden: style.display === "none" || style.visibility === "hidden",
      };
    });
    expect(settled.hidden, "the rail is hidden once close travel has fully completed").toBe(true);
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
    await page.waitForTimeout(640);
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
    expect(measured.top, "the recessed page must keep a thicker top margin").toBeGreaterThan(12);
    expect(measured.bottom, "the recessed page must keep a thicker bottom margin").toBeLessThan(900 - 12);
    expect(measured.width, "the recessed card must stay fully on screen").toBeLessThan(before.width - 40);
    /* The rounding lives on the clip now. Transitioning border-radius on the
       element that holds the whole app repainted it every frame to draw a
       corner the clip was already cutting. */
    const cardRadius = Number.parseFloat((measured.clipPath.split("round ")[1] || "0"));
    expect(cardRadius, "the open card must be rounded by its clip").toBeGreaterThan(12);
    const topGap = measured.top;
    const rightGap = 1280 - measured.right;
    const bottomGap = 900 - measured.bottom;
    expect(Math.abs(bottomGap - topGap), `bottom recess ${bottomGap} vs top ${topGap}`).toBeLessThan(12);
    expect(Math.abs(rightGap - topGap), `right recess ${rightGap} vs top ${topGap}`).toBeLessThan(16);
    expect(measured.transform, "the page must travel on X, not reflow").toMatch(/matrix|translate/);
    expect(measured.clipPath, "even borders come from a clip, not leftover height").not.toBe("none");
    expect(Math.round(measured.layoutWidth), "layout width stays full so glyphs do not reflow").toBe(1280);
    const toggle = page.getByTestId("nav-toggle");
    const toggleBox = await toggle.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left };
    });
    expect(toggleBox.top, "the hamburger must stay inside the recessed card").toBeGreaterThanOrEqual(measured.top - 1);
    expect(toggleBox.left, "the hamburger must stay on the recessed page").toBeGreaterThan(measured.left);
    const duration = await surface.evaluate((node) => Number.parseFloat(getComputedStyle(node).transitionDuration) * 1000);
    expect(duration, "the settle must not be snappy").toBeGreaterThanOrEqual(500);
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

  test("surface, drawer and labels reverse together on desktop and mobile", async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 601 }]) {
      await page.setViewportSize(viewport);
      await openPlanner(page);
      await page.getByTestId("nav-toggle").click();
      await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
      await page.waitForTimeout(560);

      const motion = await page.evaluate(async () => {
        const shell = document.querySelector('[data-test="nav-shell"]');
        const surface = document.querySelector('[data-test="app-surface"]');
        const drawer = document.querySelector("#planner-navigation");
        const label = drawer.querySelector(".nb-nav-item");
        const toggle = document.querySelector('[data-test="nav-toggle"]');
        const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        const x = (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41;
        const sample = () => ({
          phase: shell.dataset.navState,
          surfaceX: x(surface),
          drawerX: x(drawer),
          labelOpacity: Number.parseFloat(getComputedStyle(label).opacity),
        });
        const frames = async (count) => {
          const samples = [];
          for (let index = 0; index < count; index += 1) {
            await frame();
            samples.push(sample());
          }
          return samples;
        };

        const busyUntil = performance.now() + 24;
        while (performance.now() < busyUntil) Math.sqrt(performance.now());
        const pressedAt = performance.now();
        toggle.click();
        const committedAt = performance.now();
        const closing = await frames(8);
        toggle.click();
        const reopening = await frames(34);
        return { commitMs: committedAt - pressedAt, closing, reopening, final: sample() };
      });

      expect(motion.commitMs, `${viewport.width}px press-to-phase commit`).toBeLessThan(50);
      expect(motion.closing.every((sample) => sample.phase === "closing")).toBe(true);
      expectMonotonic(motion.closing, "surfaceX", "down", `${viewport.width}px surface close`);
      expectMonotonic(motion.closing, "drawerX", "down", `${viewport.width}px drawer close`);
      expectMonotonic(motion.closing, "labelOpacity", "down", `${viewport.width}px label close`);
      expect(motion.closing[0].surfaceX - motion.closing.at(-1).surfaceX).toBeGreaterThan(8);
      expect(motion.closing[0].drawerX - motion.closing.at(-1).drawerX).toBeGreaterThan(2);
      expect(motion.closing[0].labelOpacity - motion.closing.at(-1).labelOpacity).toBeGreaterThan(0.05);

      expect(motion.reopening.every((sample) => sample.phase === "open")).toBe(true);
      expectMonotonic(motion.reopening, "surfaceX", "up", `${viewport.width}px surface reopen`);
      expectMonotonic(motion.reopening, "drawerX", "up", `${viewport.width}px drawer reopen`);
      expectMonotonic(motion.reopening, "labelOpacity", "up", `${viewport.width}px label reopen`);
      expect(Math.abs(motion.reopening[0].surfaceX - motion.closing.at(-1).surfaceX)).toBeLessThan(35);
      expect(Math.abs(motion.reopening[0].drawerX - motion.closing.at(-1).drawerX)).toBeLessThan(12);
      expect(motion.final.phase).toBe("open");
    }
  });

  test("an interrupted close ignores stale completion and settles every channel", async ({ page }) => {
    await openPlanner(page);
    const shell = page.getByTestId("nav-shell");
    const surface = page.getByTestId("app-surface");
    const trigger = page.getByTestId("nav-toggle");

    await trigger.click();
    await page.waitForTimeout(560);
    await trigger.evaluate((node) => node.click());
    await page.waitForTimeout(90);
    await trigger.evaluate((node) => node.click());
    await page.waitForTimeout(35);
    await trigger.evaluate((node) => node.click());
    await expect(shell).toHaveAttribute("data-nav-state", "closing");

    await surface.dispatchEvent("transitionend", { propertyName: "transform" });
    await expect(shell).toHaveAttribute("data-nav-state", "closing");
    await expect(shell).toHaveAttribute("data-nav-state", "closed");

    await expect.poll(() => page.evaluate(() => {
      const nodes = [
        document.querySelector('[data-test="app-surface"]'),
        document.querySelector("#planner-navigation"),
        ...document.querySelectorAll(".nb-nav-brand,.nb-nav-item,.nb-nav-membership"),
      ];
      return nodes.flatMap((node) => node.getAnimations()).filter((animation) => animation.playState === "running").length;
    })).toBe(0);

    const settled = await page.evaluate(async () => {
      const surfaceNode = document.querySelector('[data-test="app-surface"]');
      const drawer = document.querySelector("#planner-navigation");
      const label = drawer.querySelector(".nb-nav-item");
      const read = () => ({
        surface: getComputedStyle(surfaceNode).transform,
        drawer: getComputedStyle(drawer).transform,
        opacity: getComputedStyle(label).opacity,
      });
      const before = read();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { before, after: read() };
    });
    expect(settled.after).toEqual(settled.before);
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

    /* CSS owns the actual duration. The shell must not report closed until the
       surface, drawer and labels have reached their shared concealed target. */
    await expect(shell).toHaveAttribute("data-nav-state", "closed");
    await expect(surface).not.toHaveClass(/nb-app-surface-open/);
  });

  test("reduced motion retains navigation semantics without staged movement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();

    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    await expect(page.getByTestId("nav-toggle")).toBeFocused();
  });
});
