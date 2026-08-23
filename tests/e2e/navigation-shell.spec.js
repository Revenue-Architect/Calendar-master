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

  test("does not mutate the viewport clip-path once per travel frame", async ({ page }) => {
    await openPlanner(page);

    await page.evaluate(() => {
      const viewport = document.querySelector('[data-test="nav-motion-viewport"]');
      if (!viewport) throw new Error("navigation motion viewport is missing");
      const state = { active: false, values: [] };
      const observer = new MutationObserver(() => {
        if (!state.active) return;
        const value = viewport.style.clipPath;
        if (value !== state.values[state.values.length - 1]) state.values.push(value);
      });
      observer.observe(viewport, { attributes: true, attributeFilter: ["style"] });
      window.__navClipMutationProbe = {
        start() { state.values = []; state.active = true; },
        stop() {
          state.active = false;
          observer.disconnect();
          return { distinct: state.values.length, values: state.values };
        },
      };
    });

    await page.evaluate(() => window.__navClipMutationProbe.start());
    await page.getByTestId("nav-toggle").click();
    const activeRun = await page.getByTestId("nav-shell").evaluate((node) => ({
      phase: node.dataset.navState,
      runId: Number(node.dataset.navRunId),
    }));
    expect(activeRun.phase, "the probe must observe an active navigation transaction").toBe("opening");
    expect(activeRun.runId, "the active transaction must have a run id").toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => Number(document.querySelector('[data-test="nav-shell"]').dataset.navProgress)), {
      message: "the mutation probe must sample an observable in-flight frame",
    }).toBeGreaterThan(0.15);
    const observed = await page.evaluate(async () => {
      /* This frame is a lifecycle sample of the active run, not a timeout used
         to manufacture a particular mutation count. */
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return window.__navClipMutationProbe.stop();
    });
    expect(observed.distinct, `active inline clip-path values: ${observed.values.join(" | ")}`).toBeLessThanOrEqual(1);
  });
  test("browser-owned framing keeps the active viewport unclipped", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "opening");

    const active = await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector('[data-test="nav-motion-viewport"]');
      const masks = [...viewport.querySelectorAll("[data-nav-mask]")];
      return {
        clipPath: viewport.style.clipPath,
        maskAnimations: masks.reduce((count, mask) => count + mask.getAnimations()
          .filter((animation) => animation.playState === "running").length, 0),
        hasClipAnimation: viewport.getAnimations().some((animation) => {
          const keyframes = animation.effect?.getKeyframes?.() || [];
          return keyframes.some((frame) => frame.clipPath != null);
        }),
      };
    });

    expect(active.clipPath, "the active stage must not animate a changing surface clip").toBe("none");
    expect(active.maskAnimations, "edge and corner framing must be browser-owned").toBeGreaterThan(0);
    expect(active.hasClipAnimation, "the viewport must not retain a WAAPI clip animation").toBe(false);
  });

  test("active corner masks scale with the in-flight navigation radius", async ({ page }) => {
    for (const { width, height, radius } of [
      { width: 1280, height: 900, radius: 22 },
      { width: 390, height: 844, radius: 16 },
    ]) {
      await page.setViewportSize({ width, height });
      await openPlanner(page);
      await page.getByTestId("nav-toggle").click();

      const sample = await page.evaluate(() => new Promise((resolve, reject) => {
        const shell = document.querySelector('[data-test="nav-shell"]');
        const names = ["top-left", "top-right", "bottom-left", "bottom-right"];
        let frames = 0;
        const read = () => {
          const progress = Number(shell.dataset.navProgress);
          if (shell.dataset.navState === "opening" && progress >= 0.2 && progress <= 0.8) {
            resolve({
              progress,
              corners: names.map((name) => {
                const node = document.querySelector(`[data-nav-mask="${name}"]`);
                const rect = node.getBoundingClientRect();
                const transform = getComputedStyle(node).transform;
                const values = transform.match(/^matrix\((.+)\)$/)?.[1]?.split(",")
                  || transform.match(/^matrix3d\((.+)\)$/)?.[1]?.split(",");
                const scaleX = values ? Number(values[0]) : NaN;
                const scaleY = values ? Number(values[values.length === 16 ? 5 : 3]) : NaN;
                return { name, width: rect.width, height: rect.height, scaleX, scaleY, transform };
              }),
            });
            return;
          }
          frames += 1;
          if (frames >= 90) {
            reject(new Error(`corner geometry sample did not reach an active frame: state=${shell.dataset.navState} progress=${shell.dataset.navProgress}`));
            return;
          }
          requestAnimationFrame(read);
        };
        requestAnimationFrame(read);
      }));

      expect(sample.progress).toBeGreaterThanOrEqual(0.2);
      expect(sample.progress).toBeLessThanOrEqual(0.8);
      for (const corner of sample.corners) {
        expect(Math.abs(corner.width - (radius * sample.progress)), `${width}px ${corner.name} width`)
          .toBeLessThan(1.5);
        expect(Math.abs(corner.height - (radius * sample.progress)), `${width}px ${corner.name} height`)
          .toBeLessThan(1.5);
        expect(corner.scaleX, `${width}px ${corner.name} transform scaleX`).toBeCloseTo(sample.progress, 0.08);
        expect(corner.scaleY, `${width}px ${corner.name} transform scaleY`).toBeCloseTo(sample.progress, 0.08);
      }

      if (width < 640) await page.getByTestId("mobile-calendar-return").click();
      else await page.getByTestId("nav-toggle").click();
      await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    }
  });

  test("progress telemetry does not write visual geometry", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();

    const telemetry = await page.evaluate(() => new Promise((resolve) => {
      const shell = document.querySelector('[data-test="nav-shell"]');
      const viewport = document.querySelector('[data-test="nav-motion-viewport"]');
      const nodes = [
        viewport,
        document.querySelector('[data-test="nav-motion-carrier"]'),
        document.querySelector('[data-test="mobile-calendar-return"]'),
        ...viewport.querySelectorAll('[data-nav-mask]'),
        document.querySelector("#planner-navigation"),
      ].filter(Boolean);
      const initialProgress = shell.dataset.navProgress;
      const initialStyles = nodes.map((node) => node.getAttribute("style"));
      let geometryMutations = 0;
      const observer = new MutationObserver((records) => {
        geometryMutations += records.filter((record) => record.attributeName === "style").length;
      });
      nodes.forEach((node) => observer.observe(node, { attributes: true, attributeFilter: ["style"] }));

      const sample = () => {
        if (shell.dataset.navState === "opening" && shell.dataset.navProgress !== initialProgress) {
          requestAnimationFrame(() => {
            observer.disconnect();
            resolve({
              initialProgress,
              progress: shell.dataset.navProgress,
              geometryMutations,
              initialStyles,
              finalStyles: nodes.map((node) => node.getAttribute("style")),
            });
          });
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));

    expect(Number(telemetry.progress)).toBeGreaterThan(Number(telemetry.initialProgress));
    expect(telemetry.geometryMutations, "rAF progress updates must not mutate visual inline styles")
      .toBe(0);
    expect(telemetry.finalStyles).toEqual(telemetry.initialStyles);
  });

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
    expect(samples.every((sample) => sample.gap <= 0.5), "rail and surface must not expose a positive moving black seam").toBe(true);
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
    const rail = page.getByTestId("mobile-calendar-return");
    await expect(rail).toBeVisible();

    const openGeometry = await rail.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const centerY = box.top + (box.height / 2);
      const hit = document.elementFromPoint(window.innerWidth - 1, centerY);
      return {
        right: box.right,
        centerY,
        hitRail: hit === node || Boolean(hit?.closest?.('[data-test="mobile-calendar-return"]')),
      };
    });
    expect(Math.abs(openGeometry.right - 390), "the open rail must meet the phone viewport edge").toBeLessThanOrEqual(0.5);
    expect(openGeometry.hitRail, "the outermost rail pixels must remain actionable").toBe(true);

    await page.mouse.move(389 - 22, openGeometry.centerY);
    await page.mouse.down();
    await page.waitForTimeout(30);
    const pressedGeometry = await rail.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        right: box.right,
        scale: getComputedStyle(node).scale,
        overlayOpacity: getComputedStyle(node, "::after").opacity,
      };
    });
    expect(Number.parseFloat(pressedGeometry.scale), "the rail must not contract under touch").toBeCloseTo(1, 4);
    expect(Math.abs(pressedGeometry.right - openGeometry.right), "the rail edge must stay fixed under touch").toBeLessThanOrEqual(0.5);
    expect(Number.parseFloat(pressedGeometry.overlayOpacity), "the press overlay should provide feedback").toBeGreaterThan(0);
    await page.mouse.up();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("mobile transform masks meet the rail and full-size surface at both heights", async ({ page }) => {
    for (const height of [844, 601]) {
      await page.setViewportSize({ width: 390, height });
      await openPlanner(page);
      await page.getByTestId("nav-toggle").click();
      await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");

      const geometry = await page.evaluate(() => {
        const mask = (name) => document.querySelector(`[data-nav-mask="${name}"]`).getBoundingClientRect();
        const rail = document.querySelector('[data-test="mobile-calendar-return"]').getBoundingClientRect();
        const surface = document.querySelector('[data-test="app-surface"]').getBoundingClientRect();
        return {
          topBottom: mask("top").bottom,
          bottomTop: mask("bottom").top,
          leftRight: mask("left").right,
          railRight: rail.right,
          surfaceLeft: surface.left,
          seam: surface.left - rail.right,
          maskPointerEvents: [...document.querySelectorAll("[data-nav-mask]")]
            .map((node) => getComputedStyle(node).pointerEvents),
        };
      });

      expect(geometry.topBottom, `${height}px top margin`).toBeCloseTo(14, 1);
      expect(geometry.bottomTop, `${height}px bottom margin`).toBeCloseTo(height - 14, 1);
      expect(geometry.leftRight, `${height}px rail frame`).toBeCloseTo(346, 1);
      expect(geometry.railRight, `${height}px rail edge`).toBeCloseTo(390, 1);
      expect(geometry.surfaceLeft, `${height}px full-size surface carrier`).toBeCloseTo(390, 1);
      expect(geometry.seam, `${height}px rail/surface seam`).toBeLessThanOrEqual(1);
      expect(geometry.maskPointerEvents, `${height}px masks must not intercept input`)
        .toEqual(Array(8).fill("none"));

      await page.getByTestId("mobile-calendar-return").click();
      await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    }
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

  test("reversal keeps the stage unclipped until the terminal frame", async ({ page }) => {
    await openPlanner(page);
    const shell = page.getByTestId("nav-shell");
    await page.getByTestId("nav-toggle").click();
    await expect(shell).toHaveAttribute("data-nav-state", "opening");
    const { before, after } = await page.evaluate(() => new Promise((resolve) => {
      const shellNode = document.querySelector('[data-test="nav-shell"]');
      const viewport = document.querySelector('[data-test="nav-motion-viewport"]');
      const toggle = document.querySelector('[data-test="nav-toggle"]');
      const sample = () => ({
        phase: shellNode.dataset.navState,
        progress: shellNode.dataset.navProgress,
        clipPath: viewport.style.clipPath,
        carrier: getComputedStyle(document.querySelector('[data-test="nav-motion-carrier"]')).transform,
        topMaskBottom: viewport.querySelector('[data-nav-mask="top"]').getBoundingClientRect().bottom,
        leftMaskRight: viewport.querySelector('[data-nav-mask="left"]').getBoundingClientRect().right,
      });
      const waitForActiveFrame = () => {
        const progress = Number(shellNode.dataset.navProgress);
        if (shellNode.dataset.navState === "opening" && progress > 0.2 && progress < 0.8) {
          const beforeSample = sample();
          toggle.click();
          requestAnimationFrame(() => resolve({ before: beforeSample, after: {
            ...sample(),
            maskAnimations: [...viewport.querySelectorAll("[data-nav-mask]")]
              .reduce((count, mask) => count + mask.getAnimations()
                .filter((animation) => animation.playState === "running").length, 0),
          } }));
          return;
        }
        requestAnimationFrame(waitForActiveFrame);
      };
      waitForActiveFrame();
    }));

    expect(before.phase).toBe("opening");
    expect(before.clipPath).toBe("none");
    expect(before.carrier).toMatch(/matrix|translate/);
    expect(after.phase).toBe("closing");
    expect(after.clipPath, "reversal must not briefly restore the destination clip").toBe("none");
    expect(after.maskAnimations, "reversal must restart the same mask channels").toBeGreaterThan(0);
    expect(after.carrier).toMatch(/matrix|translate/);
    expect(Math.abs(after.topMaskBottom - before.topMaskBottom), "reversal must keep the top wall near its sampled frame")
      .toBeLessThan(24);
    expect(Math.abs(after.leftMaskRight - before.leftMaskRight), "reversal must keep the left wall near its sampled frame")
      .toBeLessThan(32);
    expect(after.leftMaskRight, "reversal must not jump to the open destination wall")
      .toBeLessThan(300);
    await expect(shell).toHaveAttribute("data-nav-state", "closed");
    await expect(page.getByTestId("nav-motion-viewport")).toHaveCSS("clip-path", /inset\(0px\)/);
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
