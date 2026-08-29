import { expect, test } from "@playwright/test";
import { openPlanner, quickAdd, seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { addDaysToKey, keyOf } from "../../src/shared/time/dateKey.js";

/* The goo and the notch.
 *
 * Both are decoration, which is exactly why they need tests: decoration is what
 * nobody notices breaking. What is asserted here is not that they look good —
 * a browser cannot tell me that — but the three things that would make them
 * wrong: costing something when idle, running for someone who asked for less
 * motion, and leaving the app in a state it cannot get out of. */

const filters = (page, prefix) => page.locator(`filter[id^="${prefix}"]`);

/* Read the running notch choreography at one shared production clock. The
 * sampler deliberately scrubs the CSS/WAAPI animations themselves rather than
 * recreating their interpolation in test code; the assertions below therefore
 * describe the current browser-rendered contract and can catch a choreography
 * that changes without making the test's model stale. */
const sampleNotchFrames = async (sheet, fractions) => sheet.evaluate((node, requestedFractions) => {
  const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
  if (!entry?.effect) return null;
  const morphMs = Number(entry.effect.getTiming().duration);
  const source = node.querySelector('[data-test="morph-source-label"]');
  const body = node.querySelector(".nb-notch-body");
  if (!source || !body || !Number.isFinite(morphMs) || morphMs <= 0) return null;

  const matrixValues = (value) => {
    const matrix = new DOMMatrixReadOnly(value === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : value);
    return {
      x: matrix.e,
      y: matrix.f,
      scaleX: matrix.a,
      scaleY: matrix.d,
      raw: value,
    };
  };
  const read = (fraction) => {
    for (const animation of node.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = morphMs * fraction;
    }
    const panelStyle = getComputedStyle(node);
    const sourceStyle = getComputedStyle(source);
    const bodyStyle = getComputedStyle(body);
    return {
      fraction,
      panelTransform: matrixValues(panelStyle.transform),
      panelClip: panelStyle.clipPath,
      panelOffsetWidth: node.offsetWidth,
      panelOffsetHeight: node.offsetHeight,
      panelClientWidth: node.clientWidth,
      panelScrollWidth: node.scrollWidth,
      panelOverflowX: panelStyle.overflowX,
      panelBackground: panelStyle.backgroundColor,
      sourceOpacity: Number(sourceStyle.opacity),
      sourceTransform: matrixValues(sourceStyle.transform),
      sourceFilter: sourceStyle.filter,
      bodyOpacity: Number(bodyStyle.opacity),
      bodyTransform: matrixValues(bodyStyle.transform),
      bodyFilter: bodyStyle.filter,
      bodyScrollHeight: body.scrollHeight,
    };
  };

  const frames = requestedFractions.map(read);
  for (const animation of node.getAnimations({ subtree: true })) animation.play();
  return frames;
}, fractions);

const readHandoffRestState = async (sheet) => sheet.evaluate((node) => {
  const read = (element) => {
    const style = getComputedStyle(element);
    return {
      opacity: Number(style.opacity),
      transform: style.transform,
      filter: style.filter,
      willChange: style.willChange,
      animations: element.getAnimations().map((animation) => animation.animationName),
    };
  };
  const cascade = [
    ...node.querySelectorAll(
      ".nb-notch-cascade > *, .nb-notch-body > :first-child, .nb-notch-body > :last-child:not(:has(.nb-notch-cascade))",
    ),
  ].map((element) => getComputedStyle(element).willChange);
  return {
    source: read(node.querySelector(".nb-morph-source-label")),
    body: read(node.querySelector(".nb-notch-body")),
    cascade,
  };
});

test.describe("Event semantic morph sources", () => {
  test("Day and Week cards register their own source keys, morph to Inspector, and restore source paint on close", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Source identity today 10am 60m");

    const sourceOpacity = (locator) => locator.evaluate((node) => Number(getComputedStyle(node).opacity));
    const dayCard = page.locator('[data-event-id]').filter({ hasText: "Source identity" }).locator('[data-morph-key]');
    await expect(dayCard).toHaveAttribute("data-morph-key", /:v:day:l:timeline$/);
    const dayKey = await dayCard.getAttribute("data-morph-key");

    await dayCard.click();
    await expect(page.locator('[data-morph-overlay]'), "the Day Event must start a real registry-backed morph").toBeVisible();
    await expect(page.getByTestId("sheet")).toBeVisible();
    expect(await sourceOpacity(dayCard), "the physical Day card must transfer paint to the overlay").toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator("[data-motion-state]")).toHaveAttribute("data-motion-state", "idle");
    expect(await sourceOpacity(dayCard), "closing must restore the Day card after its source handoff").toBeGreaterThan(0);

    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    const weekCard = page.getByTestId("week-event").filter({ hasText: "Source identity" });
    await expect(weekCard).toHaveAttribute("data-morph-key", /:v:week:l:timeline$/);
    expect(await weekCard.getAttribute("data-morph-key")).not.toBe(dayKey);
    const weekBaselineOpacity = await sourceOpacity(weekCard);

    await weekCard.click();
    await expect(page.locator('[data-morph-overlay]'), "the Week Event must use its Week source instead of falling back to a generic Sheet").toBeVisible();
    await expect(page.getByTestId("sheet")).toBeVisible();
    await expect.poll(() => sourceOpacity(weekCard), {
      message: "the physical Week card must transfer paint to the overlay",
    }).toBeLessThanOrEqual(.01);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator("[data-motion-state]")).toHaveAttribute("data-motion-state", "idle");
    await expect.poll(async () => Math.abs(await sourceOpacity(weekCard) - weekBaselineOpacity), {
      message: "closing must restore the live Week source's native resting opacity",
    }).toBeLessThan(.02);
  });

  test("a pointer-opened Event uses its live Inspector as the morph destination", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Physical Event destination today 10am 60m");

    const source = page.locator('[data-event-id]').filter({ hasText: "Physical Event destination" }).locator('[data-morph-key]');
    await source.scrollIntoViewIfNeeded();
    const sourceRect = await source.boundingBox();
    const sourceMaterial = await source.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        radius: style.borderRadius,
      };
    });
    const sourceOpacity = () => source.evaluate((node) => Number(getComputedStyle(node).opacity));
    await expect(source.locator("[data-event-morph-disclosure]")).toHaveCount(1);
    await source.click();

    const sheet = page.getByTestId("sheet");
    const frameZero = await page.locator("[data-morph-overlay]").evaluate(async (overlay) => {
      const shell = overlay.querySelector("[data-morph-shell]");
      const title = overlay.querySelector("[data-morph-title]");
      const animation = shell?.getAnimations().find((candidate) => (
        Number(candidate.effect?.getTiming?.().duration) > 0
      ));
      animation?.pause();
      if (animation) animation.currentTime = 0;
      /* WAAPI applies the sampled currentTime at the next style/composite
         boundary. Reading immediately after assignment can observe the old
         rendered frame, which would make this first-frame contract depend on
         scheduler luck rather than the source geometry. */
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const shellRect = shell?.getBoundingClientRect();
      const titleTransform = getComputedStyle(title).transform;
      const matrix = new DOMMatrixReadOnly(titleTransform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : titleTransform);
      return {
        shellRect: shellRect && { left: shellRect.left, top: shellRect.top, width: shellRect.width, height: shellRect.height },
        titleTransform,
        titleText: title?.textContent?.trim(),
        titleScaleX: matrix.a,
        titleScaleY: matrix.d,
        animationCount: shell?.getAnimations().length ?? 0,
        animationDuration: Number(animation?.effect?.getTiming?.().duration),
      };
    });
    await expect(sheet).toHaveAttribute("data-event-inspector-surface", "morph");
    await expect(sheet).toHaveAttribute("data-morph-presentation", "opening");
    /* The destination is a real source-anchored layer during the transition.
       Hiding the whole Inspector until OPEN turns the handoff into a modal pop
       instead of letting facts emerge inside the expanding Event. */
    await expect(sheet).toHaveCSS("visibility", "visible");
    const openingEnvironment = await sheet.evaluate((panel) => {
      const backdropStyle = panel.parentElement ? getComputedStyle(panel.parentElement) : null;
      return {
        background: backdropStyle?.backgroundColor,
        backdropFilter: backdropStyle?.backdropFilter,
      };
    });
    expect(openingEnvironment.background, "an Event expansion must not darken the planner").toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(openingEnvironment.backdropFilter, "an Event expansion must not blur the planner").toBe("none");
    const openingMaterial = await sheet.evaluate(async (panel) => {
      const material = panel.querySelector(".nb-event-morph-material");
      const animation = material?.getAnimations().find((candidate) => (
        Number(candidate.effect?.getTiming?.().duration) > 0
      ));
      animation?.pause();
      if (animation) animation.currentTime = 0;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panelStyle = getComputedStyle(panel);
      const materialStyle = material ? getComputedStyle(material) : null;
      const snapshot = {
        sourceSurface: panelStyle.getPropertyValue("--event-morph-source-surface").trim(),
        sourceBorder: panelStyle.getPropertyValue("--event-morph-source-border").trim(),
        sourceRadius: panelStyle.getPropertyValue("--event-morph-source-radius").trim(),
        visibleSurface: materialStyle?.backgroundColor,
        visibleBorder: materialStyle?.borderColor,
        visibleBorderWidth: materialStyle?.borderWidth,
        destinationTitleVisibility: getComputedStyle(panel.querySelector(".nb-event-morph-details [data-morph-title]")).visibility,
      };
      animation?.play();
      return snapshot;
    });
    expect(openingMaterial.sourceSurface, "the carrier must retain the clicked Event surface token").toBe(sourceMaterial.background);
    expect(openingMaterial.sourceBorder, "the carrier must retain the clicked Event border token").toBe(sourceMaterial.border);
    expect(openingMaterial.sourceRadius, "the carrier must retain the clicked Event corner token").toBe(sourceMaterial.radius);
    expect(openingMaterial.visibleSurface, "the opening carrier must visibly begin as the clicked Event material").toBe(sourceMaterial.background);
    expect(openingMaterial.visibleBorderWidth, "the expanded carrier must not extend the timeline card's 1px border across its larger material").toBe("0px");
    expect(openingMaterial.destinationTitleVisibility, "the destination title must stay out of view while MorphSurface owns the shared title handoff").toBe("hidden");
    await expect(sheet.locator("[data-morph-title]")).toHaveCount(1);
    await expect(sheet.locator("[data-morph-meta]")).toHaveCount(1);
    await expect(sheet.locator("[data-morph-marker]")).toHaveCount(1);
    await expect(sheet.getByRole("button", { name: "Collapse event" })).toBeVisible();
    await expect.poll(sourceOpacity, { message: "the timeline source must stay suppressed while the physical carrier owns its paint" }).toBeLessThanOrEqual(.01);
    expect(frameZero.shellRect).not.toBeNull();
    expect(frameZero.animationCount, "the compositor shell must expose its running WAAPI animation").toBeGreaterThan(0);
    expect(frameZero.animationDuration, "a physical Event expansion needs room for the shared title to land before the facts fully reveal").toBe(390);
    expect(frameZero.titleText, "the traveling shared title must carry the Event's readable label, including when its destination is an editable input").toBe("Physical Event destination");
    expect(Math.abs(frameZero.shellRect.left - sourceRect.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(frameZero.shellRect.top - sourceRect.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(frameZero.shellRect.width - sourceRect.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(frameZero.shellRect.height - sourceRect.height)).toBeLessThanOrEqual(1);
    expect(frameZero.titleScaleX, "shared title must translate at 1x, never inherit the shell scale").toBeCloseTo(1);
    expect(frameZero.titleScaleY, "shared title must translate at 1x, never inherit the shell scale").toBeCloseTo(1);
    const titleHandoff = await sheet.evaluate(async (panel) => {
      const overlay = document.querySelector("[data-morph-overlay]");
      const travelingTitle = overlay?.querySelector("[data-morph-title]");
      const destinationTitle = panel.querySelector(".nb-event-morph-details [data-morph-title]");
      const visibleDestinationTitle = destinationTitle?.matches("input, textarea, [contenteditable='true']")
        ? destinationTitle
        : destinationTitle?.querySelector("input, textarea, [contenteditable='true']") || destinationTitle;
      const animation = travelingTitle?.getAnimations().find((candidate) => (
        Number(candidate.effect?.getTiming?.().duration) > 0
      ));
      animation?.pause();
      if (animation) animation.currentTime = Number(animation.effect?.getTiming?.().duration);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const box = (node) => {
        const rect = node?.getBoundingClientRect();
        return rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      };
      const result = {
        traveling: {
          box: box(travelingTitle),
          fontSize: travelingTitle && getComputedStyle(travelingTitle).fontSize,
          fontWeight: travelingTitle && getComputedStyle(travelingTitle).fontWeight,
        },
        destination: {
          box: box(visibleDestinationTitle),
          fontSize: visibleDestinationTitle && getComputedStyle(visibleDestinationTitle).fontSize,
          fontWeight: visibleDestinationTitle && getComputedStyle(visibleDestinationTitle).fontWeight,
        },
      };
      animation?.play();
      return result;
    });
    expect(titleHandoff.traveling.box).not.toBeNull();
    expect(titleHandoff.destination.box).not.toBeNull();
    expect(Math.abs(titleHandoff.traveling.box.left - titleHandoff.destination.box.left), "the overlay title must land on the real Inspector title's left edge").toBeLessThanOrEqual(1);
    expect(Math.abs(titleHandoff.traveling.box.top - titleHandoff.destination.box.top), "the overlay title must land on the real Inspector title's baseline region").toBeLessThanOrEqual(1);
    expect(Math.abs(titleHandoff.traveling.box.width - titleHandoff.destination.box.width), "the overlay title must land at the destination width, not snap wider after handoff").toBeLessThanOrEqual(1);
    expect(titleHandoff.traveling.fontSize, "the traveling title must finish at the real Inspector typography before ownership changes").toBe(titleHandoff.destination.fontSize);
    expect(titleHandoff.traveling.fontWeight, "the traveling title must finish at the real Inspector weight before ownership changes").toBe(titleHandoff.destination.fontWeight);
    const timeHandoff = await sheet.evaluate((panel) => {
      const sharedMeta = panel.querySelector(".nb-event-morph-details [data-morph-meta]");
      const visibleTime = sharedMeta?.querySelector(".nb-stamp > [aria-hidden='true']") || sharedMeta;
      const readTypography = (node) => {
        const style = node && getComputedStyle(node);
        return {
          color: style?.color,
          fontFamily: style?.fontFamily,
          fontSize: style?.fontSize,
          fontWeight: style?.fontWeight,
          lineHeight: style?.lineHeight,
        };
      };
      return {
        shared: readTypography(sharedMeta),
        visible: readTypography(visibleTime),
      };
    });
    expect(timeHandoff.shared.color, "the shared time proxy must finish with the same colour as the live timestamp").toBe(timeHandoff.visible.color);
    expect(timeHandoff.shared.fontFamily, "the shared time proxy must not switch faces when Inspector takes ownership").toBe(timeHandoff.visible.fontFamily);
    expect(timeHandoff.shared.fontSize, "the shared time proxy must finish at the live timestamp size").toBe(timeHandoff.visible.fontSize);
    expect(timeHandoff.shared.fontWeight, "the shared time proxy must finish at the live timestamp weight").toBe(timeHandoff.visible.fontWeight);
    expect(timeHandoff.shared.lineHeight, "the shared time proxy must finish on the live timestamp line box").toBe(timeHandoff.visible.lineHeight);
    await expect(sheet).toHaveAttribute("data-morph-presentation", "open");
    const settledMaterial = await sheet.locator(".nb-event-morph-material").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        borderWidth: style.borderWidth,
      };
    });
    expect(settledMaterial.background, "the expanded Event must retain its source material instead of falling back to the generic Sheet card").toBe(sourceMaterial.background);
    expect(settledMaterial.borderWidth, "the expanded Event must retain only soft elevation, not a hard modal outline").toBe("0px");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveAttribute("data-morph-presentation", /^(closing|cancelling)$/);
    await expect(sheet).toHaveCSS("visibility", "visible");
    const closeDuration = await page.locator("[data-morph-overlay]").evaluate((overlay) => {
      const animation = overlay.querySelector("[data-morph-shell]")?.getAnimations()
        .find((candidate) => Number(candidate.effect?.getTiming?.().duration) > 0);
      return {
        duration: Number(animation?.effect?.getTiming?.().duration),
        easing: animation?.effect?.getTiming?.().easing,
        titleText: overlay.querySelector("[data-morph-title]")?.textContent?.trim(),
      };
    });
    expect(closeDuration.duration, "the physical return must use the smoother panel-close duration").toBe(340);
    expect(closeDuration.easing, "the physical return must ease through its middle rather than eject immediately like a modal dismissal").toBe("cubic-bezier(0.2, 0, 0, 1)");
    expect(closeDuration.titleText, "the return must keep the Event title visible until it reconnects to the source card").toBe("Physical Event destination");
    expect(await sourceOpacity(), "source paint must not restore until the return carrier has finished closing").toBeLessThanOrEqual(.01);
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
    await expect.poll(sourceOpacity).toBeGreaterThan(.1);
  });

  test("an adjacent Event title stays on one uninterrupted line while its card expands", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Adjacent source heading must retain one unbroken line while its physical inspector expands today 2pm 90m");
    await quickAdd(page, "Adjacent sibling holds the neighbouring timeline lane today 2pm 90m");

    const source = page.locator('[data-event-id]').filter({ hasText: "Adjacent source heading" }).locator('[data-morph-key]');
    const sourceTitle = source.locator("[data-morph-title]");
    const sourceLayout = await sourceTitle.evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }));
    expect(sourceLayout.scrollWidth, "the adjacent lane fixture must genuinely constrain the Event title").toBeGreaterThan(sourceLayout.clientWidth);

    await source.click();
    const overlayFlow = await page.locator("[data-morph-overlay] [data-morph-title]").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        clientHeight: node.clientHeight,
        overflowX: style.overflowX,
        scrollHeight: node.scrollHeight,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    });
    expect(overlayFlow.whiteSpace, "the shared title must retain the source card's one-line text flow").toBe("nowrap");
    expect(overlayFlow.overflowX, "the shared title must clip rather than reflow during a narrow-lane handoff").toBe("hidden");
    expect(overlayFlow.textOverflow, "a narrow title must continue to ellipsize while its width grows").toBe("ellipsis");
    expect(overlayFlow.scrollHeight, "the shared title must never gain a second line mid-motion").toBeLessThanOrEqual(overlayFlow.clientHeight + 1);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).toHaveCount(0, { timeout: 3000 });
  });

  test("a physical Event keeps its Inspector body inside the carrier material", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Contained physical Event today 10am 60m");

    const source = page.locator('[data-event-id]').filter({ hasText: "Contained physical Event" }).locator('[data-morph-key]');
    await source.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-presentation", "open");

    const deleteControl = sheet.getByRole("button", { name: "DELETE", exact: true });
    await deleteControl.scrollIntoViewIfNeeded();
    const containment = await sheet.evaluate((panel) => {
      const material = panel.querySelector(".nb-event-morph-material");
      const scrollOwner = panel.querySelector("[data-event-morph-scroll]");
      const deleteControl = [...panel.querySelectorAll("button")].find((node) => node.textContent?.trim() === "DELETE");
      const box = material?.getBoundingClientRect();
      const controlBox = deleteControl?.getBoundingClientRect();
      const scrollStyle = scrollOwner ? getComputedStyle(scrollOwner) : null;
      return {
        scrollOverflowY: scrollStyle?.overflowY,
        panel: {
          top: panel.getBoundingClientRect().top,
          bottom: panel.getBoundingClientRect().bottom,
          height: panel.getBoundingClientRect().height,
          scrollTop: scrollOwner?.scrollTop,
          scrollHeight: scrollOwner?.scrollHeight,
          clientHeight: scrollOwner?.clientHeight,
          inlineHeight: panel.style.height,
        },
        details: (() => {
          const details = panel.querySelector(".nb-event-morph-details");
          const box = details?.getBoundingClientRect();
          return details && box && { top: box.top, bottom: box.bottom, height: box.height, scrollHeight: details.scrollHeight, offsetTop: details.offsetTop };
        })(),
        material: box && { top: box.top, bottom: box.bottom },
        control: controlBox && { top: controlBox.top, bottom: controlBox.bottom },
      };
    });
    expect(containment.scrollOverflowY, "the expanded Event must own an internal vertical scroller when content exceeds its available visual height").toMatch(/auto|scroll/);
    expect(containment.material).not.toBeNull();
    expect(containment.control).not.toBeNull();
    expect(containment.control.top, "a scrolled Inspector control must not escape above the Event material").toBeGreaterThanOrEqual(containment.material.top - 1);
    expect(containment.control.bottom, "a scrolled Inspector control must remain inside the Event material's bottom edge").toBeLessThanOrEqual(containment.material.bottom + 1);
  });

  test("a physical Event suppresses only its own direct timeline JOIN control", async ({ page }) => {
    const today = keyOf(new Date());
    const meetingUrl = "https://meet.example.test/physical-morph";
    const state = createEvent(createBlankPlannerState({}), {
      calendarId: "calendar-default",
      title: "Physical linked meeting",
      category: "PEOPLE",
      link: meetingUrl,
      timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${today}T10:00`, endLocal: `${today}T11:00` },
    }, { id: "evt-physical-linked" }).state;
    await seedPlanner(page, state);

    const source = page.locator('[data-event-id="evt-physical-linked"] [data-morph-key]');
    const sourceJoin = page.locator('[data-join="evt-physical-linked"]');
    await expect(sourceJoin).toBeVisible();
    await source.click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-event-inspector-surface", "morph");
    await expect(sourceJoin, "the source-only JOIN lane must not peek beside the expanded Event").toHaveCSS("opacity", "0");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
    await expect(sourceJoin, "the direct JOIN control must restore when its Event source regains paint").toHaveCSS("opacity", "1");
  });

  test("an Event can expand and collapse forty times without leaving a carrier or source paint behind", async ({ page }) => {
    // The carrier now uses the reference's longer 440ms expansion beat;
    // preserve the forty-cycle leak check without racing the test's own wall clock.
    test.setTimeout(100_000);
    await openPlanner(page);
    await quickAdd(page, "Forty Event morph cycles today 10am 60m");
    const source = page.locator('[data-event-id]').filter({ hasText: "Forty Event morph cycles" }).locator('[data-morph-key]');
    const sourceOpacity = () => source.evaluate((node) => Number(getComputedStyle(node).opacity));

    for (let cycle = 0; cycle < 40; cycle += 1) {
      await source.click();
      const sheet = page.getByTestId("sheet");
      await expect(sheet, `cycle ${cycle + 1} must finish opening its in-place carrier`).toHaveAttribute("data-morph-presentation", "open");
      await sheet.getByRole("button", { name: "Collapse event" }).click();
      await expect(sheet, `cycle ${cycle + 1} must settle the returning carrier`).toHaveCount(0, { timeout: 3000 });
    }

    await expect(page.locator("[data-morph-overlay]"), "a completed cycle must not strand an overlay").toHaveCount(0);
    await expect.poll(sourceOpacity, { message: "the source must own its paint again after the fortieth close" }).toBeGreaterThan(.1);
  });

  test("an expanded Event keeps logical timeline geometry fixed while its visual lens yields below", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Lens source today 9am 60m");
    await quickAdd(page, "Lens below today 12pm 60m");

    const source = page.locator('[data-event-id]').filter({ hasText: "Lens source" }).locator('[data-morph-key]');
    const below = page.locator('[data-event-id]').filter({ hasText: "Lens below" });
    const timeline = page.getByTestId("day-stream");
    await source.scrollIntoViewIfNeeded();
    const before = {
      source: await source.boundingBox(),
      below: await below.boundingBox(),
      belowOffsetTop: await below.evaluate((node) => node.offsetTop),
      scrollHeight: await timeline.evaluate((node) => node.scrollHeight),
    };

    await source.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-presentation", "open");
    await expect.poll(async () => Number.parseFloat(await below.evaluate((node) => (
      getComputedStyle(node).getPropertyValue("--event-timeline-lens-y")
    )))).toBeGreaterThan(0);

    const after = {
      sheet: await sheet.boundingBox(),
      source: await source.boundingBox(),
      below: await below.boundingBox(),
      belowOffsetTop: await below.evaluate((node) => node.offsetTop),
      scrollHeight: await timeline.evaluate((node) => node.scrollHeight),
    };
    expect(Math.abs(after.sheet.y - after.source.y), "the expanded Event must keep its live semantic source top").toBeLessThanOrEqual(1);
    expect(after.below.y, "timeline paint below the Event must visibly yield").toBeGreaterThan(before.below.y + 8);
    expect(after.belowOffsetTop, "the lens must not alter the Event's logical layout top").toBe(before.belowOffsetTop);
    expect(after.scrollHeight, "the lens must not alter timeline scroll geometry").toBe(before.scrollHeight);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
    await expect.poll(async () => (await below.boundingBox())?.y).toBeCloseTo(before.below.y, 0);
  });

  test("a Week Event stays inside the timeline plane while the visual lens leaves logical lanes alone", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Week lens source today 9am 60m");
    await quickAdd(page, "Week lens below today 12pm 60m");
    await page.getByTestId("zoom-out").click();

    const source = page.getByTestId("week-event").filter({ hasText: "Week lens source" });
    const sourceLane = source.locator("xpath=..");
    const belowLane = page.getByTestId("week-event").filter({ hasText: "Week lens below" }).locator("xpath=..");
    const plane = page.locator("[data-event-timeline-lens-plane]");
    const before = {
      source: await source.boundingBox(),
      below: await belowLane.boundingBox(),
      belowOffsetTop: await belowLane.evaluate((node) => node.offsetTop),
      planeHeight: await plane.evaluate((node) => node.offsetHeight),
    };

    await source.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-presentation", "open");
    await expect.poll(async () => Number.parseFloat(await belowLane.evaluate((node) => (
      getComputedStyle(node).getPropertyValue("--event-timeline-lens-y")
    )))).toBeGreaterThan(0);

    const after = {
      sheet: await sheet.boundingBox(),
      source: await source.boundingBox(),
      below: await belowLane.boundingBox(),
      belowOffsetTop: await belowLane.evaluate((node) => node.offsetTop),
      planeHeight: await plane.evaluate((node) => node.offsetHeight),
      plane: await plane.boundingBox(),
    };
    expect(Math.abs(after.sheet.y - after.source.y), "the Week Event must retain its source top").toBeLessThanOrEqual(1);
    expect(after.sheet.x, "the expanded Event must remain inside the timeline plane").toBeGreaterThanOrEqual(after.plane.x - 1);
    expect(after.sheet.x + after.sheet.width, "the expanded Event must not cover the Actions rail").toBeLessThanOrEqual(after.plane.x + after.plane.width + 1);
    expect(after.source.x, "the source card must remain inside its expanded carrier").toBeGreaterThanOrEqual(after.sheet.x - 1);
    expect(after.source.x + after.source.width, "the source card must remain inside its expanded carrier").toBeLessThanOrEqual(after.sheet.x + after.sheet.width + 1);
    expect(after.below.y, "Week content below the source must visibly yield").toBeGreaterThan(before.below.y + 8);
    expect(after.belowOffsetTop, "the Week lens must not alter logical card top").toBe(before.belowOffsetTop);
    expect(after.planeHeight, "the Week lens must not alter logical timeline height").toBe(before.planeHeight);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("an Inspector disclosure grows its carrier and visual lens without clipping the Event", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1600 });
    await openPlanner(page);
    await quickAdd(page, "Disclosure lens source today 1am 60m");
    const timeline = page.getByTestId("day-stream");
    await timeline.evaluate((node) => { node.scrollTop = 0; });

    const source = page.locator('[data-event-id]').filter({ hasText: "Disclosure lens source" }).locator('[data-morph-key]');
    const below = page.locator('[data-event-timeline-lens-target="hour"]').nth(4);
    await source.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-presentation", "open");
    await expect(sheet).toHaveClass(/nb-sheet-h/);
    /* The initial measurement intentionally settles before height interpolation
       is armed. Start this disclosure assertion from that resting carrier,
       rather than treating the opening-size handoff as a field expansion. */
    await page.waitForTimeout(360);
    const before = {
      height: (await sheet.boundingBox()).height,
      lens: Number.parseFloat(await below.evaluate((node) => getComputedStyle(node).getPropertyValue("--event-timeline-lens-y"))),
      scrollHeight: await timeline.evaluate((node) => node.scrollHeight),
    };

    await sheet.getByText("Does not repeat", { exact: true }).click();
    await expect(sheet.getByText("DAILY", { exact: true })).toBeVisible();
    await expect.poll(async () => (await sheet.boundingBox()).height).toBeGreaterThan(before.height + 8);
    await expect.poll(async () => Number.parseFloat(await below.evaluate((node) => (
      getComputedStyle(node).getPropertyValue("--event-timeline-lens-y")
    )))).toBeGreaterThan(before.lens + 8);
    expect(await timeline.evaluate((node) => node.scrollHeight), "disclosure expansion must remain presentation-only").toBe(before.scrollHeight);

    await sheet.getByText("DAILY", { exact: true }).click();
    await expect(sheet.getByText("DAILY", { exact: true })).toBeHidden();
    await expect.poll(async () => (await sheet.boundingBox()).height).toBeLessThanOrEqual(before.height + 1);
    await expect.poll(async () => Number.parseFloat(await below.evaluate((node) => (
      getComputedStyle(node).getPropertyValue("--event-timeline-lens-y")
    )))).toBeLessThanOrEqual(before.lens + 1);

    /* Choosing a repeat rule deliberately makes the real Inspector dirty.
       Revert that local draft before closing so this visual contract leaves no
       confirmation surface or planner data behind. */
    await sheet.getByRole("button", { name: "REVERT" }).click();
    await expect(sheet.getByText("Does not repeat", { exact: true })).toBeVisible();

    /* Alerts are a separate expanding field. Opening and closing it without
       picking an option must still resize the same physical carrier and lens;
       this guards against a Repeat-only measurement path. */
    const alertBaseline = {
      height: (await sheet.boundingBox()).height,
      lens: Number.parseFloat(await below.evaluate((node) => (
        getComputedStyle(node).getPropertyValue("--event-timeline-lens-y")
      ))),
    };
    await sheet.getByText("No reminder", { exact: true }).click();
    await expect(sheet.getByText("15M", { exact: true })).toBeVisible();
    await expect.poll(async () => (await sheet.boundingBox()).height).toBeGreaterThan(alertBaseline.height + 8);
    await expect.poll(async () => Number.parseFloat(await below.evaluate((node) => (
      getComputedStyle(node).getPropertyValue("--event-timeline-lens-y")
    )))).toBeGreaterThan(alertBaseline.lens + 8);
    await sheet.getByText("No reminder", { exact: true }).click();
    await expect(sheet.getByText("15M", { exact: true })).toBeHidden();
    await expect.poll(async () => (await sheet.boundingBox()).height).toBeLessThanOrEqual(alertBaseline.height + 1);
    await expect.poll(async () => Number.parseFloat(await below.evaluate((node) => (
      getComputedStyle(node).getPropertyValue("--event-timeline-lens-y")
    )))).toBeLessThanOrEqual(alertBaseline.lens + 1);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("Week keyboard activation opens exactly one Inspector without reviving pointer ownership", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Keyboard source today 10am 60m");
    await page.getByTestId("zoom-out").click();
    const card = page.getByTestId("week-event").filter({ hasText: "Keyboard source" });

    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("sheet")).toHaveCount(1);
    await expect(page.locator("[data-morph-overlay]")).toHaveCount(0);
    await expect(page.getByTestId("sheet")).toHaveAttribute("data-event-inspector-surface", "instant");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).toHaveCount(0);

    await card.focus();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("sheet")).toHaveCount(1);
    await expect(page.locator("[data-morph-overlay]")).toHaveCount(0);
  });

  test("a delayed Week open is cancelled by Escape and superseded by the latest Event", async ({ page }) => {
    const dateKey = keyOf(new Date());
    const weekStart = addDaysToKey(dateKey, -new Date(`${dateKey}T12:00:00`).getDay());
    const entries = [
      { id: "evt-pending-alpha", title: "Pending Alpha", date: addDaysToKey(weekStart, 1) },
      { id: "evt-pending-beta", title: "Pending Beta", date: addDaysToKey(weekStart, 2) },
    ];
    let state = createBlankPlannerState({});
    for (const entry of entries) {
      ({ state } = createEvent(state, {
        calendarId: "calendar-default",
        title: entry.title,
        category: "PERSONAL",
        timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${entry.date}T10:00`, endLocal: `${entry.date}T11:00` },
      }, { id: entry.id }));
    }

    await seedPlanner(page, state);
    await page.getByTestId("zoom-out").click();
    const alpha = page.getByTestId("week-event").filter({ hasText: "Pending Alpha" });

    await alpha.click({ noWaitAfter: true });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    await expect(page.getByTestId("sheet")).toHaveCount(0);

    await page.evaluate(() => {
      const fireTap = (node) => {
        const rect = node.getBoundingClientRect();
        const init = { bubbles: true, button: 0, pointerType: "mouse", clientX: rect.left + 4, clientY: rect.top + 4 };
        node.dispatchEvent(new PointerEvent("pointerdown", init));
        node.dispatchEvent(new PointerEvent("pointerup", init));
      };
      const alphaNode = [...document.querySelectorAll('[data-test="week-event"]')]
        .find((node) => node.textContent.includes("Pending Alpha"));
      const betaNode = [...document.querySelectorAll('[data-test="week-event"]')]
        .find((node) => node.textContent.includes("Pending Beta"));
      fireTap(alphaNode);
      fireTap(betaNode);
    });
    const sheet = page.getByTestId("sheet");
    const title = sheet.getByLabel("Event title");
    await expect(title).toHaveValue("Pending Beta");
    await page.waitForTimeout(120);
    await expect(sheet).toHaveCount(1);
    await expect(title).not.toHaveValue("Pending Alpha");
  });

  test("each recurring Week segment owns a dated source key and returns to the card that opened Inspector", async ({ page }) => {
    const startDate = addDaysToKey(keyOf(new Date()), -30);
    const { state } = createEvent(createBlankPlannerState({}), {
      calendarId: "calendar-default",
      title: "Dated recurring source",
      category: "DEEP WORK",
      timing: {
        kind: "timed", timeZoneMode: "floating",
        startLocal: `${startDate}T10:00`, endLocal: `${startDate}T10:30`,
      },
      recurrence: { frequency: "daily", interval: 1, weekStart: 0, missingDatePolicy: "skip" },
    }, { id: "evt-dated-recurring-source" });

    await seedPlanner(page, state);
    await page.getByTestId("zoom-out").click();
    const cards = page.getByTestId("week-event").filter({ hasText: "Dated recurring source" });
    await expect(cards).toHaveCount(7);
    const keys = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-morph-key")));
    expect(new Set(keys).size, "each rendered recurring segment must own its registry slot").toBe(7);
    expect(keys.every((key) => /:occ:.*:d:\d{4}-\d{2}-\d{2}:v:week:l:timeline$/.test(key))).toBe(true);

    const source = cards.first();
    const sibling = cards.nth(1);
    const sourceOpacity = () => source.evaluate((node) => Number(getComputedStyle(node).opacity));
    const siblingOpacity = () => sibling.evaluate((node) => Number(getComputedStyle(node).opacity));
    const baselineOpacity = await sourceOpacity();
    const siblingBaselineOpacity = await siblingOpacity();
    await source.click();
    await expect(page.locator("[data-morph-overlay]")).toBeVisible();
    await expect.poll(sourceOpacity, { message: "the selected recurring segment must transfer paint to the overlay" }).toBeLessThanOrEqual(.01);
    await expect.poll(async () => Math.abs(await siblingOpacity() - siblingBaselineOpacity), {
      message: "a sibling occurrence must remain painted while the selected semantic source morphs",
    }).toBeLessThan(.02);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-motion-state]")).toHaveAttribute("data-motion-state", "idle");
    await expect.poll(async () => Math.abs(await sourceOpacity() - baselineOpacity), {
      message: "closing must restore the exact recurring Week segment that opened Inspector",
      timeout: 3000,
    }).toBeLessThan(.02);
  });

  test("Day and Week all-day Events expand in place from their physical source rows", async ({ page }) => {
    const dateKey = keyOf(new Date());
    const { state } = createEvent(createBlankPlannerState({}), {
      calendarId: "calendar-default",
      title: "All-day source identity",
      category: "PERSONAL",
      timing: {
        kind: "all-day",
        startDate: dateKey,
        endDateExclusive: addDaysToKey(dateKey, 1),
      },
    }, { id: "evt-all-day-source" });

    await seedPlanner(page, state);
    const dayCard = page.locator("[data-morph-key]").filter({ hasText: "All-day source identity" });
    await expect(dayCard).toHaveAttribute("data-morph-key", /:v:day:l:allday$/);
    const daySource = await dayCard.boundingBox();
    await dayCard.click();
    await expect(page.locator("[data-morph-overlay]")).toBeVisible();
    const daySheet = page.getByTestId("sheet");
    await expect(daySheet).toHaveAttribute("data-morph-presentation", "open");
    const dayDestination = await daySheet.boundingBox();
    expect(Math.abs(dayDestination.y - daySource.y), "a Day all-day Event must retain its source row").toBeLessThanOrEqual(1);
    expect(Math.abs(dayDestination.x - daySource.x), "a wide all-day row must not travel horizontally").toBeLessThanOrEqual(1);
    await daySheet.getByRole("button", { name: "Collapse event" }).click();
    await expect(page.getByTestId("sheet")).toHaveCount(0);

    await page.getByTestId("zoom-out").click();
    const weekCard = page.getByTestId("week-allday-event").filter({ hasText: "All-day source identity" });
    await expect(weekCard).toHaveAttribute("data-morph-key", /:v:week:l:allday$/);
    const weekSource = await weekCard.boundingBox();
    const weekPlane = page.locator("[data-event-timeline-lens-plane]");
    await weekCard.click();
    await expect(page.locator("[data-morph-overlay]")).toBeVisible();
    const weekSheet = page.getByTestId("sheet");
    await expect(weekSheet).toHaveAttribute("data-morph-presentation", "open");
    const weekDestination = await weekSheet.boundingBox();
    const weekPlaneBox = await weekPlane.boundingBox();
    expect(Math.abs(weekDestination.y - weekSource.y), "a Week all-day Event must retain its source row").toBeLessThanOrEqual(1);
    expect(weekDestination.x, "a Week all-day Event must remain inside the timeline plane").toBeGreaterThanOrEqual(weekPlaneBox.x - 1);
    expect(weekDestination.x + weekDestination.width, "a Week all-day Event must not cover the Actions rail").toBeLessThanOrEqual(weekPlaneBox.x + weekPlaneBox.width + 1);
    expect(weekSource.x, "the all-day source must remain inside its expanded carrier").toBeGreaterThanOrEqual(weekDestination.x - 1);
    expect(weekSource.x + weekSource.width, "the all-day source must remain inside its expanded carrier").toBeLessThanOrEqual(weekDestination.x + weekDestination.width + 1);
  });

  test("Event Edit reconfigures the expanded surface without remounting its object", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Phase 8 same object today 10am 60m");

    const source = page.locator('[data-event-id]').filter({ hasText: "Phase 8 same object" }).locator('[data-morph-key]');
    await source.click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-event-inspector-surface", "morph");
    await expect(sheet).toHaveAttribute("data-event-inspector-mode", "read");
    await expect(sheet).toHaveAttribute("data-morph-presentation", "open");

    const before = await sheet.evaluate((node) => {
      window.__phase8SheetNode = node;
      window.__phase8OverlayNode = document.querySelector("[data-morph-overlay]");
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top };
    });

    await sheet.getByRole("button", { name: "EDIT EVENT" }).click();
    await expect(sheet).toHaveAttribute("data-event-inspector-mode", "edit");
    await expect(page.getByTestId("sheet")).toHaveCount(1);
    await expect(page.locator("[data-motion-state]")).toHaveAttribute("data-motion-state", "open");
    await expect(sheet).toHaveAttribute("data-morph-presentation", "open");
    await expect(sheet.getByRole("button", { name: "DONE" })).toBeVisible();

    const duringEdit = await page.evaluate(() => {
      const sheetNode = document.querySelector('[data-test="sheet"]');
      const box = sheetNode?.getBoundingClientRect();
      return {
        sameSheet: window.__phase8SheetNode === sheetNode,
        sameOverlay: window.__phase8OverlayNode === document.querySelector("[data-morph-overlay]"),
        left: box?.left,
        top: box?.top,
      };
    });
    expect(duringEdit.sameSheet, "Edit must reconfigure the existing Inspector node").toBe(true);
    expect(duringEdit.sameOverlay, "Edit must not replace the physical Event carrier").toBe(true);
    expect(Math.abs(duringEdit.left - before.left), "Edit must retain the Event's horizontal anchor").toBeLessThanOrEqual(1);
    expect(Math.abs(duringEdit.top - before.top), "Edit must retain the Event's spatial anchor").toBeLessThanOrEqual(1);

    const title = sheet.getByRole("textbox", { name: "Event title" });
    await title.fill("Phase 8 edited title");
    await title.press("Tab");
    await expect(sheet.getByRole("button", { name: "REVERT" })).toBeVisible();
    await sheet.getByRole("button", { name: "REVERT" }).click();
    await expect(sheet).toHaveAttribute("data-event-inspector-mode", "read");
    await expect(title).toHaveValue("Phase 8 same object");
    expect(await page.evaluate(() => window.__phase8SheetNode === document.querySelector('[data-test="sheet"]')))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });
});

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

  test("a pointer-selected view gets a quiet handoff while a keyboard-selected view stays immediate", async ({ page }) => {
    await openPlanner(page);
    const main = page.locator("main.nb-main");

    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await expect(main).toHaveClass(/nb-view-enter-[ab]/);

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "ACTIONS", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(main).not.toHaveClass(/nb-view-enter/);

    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await expect(main).toHaveClass(/nb-view-enter-[ab]/);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("Day view");
    await page.getByText("Day view", { exact: true }).click();
    await expect(page.getByRole("tab", { name: "TIMELINE", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(main).not.toHaveClass(/nb-view-enter/);
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
  test("characterizes the production surface, source handoff, and destination handoff", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlanner(page);
    await page.getByTestId("new-entry").click();

    const frames = await sampleNotchFrames(page.getByTestId("sheet"), [0, .2, .4, .6, .8, 1]);
    expect(frames, "the production notch must expose a running nbnotchin animation").not.toBeNull();
    const [zero, twenty, forty, sixty, eighty, end] = frames;

    /* The surface must travel from the first fifth. v2 deliberately held its
       transform until the radius handoff, so this is expected to be RED on the
       baseline and becomes the guard against recreating that split choreography. */
    expect.soft(Math.abs(twenty.panelTransform.x), "panel X translation must progress by 20%")
      .toBeLessThan(Math.abs(zero.panelTransform.x) * .9);
    expect.soft(Math.abs(twenty.panelTransform.y), "panel Y translation must progress by 20%")
      .toBeLessThan(Math.abs(zero.panelTransform.y) * .9);

    /* The source identity must visibly leave in the reference's lateral
       direction, not only disappear through opacity. */
    expect.soft(forty.sourceTransform.x, "source identity must travel left by 40%").toBeLessThan(-8);
    expect.soft(forty.sourceOpacity, "source identity must soften during its departure").toBeLessThan(.9);
    expect.soft(sixty.sourceOpacity, "source identity must be gone before the settle").toBeLessThanOrEqual(.1);

    /* The real Composer body is the destination plane. At 40% it should still
       be arriving from the right; by 65% it should be effectively settled. */
    expect.soft(forty.bodyTransform.x, "destination body must enter from the right").toBeGreaterThanOrEqual(8);
    expect.soft(forty.bodyOpacity, "destination body must not be fully present at 40%")
      .toBeGreaterThan(.1);
    expect.soft(forty.bodyOpacity, "destination body must not win before its handoff")
      .toBeLessThan(.95);
    expect.soft(Math.abs(sixty.bodyTransform.x), "destination body must settle by 60%").toBeLessThanOrEqual(2);
    expect.soft(sixty.bodyOpacity, "destination body must be readable by 60%").toBeGreaterThanOrEqual(.95);
    expect.soft(Math.abs(end.bodyTransform.x), "destination body must be at rest at 100%").toBeLessThanOrEqual(0.01);
    expect.soft(end.bodyOpacity).toBeGreaterThanOrEqual(.99);
    expect.soft(end.bodyFilter, "destination body must have no filter at rest").toMatch(/none|blur\(0(px)?\)/);
    /* Frame scrubbing intentionally holds the stage machine at "source"; the
       settled cleanup is a separate, wall-clock contract. Verify it after the
       production stage reaches open so this cannot accidentally bless a filled
       animation value as the resting state. */
    const settledSource = page.getByTestId("sheet").locator('[data-test="morph-source-label"]');
    await expect(page.getByTestId("sheet")).toHaveAttribute("data-morph-stage", "open");
    const settledSourceStyle = await settledSource.evaluate((node) => {
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), transform: style.transform, filter: style.filter };
    });
    expect(settledSourceStyle.opacity, "source identity must remain hidden at rest").toBeLessThanOrEqual(.01);
    expect(settledSourceStyle.transform, "source identity must clear its transient transform at rest")
      .toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    expect(settledSourceStyle.filter, "source identity must not retain a blur at rest").toMatch(/none|blur\(0(px)?\)/);

    const rest = await readHandoffRestState(page.getByTestId("sheet"));
    expect(rest.body.willChange, "settled Composer body must release its compositor hint").toBe("auto");
    expect(rest.source.willChange, "settled source clone must release its compositor hint").toBe("auto");
    expect(rest.cascade, "settled notch cascade descendants must release clip-path hints").not.toContain("clip-path");
    expect(rest.cascade.every((value) => value === "auto"), "settled notch cascade descendants must be idle").toBe(true);

    /* Richer handoff motion must never alter the true-size layout box or the
       scrollable form geometry. */
    const width = zero.panelOffsetWidth;
    const height = zero.panelOffsetHeight;
    const scrollHeight = zero.bodyScrollHeight;
    for (const frame of frames) {
      expect.soft(frame.panelOffsetWidth, `Sheet width changed at ${frame.fraction * 100}%`).toBe(width);
      expect.soft(frame.panelOffsetHeight, `Sheet height changed at ${frame.fraction * 100}%`).toBe(height);
      expect.soft(Math.abs(frame.bodyScrollHeight - scrollHeight), `body scrollHeight changed at ${frame.fraction * 100}%`).toBeLessThanOrEqual(1);
      expect.soft(frame.panelOverflowX, `horizontal scrolling stayed exposed at ${frame.fraction * 100}%`)
        .not.toMatch(/auto|scroll/);
    }
  });

  test("creation carries the trigger material until the composer content can arrive", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const trigger = page.getByTestId("new-action");
    const accent = await trigger.evaluate((node) => getComputedStyle(node).backgroundColor);
    await trigger.click();

    const sheet = page.getByTestId("sheet");
    /* Pause first, scrub second. An unpaused entry animation finishes on the wall
       clock while the probe is still in flight, and a finished animation is a
       removed animation — which is how the previous draft of this test both
       crashed and passed for the wrong reason on the same machine. */
    const opening = await sheet.evaluate((node) => {
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 0;
      }
      return {
        panel: Number(getComputedStyle(node).opacity),
        source: Number(getComputedStyle(node.querySelector('[data-test="morph-source-label"]')).opacity),
        fill: getComputedStyle(node).backgroundColor,
      };
    });
    expect(opening.panel, "the real sheet owns the trigger's material").toBeGreaterThanOrEqual(.99);
    expect(opening.source, "the trigger label must be visible while the sheet opens").toBeGreaterThanOrEqual(.99);
    expect(opening.fill, "the first frame is the trigger, repainted at sheet size").toBe(accent);

    const sample = await sheet.evaluate((node) => {
      const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
      if (!entry?.effect) return null;
      const morphMs = Number(entry.effect.getTiming().duration);
      /* One clock for every animation, not each one scaled by its own duration.
         The staggered groups are shorter than the shape and start on a delay, so
         dividing each by its own length sampled seven different moments and called
         them one frame — which is how a cascade that overlapped the wash for half
         its run read as "content has not started yet". */
      const at = (fraction) => {
        for (const animation of node.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = morphMs * fraction;
        }
        /* Groups are uncovered now, so "arrived" is a clip question, not an opacity
           one: a group still carrying the 100% edge of its wipe has not begun. */
        const groups = node.getAnimations({ subtree: true })
          .filter((animation) => animation.animationName === "nbnotchgroupin")
          .map((animation) => getComputedStyle(animation.effect.target).clipPath);
        return {
          source: Number(getComputedStyle(node.querySelector('[data-test="morph-source-label"]')).opacity),
          body: Number(getComputedStyle(node.querySelector(".nb-notch-body")).opacity),
          groups: groups.length,
          started: groups.filter((clip) => clip === "none" || !clip.includes("100%")).length,
          fill: getComputedStyle(node).backgroundColor,
        };
      };
      return { early: at(0.1), quarter: at(0.25), mid: at(0.4), end: at(1) };
    });

    expect(sample, "the notch entry animation must still be running").not.toBeNull();
    expect(sample.early.fill, "the window is still the trigger's own paint while it has nowhere to land").toBe(accent);
    expect(sample.early.source, "the trigger's label is the material it carries out").toBeGreaterThanOrEqual(.9);
    /* The body plane starts after the surface has begun its move, so the source
       remains the only readable identity during the first quarter. */
    expect(sample.quarter.body, "destination content must wait for the handoff").toBeLessThan(.95);
    expect(sample.quarter.started, "the legacy cascade must not create a second arrival path").toBe(0);
    /* The wash finishes becoming the card before the body plane is readable. */
    expect(sample.mid.fill, "the surface has become the sheet's own before content lands on it").not.toBe(accent);
    expect(sample.end.groups, "notch entry uses one destination plane, not eight arrivals").toBe(0);
  });

  test("the notch lands on the composer's own surface", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    const accent = await trigger.evaluate((node) => getComputedStyle(node).backgroundColor);
    await trigger.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-stage", "open");
    const settled = await sheet.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(settled, "a settled composer is not an accent slab").not.toBe(accent);
    await expect(sheet.getByTestId("morph-source-label")).toHaveCSS("opacity", "0");
  });

  test("the in-app reduced-motion preference also skips the morph staging", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Reduce motion" }).click();
    await page.getByRole("button", { name: "DONE" }).click();
    await expect(page.getByTestId("sheet")).toHaveCount(0, { timeout: 3000 });

    await page.getByTestId("new-entry").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-stage", "open");
    await expect(sheet.getByTestId("morph-source-label")).toHaveCSS("opacity", "0");
    const rest = await readHandoffRestState(sheet);
    expect(rest.body.animations).not.toContain("nbnotchbodyin");
    expect(rest.body.opacity).toBeGreaterThanOrEqual(.99);
    expect(rest.body.transform).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    expect(rest.body.filter).toMatch(/none|blur\(0(px)?\)/);
    expect(rest.body.willChange).toBe("auto");
    expect(rest.source.opacity).toBeLessThanOrEqual(.01);
    expect(rest.source.transform).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    expect(rest.source.filter).toMatch(/none|blur\(0(px)?\)/);
    expect(rest.source.willChange).toBe("auto");
    expect(rest.cascade.every((value) => value === "auto")).toBe(true);
  });

  test("NEW grows the composer out of the button, and folds it back", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet, "the composer should morph as a notch from NEW").toHaveAttribute("data-fluid-origin", "notch");
    /* The body remains part of the material instead of cross-fading over it. */
    await expect(sheet.locator(".nb-notch-body")).toBeVisible();

    await page.keyboard.press("Escape");
    /* The exit animation is longer than the ordinary one, and the sheet has to
       actually go away at the end of it rather than linger. */
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("the mobile create button morphs the same way", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const trigger = page.getByTestId("new-action");
    const source = await trigger.boundingBox();
    await trigger.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");
    await expect(sheet).toHaveAttribute("data-morph-source", "new-action");
    await expect(sheet).toHaveAttribute("data-morph-anchor-x", "right");
    await expect(sheet).toHaveAttribute("data-morph-anchor-y", "bottom");
    await expect(sheet.getByTestId("morph-source-label")).toHaveText("+ ACTION");
    await expect(sheet.getByTestId("notch-surface")).toHaveCount(0);
    await expect(page.getByTestId("new-action")).toHaveCSS("visibility", "hidden");
    await expect(page.getByTestId("composer")).toHaveAttribute("data-composer-kind", "task");

    const start = await sheet.evaluate((node) => {
      const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
      entry?.pause();
      if (entry) entry.currentTime = 0;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(style.transform);
      const clip = style.clipPath.match(/^inset\(([^)]*)\)/);
      const insetText = clip ? clip[1].split(/\s+round\b/)[0] : "0px 0px 0px 0px";
      const [top, right, bottom, left] = insetText
        .trim().split(/\s+/).map((value) => Number.parseFloat(value) || 0);
      return {
        left: rect.left + left,
        top: rect.top + top,
        width: rect.width - left - right,
        height: rect.height - top - bottom,
        transformX: matrix.e,
        transformY: matrix.f,
      };
    });
    expect(Math.abs(start.left - source.x)).toBeLessThan(2);
    expect(Math.abs(start.top - source.y)).toBeLessThan(2);
    expect(Math.abs(start.width - source.width)).toBeLessThan(2);
    expect(Math.abs(start.height - source.height)).toBeLessThan(2);
  });

  test("NEW morphs the sheet material itself before the composer content arrives", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    await trigger.click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-source", "new-entry");
    await expect(sheet.getByTestId("morph-source-label")).toHaveText("NEW");
    await expect(sheet.getByTestId("notch-surface")).toHaveCount(0);
    await expect(trigger).toHaveCSS("visibility", "hidden");

    /* V3 intentionally replaces the old eight-group notch cascade with one
       destination-plane handoff. The Composer markup remains unchanged; only
       its entry choreography is owned by `.nb-notch-body`. */
    const transitions = await sheet.evaluate((node) => {
      const groups = node.getAnimations({ subtree: true })
        .filter((animation) => animation.animationName === "nbnotchgroupin");
      const body = node.getAnimations({ subtree: true })
        .filter((animation) => animation.animationName === "nbnotchbodyin");
      /* Read production timing rather than hardcoding it, so the bound still means
         "inside the shape" if the reference cadence is retuned. */
      const morphMs = parseFloat(getComputedStyle(node).getPropertyValue("--nb-morph-dur"));
      const bodyTiming = body.map((animation) => {
        const timing = animation.effect.getTiming();
        return Math.round(Number(timing.delay) + Number(timing.duration));
      });
      return {
        panel: getComputedStyle(node).transitionProperty,
        morphMs,
        groupCount: groups.length,
        bodyCount: body.length,
        bodyLastArrival: bodyTiming.length ? Math.max(...bodyTiming) : null,
        bodyProps: [...new Set(body.flatMap((animation) => (
          animation.effect.getKeyframes().flatMap((frame) => Object.keys(frame))
        )))],
      };
    });
    expect(transitions.panel, "the shared panel must transition from the trigger accent to its own surface").toContain("background-color");
    expect(transitions.groupCount, "notch entry must not create eight independent arrivals").toBe(0);
    expect(transitions.bodyCount, "the Composer must enter as one destination plane").toBe(1);
    expect(transitions.bodyProps).toEqual(expect.arrayContaining(["opacity", "transform", "filter"]));
    expect(transitions.bodyLastArrival,
      "destination content must finish arriving inside the primary morph").toBeLessThanOrEqual(transitions.morphMs);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
    await expect(trigger).toHaveCSS("visibility", "visible");
  });

  /* The regression this suite could not see, written from the shipped bug.
     Every probe here drives the morph with an explicit currentTime, so all of them
     answer "what does frame N look like" and none of them answered "what if there
     is no frame N". A running animation outranks the inline background whether or
     not its clock advances, so a stalled one pinned the sheet to its 0% keyframe —
     a composer stuck solid accent, with the correct colour sitting unused in the
     style attribute. Pausing at zero is exactly what a throttled tab does. */
  test("a morph whose clock never advances still settles on the right surface", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    const accent = await trigger.evaluate((node) => getComputedStyle(node).backgroundColor);
    await trigger.click();

    const sheet = page.getByTestId("sheet");
    await sheet.evaluate((node) => {
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 0;
      }
    });
    /* The stage machine is on setTimeout, so it arrives even when nothing is
       painting. That is the whole reason it can be trusted to end the morph. */
    await expect(sheet).toHaveAttribute("data-morph-stage", "open");

    const settled = await sheet.evaluate((node) => ({
      fill: getComputedStyle(node).backgroundColor,
      card: getComputedStyle(node).getPropertyValue("--morph-card").trim(),
      clipped: [...node.querySelectorAll(".nb-notch-cascade > *")]
        .filter((el) => getComputedStyle(el).clipPath.includes("100%")).length,
    }));

    expect(settled.fill, "a stalled wash must not leave the sheet painted as its trigger").not.toBe(accent);
    expect(settled.clipped, "a stalled cascade must not leave the form clipped away").toBe(0);
  });

  test("a stalled Composer body is repaired when the wall-clock stage opens", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const sheet = page.getByTestId("sheet");
    const stalled = await sheet.evaluate((node) => {
      const bodyAnimation = node.getAnimations({ subtree: true })
        .find((animation) => animation.animationName === "nbnotchbodyin");
      if (!bodyAnimation?.effect) return false;
      bodyAnimation.pause();
      bodyAnimation.currentTime = Number(bodyAnimation.effect.getTiming().duration) * .1;
      return true;
    });
    expect(stalled, "the body handoff must be running before the stall").toBe(true);

    await expect(sheet).toHaveAttribute("data-morph-stage", "open");
    const rest = await readHandoffRestState(sheet);
    expect(rest.body.opacity).toBeGreaterThanOrEqual(.99);
    expect(rest.body.transform).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    expect(rest.body.filter).toMatch(/none|blur\(0(px)?\)/);
    expect(rest.body.animations).not.toContain("nbnotchbodyin");
    expect(rest.source.opacity).toBeLessThanOrEqual(.01);
    expect(rest.source.transform).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    expect(rest.source.filter).toMatch(/none|blur\(0(px)?\)/);
    expect(rest.body.willChange).toBe("auto");
    expect(rest.source.willChange).toBe("auto");
    expect(rest.cascade.every((value) => value === "auto")).toBe(true);
  });

  test("the Composer body holds through its delayed handoff before entering", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const sheet = page.getByTestId("sheet");
    const frames = await sheet.evaluate((node) => {
      const body = node.querySelector(".nb-notch-body");
      const bodyAnimation = node.getAnimations({ subtree: true })
        .find((animation) => animation.animationName === "nbnotchbodyin");
      if (!body || !bodyAnimation?.effect) return null;

      const panelStyle = getComputedStyle(node);
      const morphMs = Number.parseFloat(panelStyle.getPropertyValue("--nb-morph-dur"));
      const handoffMs = Number.parseFloat(panelStyle.getPropertyValue("--nb-morph-handoff"));
      const timing = bodyAnimation.effect.getTiming();
      const delay = Number(timing.delay);
      const duration = Number(timing.duration);
      const matrixValues = (value) => {
        const matrix = new DOMMatrixReadOnly(value === "none" ? "matrix(1,0,0,1,0,0)" : value);
        return { x: matrix.e, scaleX: matrix.a };
      };
      const readAt = (clock) => {
        for (const animation of node.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = clock;
        }
        const style = getComputedStyle(body);
        return {
          opacity: Number(style.opacity),
          transform: matrixValues(style.transform),
          filter: style.filter,
        };
      };
      const twenty = readAt(morphMs * .2);
      const twentyFive = readAt(morphMs * .25);
      const forty = readAt(morphMs * .4);
      for (const animation of node.getAnimations({ subtree: true })) animation.play();
      return {
        morphMs,
        handoffMs,
        delay,
        duration,
        twenty,
        twentyFive,
        forty,
      };
    });

    expect(frames, "the delayed Composer body animation must be present").not.toBeNull();
    expect(Math.abs(frames.delay - frames.morphMs * .28), "body delay must be 28% of the opening cadence").toBeLessThanOrEqual(1);
    expect(frames.duration, "body handoff must use the handoff token").toBe(frames.handoffMs);

    for (const [label, frame] of [["20%", frames.twenty], ["25%", frames.twentyFive]]) {
      expect(frame.opacity, `body must remain hidden at ${label}`).toBeLessThanOrEqual(.01);
      expect(frame.transform.x, `body must remain translated from the right at ${label}`).toBeGreaterThan(30);
      expect(frame.transform.scaleX, `body must retain its handoff scale at ${label}`).toBeGreaterThanOrEqual(.98);
      expect(frame.transform.scaleX, `body must not be settled at ${label}`).toBeLessThanOrEqual(.99);
      expect(frame.filter, `body must retain its transient blur at ${label}`).toMatch(/blur\(1\.5px\)/);
    }
    expect(frames.forty.opacity, "body must become visible after its delay").toBeGreaterThan(.05);
    expect(frames.forty.transform.x, "body must still be travelling in from the right after its delay").toBeGreaterThan(0);
    expect(frames.forty.transform.x, "body must be closer to rest after its delay").toBeLessThan(36);
    expect(frames.forty.transform.scaleX, "body must be resolving toward identity after its delay").toBeGreaterThan(.985);
    expect(frames.forty.transform.scaleX, "body must not settle before the handoff completes").toBeLessThan(1);
  });

  /* Reported from a phone three times before it was reproduced, because it needs a
     condition a desktop run never produces: the stage machine's setTimeouts not
     firing. Mobile Chrome throttles timers hard — a backgrounded app, battery
     saver, a loaded device — and the sheet's resting colour used to depend on
     them. Where they stalled, the composer stayed a solid accent slab. Every
     other probe in this file drives the morph with an explicit currentTime, so
     all of them ask what frame N looks like and none asked what happens when
     there is no frame N. Neutralising just those three timers is the whole
     reproduction; everything else here is real. */
  test("a stalled stage machine still leaves the composer on its own surface", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    const accent = await trigger.evaluate((node) => getComputedStyle(node).backgroundColor);

    await page.evaluate(() => {
      const real = window.setTimeout.bind(window);
      /* The three stage timers land at 56%, 69% and 100% of the current morph. */
      window.setTimeout = (fn, ms, ...rest) => (ms >= 250 && ms <= 500 ? 0 : real(fn, ms, ...rest));
    });

    await trigger.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-morph-stage", "source");
    await page.waitForTimeout(900);

    const fill = await sheet.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(fill, "a sheet whose stage never advanced must not be left as an accent slab").not.toBe(accent);
  });

  test("an in-flight composer morph reverses from its current geometry", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const sheet = page.getByTestId("sheet");
    await sheet.evaluate((node) => {
      const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
      entry?.pause();
      if (entry?.effect) entry.currentTime = Number(entry.effect.getTiming().duration) / 2;
    });

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveAttribute("data-fluid-reverse", "true");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  for (const fraction of [.25, .5, .75]) {
    test(`Escape reverses a Composer opened ${Math.round(fraction * 100)}%`, async ({ page }) => {
      await openPlanner(page);
      await page.getByTestId("new-entry").click();
      const sheet = page.getByTestId("sheet");
      const opening = await sheet.evaluate((node, progress) => {
        const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
        if (!entry?.effect) return null;
        const clock = Number(entry.effect.getTiming().duration) * progress;
        for (const animation of node.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = clock;
        }
        const read = (element) => {
          const style = getComputedStyle(element);
          const matrix = new DOMMatrixReadOnly(style.transform === "none"
            ? "matrix(1,0,0,1,0,0)"
            : style.transform);
          return { x: matrix.e, y: matrix.f, opacity: Number(style.opacity), filter: style.filter };
        };
        return {
          source: read(node.querySelector(".nb-morph-source-label")),
          body: read(node.querySelector(".nb-notch-body")),
        };
      }, fraction);
      expect(opening).not.toBeNull();

      await page.keyboard.press("Escape");
      await expect(sheet).toHaveAttribute("data-fluid-reverse", "true");
      const firstClosing = await sheet.evaluate((node) => {
        const readAtStart = (element) => {
          const animation = element.getAnimations()[0];
          animation?.pause();
          if (animation) animation.currentTime = 0;
          const style = getComputedStyle(element);
          const matrix = new DOMMatrixReadOnly(style.transform === "none"
            ? "matrix(1,0,0,1,0,0)"
            : style.transform);
          return { x: matrix.e, y: matrix.f, opacity: Number(style.opacity), filter: style.filter };
        };
        return {
          source: readAtStart(node.querySelector(".nb-morph-source-label")),
          body: readAtStart(node.querySelector(".nb-notch-body")),
        };
      });
      for (const key of ["x", "y", "opacity"]) {
        expect(Math.abs(firstClosing.source[key] - opening.source[key]), `source ${key} snapped at ${fraction * 100}%`).toBeLessThan(.5);
        expect(Math.abs(firstClosing.body[key] - opening.body[key]), `body ${key} snapped at ${fraction * 100}%`).toBeLessThan(.5);
      }
      await expect(sheet).toHaveCount(0, { timeout: 3000 });
    });
  }

  test("a backdrop dismissal during entry reverses instead of snapping", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const sheet = page.getByTestId("sheet");
    await sheet.evaluate((node) => {
      const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
      entry?.pause();
      if (entry?.effect) entry.currentTime = Number(entry.effect.getTiming().duration) * .75;
    });
    /* The backdrop guard intentionally ignores the opener's same-tap click. At
       355ms the guard has elapsed while the animation is deliberately held in
       flight, which exercises a real backdrop close without weakening that
       protection. */
    await page.waitForTimeout(355);
    await page.locator(".nb-scrim").first().click({ position: { x: 4, y: 4 } });
    await expect(sheet).toHaveAttribute("data-fluid-reverse", "true");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("a quick close followed by reopen leaves one settled Composer", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    await trigger.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });

    await trigger.click();
    await expect(page.getByTestId("sheet")).toHaveAttribute("data-fluid-origin", "notch");
    await expect(page.getByTestId("sheet")).toHaveCount(1);
  });

  test("an interrupted entry can unmount and reopen with a fresh handoff", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    await trigger.click();
    const sheet = page.getByTestId("sheet");
    await sheet.evaluate((node) => {
      const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
      if (!entry?.effect) return;
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = Number(entry.effect.getTiming().duration) * .45;
      }
    });
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });

    /* Freeze only the freshly mounted handoff channels. This samples the
     * zero-time source frame deterministically rather than racing the first
     * compositor frame after the reopen click. */
    await page.addStyleTag({ content: ".nb-fluid[data-fluid-origin='notch'] .nb-morph-source-label,.nb-fluid[data-fluid-origin='notch'] .nb-notch-body{animation-play-state:paused!important}" });
    await trigger.click();
    const reopened = page.getByTestId("sheet");
    await expect(reopened).toHaveAttribute("data-fluid-origin", "notch");
    await expect(reopened).toHaveAttribute("data-morph-stage", "source");
    const handoff = await reopened.evaluate((node) => ({
      source: getComputedStyle(node.querySelector(".nb-morph-source-label")).transform,
      body: getComputedStyle(node.querySelector(".nb-notch-body")).transform,
      sourceFilter: getComputedStyle(node.querySelector(".nb-morph-source-label")).filter,
      bodyFilter: getComputedStyle(node.querySelector(".nb-notch-body")).filter,
    }));
    expect(handoff.source).toMatch(/matrix\(1, 0, 0, 1, 0, 0\)|none/);
    expect(handoff.body).not.toMatch(/matrix\([^)]*NaN/);
    expect(handoff.sourceFilter).toMatch(/none|blur\(0(px)?\)/);
    expect(handoff.bodyFilter).not.toContain("NaN");
  });

  test("the form leaves before the sheet finishes folding", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("new-entry").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-morph-stage", "open");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");

    /* The destination plane now leaves as one handoff, in lockstep with the
       shrinking surface. Scrub the real fold and body animation together so the
       assertion observes the rendered midpoint rather than a wall-clock guess. */
    const mid = await sheet.evaluate((node) => {
      const fold = node.getAnimations().find((animation) => animation.animationName === "nbnotchout");
      const bodyOut = node.querySelector(".nb-notch-body")?.getAnimations()
        .find((animation) => animation.animationName === "nbnotchbodyout");
      const labelIn = node.querySelector(".nb-morph-source-label")?.getAnimations()
        .find((animation) => animation.animationName === "nbnotchlabelin");
      const scrimOut = node.parentElement?.getAnimations()
        .find((animation) => animation.animationName === "nbscrimout");
      const duration = Number(fold?.effect?.getTiming().duration || 0);
      const delay = Number(fold?.effect?.getTiming().delay || 0)
        || (parseFloat(getComputedStyle(node).animationDelay) || 0) * 1000;
      if (fold) {
        for (const animation of node.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = delay + duration * 0.5;
        }
      }
      return {
        body: Number(getComputedStyle(node.querySelector(".nb-notch-body")).opacity),
        label: Number(getComputedStyle(node.querySelector('[data-test="morph-source-label"]')).opacity),
        foldDelay: delay,
        foldDuration: duration,
        closeDuration: parseFloat(getComputedStyle(node).getPropertyValue("--nb-morph-close")),
        bodyDuration: Number(bodyOut?.effect?.getTiming().duration || 0),
        labelDuration: Number(labelIn?.effect?.getTiming().duration || 0),
        scrimDuration: Number(scrimOut?.effect?.getTiming().duration || 0),
      };
    });

    expect(mid.body, "form groups must be gone while the clip is still folding").toBeLessThan(0.2);
    expect(mid.label, "NEW returns as the visible material of the fold").toBeGreaterThan(0.8);
    expect(mid.foldDuration, "panel fold uses the v3 close token").toBe(mid.closeDuration);
    expect(mid.bodyDuration, "destination plane close uses the v3 close token").toBe(mid.closeDuration);
    expect(mid.labelDuration, "source return uses the v3 close token").toBe(mid.closeDuration);
    expect(mid.scrimDuration, "notch scrim close uses the v3 close token").toBe(mid.closeDuration);
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
    await expect(sheet).toHaveAttribute("data-fluid-origin", "none");
    await expect(sheet.getByTestId("morph-source-label")).toHaveCount(0);
    await expect(page.getByTestId("new-entry")).toHaveCSS("visibility", "visible");
  });

  test("reduced motion leaves no source skin behind", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    await trigger.click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-morph-stage", "open");
    await expect(sheet.getByTestId("morph-source-label")).toHaveCSS("opacity", "0");
    const rest = await readHandoffRestState(sheet);
    expect(rest.body.animations).not.toContain("nbnotchbodyin");
    expect(rest.body.opacity).toBeGreaterThanOrEqual(.99);
    expect(rest.body.transform).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    expect(rest.body.filter).toMatch(/none|blur\(0(px)?\)/);
    expect(rest.body.willChange).toBe("auto");
    expect(rest.source.opacity).toBeLessThanOrEqual(.01);
    expect(rest.source.transform).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    expect(rest.source.filter).toMatch(/none|blur\(0(px)?\)/);
    expect(rest.source.willChange).toBe("auto");
    expect(rest.cascade.every((value) => value === "auto")).toBe(true);
    await expect(trigger).toHaveCSS("visibility", "hidden");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
    await expect(trigger).toHaveCSS("visibility", "visible");
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
    await expect(page.getByTestId("sheet")).toHaveAttribute("data-fluid-origin", "none");
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

  test("desktop + ADD grows the task composer out of itself", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await openPlanner(page);
    const add = page.getByTestId("actions-column").getByTestId("actions-add");
    await expect(add).toBeVisible();
    await add.click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");
    await expect(sheet).toHaveAttribute("data-morph-source", "actions-add");
    await expect(sheet.getByTestId("morph-source-label")).toHaveText("+ ADD");
    await expect(page.getByTestId("composer")).toHaveAttribute("data-composer-kind", "task");
    await expect(add).toHaveCSS("visibility", "hidden");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
    await expect(add).toHaveCSS("visibility", "visible");
  });

  test("the empty Actions panel does not borrow a morph", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await openPlanner(page);
    const empty = page.getByRole("button", { name: /Nothing claimed for this day/ }).first();
    await expect(empty).toBeVisible();
    await empty.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-fluid-origin", "none");
    await expect(sheet.getByTestId("morph-source-label")).toHaveCount(0);
  });
});

