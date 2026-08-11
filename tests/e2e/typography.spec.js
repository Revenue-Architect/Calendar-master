import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";
import { TYPE_SCALE } from "../../src/design/typography.js";

/* Typography, asserted rather than assumed.
 *
 * The project shipped a font stack naming Inter for months. Inter was never
 * bundled, no `@font-face` ever existed, and the stack silently fell through to
 * the system face — so the design intent and the rendered result had diverged
 * completely and nothing could tell. That is the specific failure these guard
 * against: a face that is declared and does not load, a scale declared in two
 * places that drift, and controls too small to hit.
 */

test.describe("the face actually loaded", () => {
  test("Jost is present and rendering, not silently falling back", async ({ page }) => {
    await openPlanner(page);

    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        /* The direct question, and the one Inter would have failed. */
        available: document.fonts.check('700 13px "Jost"'),
        faces: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
      };
    });
    expect(loaded.available, `Jost did not load. Faces present: ${loaded.faces.join(", ")}`).toBe(true);
    expect(loaded.faces.some((f) => f.startsWith("Jost")), "no Jost face was registered at all").toBe(true);
  });

  test("and it is what the interface is measured in", async ({ page }) => {
    /* `document.fonts.check` says the face is available, not that anything uses
       it. The honest test is metric: the same string, in the display stack and
       in a fallback, must not come out the same width. */
    await openPlanner(page);
    const widths = await page.evaluate(() => {
      const measure = (family) => {
        const span = document.createElement("span");
        span.textContent = "Handgloves 0123456789";
        span.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:600 32px ${family}`;
        document.body.appendChild(span);
        const w = span.getBoundingClientRect().width;
        span.remove();
        return w;
      };
      return { display: measure("Jost, serif"), fallback: measure("serif") };
    });
    expect(widths.display).toBeGreaterThan(0);
    expect(
      Math.abs(widths.display - widths.fallback),
      "the display face measures identically to the fallback, so it is the fallback",
    ).toBeGreaterThan(1);
  });

  test("Inter is gone rather than merely unused", async ({ page }) => {
    await openPlanner(page);
    const stack = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--font-display"));
    expect(stack).toContain("Jost");
    expect(stack, "the dead Inter name is still in the stack").not.toContain("Inter");
  });
});

test.describe("the scale is one scale", () => {
  test("the stylesheet and the token map agree, step for step", async ({ page }) => {
    /* Two declarations of the same thing is a cost. This is what pays it: if
       index.css and typography.js drift, the test fails rather than the design. */
    await openPlanner(page);
    const fromCss = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name) => style.getPropertyValue(name).trim();
      const out = {};
      for (const step of ["display", "title", "heading", "lead", "body", "label", "data", "micro"]) {
        out[step] = {
          px: parseFloat(read(`--t-${step}`)),
          weight: parseFloat(read(`--t-${step}-w`)),
          tracking: parseFloat(read(`--t-${step}-ls`)),
        };
      }
      return out;
    });

    for (const [step, css] of Object.entries(fromCss)) {
      const spec = TYPE_SCALE[step];
      expect(css.px, `${step} size`).toBe(spec.px);
      expect(css.weight, `${step} weight`).toBe(spec.weight);
      expect(css.tracking, `${step} tracking`).toBeCloseTo(spec.tracking, 4);
    }
  });

  test("nothing in the interface is smaller than the smallest step", async ({ page }) => {
    await openPlanner(page);
    const floor = Math.min(...Object.values(TYPE_SCALE).map((s) => s.px));
    const tooSmall = await page.evaluate((floorPx) => {
      const out = [];
      for (const node of document.querySelectorAll("body *")) {
        if (!node.textContent?.trim() || node.children.length) continue;
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const size = parseFloat(getComputedStyle(node).fontSize);
        if (size < floorPx) out.push(`${node.tagName.toLowerCase()} "${node.textContent.trim().slice(0, 20)}" at ${size}px`);
      }
      return out.slice(0, 8);
    }, floor);
    expect(tooSmall, `text below ${floor}px: ${tooSmall.join(" | ")}`).toEqual([]);
  });
});

test.describe("a control you can actually hit", () => {
  test.use({ viewport: { width: 393, height: 844 }, hasTouch: true, isMobile: true });

  test("every control on a phone reaches the 44px target", async ({ page }) => {
    /* The chrome has been under the minimum for the life of the project: 12px
       labels with 8px of horizontal and 4px of vertical padding measure roughly
       30 x 22. Nothing had ever measured it. */
    await openPlanner(page);
    await page.waitForTimeout(300);

    const small = await page.evaluate(() => {
      const MIN = 44;
      const out = [];
      const selector = 'button, [role="button"], a[href], summary, input[type="checkbox"]';
      for (const node of document.querySelectorAll(selector)) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;      // not on screen
        if (getComputedStyle(node).visibility === "hidden") continue;

        /* The target, not the button. A control may be drawn small and take its
           press through an expanded pseudo-element — which is the whole point of
           the technique, and invisible to `getBoundingClientRect`. Measuring the
           box alone would report a fix that shipped as a failure. */
        const after = getComputedStyle(node, "::after");
        const hasTarget = after.content && after.content !== "none";
        const width = Math.max(box.width, hasTarget ? parseFloat(after.width) || 0 : 0);
        const height = Math.max(box.height, hasTarget ? parseFloat(after.height) || 0 : 0);

        if (width >= MIN && height >= MIN) continue;
        const label = (node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 24);
        out.push(`${label || node.tagName} ${Math.round(width)}x${Math.round(height)}`);
      }
      return out;
    });

    expect(small, `${small.length} controls under 44px: ${small.slice(0, 12).join(" | ")}`).toEqual([]);
  });
});
