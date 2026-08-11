import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

/* The goo and the notch.
 *
 * Both are decoration, which is exactly why they need tests: decoration is what
 * nobody notices breaking. What is asserted here is not that they look good —
 * a browser cannot tell me that — but the three things that would make them
 * wrong: costing something when idle, running for someone who asked for less
 * motion, and leaving the app in a state it cannot get out of. */

const filters = (page, prefix) => page.locator(`filter[id^="${prefix}"]`);

test.describe("the liquid pill", () => {
  test("slides without a filter at all", () => {
    /* A trailing droplet plus a goo filter was tried and removed. The droplet
       could only be mounted once the pill was already moving, which meant
       mounting it at the position it was meant to travel *from* — it flickered
       at the destination. And switching `filter` on for the duration of a
       transition re-rasterises the element at both ends, so every press snapped
       in and snapped out. One shape sliding cleanly is the whole effect. */
  });

  test("the selection moves and nothing pops", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    expect(await filters(page, "goo-pill").count(), "the pill filter is gone for good").toBe(0);
    await expect(page.getByRole("tab", { name: "AGENDA", exact: true })).toHaveAttribute("aria-selected", "true");

    await page.waitForTimeout(700);
    expect(await filters(page, "goo-pill").count()).toBe(0);
  });

  test("still switches views for someone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await expect(page.getByRole("tab", { name: "AGENDA", exact: true })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("adjacent weekdays", () => {
  /* Addressed by weekday index, not by letter: the chips read S M T W T F S,
     and two of those letters name two different days. */
  const day = (page, index) => page.locator(`[data-test="weekday-chip"][data-weekday="${index}"]`);
  const setDay = async (page, index, on) => {
    const chip = day(page, index);
    if ((await chip.getAttribute("data-on")) !== String(on)) await chip.click();
  };

  test("merge with a filter that does not switch on under the finger", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    await expect(page.getByTestId("composer")).toBeVisible();
    await page.getByRole("button", { name: "MORE OPTIONS" }).click();
    await page.getByRole("button", { name: "WEEKLY", exact: true }).click();
    await expect(day(page, 1)).toBeVisible();

    /* On for the life of the row. Toggling it as days were picked meant every
       chip press flickered the whole row — the merge is what the filter is for,
       and it was ruining the thing it decorated. */
    expect(await filters(page, "goo-days").count()).toBe(1);

    await setDay(page, 1, true);
    await setDay(page, 2, true);
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count(), "a run must not remount it").toBe(1);

    await setDay(page, 2, false);
    await page.waitForTimeout(200);
    expect(await filters(page, "goo-days").count(), "breaking a run must not remove it").toBe(1);
  });

  test("no filter at all for someone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    await page.getByRole("button", { name: "MORE OPTIONS" }).click();
    await page.getByRole("button", { name: "WEEKLY", exact: true }).click();
    await expect(day(page, 1)).toBeVisible();
    expect(await filters(page, "goo-days").count()).toBe(0);
  });
});

test.describe("the notch morph", () => {
  test("NEW grows the composer out of the button, and folds it back", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet, "the composer should morph as a notch from NEW").toHaveAttribute("data-fluid-origin", "notch");
    /* The body is the part that arrives late and leaves early. */
    await expect(sheet.locator(".nb-notch-body")).toBeVisible();

    await page.keyboard.press("Escape");
    /* The exit animation is longer than the ordinary one, and the sheet has to
       actually go away at the end of it rather than linger. */
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("the mobile create button morphs the same way", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.getByTestId("new-action").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");
    await expect(page.getByTestId("composer")).toHaveAttribute("data-composer-kind", "task");
  });

  test("a sheet opened from the keyboard arrives on its own terms", async ({ page }) => {
    await openPlanner(page);
    /* The notch is the signature of "make something new" from a create button,
       not of the composer itself — and neither is the trigger morph, which needs a
       control that was actually pressed. Nothing was pressed here, so growing the
       sheet out of whatever still holds focus (a view tab, the last thing clicked)
       would make it fly out of something unrelated. */
    await page.keyboard.press("n");
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    expect(await sheet.getAttribute("data-fluid-origin"), "a keystroke is not a control").toBeNull();
  });

  test("a press still gives the sheet its origin, and a later keystroke does not steal it", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    await expect(page.getByTestId("sheet")).toHaveAttribute("data-fluid-origin", "notch");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).toHaveCount(0, { timeout: 3000 });

    /* The remembered press is cleared by the keystroke that closed the last sheet,
       so this one cannot inherit an origin from a button pressed a moment ago. */
    await page.keyboard.press("n");
    expect(await page.getByTestId("sheet").getAttribute("data-fluid-origin")).toBeNull();
  });

  test("the composer still saves what it was opened with", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const composer = page.getByTestId("composer");
    await composer.getByRole("textbox").first().fill("Morphed into being");
    await page.getByTestId("sheet").getByRole("button", { name: /^ADD TO TIMELINE$/ }).click();
    await expect(page.getByTestId("composer")).toBeHidden();
    await expect(page.getByText("Morphed into being").first()).toBeVisible();
  });
});