test.describe("sheet exits", () => {
  test("ordinary Settings stays on the generic Sheet and scrim cadence", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("button", { name: "Settings" }).click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).not.toHaveAttribute("data-fluid-origin", "notch");
    const opening = await sheet.evaluate((node) => {
      const animation = node.getAnimations().find((item) => item.effect?.target === node);
      return {
        name: animation?.animationName,
        duration: Number(animation?.effect?.getTiming().duration || 0),
        descendants: node.getAnimations({ subtree: true }).map((item) => item.animationName),
      };
    });
    expect(opening.name).toBe("nbfluidorigin");
    expect(opening.duration).toBe(420);
    expect(opening.descendants).not.toContain("nbnotchbodyin");
    expect(opening.descendants).not.toContain("nbnotchlabelout");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveClass(/nb-fluid-closing/);
    const closing = await page.locator(".nb-scrim").first().evaluate((node) => {
      const animation = node.getAnimations()[0];
      return { name: animation?.animationName, duration: Number(animation?.effect?.getTiming().duration || 0) };
    });
    expect(closing.name).toBe("nbscrimout");
    expect(closing.duration).toBe(240);
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("a trigger morph approaches rest without bouncing past it", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await page.getByText("Roadmap workshop", { exact: true }).click();

    const travel = await page.getByTestId("sheet").evaluate((node) => {
      const animation = node.getAnimations()[0];
      animation.pause();
      animation.currentTime = 0;
      const start = new DOMMatrix(getComputedStyle(node).transform);
      animation.currentTime = Number(animation.effect.getTiming().duration) * .72;
      const late = new DOMMatrix(getComputedStyle(node).transform);
      return { start: { x: start.m41, y: start.m42 }, late: { x: late.m41, y: late.m42 } };
    });
    const remainsBetweenStartAndRest = (late, start) => start >= 0
      ? late >= -.01 && late <= start + .01
      : late <= .01 && late >= start - .01;
    expect(remainsBetweenStartAndRest(travel.late.x, travel.start.x), "horizontal travel crossed the resting edge").toBe(true);
    expect(remainsBetweenStartAndRest(travel.late.y, travel.start.y), "vertical travel crossed the resting edge").toBe(true);
  });

  test("an inspector stays visible while it morphs to and from its card", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await page.getByText("Roadmap workshop", { exact: true }).click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");
    const entryNames = await sheet.evaluate((node) => node.getAnimations({ subtree: true }).map((animation) => animation.animationName));
    expect(entryNames).not.toContain("nbnotchbodyin");
    expect(entryNames).not.toContain("nbnotchlabelout");

    /* Sample the rendered animation itself. A class-name assertion passed while
       the body independently faded from zero, which is exactly why the previous
       regression test certified a transition that still looked like a fade. */
    const opening = await sheet.evaluate((node) => {
      const body = node.querySelector(".nb-notch-body");
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 0;
      }
      return {
        panelOpacity: Number(getComputedStyle(node).opacity),
        bodyOpacity: Number(getComputedStyle(body).opacity),
      };
    });
    expect(opening.panelOpacity).toBeGreaterThanOrEqual(.99);
    expect(opening.bodyOpacity, "the card-to-sheet morph must not begin as an empty surface").toBeGreaterThanOrEqual(.99);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveClass(/nb-fluid-closing/);
    const closing = await sheet.evaluate((node) => {
      const body = node.querySelector(".nb-notch-body");
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        const timing = animation.effect.getTiming();
        animation.currentTime = Math.max(0, Number(timing.delay || 0) + Number(timing.duration || 0) - 2);
      }
      return {
        panelOpacity: Number(getComputedStyle(node).opacity),
        bodyOpacity: Number(getComputedStyle(body).opacity),
      };
    });
    expect(closing.panelOpacity, "the material must land in the card before it unmounts").toBeGreaterThanOrEqual(.99);
    expect(closing.bodyOpacity, "the card contents should leave through the shrinking clip, not a separate fade").toBeGreaterThanOrEqual(.99);
  });

  test("a cross-day agenda open keeps the pressed card as its morph origin", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();

    await page.getByText("Roadmap workshop", { exact: true }).click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveClass(/nb-fluid-closing/);
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("a detail command uses the same morph exit as the close button", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await page.getByText("Walk 8k steps", { exact: true }).first().click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-sheet-title", "ACTION");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");
    const entryNames = await sheet.evaluate((node) => node.getAnimations({ subtree: true }).map((animation) => animation.animationName));
    expect(entryNames).not.toContain("nbnotchbodyin");
    expect(entryNames).not.toContain("nbnotchlabelout");
    await sheet.getByRole("button", { name: "MARK COMPLETE" }).click();

    await expect(sheet).toHaveClass(/nb-fluid-closing/);
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("deleting an inspected action keeps the exit mounted until it finishes", async ({ page }) => {
    await openPlanner(page, { keepSample: true });
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await page.getByText("Reconcile receipts", { exact: true }).first().click();

    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-sheet-title", "ACTION");
    await sheet.getByRole("button", { name: "DELETE" }).click();

    await expect(sheet).toHaveClass(/nb-fluid-closing/);
    await expect(sheet).toHaveCount(0, { timeout: 3000 });
  });

  test("a detail sheet leaves along the path it arrived on", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("Standup");
    await page.getByTestId("palette-quick-add").click();
    await page.waitForTimeout(500);

    await page.getByText("Standup", { exact: true }).first().click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");

    /* Entry and exit read the same custom properties, so the sheet retraces its
       own path instead of drifting vaguely downward. The exit used to travel a
       quarter of the distance and stop at a different size. */
    const geometry = await sheet.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        x: style.getPropertyValue("--fluid-x").trim(),
        insetTop: style.getPropertyValue("--fluid-inset-top").trim(),
        insetRight: style.getPropertyValue("--fluid-inset-right").trim(),
        insetBottom: style.getPropertyValue("--fluid-inset-bottom").trim(),
        insetLeft: style.getPropertyValue("--fluid-inset-left").trim(),
      };
    });
    expect(geometry.x).not.toBe("");
    /* A timeline card on a wide screen can be wider than the panel it opens, so
       one horizontal inset is legitimately zero. What matters is that every
       edge is explicit and no asymmetric clip goes negative. */
    for (const name of ["insetTop", "insetRight", "insetBottom", "insetLeft"]) {
      expect(parseFloat(geometry[name]), `${name} must not be negative`).toBeGreaterThanOrEqual(0);
    }

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
    const number = (name) => Number(style.getPropertyValue(name).replace("px", ""));
    return {
      x: number("--fluid-x"),
      y: number("--fluid-y"),
      insetTop: number("--fluid-inset-top"),
      insetRight: number("--fluid-inset-right"),
      insetBottom: number("--fluid-inset-bottom"),
      insetLeft: number("--fluid-inset-left"),
      anchorX: node.dataset.morphAnchorX,
      anchorY: node.dataset.morphAnchorY,
      panel: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };
  });

  test("desktop NEW starts at its measured top-right bounds and expands left/down", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    const source = await trigger.boundingBox();
    await trigger.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");
    await expect(sheet).toHaveAttribute("data-morph-anchor-x", "right");
    await expect(sheet).toHaveAttribute("data-morph-anchor-y", "top");

    const samples = await sheet.evaluate((node) => {
      const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
      if (!entry?.effect) return null;
      const duration = Number(entry.effect.getTiming().duration);
      const read = () => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(style.transform);
        const clip = style.clipPath.match(/^inset\(([^)]*)\)/);
        const insetText = clip ? clip[1].split(/\s+round\b/)[0] : "0px 0px 0px 0px";
        const radius = Number.parseFloat(style.clipPath.match(/\s+round\s+([0-9.]+)px/)?.[1] ?? "0");
        const [top, right, bottom, left] = insetText
          .trim().split(/\s+/).map((value) => Number.parseFloat(value) || 0);
        return {
          left: rect.left + left,
          right: rect.right - right,
          top: rect.top + top,
          bottom: rect.bottom - bottom,
          width: rect.width - left - right,
          height: rect.height - top - bottom,
          radius,
          scaleX: matrix.a,
          scaleY: matrix.d,
        };
      };
      entry.pause();
      entry.currentTime = 0;
      const start = read();
      entry.currentTime = duration * .1;
      const early = read();
      entry.currentTime = duration * .15;
      const anchored15 = read();
      entry.currentTime = duration * .35;
      const anchored35 = read();
      entry.currentTime = duration * .6;
      const anchored60 = read();
      entry.currentTime = duration * .5;
      const mid = read();
      entry.currentTime = duration;
      const end = read();
      entry.play();
      return { start, early, anchored15, anchored35, anchored60, mid, end };
    });

    expect(samples).not.toBeNull();
    expect(Math.abs(samples.start.left - source.x)).toBeLessThan(2);
    expect(Math.abs(samples.start.top - source.y)).toBeLessThan(2);
    expect(Math.abs(samples.start.width - source.width)).toBeLessThan(2);
    expect(Math.abs(samples.start.height - source.height)).toBeLessThan(2);
    expect(samples.start.radius).toBeLessThanOrEqual(Math.min(source.width, source.height) / 2 + 1);
    expect(samples.early.radius).toBeLessThan(Math.min(samples.early.width, samples.early.height) * .75);
    /* V3 deliberately removes v2's early transform hold: translation and clip
       both progress from the first fifth, so the source corner is allowed to
       travel continuously while the visible window expands. */
    expect(samples.anchored15.left, "the visible window must already expand left by 15%").toBeLessThan(samples.start.left);
    expect(samples.anchored15.bottom, "the visible window must already expand down by 15%").toBeGreaterThan(samples.start.bottom);
    expect(samples.anchored35.left, "the visible window keeps expanding left").toBeLessThan(samples.anchored15.left);
    expect(samples.anchored35.bottom, "the visible window keeps expanding down").toBeGreaterThan(samples.anchored15.bottom);
    expect(samples.anchored60.left, "the visible window continues toward the final left edge").toBeLessThan(samples.anchored35.left);
    expect(samples.anchored60.bottom, "the visible window continues toward the final bottom edge").toBeGreaterThan(samples.anchored35.bottom);
    expect(samples.anchored35.radius).toBeCloseTo(24, 0);
    expect(samples.mid.left, "the opposite horizontal edge should expand left").toBeLessThan(samples.start.left);
    expect(samples.mid.bottom, "the opposite vertical edge should expand down").toBeGreaterThan(samples.start.bottom);
    expect(samples.end.width).toBeGreaterThan(samples.start.width);
    expect(samples.end.height).toBeGreaterThan(samples.start.height);
    expect(samples.start.scaleX).toBeCloseTo(1, 5);
    expect(samples.start.scaleY).toBeCloseTo(1, 5);
    expect(samples.mid.scaleX).toBeCloseTo(1, 5);
    expect(samples.mid.scaleY).toBeCloseTo(1, 5);
  });

  test("source and destination identities exchange without a gap", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlanner(page);
    const trigger = page.getByTestId("new-entry");
    const source = await trigger.boundingBox();
    await trigger.click();
    const sheet = page.getByTestId("sheet");

    const samples = await sheet.evaluate((node) => {
      const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
      const label = node.querySelector('[data-test="morph-source-label"]');
      const body = node.querySelector(".nb-notch-body");
      if (!entry?.effect || !label || !body) return null;
      const duration = Number(entry.effect.getTiming().duration);
      const at = (fraction) => {
        for (const animation of node.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = duration * fraction;
        }
        const labelRect = label.getBoundingClientRect();
        const bodyStyle = getComputedStyle(body);
        const bodyMatrix = new DOMMatrixReadOnly(bodyStyle.transform === "none"
          ? "matrix(1,0,0,1,0,0)"
          : bodyStyle.transform);
        return {
          labelOpacity: Number(getComputedStyle(label).opacity),
          bodyOpacity: Number(bodyStyle.opacity),
          bodyTransformX: bodyMatrix.e,
          labelRect: { x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height },
        };
      };
      return { zero: at(0), quarter: at(.25), handoff: at(.4) };
    });

    expect(samples).not.toBeNull();
    expect(Math.abs(samples.zero.labelRect.x - source.x)).toBeLessThan(2);
    expect(Math.abs(samples.zero.labelRect.y - source.y)).toBeLessThan(2);
    expect(Math.abs(samples.zero.labelRect.width - source.width)).toBeLessThan(2);
    expect(Math.abs(samples.zero.labelRect.height - source.height)).toBeLessThan(2);
    expect(samples.zero.labelOpacity).toBeGreaterThan(.9);
    expect(Math.max(samples.quarter.labelOpacity, samples.quarter.bodyOpacity), "source and destination must never both disappear").toBeGreaterThan(.05);
    expect(samples.handoff.bodyOpacity).toBeGreaterThan(.1);
    expect(samples.handoff.bodyTransformX).toBeGreaterThan(0);
    expect(samples.handoff.labelOpacity).toBeLessThan(.9);
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

    /* A CSS animation's first keyframe is applied before any layout effect runs,
       so a naive `getBoundingClientRect()` in that effect measures the *pill*.
       the transformed box would put this number tens of pixels out. */
    const visible = {
      left: g.panel.left + g.x + g.insetLeft,
      top: g.panel.top + g.y + g.insetTop,
      width: g.panel.width - g.insetLeft - g.insetRight,
      height: g.panel.height - g.insetTop - g.insetBottom,
    };
    expect(Math.abs(visible.left - box.x)).toBeLessThan(2);
    expect(Math.abs(visible.top - box.y)).toBeLessThan(2);
    expect(Math.abs(visible.width - box.width)).toBeLessThan(2);
    expect(Math.abs(visible.height - box.height)).toBeLessThan(2);
  });

  test("the same is true of an ordinary sheet, not just the notch", async ({ page }) => {
    await openPlanner(page);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("palette-input").fill("Standup");
    await page.getByTestId("palette-quick-add").click();
    await page.waitForTimeout(500);

    /* The card, not the words inside it. The morph grows from whatever the press
       resolved to — `[data-event-id]` — and measuring the title span instead
       compared the sheet's travel against a box a few pixels off centre from the
       one it was actually computed from. The assertion was reading the wrong
       rectangle, not catching a wrong translation. */
    const card = page.getByRole("button", { name: /Standup/ }).first();
    /* Brought into view before it is measured, because `click()` would do it
       afterwards: the timeline is a scroll container, and a card measured where
       it sits and then clicked where the click scrolled it to compares two
       different rectangles. */
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await card.boundingBox();
    await card.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toHaveAttribute("data-fluid-origin", "trigger");
    await page.waitForTimeout(700);

    const g = await geometryOf(sheet);
    const visibleTop = g.panel.top + g.y + g.insetTop;
    const visibleHeight = g.panel.height - g.insetTop - g.insetBottom;
    expect(Math.abs(visibleTop - box.y)).toBeLessThan(2);
    expect(Math.abs(visibleHeight - box.height)).toBeLessThan(2);
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

test.describe("a sheet must not resize what is inside it", () => {
  /* "It zooms in intensely and glitches" on New event and New action.
     Three explanations were offered for this and two of them were wrong. It was
     not the mis-measured panel, and it was not the two-axis scale -- both were
     real defects, both were fixed, and the symptom survived both, because the
     fault was never in the numbers being animated. It was that a container with
     content inside it was being animated on a scale at all: at 0.23 every word
     and field in the composer is drawn at a quarter size and magnified four times
     over the length of the animation, resampling the whole way.

     So these tests no longer ask whether the scale is right. They ask whether
     anything inside the panel changes size at all, which is a question with only
     one acceptable answer and no way to satisfy it by adjusting a ratio. */

  /* The animation is held at fixed fractions rather than sampled by wall clock:
     deterministic, and the only way to be certain the samples land while it is
     still running. The endpoints were never the problem -- at 0% and 100% even a
     badly distorted morph measures perfectly. */
  const probeDuringEntry = (sheet) => sheet.evaluate((node) => {
    const animation = node.getAnimations().find((a) => a.animationName === "nbnotchin");
    if (!animation) return "the panel has no entry animation to hold";
    /* The close button: it is in every sheet, it is small enough that a magnified
       frame is unmistakable, and it is real content rather than a wrapper. */
    const probe = node.querySelector('button[aria-label="Close"]');
    if (!probe) return "the sheet has no close button to measure";
    const duration = animation.effect.getComputedTiming().duration;
    animation.pause();
    const read = () => {
      const box = probe.getBoundingClientRect();
      const style = getComputedStyle(node);
      const m = new DOMMatrixReadOnly(style.transform);
      return { width: box.width, height: box.height, across: m.a, down: m.d, clip: style.clipPath };
    };
    const out = [];
    for (const fraction of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      animation.currentTime = duration * fraction;
      out.push({ fraction, ...read() });
    }
    animation.finish();
    const settled = read();
    animation.play();
    return { samples: out, settled };
  });

  for (const [label, testId] of [["New event", "new-entry"], ["New action", "new-action"]]) {
    test(`${label} opens without scaling anything`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openPlanner(page);
      await page.getByTestId(testId).click();
      const sheet = page.getByTestId("sheet");
      await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");

      const vars = await sheet.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          insetTop: style.getPropertyValue("--fluid-inset-top").trim(),
          insetRight: style.getPropertyValue("--fluid-inset-right").trim(),
          insetBottom: style.getPropertyValue("--fluid-inset-bottom").trim(),
          insetLeft: style.getPropertyValue("--fluid-inset-left").trim(),
          s: style.getPropertyValue("--fluid-s").trim(),
          sx: style.getPropertyValue("--fluid-sx").trim(),
          sy: style.getPropertyValue("--fluid-sy").trim(),
        };
      });
      const insets = [vars.insetTop, vars.insetRight, vars.insetBottom, vars.insetLeft].map(Number.parseFloat);
      expect(insets.every((value) => value >= 0), "the reveal must expose four non-negative edge insets").toBe(true);
      expect(insets.some((value) => value > 0), "the reveal needs a shape to open from").toBe(true);
      /* Gone from the stylesheet, not merely unused: a scale left lying about is
         a scale something will animate again. */
      expect(vars.s, "the single scale must be gone").toBe("");
      expect(vars.sx, "the two-axis pair must be gone").toBe("");
      expect(vars.sy).toBe("");
    });
  }

  test("nothing inside the panel changes size while it opens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    /* The mobile create button, deliberately: 91px against a 390px panel. Under
       the old morph that is a 0.23 scale, so this button would measure a quarter
       of its final width one frame in. The narrow NEW button in the header is the
       one case that looked passable while everything else stretched, and a first
       draft of a test like this passed against the bug because it picked it. */
    await page.getByTestId("new-action").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();

    const result = await probeDuringEntry(sheet);
    expect(typeof result === "object", String(result)).toBe(true);
    const { samples, settled } = result;

    for (const s of samples) {
      expect(
        Math.abs(s.width - settled.width),
        `at ${s.fraction} through, a ${settled.width.toFixed(1)}px control measured ${s.width.toFixed(1)}px`,
      ).toBeLessThan(1);
      expect(
        Math.abs(s.height - settled.height),
        `at ${s.fraction} through, a ${settled.height.toFixed(1)}px control measured ${s.height.toFixed(1)}px`,
      ).toBeLessThan(1);
      /* And the panel itself carries no scale, so there is nothing that could
         start resampling the contents again. */
      expect(s.across, `the panel was scaled ${s.across} across at ${s.fraction}`).toBeCloseTo(1, 5);
      expect(s.down, `the panel was scaled ${s.down} down at ${s.fraction}`).toBeCloseTo(1, 5);
    }
  });

  test("the panel is revealed from the button's shape outwards", async ({ page }) => {
    /* The other half of the claim: the contents holding still would be worth
       nothing if the panel simply appeared. The clip has to actually open. */
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await page.getByTestId("new-action").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();

    const { samples } = await probeDuringEntry(sheet);
    const insets = samples.map((s) => ({
      fraction: s.fraction,
      /* `inset(<top> <right> <bottom> <left> round …)` — the first number is
         enough to say how far open the window is. */
      top: parseFloat(String(s.clip).replace(/^inset\(/, "")),
    }));
    for (const i of insets) expect(Number.isFinite(i.top), `no clip at ${i.fraction}: ${samples[0].clip}`).toBe(true);
    expect(insets[0].top, "the reveal did not start clipped").toBeGreaterThan(20);
    /* The curve springs — `cubic-bezier(.22,1.12,.28,1)` overshoots its end value
       on purpose — so the inset can pass a fraction of a pixel below zero on the
       way to settling. Below zero the clip is already outside the panel and there
       is nothing left to reveal, so monotonicity is only claimed while the window
       is still closing. */
    for (let i = 1; i < insets.length; i += 1) {
      if (insets[i - 1].top <= 0) break;
      expect(
        insets[i].top,
        `the clip opened backwards between ${insets[i - 1].fraction} and ${insets[i].fraction}`,
      ).toBeLessThan(insets[i - 1].top);
    }
    for (const i of insets) {
      expect(i.top, `the clip overshot ${i.top.toFixed(2)}px past open at ${i.fraction}`).toBeGreaterThan(-2);
    }
    expect(insets[insets.length - 1].top, "the reveal had not nearly finished").toBeLessThan(insets[0].top / 2);
  });
});
