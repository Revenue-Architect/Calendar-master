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

    /* Arm and trigger the first frame in one page task. Keeping the rAF
       promise in a separate Playwright command queues the click behind it;
       under a real compositor that can resolve only after the 520ms run and
       falsely report the settled identity matrix. */
    const opening = await page.evaluate(() => new Promise((resolve) => {
      const node = document.querySelector("#planner-navigation");
      const toggle = document.querySelector('[data-test="nav-toggle"]');
      const before = getComputedStyle(node).transform;
      toggle.click();
      requestAnimationFrame(() => resolve({
        before,
        frame: getComputedStyle(node).transform,
      }));
    }));
    expect(opening.before, "opening must start from off-screen, not already settled").not.toBe("none");
    expect(opening.before).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
    expect(opening.frame).not.toBe("none");
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

  test("the calendar return rail and mobile surface share one close timeline", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    const rail = page.getByTestId("mobile-calendar-return");
    const surface = page.getByTestId("app-surface");

    await expect(rail).toBeVisible();
    await expect(rail).toHaveCSS("transition-duration", "0s");
    expect(await rail.evaluate((node) => node.parentElement?.dataset.test === "nav-motion-viewport")).toBe(true);

    await rail.click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closing");

    const samples = await page.evaluate(async () => {
      const shell = document.querySelector('[data-test="nav-shell"]');
      const rail = document.querySelector('[data-test="mobile-calendar-return"]');
      const surface = document.querySelector('[data-test="app-surface"]');
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const sample = () => {
        const railBox = rail.getBoundingClientRect();
        const surfaceBox = surface.getBoundingClientRect();
        return {
          phase: shell.dataset.navState,
          progress: Number(shell.dataset.navProgress),
          railRight: railBox.right,
          surfaceLeft: surfaceBox.left,
          gap: surfaceBox.left - railBox.right,
        };
      };
      const values = [];
      for (let index = 0; index < 10; index += 1) {
        await frame();
        values.push(sample());
      }
      return values;
    });
    expect(samples.every((sample) => sample.phase === "closing")).toBe(true);
    expect(samples.every((sample) => Math.abs(sample.gap) <= 1), "rail and surface must not expose a moving black seam").toBe(true);
    expect(samples.some((sample) => sample.progress > 0.05 && sample.progress < 0.95), "the sample must include active close travel").toBe(true);
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closing");
    await expect(rail).toBeVisible();

    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    await expect(page.getByTestId("app-surface")).not.toHaveClass(/nb-app-surface-open/);

    const settled = await page.evaluate(() => {
      const rail = document.querySelector('[data-test="mobile-calendar-return"]');
      if (!rail) return { hidden: true, display: "none", visibility: "hidden", right: 0 };
      const style = getComputedStyle(rail);
      const box = rail.getBoundingClientRect();
      return {
        display: style.display,
        visibility: style.visibility,
        hidden: rail.getAttribute("aria-hidden") === "true",
        pointerEvents: style.pointerEvents,
        right: box.right,
      };
    });
    expect(settled.hidden, "the off-screen rail is removed from the accessibility tree").toBe(true);
    expect(settled.pointerEvents).toBe("none");
    expect(settled.right).toBeLessThanOrEqual(0);
  });

  test("mobile resolves the open calendar into a return rail", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await expect(page.getByTestId("new-entry")).toBeVisible();
    await page.getByTestId("nav-toggle").click();

    const surface = page.getByTestId("app-surface");
    await expect(surface).toHaveClass(/nb-app-surface-open/);
    await expect(page.getByTestId("nav-motion-viewport")).toHaveCSS("clip-path", /round 16px/);
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
    await page.waitForTimeout(640);
    const measured = await page.evaluate(() => {
      const vNode = document.querySelector('[data-test="nav-motion-viewport"]');
      const cNode = document.querySelector('[data-test="nav-motion-carrier"]');
      const sNode = document.querySelector('[data-test="app-surface"]');
      const vStyle = getComputedStyle(vNode);
      const cStyle = getComputedStyle(cNode);
      const clip = vStyle.clipPath || "";
      const nums = [...clip.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      const top = nums[0] ?? 0;
      const right = nums[1] ?? 0;
      const bottom = nums[2] ?? 0;
      const left = nums[3] ?? 0;
      return {
        clipTop: top,
        clipRight: right,
        clipBottom: bottom,
        clipLeft: left,
        carrierTransform: cStyle.transform,
        clipPath: vStyle.clipPath,
        layoutWidth: sNode.offsetWidth,
      };
    });
    expect(before).not.toBeNull();
    expect(measured.clipTop, "the recessed page top frame is 24px").toBe(24);
    expect(measured.clipRight, "the recessed page right frame is direct 22px").toBe(22);
    expect(measured.clipBottom, "the recessed page bottom frame is 24px").toBe(24);
    expect(measured.clipLeft, "the recessed page left frame is 322px").toBe(322);
    expect(measured.carrierTransform, "carrier translates on X and Y").toMatch(/matrix|translate/);
    expect(Math.round(measured.layoutWidth), "layout width stays full so glyphs do not reflow").toBe(1280);

    const cardRadius = Number.parseFloat((measured.clipPath.split("round ")[1] || "0"));
    expect(cardRadius, "the open card must be rounded by its clip").toBeGreaterThan(12);

    const toggle = page.getByTestId("nav-toggle");
    const toggleBox = await toggle.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left };
    });
    expect(toggleBox.top, "the hamburger must stay inside the recessed card").toBeGreaterThanOrEqual(measured.clipTop - 1);
    expect(toggleBox.left, "the hamburger must stay on the recessed page").toBeGreaterThan(measured.clipLeft - 322);
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
    expect(Math.round(after.width)).toBe(Math.round(before.width));
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
        const carrier = document.querySelector('[data-test="nav-motion-carrier"]');
        const drawer = document.querySelector("#planner-navigation");
        const label = drawer.querySelector(".nb-nav-item");
        const rail = document.querySelector('[data-test="mobile-calendar-return"]');
        const surface = document.querySelector('[data-test="app-surface"]');
        const toggle = document.querySelector('[data-test="nav-toggle"]');
        const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        const x = (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41;
        const surfaceGap = () => surface.getBoundingClientRect().left - rail.getBoundingClientRect().right;
        const sample = () => ({
          phase: shell.dataset.navState,
          carrierX: x(carrier),
          drawerX: x(drawer),
          labelOpacity: Number.parseFloat(getComputedStyle(label).opacity),
          railX: x(rail),
          railGap: surfaceGap(carrier, rail),
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
      expectMonotonic(motion.closing, "carrierX", "down", `${viewport.width}px carrier close`);
      expectMonotonic(motion.closing, "drawerX", "down", `${viewport.width}px drawer close`);
      expectMonotonic(motion.closing, "labelOpacity", "down", `${viewport.width}px label close`);
      expect(motion.closing[0].carrierX - motion.closing.at(-1).carrierX).toBeGreaterThan(8);
      expect(motion.closing[0].drawerX - motion.closing.at(-1).drawerX).toBeGreaterThan(2);
      expect(motion.closing[0].labelOpacity - motion.closing.at(-1).labelOpacity).toBeGreaterThan(0.05);
      if (viewport.width < 640) {
        expectMonotonic(motion.closing, "railX", "down", "mobile rail close");
        expect(motion.closing.every((sample) => Math.abs(sample.railGap) <= 1), "mobile close cannot open a rail/surface seam").toBe(true);
      }

      expect(motion.reopening.every((sample) => sample.phase === "opening" || sample.phase === "open")).toBe(true);
      expectMonotonic(motion.reopening, "carrierX", "up", `${viewport.width}px carrier reopen`);
      expectMonotonic(motion.reopening, "drawerX", "up", `${viewport.width}px drawer reopen`);
      expectMonotonic(motion.reopening, "labelOpacity", "up", `${viewport.width}px label reopen`);
      expect(Math.abs(motion.reopening[0].carrierX - motion.closing.at(-1).carrierX)).toBeLessThan(35);
      expect(Math.abs(motion.reopening[0].drawerX - motion.closing.at(-1).drawerX)).toBeLessThan(12);
      if (viewport.width < 640) {
        expectMonotonic(motion.reopening, "railX", "up", "mobile rail reopen");
        expect(motion.reopening.every((sample) => Math.abs(sample.railGap) <= 1), "mobile reopen cannot open a rail/surface seam").toBe(true);
      }
      expect(motion.final.phase).toBe("open");
    }
  });

  test("an interrupted close ignores stale completion and settles every channel", async ({ page }) => {
    await openPlanner(page);
    const shell = page.getByTestId("nav-shell");
    const carrier = page.getByTestId("nav-motion-carrier");
    const trigger = page.getByTestId("nav-toggle");

    await trigger.click();
    await page.waitForTimeout(560);
    await trigger.evaluate((node) => node.click());
    await page.waitForTimeout(90);
    await trigger.evaluate((node) => node.click());
    await page.waitForTimeout(35);
    await trigger.evaluate((node) => node.click());
    await expect(shell).toHaveAttribute("data-nav-state", "closing");

    await carrier.dispatchEvent("transitionend", { propertyName: "transform" });
    await expect(shell).toHaveAttribute("data-nav-state", "closing");
    await expect(shell).toHaveAttribute("data-nav-state", "closed");

    await expect.poll(() => page.evaluate(() => {
      const nodes = [
        document.querySelector('[data-test="nav-motion-carrier"]'),
        document.querySelector('[data-test="nav-motion-viewport"]'),
        document.querySelector("#planner-navigation"),
        ...document.querySelectorAll(".nb-nav-brand,.nb-nav-item,.nb-nav-membership"),
      ];
      return nodes.flatMap((node) => node.getAnimations()).filter((animation) => animation.playState === "running").length;
    })).toBe(0);

    const settled = await page.evaluate(async () => {
      const carrierNode = document.querySelector('[data-test="nav-motion-carrier"]');
      const drawer = document.querySelector("#planner-navigation");
      const label = drawer.querySelector(".nb-nav-item");
      const read = () => ({
        carrier: getComputedStyle(carrierNode).transform,
        drawer: getComputedStyle(drawer).transform,
        opacity: getComputedStyle(label).opacity,
      });
      const before = read();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { before, after: read() };
    });
    expect(settled.after).toEqual(settled.before);
  });

  test("closing completes from the carrier transition", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 601 });
    await openPlanner(page);

    const shell = page.getByTestId("nav-shell");
    await page.getByTestId("nav-toggle").click();
    await expect(shell).toHaveAttribute("data-nav-state", "open");
    await page.getByTestId("mobile-calendar-return").click();
    await expect(shell).toHaveAttribute("data-nav-state", "closing");

    await expect(shell).toHaveAttribute("data-nav-state", "closed");
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