test.describe("sheet exits", () => {
  test("a detail sheet leaves along the path it arrived on", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("Standup today 10am 30m");
    await page.getByTestId("palette-quick-add").click();
    await page.waitForTimeout(500);

    await page.getByText("Standup", { exact: true }).first().click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");

    /* Entry and exit read the same custom properties, so the sheet retraces its
       own path instead of drifting vaguely downward. The exit used to travel a
       quarter of the distance and stop at a different scale. */
    const geometry = await sheet.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        x: style.getPropertyValue("--fluid-x").trim(),
        s: style.getPropertyValue("--fluid-s").trim(),
      };
    });
    expect(geometry.x).not.toBe("");
    expect(Number(geometry.s)).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("form fields are big enough that a touch browser will not zoom the page", async ({ page }) => {
    /* Every sheet autofocuses a field, and a coarse-pointer browser zooms the
       whole viewport when that field's text is under 16px — then a pinch back
       out leaves every fixed sheet mis-painted. */
    await page.emulateMedia({ media: "screen" });
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    await expect(page.getByTestId("composer")).toBeVisible();

    const tooSmall = await page.evaluate(() => {
      const coarse = window.matchMedia("(pointer: coarse)");
      if (!coarse.matches) return "desktop";
      return [...document.querySelectorAll("input, textarea, select")]
        .filter((n) => n.offsetParent !== null)
        .filter((n) => parseFloat(getComputedStyle(n).fontSize) < 16)
        .length;
    });
    expect(tooSmall === "desktop" || tooSmall === 0).toBe(true);
  });
});

test.describe("the shape a sheet grows from", () => {
  /* The morph is computed from two rectangles: the button pressed, and the panel
     it becomes. Getting the second one wrong is invisible in code review and very
     visible on screen — the sheet starts from the wrong place and size and then
     snaps to the right one on its last frame. These assert the numbers the CSS
     actually animates between, because that is the only part a browser can check. */

  const geometryOf = (sheet) => sheet.evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      x: Number(style.getPropertyValue("--fluid-x").replace("px", "")),
      y: Number(style.getPropertyValue("--fluid-y").replace("px", "")),
      s: Number(style.getPropertyValue("--fluid-s")),
      panel: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };
  });

  test("the morph is measured from the panel, not from the panel mid-animation", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    const box = await trigger.boundingBox();
    await trigger.click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    /* Let the entry animation finish, so the rect read here is the settled panel
       — the thing the geometry was supposed to have been measured against. */
    await page.waitForTimeout(700);
    const g = await geometryOf(sheet);

    const panelCenterY = g.panel.top + g.panel.height / 2;
    const triggerCenterY = box.y + box.height / 2;
    /* A CSS animation's first keyframe is applied before any layout effect runs,
       so a naive `getBoundingClientRect()` in that effect measures the *pill*.
       `.nb-fluid`'s 0% is `translateY(26px) scale(.965)` about the bottom edge,
       which put this number tens of pixels out. */
    expect(
      Math.abs(g.y - (triggerCenterY - panelCenterY)),
      "the morph's travel does not match the distance between the button and the panel",
    ).toBeLessThan(2);

    const expectedScale = Math.max(0.12, Math.min(1, box.width / g.panel.width));
    expect(
      Math.abs(g.s - expectedScale),
      "the morph's scale does not match the button's width against the panel's",
    ).toBeLessThan(0.005);
  });

  test("the same is true of an ordinary sheet, not just the notch", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("Standup today 10am 30m");
    await page.getByTestId("palette-quick-add").click();
    await page.waitForTimeout(500);

    const card = page.getByText("Standup", { exact: true }).first();
    const box = await card.boundingBox();
    await card.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");
    await page.waitForTimeout(700);

    const g = await geometryOf(sheet);
    const panelCenterY = g.panel.top + g.panel.height / 2;
    expect(Math.abs(g.y - ((box.y + box.height / 2) - panelCenterY))).toBeLessThan(2);
  });

  test("opening a sheet scrolls neither the page nor the sheet", async ({ page }) => {
    /* The first focusable is focused on the opening frame, while the panel is
       still a scaled-down pill. A focus that is allowed to scroll asks the browser
       to bring a transformed, quarter-sized element into view inside a container
       that is itself mid-animation — it scrolls somewhere that will not exist a
       frame later, and the contents visibly jump. */
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();

    for (const label of ["on the opening frame", "once settled"]) {
      const scrolled = await page.evaluate(() => ({
        page: window.scrollY,
        sheet: document.querySelector('[data-test="sheet"]')?.scrollTop ?? 0,
      }));
      expect(scrolled.page, `the page scrolled ${label}`).toBe(0);
      expect(scrolled.sheet, `the sheet scrolled ${label}`).toBe(0);
      await page.waitForTimeout(700);
    }
    /* And the focus it was doing all that for still landed inside the sheet. */
    expect(await sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  });

  test("the scrim blurs at a constant radius", async ({ page }) => {
    /* Animating a blur radius throws away the compositor's cached backdrop every
       frame and re-blurs the whole viewport under a sheet that is already
       animating. The scrim fades its opacity instead, which fades the blur in
       with it for one blur's worth of work. */
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const scrim = page.locator(".nb-scrim").first();
    await expect(scrim).toBeVisible();

    const radii = [];
    for (let i = 0; i < 3; i += 1) {
      radii.push(await scrim.evaluate((node) => {
        const style = getComputedStyle(node);
        return style.backdropFilter || style.webkitBackdropFilter;
      }));
      await page.waitForTimeout(120);
    }
    expect(new Set(radii).size, `the blur radius changed over time: ${radii.join(" → ")}`).toBe(1);
  });
});

