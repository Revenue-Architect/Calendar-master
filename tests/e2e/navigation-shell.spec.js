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

/* Corner-shape samples are pixel counts inside each corner quadrant of the
   frame overlay, not computed style. border-radius: 22px is true of both a
   rounded corner and the inverted bite that paints if misconfigured; only the
   painted frame fraction distinguishes them (convex ≈ 21.5%, concave ≈ 78.5%). */
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const CONVEX_MAX_FRAME_PCT = 40;

function freezeNavAt(page, target) {
  return page.evaluate((stopAt) => new Promise((resolve) => {
    const shell = document.querySelector('[data-test="nav-shell"]');
    let frames = 0;
    const tick = () => {
      const state = shell.dataset.navState;
      const progress = Number(shell.dataset.navProgress);
      if (state !== "opening" && state !== "closing") return resolve({ state, progress, frozen: false });
      if ((state === "opening" && progress >= stopAt) || (state === "closing" && progress <= stopAt)) {
        document.getAnimations().forEach((animation) => animation.pause());
        return resolve({ state, progress, frozen: true });
      }
      frames += 1;
      if (frames >= 120) return resolve({ state, progress, frozen: false });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), target);
}

function resumeNav(page) {
  return page.evaluate(() => document.getAnimations().forEach((animation) => animation.play()));
}

/* Shell / frame overlay fill is authored as #17181b on every theme. Card panels
   sit too close in RGB for a loose tolerance, so interior is read from the
   screenshot itself. */
const FRAME_RGB = [0x17, 0x18, 0x1b];

async function sampleCornerFramePct(page, decoder, names = CORNERS) {
  const info = await page.evaluate((cornerNames) => {
    const shell = document.querySelector('[data-test="nav-shell"]');
    const surface = document.querySelector('[data-test="app-surface"]');
    const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
    if (!surface || !overlay) throw new Error("app surface or frame overlay is missing");
    const surfaceRect = surface.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(overlay).borderRadius) || 22;
    const r = Math.max(8, radius);

    const cornerCoords = {
      "top-left": { x: overlayRect.left, y: overlayRect.top, w: r, h: r },
      "top-right": { x: overlayRect.right - r, y: overlayRect.top, w: r, h: r },
      "bottom-left": { x: overlayRect.left, y: overlayRect.bottom - r, w: r, h: r },
      "bottom-right": { x: overlayRect.right - r, y: overlayRect.bottom - r, w: r, h: r },
    };

    return {
      state: shell.dataset.navState,
      progress: Number(shell.dataset.navProgress),
      viewportWidth: window.innerWidth,
      surface: { x: surfaceRect.x, y: surfaceRect.y, w: surfaceRect.width, h: surfaceRect.height },
      corners: cornerNames.map((name) => ({ name, ...cornerCoords[name] })),
    };
  }, names);

  const shot = (await page.screenshot()).toString("base64");
  const corners = await decoder.evaluate(async ({ shot, info, FRAME_RGB }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const ratio = image.width / info.viewportWidth;
    const samplePx = (x, y) => {
      const sx = Math.min(image.width - 1, Math.max(0, Math.round(x * ratio)));
      const sy = Math.min(image.height - 1, Math.max(0, Math.round(y * ratio)));
      const px = ctx.getImageData(sx, sy, 1, 1).data;
      return [px[0], px[1], px[2]];
    };
    const dist = (r, g, b, target) => (
      Math.abs(r - target[0]) + Math.abs(g - target[1]) + Math.abs(b - target[2])
    );
    const interiorRgb = samplePx(
      info.surface.x + info.surface.w / 2,
      info.surface.y + info.surface.h / 2,
    );
    const result = {};
    for (const corner of info.corners) {
      const sx = Math.max(0, Math.round(corner.x * ratio));
      const sy = Math.max(0, Math.round(corner.y * ratio));
      const sw = Math.max(1, Math.round(corner.w * ratio));
      const sh = Math.max(1, Math.round(corner.h * ratio));
      const width = Math.min(sw, image.width - sx);
      const height = Math.min(sh, image.height - sy);
      if (width <= 0 || height <= 0) {
        result[corner.name] = { pct: NaN, width: corner.w, height: corner.h };
        continue;
      }
      const data = ctx.getImageData(sx, sy, width, height).data;
      let framePx = 0;
      const total = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        if (dist(data[i], data[i + 1], data[i + 2], FRAME_RGB)
          <= dist(data[i], data[i + 1], data[i + 2], interiorRgb)) {
          framePx += 1;
        }
      }
      result[corner.name] = {
        pct: (framePx / total) * 100,
        width: corner.w,
        height: corner.h,
      };
    }
    return result;
  }, { shot, info, FRAME_RGB });

  return { state: info.state, progress: info.progress, corners };
}

function expectConvexCorners(sample, names, label) {
  for (const name of names) {
    const pct = sample.corners[name]?.pct;
    expect(
      pct,
      `${label} (state=${sample.state} p=${sample.progress.toFixed(2)}) ${name} framePct=${Number.isFinite(pct) ? pct.toFixed(1) : String(pct)} — convex is < ${CONVEX_MAX_FRAME_PCT}, concave is ~73`,
    ).toBeLessThan(CONVEX_MAX_FRAME_PCT);
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
  test("browser-owned framing keeps the active viewport unclipped with a continuous overlay", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "opening");

    const active = await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector('[data-test="nav-motion-viewport"]');
      const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
      return {
        clipPath: viewport.style.clipPath || "none",
        overlayVisible: getComputedStyle(overlay).visibility === "visible"
          && getComputedStyle(overlay).opacity === "1",
        overlayAnimations: overlay.getAnimations()
          .filter((animation) => animation.playState === "running").length,
        hasClipAnimation: viewport.getAnimations().some((animation) => {
          const keyframes = animation.effect?.getKeyframes?.() || [];
          return keyframes.some((frame) => frame.clipPath != null);
        }),
      };
    });

    expect(active.clipPath, "the active stage must not animate a changing surface clip").toBe("none");
    expect(active.overlayVisible, "the solid frame overlay must own the frame during travel").toBe(true);
    expect(active.overlayAnimations, "frame overlay animation must be browser-owned").toBeGreaterThan(0);
    expect(active.hasClipAnimation, "the viewport must not retain a WAAPI clip animation").toBe(false);
  });

  test("active frame overlay scales with the in-flight navigation progress", async ({ page }) => {
    for (const { width, height, radius } of [
      { width: 1280, height: 900, radius: 22 },
      { width: 390, height: 844, radius: 16 },
    ]) {
      await page.setViewportSize({ width, height });
      await openPlanner(page);
      await page.getByTestId("nav-toggle").click();

      const sample = await page.evaluate(() => new Promise((resolve, reject) => {
        const shell = document.querySelector('[data-test="nav-shell"]');
        const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
        let frames = 0;
        const read = () => {
          const progress = Number(shell.dataset.navProgress);
          if (shell.dataset.navState === "opening" && progress >= 0.2 && progress <= 0.8) {
            const rect = overlay.getBoundingClientRect();
            const radiusStr = getComputedStyle(overlay).borderRadius;
            const radiusVal = parseFloat(radiusStr) || 0;
            resolve({
              progress,
              overlay: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, radius: radiusVal },
            });
            return;
          }
          frames += 1;
          if (frames >= 90) {
            reject(new Error(`overlay geometry sample did not reach an active frame: state=${shell.dataset.navState} progress=${shell.dataset.navProgress}`));
            return;
          }
          requestAnimationFrame(read);
        };
        requestAnimationFrame(read);
      }));

      expect(sample.progress).toBeGreaterThanOrEqual(0.2);
      expect(sample.progress).toBeLessThanOrEqual(0.8);
      expect(sample.overlay.radius, `${width}px in-flight radius scales with progress`)
        .toBeGreaterThan(0);
      expect(sample.overlay.radius, `${width}px in-flight radius does not exceed max`)
        .toBeLessThanOrEqual(radius + 1);

      if (width < 640) await page.getByTestId("mobile-calendar-return").click();
      else await page.getByTestId("nav-toggle").click();
      await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    }
  });

  test("settled navigation frames the app card with continuous solid overlay", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");

    const settled = await page.evaluate(() => {
      const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
      const style = getComputedStyle(overlay);
      const rect = overlay.getBoundingClientRect();
      return {
        visibility: style.visibility,
        opacity: style.opacity,
        borderRadius: parseFloat(style.borderRadius) || 0,
        boxShadow: style.boxShadow,
        top: rect.top,
        left: rect.left,
      };
    });

    expect(settled.visibility, "the frame overlay must be visible when open").toBe("visible");
    expect(settled.opacity, "the frame overlay must be opaque when open").toBe("1");
    expect(settled.borderRadius, "the frame overlay has the 22px open radius").toBe(22);
    expect(settled.boxShadow, "the frame overlay casts obsidian stage shadow").toContain("rgb(23, 24, 27)");
    expect(settled.top, "desktop open top inset").toBe(24);
    expect(settled.left, "desktop open left inset").toBe(322);
  });

  test.describe("continuous frame corner paint shape", () => {
    test.use({ deviceScaleFactor: 2 });

  test("continuous frame overlay paints a rounded corner, not a bite, through desktop travel", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlanner(page);
    const decoder = await page.context().newPage();
    const samples = [];

    try {
      await page.getByTestId("nav-toggle").click();
      const opening = await freezeNavAt(page, 0.35);
      expect(opening.frozen, `opening p≈0.35 must freeze in flight, got state=${opening.state} p=${opening.progress}`).toBe(true);
      samples.push({ label: "opening p≈0.35", ...await sampleCornerFramePct(page, decoder) });
      await resumeNav(page);
      await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");

      await page.getByTestId("nav-toggle").click();
      const closing = await freezeNavAt(page, 0.35);
      expect(closing.frozen, `closing p≈0.35 must freeze in flight, got state=${closing.state} p=${closing.progress}`).toBe(true);
      samples.push({ label: "closing p≈0.35", ...await sampleCornerFramePct(page, decoder) });
      await resumeNav(page);
      await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    } finally {
      await decoder.close();
    }

    for (const sample of samples) {
      expectConvexCorners(sample, CORNERS, sample.label);
    }
  });

  test("the nav stage stays dark on a light ground, and in-flight right corners do not leak the page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlanner(page);
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("nbmp:preferences:v1") || "{}");
      localStorage.setItem("nbmp:preferences:v1", JSON.stringify({
        schemaVersion: 2,
        display: { ...(stored.display || {}), themeId: "cream-terracotta" },
        feedback: stored.feedback || { sound: true, haptics: true },
        notifications: stored.notifications || { systemEnabled: false },
        motivation: stored.motivation || { points: true, levels: true, streaks: true, celebrations: true },
      }));
    });
    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();

    await page.getByTestId("nav-toggle").click();
    const opening = await freezeNavAt(page, 0.35);
    expect(opening.frozen, `opening p≈0.35 must freeze in flight, got state=${opening.state} p=${opening.progress}`).toBe(true);

    const paint = await page.evaluate(() => {
      const shell = document.querySelector('[data-test="nav-shell"]');
      const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
      return {
        shell: getComputedStyle(shell).backgroundColor,
        overlayTop: overlay.getBoundingClientRect().top,
        progress: Number(shell.dataset.navProgress),
      };
    });
    expect(paint.shell, "the stage is not a theme").toBe("rgb(23, 24, 27)");
    expect(paint.overlayTop, "the overlay must meet the in-flight card top, not the destination 24px inset")
      .toBeLessThan(16);

    const decoder = await page.context().newPage();
    try {
      const leak = await page.evaluate(() => {
        const progress = Number(document.querySelector('[data-test="nav-shell"]').dataset.navProgress);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        return {
          progress,
          viewportWidth: vw,
          top: { x: vw - 4, y: (24 * progress + 24) / 2 },
          bottom: { x: vw - 4, y: vh - (24 * progress + 24) / 2 },
        };
      });
      const shot = (await page.screenshot()).toString("base64");
      const samples = await decoder.evaluate(async ({ shot, leak, FRAME_RGB }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${shot}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const ratio = image.width / leak.viewportWidth;
        const read = (point) => {
          const sx = Math.min(image.width - 1, Math.max(0, Math.round(point.x * ratio)));
          const sy = Math.min(image.height - 1, Math.max(0, Math.round(point.y * ratio)));
          const px = ctx.getImageData(sx, sy, 1, 1).data;
          return [px[0], px[1], px[2]];
        };
        const dist = (rgb) => (
          Math.abs(rgb[0] - FRAME_RGB[0]) + Math.abs(rgb[1] - FRAME_RGB[1]) + Math.abs(rgb[2] - FRAME_RGB[2])
        );
        return {
          top: read(leak.top),
          bottom: read(leak.bottom),
          topDist: dist(read(leak.top)),
          bottomDist: dist(read(leak.bottom)),
        };
      }, { shot, leak, FRAME_RGB });
      expect(samples.topDist, `top-right margin ${samples.top.join(",")} must be stage, not page`).toBeLessThan(40);
      expect(samples.bottomDist, `bottom-right margin ${samples.bottom.join(",")} must be stage, not page`).toBeLessThan(40);
    } finally {
      await decoder.close();
    }
  });

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
        document.querySelector('[data-test="nav-frame-overlay"]'),
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

  /* Updated with the all-corner fix: this previously expected the two
     page-facing corners to be 0px, which described the element rather than the
     render. At rest the viewport clip is coincident with the rail and rounds
     all four anyway, so "settled open rail keeps the surface edge square" was
     never what reached the screen; in travel that clip is removed and those two
     corners really did go square, which is the defect this now guards. */
  test("the mobile calendar rail keeps its outer corners rounded throughout travel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);

    const shell = page.getByTestId("nav-shell");
    const rail = page.getByTestId("mobile-calendar-return");
    const readRail = () => page.evaluate(() => {
      const node = document.querySelector('[data-test="mobile-calendar-return"]');
      const shellNode = document.querySelector('[data-test="nav-shell"]');
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        phase: shellNode.dataset.navState,
        progress: Number(shellNode.dataset.navProgress),
        x: box.x,
        right: box.right,
        borderTopLeft: style.borderTopLeftRadius,
        borderTopRight: style.borderTopRightRadius,
        borderBottomRight: style.borderBottomRightRadius,
        borderBottomLeft: style.borderBottomLeftRadius,
      };
    });

    await page.getByTestId("nav-toggle").click();
    await expect(shell).toHaveAttribute("data-nav-state", "opening");
    const opening = await page.evaluate(() => new Promise((resolve, reject) => {
      const started = performance.now();
      const read = () => {
        const node = document.querySelector('[data-test="mobile-calendar-return"]');
        const shellNode = document.querySelector('[data-test="nav-shell"]');
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          phase: shellNode.dataset.navState,
          progress: Number(shellNode.dataset.navProgress),
          x: box.x,
          right: box.right,
          borderTopLeft: style.borderTopLeftRadius,
          borderTopRight: style.borderTopRightRadius,
          borderBottomRight: style.borderBottomRightRadius,
          borderBottomLeft: style.borderBottomLeftRadius,
        };
      };
      const sample = () => {
        const value = read();
        if (value.phase === "opening" && value.progress > 0.25 && value.progress < 0.75) {
          resolve(value);
          return;
        }
        if ((performance.now() - started) > 1200) {
          reject(new Error(`opening rail frame was not sampled: ${JSON.stringify(value)}`));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    expect(opening.borderTopLeft, "opening rounds every corner").toBe("16px");
    expect(opening.borderTopRight, "opening rounds every corner").toBe("16px");
    expect(opening.borderBottomRight, "opening rounds every corner").toBe("16px");
    expect(opening.borderBottomLeft, "opening rounds every corner").toBe("16px");

    await expect(shell).toHaveAttribute("data-nav-state", "open");
    const settledOpen = await readRail();
    expect(settledOpen.borderTopLeft, "the settled rail rounds every corner").toBe("16px");
    expect(settledOpen.borderTopRight, "the settled rail rounds every corner").toBe("16px");
    expect(settledOpen.borderBottomRight, "the settled rail rounds every corner").toBe("16px");
    expect(settledOpen.borderBottomLeft, "the settled rail rounds every corner").toBe("16px");

    await rail.click();
    await expect(shell).toHaveAttribute("data-nav-state", "closing");
    const closing = await page.evaluate(() => new Promise((resolve, reject) => {
      const started = performance.now();
      const read = () => {
        const node = document.querySelector('[data-test="mobile-calendar-return"]');
        const shellNode = document.querySelector('[data-test="nav-shell"]');
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          phase: shellNode.dataset.navState,
          progress: Number(shellNode.dataset.navProgress),
          x: box.x,
          right: box.right,
          borderTopLeft: style.borderTopLeftRadius,
          borderTopRight: style.borderTopRightRadius,
          borderBottomRight: style.borderBottomRightRadius,
          borderBottomLeft: style.borderBottomLeftRadius,
        };
      };
      const sample = () => {
        const value = read();
        if (value.phase === "closing" && value.progress > 0.25 && value.progress < 0.75) {
          resolve(value);
          return;
        }
        if ((performance.now() - started) > 1200) {
          reject(new Error(`closing rail frame was not sampled: ${JSON.stringify(value)}`));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    expect(closing.borderTopLeft, "closing rounds every corner").toBe("16px");
    expect(closing.borderTopRight, "closing rounds every corner").toBe("16px");
    expect(closing.borderBottomRight, "closing rounds every corner").toBe("16px");
    expect(closing.borderBottomLeft, "closing rounds every corner").toBe("16px");

    await expect(shell).toHaveAttribute("data-nav-state", "closed");
  });

  test("mobile resolves the open calendar into a return rail", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await expect(page.getByTestId("new-entry")).toBeVisible();
    await page.getByTestId("nav-toggle").click();

    const surface = page.getByTestId("app-surface");
    await expect(surface).toHaveClass(/nb-app-surface-open/);
    await expect(page.getByTestId("nav-frame-overlay")).toBeVisible();
    await expect(page.getByTestId("nav-frame-overlay")).toHaveCSS("border-radius", "16px");
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
        const overlay = document.querySelector('[data-test="nav-frame-overlay"]').getBoundingClientRect();
        const rail = document.querySelector('[data-test="mobile-calendar-return"]').getBoundingClientRect();
        const surface = document.querySelector('[data-test="app-surface"]').getBoundingClientRect();
        const overlayNode = document.querySelector('[data-test="nav-frame-overlay"]');
        return {
          overlayTop: overlay.top,
          overlayBottom: overlay.bottom,
          overlayLeft: overlay.left,
          railRight: rail.right,
          surfaceLeft: surface.left,
          seam: surface.left - rail.right,
          overlayPointerEvents: getComputedStyle(overlayNode).pointerEvents,
        };
      });

      expect(geometry.overlayTop, `${height}px top margin`).toBeCloseTo(14, 1);
      expect(geometry.overlayBottom, `${height}px bottom margin`).toBeCloseTo(height - 14, 1);
      expect(geometry.overlayLeft, `${height}px rail frame`).toBeCloseTo(346, 1);
      expect(geometry.railRight, `${height}px rail edge`).toBeCloseTo(390, 1);
      expect(geometry.surfaceLeft, `${height}px full-size surface carrier`).toBeCloseTo(390, 1);
      expect(geometry.seam, `${height}px rail/surface seam`).toBeLessThanOrEqual(1);
      expect(geometry.overlayPointerEvents, `${height}px overlay must not intercept input`).toBe("none");

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
      const oNode = document.querySelector('[data-test="nav-frame-overlay"]');
      const cNode = document.querySelector('[data-test="nav-motion-carrier"]');
      const sNode = document.querySelector('[data-test="app-surface"]');
      const oRect = oNode.getBoundingClientRect();
      const cStyle = getComputedStyle(cNode);
      const radius = parseFloat(getComputedStyle(oNode).borderRadius) || 0;
      return {
        top: oRect.top,
        right: window.innerWidth - oRect.right,
        bottom: window.innerHeight - oRect.bottom,
        left: oRect.left,
        carrierTransform: cStyle.transform,
        layoutWidth: sNode.offsetWidth,
        borderRadius: radius,
      };
    });
    expect(before).not.toBeNull();
    expect(measured.top, "the recessed page top frame is 24px").toBeCloseTo(24, 1);
    expect(measured.right, "the recessed page right frame is 22px").toBeCloseTo(22, 1);
    expect(measured.bottom, "the recessed page bottom frame is 24px").toBeCloseTo(24, 1);
    expect(measured.left, "the recessed page left frame is 322px").toBeCloseTo(322, 1);
    expect(measured.carrierTransform, "carrier translates on X and Y").toMatch(/matrix|translate/);
    expect(Math.round(measured.layoutWidth), "layout width stays full so glyphs do not reflow").toBe(1280);
    expect(measured.borderRadius, "the open card must be rounded").toBeGreaterThan(12);

    const toggle = page.getByTestId("nav-toggle");
    const toggleBox = await toggle.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left };
    });
    expect(toggleBox.top, "the hamburger must stay inside the recessed card").toBeGreaterThanOrEqual(measured.top - 1);
    expect(toggleBox.left, "the hamburger must stay on the recessed page").toBeGreaterThan(measured.left - 322);
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

  /* The closed drawer is not off-screen. It rests at translate3d(-36%,0,0), so
     roughly two thirds of it still overlaps the page, and it reads as absent only
     because its content is faded out. Every descendant therefore has to opt into
     that fade: a group wrapper carried an unconditional `border-top` and painted a
     1px rule across the left of the app at every viewport, in every view, over the
     timeline card. It went unreported for so long because the colour is invisible
     against the dark shell and obvious against a light one.

     This asserts the invariant rather than the single element, so anything added
     to the drawer later that paints while closed fails here too. */
  test("a closed navigation drawer paints nothing over the page", async ({ page }) => {
    for (const [width, height] of [[390, 844], [1280, 900]]) {
      await page.setViewportSize({ width, height });
      await openPlanner(page);
      await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");

      const offenders = await page.evaluate(() => {
        const aside = document.querySelector("aside.nb-navigation");
        if (!aside) throw new Error("navigation drawer is missing");
        const alpha = (colour) => {
          const match = /rgba?\(([^)]+)\)/.exec(colour || "");
          if (!match) return 0;
          const parts = match[1].split(",").map((value) => parseFloat(value));
          return parts.length > 3 ? parts[3] : 1;
        };
        const effectiveOpacity = (node) => {
          let value = 1;
          for (let cursor = node; cursor && cursor !== document.documentElement; cursor = cursor.parentElement) {
            value *= parseFloat(getComputedStyle(cursor).opacity);
            if (value === 0) return 0;
          }
          return value;
        };
        const found = [];
        for (const node of [aside, ...aside.querySelectorAll("*")]) {
          const rect = node.getBoundingClientRect();
          const onScreen = rect.width > 0 && rect.height > 0
            && rect.right > 0 && rect.left < window.innerWidth
            && rect.bottom > 0 && rect.top < window.innerHeight;
          if (!onScreen || effectiveOpacity(node) === 0) continue;
          const style = getComputedStyle(node);
          const paints = [];
          if (alpha(style.backgroundColor) > 0) paints.push(`background ${style.backgroundColor}`);
          for (const side of ["Top", "Right", "Bottom", "Left"]) {
            if (parseFloat(style[`border${side}Width`]) > 0
              && style[`border${side}Style`] !== "none"
              && alpha(style[`border${side}Color`]) > 0) {
              paints.push(`border-${side.toLowerCase()} ${style[`border${side}Color`]}`);
            }
          }
          const ownText = [...node.childNodes]
            .filter((child) => child.nodeType === 3 && child.textContent.trim())
            .map((child) => child.textContent.trim())
            .join(" ");
          if (ownText && alpha(style.color) > 0) paints.push(`text "${ownText.slice(0, 24)}"`);
          if (paints.length) {
            found.push(`${node.tagName.toLowerCase()}.${(node.getAttribute("class") || "(none)").slice(0, 40)} → ${paints.join(", ")}`);
          }
        }
        return found;
      });

      expect(offenders, `${width}x${height}: the closed drawer must not paint over the page`).toEqual([]);
    }

    /* The separator must still be there when the drawer is open. Without this the
       assertion above is satisfied just as well by deleting it, which would trade
       a visible defect for an invisible one. */
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    const separator = await page.locator(".nb-nav-divide").first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { colour: style.borderTopColor, width: style.borderTopWidth, style: style.borderTopStyle };
    });
    expect(separator.colour, "the open drawer must still show its group separator").not.toBe("rgba(0, 0, 0, 0)");
    expect(parseFloat(separator.width), "the separator must have width when open").toBeGreaterThan(0);
    expect(separator.style, "the separator must have a border style when open").not.toBe("none");
  });

  /* The rail's shape must not change between rest and travel. At rest the
     viewport clip is exactly coincident with the rail and rounds it for free;
     `applyProgress` sets that clip to `none` for the whole of travel, so a rail
     that owns only some of its corners goes square on the others for every frame
     of both motions and snaps back at the terminal frame.

     Measured in pixels rather than from computed style on purpose: the defect is
     that the *rendered* shape changes, and the rounding is legitimately allowed
     to come from either the element or a clip. A computed-radius assertion would
     pass for any implementation that rounds the box while the rail still renders
     square, and fail for a correct one that reinstated a travel-time clip. */
  test("the calendar rail keeps its corner radius through both motions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);

    const decoder = await page.context().newPage();
    const RADIUS = 16;

    /* Non-accent pixels inside each RADIUS-square corner box. A square corner is
       filled by the rail itself and reads ~0; a rounded one leaves the quarter
       outside the arc, (1 - PI/4) * RADIUS^2 ~= 55, showing whatever is behind. */
    const cornerBoxes = async (label) => {
      const info = await page.evaluate(() => {
        const rail = document.querySelector('[data-test="mobile-calendar-return"]');
        const shell = document.querySelector('[data-test="nav-shell"]');
        const rect = rail.getBoundingClientRect();
        return {
          state: shell.dataset.navState,
          progress: Number(shell.dataset.navProgress),
          accent: getComputedStyle(rail).backgroundColor,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        };
      });
      const shot = (await page.screenshot()).toString("base64");
      const counts = await decoder.evaluate(async ({ shot, info, RADIUS, viewportWidth }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${shot}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const ratio = image.width / viewportWidth;
        const [ar, ag, ab] = info.accent.match(/\d+/g).map(Number);
        const box = (x, y) => {
          const sx = Math.round(x * ratio);
          const sy = Math.round(y * ratio);
          const size = Math.round(RADIUS * ratio);
          if (sx < 0 || sy < 0 || sx + size > image.width || sy + size > image.height) return null;
          const data = ctx.getImageData(sx, sy, size, size).data;
          let other = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (Math.abs(data[i] - ar) > 24 || Math.abs(data[i + 1] - ag) > 24 || Math.abs(data[i + 2] - ab) > 24) other += 1;
          }
          return Math.round(other / (ratio * ratio));
        };
        const { x, y, w, h } = info.rect;
        return {
          topLeft: box(x, y),
          topRight: box(x + w - RADIUS, y),
          bottomRight: box(x + w - RADIUS, y + h - RADIUS),
          bottomLeft: box(x, y + h - RADIUS),
        };
      }, { shot, info, RADIUS, viewportWidth: 390 });
      return { label, ...info, counts };
    };

    /* Stop the travel where it is by pausing every running animation, so the
       sample is a real in-flight frame rather than a timing guess. */
    const freezeAt = (target) => page.evaluate((stopAt) => new Promise((resolve) => {
      const shell = document.querySelector('[data-test="nav-shell"]');
      let frames = 0;
      const tick = () => {
        const state = shell.dataset.navState;
        const progress = Number(shell.dataset.navProgress);
        if (state !== "opening" && state !== "closing") return resolve();
        if ((state === "opening" && progress >= stopAt) || (state === "closing" && progress <= stopAt)) {
          document.getAnimations().forEach((animation) => animation.pause());
          return resolve();
        }
        frames += 1;
        if (frames >= 120) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), target);

    const resume = () => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));

    const samples = [];
    await page.getByTestId("nav-toggle").click();
    await freezeAt(0.5);
    samples.push(await cornerBoxes("opening"));
    await resume();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    samples.push(await cornerBoxes("rest open"));

    await page.getByTestId("mobile-calendar-return").click();
    await freezeAt(0.5);
    samples.push(await cornerBoxes("closing"));
    await resume();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    await decoder.close();

    /* Rounded measured 63-88 here and square measured 0-16, so the midpoint
       separates them with room for antialiasing and for whatever sits behind. */
    const ROUNDED = 35;
    for (const sample of samples) {
      expect(sample.progress, `${sample.label}: must be a real in-flight or settled frame`).toBeGreaterThan(0);
      for (const [corner, count] of Object.entries(sample.counts)) {
        expect(count, `${sample.label} (p=${sample.progress.toFixed(2)}) ${corner} must stay rounded, got ${count} non-accent px`)
          .toBeGreaterThanOrEqual(ROUNDED);
      }
    }
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
      expect(Math.abs(motion.reopening[0].labelOpacity - motion.closing.at(-1).labelOpacity), `${viewport.width}px label opacity continuity across reversal`).toBeLessThan(0.08);
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
      const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
      const drawer = document.querySelector("#planner-navigation");
      const label = drawer.querySelector(".nb-nav-item");
      const toggle = document.querySelector('[data-test="nav-toggle"]');
      const sample = () => ({
        phase: shellNode.dataset.navState,
        progress: shellNode.dataset.navProgress,
        clipPath: viewport.style.clipPath || "none",
        carrier: getComputedStyle(document.querySelector('[data-test="nav-motion-carrier"]')).transform,
        overlayTop: overlay.getBoundingClientRect().top,
        overlayLeft: overlay.getBoundingClientRect().left,
        labelOpacity: Number.parseFloat(getComputedStyle(label).opacity),
      });
      const waitForActiveFrame = () => {
        const progress = Number(shellNode.dataset.navProgress);
        if (shellNode.dataset.navState === "opening" && progress > 0.2 && progress < 0.8) {
          const beforeSample = sample();
          toggle.click();
          requestAnimationFrame(() => resolve({ before: beforeSample, after: {
            ...sample(),
            overlayAnimations: overlay.getAnimations()
              .filter((animation) => animation.playState === "running").length,
            labelAnimations: label.getAnimations()
              .filter((animation) => animation.playState === "running").length,
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
    expect(after.overlayAnimations, "reversal must restart the overlay animation").toBeGreaterThan(0);
    expect(after.labelAnimations, "reversal must restart the tracked label animation").toBeGreaterThan(0);
    expect(Math.abs(after.labelOpacity - before.labelOpacity), "label opacity must be continuous across reversal").toBeLessThan(0.08);
    expect(after.carrier).toMatch(/matrix|translate/);
    expect(Math.abs(after.overlayTop - before.overlayTop), "reversal must keep the top wall near its sampled frame")
      .toBeLessThan(24);
    expect(Math.abs(after.overlayLeft - before.overlayLeft), "reversal must keep the left wall near its sampled frame")
      .toBeLessThan(32);
    expect(after.overlayLeft, "reversal must not jump to the open destination wall")
      .toBeLessThan(300);
    await expect(shell).toHaveAttribute("data-nav-state", "closed");
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
        document.querySelector('[data-test="nav-frame-overlay"]'),
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
    const overlaySettledOpen = await page.evaluate(() => {
      const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
      const style = getComputedStyle(overlay);
      const running = overlay.getAnimations().filter((a) => a.playState === "running").length;
      return {
        visibility: style.visibility,
        opacity: style.opacity,
        running,
      };
    });
    expect(overlaySettledOpen.visibility, "reduced motion shows the frame overlay immediately").toBe("visible");
    expect(overlaySettledOpen.opacity, "reduced motion frame overlay is opaque").toBe("1");
    expect(overlaySettledOpen.running, "reduced motion has zero running animations").toBe(0);

    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    await expect(page.getByTestId("nav-toggle")).toBeFocused();
  });

  test("navigation cleanly transfers and clears mobile/desktop geometry across viewport resizes", async ({ page }) => {
    // 1. Mobile closed -> resize to Desktop closed
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(50);
    const desktopClosed = await page.evaluate(() => {
      const surface = document.querySelector('[data-test="app-surface"]');
      const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
      return {
        surfaceBorderRadius: surface.style.borderRadius,
        surfaceOverflow: surface.style.overflow,
        overlayVisibility: getComputedStyle(overlay).visibility,
      };
    });
    expect(desktopClosed.surfaceBorderRadius, "desktop closed surface has no inline border-radius").toBeFalsy();
    expect(desktopClosed.surfaceOverflow, "desktop closed surface has no inline overflow").toBeFalsy();
    expect(desktopClosed.overlayVisibility).toBe("hidden");

    // 2. Mobile open -> resize to Desktop open
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(50);
    const desktopOpen = await page.evaluate(() => {
      const surface = document.querySelector('[data-test="app-surface"]');
      const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
      const oRect = overlay.getBoundingClientRect();
      return {
        surfaceBorderRadius: surface.style.borderRadius,
        surfaceOverflow: surface.style.overflow,
        overlayRadius: parseFloat(getComputedStyle(overlay).borderRadius),
        overlayTop: oRect.top,
        overlayLeft: oRect.left,
      };
    });
    expect(desktopOpen.surfaceBorderRadius, "desktop open surface has no inline border-radius").toBeFalsy();
    expect(desktopOpen.surfaceOverflow, "desktop open surface has no inline overflow").toBeFalsy();
    expect(desktopOpen.overlayRadius, "desktop open overlay has 22px radius").toBeCloseTo(22, 1);
    expect(desktopOpen.overlayTop, "desktop open top inset").toBeCloseTo(24, 1);
    expect(desktopOpen.overlayLeft, "desktop open left inset").toBeCloseTo(322, 1);

    // 3. Desktop open -> resize back to Mobile open
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(50);
    const mobileOpen = await page.evaluate(() => {
      const surface = document.querySelector('[data-test="app-surface"]');
      const overlay = document.querySelector('[data-test="nav-frame-overlay"]');
      const rail = document.querySelector('[data-test="mobile-calendar-return"]');
      const oRect = overlay.getBoundingClientRect();
      const rRect = rail.getBoundingClientRect();
      return {
        surfaceBorderRadius: surface.style.borderRadius,
        railVisibility: getComputedStyle(rail).visibility,
        railRadius: getComputedStyle(rail).borderRadius,
        overlayRadius: parseFloat(getComputedStyle(overlay).borderRadius),
        overlayTop: oRect.top,
        overlayLeft: oRect.left,
        railRight: rRect.right,
      };
    });
    expect(mobileOpen.surfaceBorderRadius, "mobile open surface has 16px radius").toBe("16px");
    expect(mobileOpen.railVisibility).toBe("visible");
    expect(mobileOpen.railRadius).toBe("16px");
    expect(mobileOpen.overlayRadius, "mobile open overlay has 16px radius").toBeCloseTo(16, 1);
    expect(mobileOpen.overlayTop, "mobile open top inset").toBeCloseTo(14, 1);
    expect(mobileOpen.overlayLeft, "mobile open left inset").toBeCloseTo(346, 1);
    expect(mobileOpen.railRight, "mobile open rail edge").toBeCloseTo(390, 1);

    // Close and confirm clean settle
    await page.getByTestId("mobile-calendar-return").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });
});