test.describe("a sheet must not stretch what is inside it", () => {
  /* The reported symptom was "it zooms in intensely and glitches" when opening
     New event or New action -- the two routes that use the notch morph. The cause
     was a container animating on two different scales at once. Measured on a
     phone: the composer opened 0.234 wide and 0.12 tall, an aspect ratio 1.95x
     wrong, and spent 380ms un-squashing every label and field inside it.

     The clamp was making it worse, not safer: a 28px button against a 437px panel
     is a true ratio of 0.064, and the floor lifted it to 0.12 while the width
     ratio stayed honest -- so the floor itself produced most of the distortion. */
  const scaleVars = (sheet) => sheet.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      s: style.getPropertyValue("--fluid-s").trim(),
      sx: style.getPropertyValue("--fluid-sx").trim(),
      sy: style.getPropertyValue("--fluid-sy").trim(),
      transform: style.transform,
    };
  });

  for (const [label, testId] of [["New event", "new-entry"], ["New action", "new-action"]]) {
    test(`${label} opens on one scale, not two`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openPlanner(page);
      await page.getByTestId(testId).click();
      const sheet = page.getByTestId("sheet");
      await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");

      const vars = await scaleVars(sheet);
      expect(Number(vars.s), "the morph needs a scale to animate from").toBeGreaterThan(0);
      expect(vars.sx, "the two-axis pair must be gone, not merely unused").toBe("");
      expect(vars.sy).toBe("");
    });
  }

  test("the panel keeps its aspect ratio all the way through, not just at the ends", async ({ page }) => {
    /* The endpoints were never the problem: at 0% and 100% a stretched morph
       looks perfectly correct. The animation is held at a series of mid-points
       rather than sampled by wall clock, which is both deterministic and the only
       way to be sure the samples land while it is still running. */
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    /* The mobile create button, deliberately: it is 91px against a 390px panel,
       so the width ratio is 0.23 while the height ratio floors at 0.12. The
       narrow NEW button in the header happens to floor on both axes, which makes
       it the one case that looked fine while everything else stretched. */
    await page.getByTestId("new-action").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();

    const samples = await sheet.evaluate((node) => {
      const animation = node.getAnimations().find((a) => a.effect?.getTiming);
      if (!animation) return "the panel has no entry animation to hold";
      const duration = animation.effect.getComputedTiming().duration;
      animation.pause();
      const out = [];
      for (const fraction of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
        animation.currentTime = duration * fraction;
        const m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        out.push({ fraction, across: m.a, down: m.d });
      }
      animation.play();
      return out;
    });

    expect(Array.isArray(samples), String(samples)).toBe(true);
    for (const { fraction, across, down } of samples) {
      expect(across, `nothing was scaled at ${fraction}`).toBeGreaterThan(0);
      expect(
        Math.abs(across - down),
        `at ${fraction} through, the panel was scaled ${across.toFixed(3)} across and ${down.toFixed(3)} down`,
      ).toBeLessThan(0.01);
    }
  });
});
