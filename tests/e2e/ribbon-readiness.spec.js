import { expect, test } from "@playwright/test";

async function boot(page) {
  await page.goto("/");
  await page.waitForSelector('[data-test="day-ribbon"]');
}

async function dismissWelcome(page) {
  const welcome = page.locator('[data-test="sheet"][data-sheet-title="Welcome"]');
  if (await welcome.isVisible().catch(() => false)) {
    await welcome.getByRole("button", { name: "START EMPTY" }).click();
    await expect(welcome).toBeHidden();
  }
}

async function ribbonSnapshot(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('[data-test="ribbon-viewport"]');
    const strip = document.querySelector('[data-test="day-ribbon"]');
    const headerDate = document.querySelector('[data-test="day-heading"]')?.getAttribute("data-date") ?? null;
    const cells = strip ? [...strip.querySelectorAll("button[data-day]")] : [];
    const cell = headerDate ? strip?.querySelector(`[data-day="${headerDate}"]`) : null;
    const stripRect = strip?.getBoundingClientRect();
    const cellRect = cell?.getBoundingClientRect();
    const inset = Math.min(24, Math.max(0, ((strip?.clientWidth ?? 0) - (cell?.offsetWidth ?? 0)) / 2));
    const rect = (node) => {
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return {
        x: value.x, y: value.y, top: value.top, right: value.right,
        bottom: value.bottom, left: value.left, width: value.width, height: value.height,
      };
    };
    const intersects = (node) => {
      const value = node.getBoundingClientRect();
      return Boolean(stripRect && value.left >= stripRect.left + inset - 1
        && value.right <= stripRect.right - inset + 1);
    };
    const intersectingDates = cells.filter(intersects).map((node) => node.getAttribute("data-day"));
    const stripCenter = stripRect ? stripRect.left + stripRect.width / 2 : 0;
    const centerCell = cells
      .map((node) => ({ node, distance: Math.abs((node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2) - stripCenter) }))
      .sort((a, b) => a.distance - b.distance)[0]?.node;
    const first = cells[0];
    const last = cells[cells.length - 1];
    return {
      state: viewport?.getAttribute("data-ribbon-position"),
      selectedDateKey: headerDate,
      selectedRibbonDate: cell?.getAttribute("data-day") ?? null,
      ribbonStart: strip?.getAttribute("data-ribbon-start") ?? null,
      ribbonEnd: strip?.getAttribute("data-ribbon-end") ?? null,
      windowStart: strip?.getAttribute("data-ribbon-window-start") ?? null,
      windowEnd: strip?.getAttribute("data-ribbon-window-end") ?? null,
      scrollLeft: strip?.scrollLeft ?? null,
      scrollWidth: strip?.scrollWidth ?? null,
      clientWidth: strip?.clientWidth ?? null,
      firstRenderedDate: first?.getAttribute("data-day") ?? null,
      lastRenderedDate: last?.getAttribute("data-day") ?? null,
      renderedDayCount: cells.length,
      cellWidth: cells[0]?.getBoundingClientRect().width ?? 0,
      selectedOffsetLeft: cell?.offsetLeft ?? null,
      selectedOffsetWidth: cell?.offsetWidth ?? null,
      selectedRect: rect(cell),
      stripRect: rect(strip),
      centerDate: centerCell?.getAttribute("data-day") ?? null,
      intersectingDates,
      opacity: cell ? getComputedStyle(cell).opacity : null,
      mask: strip ? getComputedStyle(strip).maskImage : null,
      webkitMask: strip ? getComputedStyle(strip).webkitMaskImage : null,
      intersects: Boolean(stripRect && cellRect && intersects(cell)),
      edgePointerEvents: [...document.querySelectorAll('[data-test^="ribbon-edge-"]')]
        .map((node) => getComputedStyle(node).pointerEvents),
    };
  });
}

async function browseUntilSelectedIsUnrendered(page) {
  const ribbon = page.getByTestId("day-ribbon");
  const selected = await page.getByTestId("day-heading").getAttribute("data-date");
  if (!selected) throw new Error("selected heading date is missing before ribbon browse");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await ribbon.locator(`button[data-day="${selected}"]`).count() === 0) return selected;
    await ribbon.evaluate((node) => {
      node.scrollLeft = Math.min(node.scrollWidth - node.clientWidth,
        node.scrollLeft + node.clientWidth * 1.5);
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(32);
  }
  throw new Error("selected date never left the rendered ribbon window");
}

async function armFirstRibbonFrameObserver(page) {
  await page.evaluate(() => {
    window.__ribbonFirstFrameObserver?.disconnect?.();
    window.__ribbonFirstFrame = null;
    let frameQueued = false;
    const observer = new MutationObserver(() => {
      const strip = document.querySelector('[data-test="day-ribbon"]');
      if (frameQueued || !strip) return;
      frameQueued = true;
      requestAnimationFrame(() => {
        const currentStrip = document.querySelector('[data-test="day-ribbon"]');
        if (!currentStrip) return;
        const viewport = document.querySelector('[data-test="ribbon-viewport"]');
        const headerDate = document.querySelector('[data-test="day-heading"]')?.getAttribute("data-date") ?? null;
        const stripRect = currentStrip.getBoundingClientRect();
        const cells = [...currentStrip.querySelectorAll("button[data-day]")];
        const firstCell = cells[0];
        const inset = Math.min(24, Math.max(0,
          (currentStrip.clientWidth - (firstCell?.offsetWidth ?? 0)) / 2));
        const intersects = (node) => {
          const rect = node.getBoundingClientRect();
          return Boolean(stripRect.width > 0
            && rect.left >= stripRect.left + inset - 1
            && rect.right <= stripRect.right - inset + 1);
        };
        const intersectingRealDates = cells.filter(intersects)
          .map((node) => node.getAttribute("data-day"))
          .filter(Boolean);
        const selected = headerDate
          ? currentStrip.querySelector(`button[data-day="${headerDate}"]`)
          : null;
        const intersecting = Object.freeze(intersectingRealDates);
        window.__ribbonFirstFrame = Object.freeze({
          renderedDayCount: cells.length,
          tabbableDayCount: cells.filter((node) => node.tabIndex === 0).length,
          intersectingRealDates: intersecting,
          selectedRendered: Boolean(selected),
          selectedIntersects: Boolean(selected && intersects(selected)),
          dataRibbonPosition: viewport?.getAttribute("data-ribbon-position") ?? null,
          stripWidth: stripRect.width,
          clientWidth: currentStrip.clientWidth,
          scrollLeft: currentStrip.scrollLeft,
        });
        observer.disconnect();
      });
    });
    window.__ribbonFirstFrameObserver = observer;
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function firstRibbonFrame(page) {
  await expect.poll(() => page.evaluate(() => window.__ribbonFirstFrame ?? null), {
    timeout: 7_000,
  }).not.toBeNull();
  return page.evaluate(() => window.__ribbonFirstFrame);
}

function assertSelectedOutOfRenderedWindow(snapshot, selected, label) {
  expect(snapshot.selectedDateKey, `${label}: selected header date`).toBe(selected);
  expect(snapshot.ribbonStart, `${label}: logical ribbon start`).toBeTruthy();
  expect(snapshot.ribbonEnd, `${label}: logical ribbon end`).toBeTruthy();
  expect(selected >= snapshot.ribbonStart && selected <= snapshot.ribbonEnd,
    `${label}: selected date must remain in logical ribbon range`).toBe(true);
  expect(snapshot.selectedRibbonDate, `${label}: selected cell must be unrendered`).toBeNull();
  expect(snapshot.renderedDayCount, `${label}: rendered day presence`).toBeGreaterThan(0);
  expect(snapshot.renderedDayCount, `${label}: rendered day bound`).toBeLessThanOrEqual(56);
}

function assertFirstFrameReady(firstFrame, label) {
  expect(firstFrame.renderedDayCount, `${label}: first frame rendered day count`).toBeGreaterThan(0);
  expect(firstFrame.intersectingRealDates.length, `${label}: first frame intersecting dates`).toBeGreaterThan(0);
  expect(firstFrame.selectedRendered, `${label}: first frame selected rendered`).toBe(true);
  expect(firstFrame.selectedIntersects, `${label}: first frame selected intersects`).toBe(true);
  expect(firstFrame.clientWidth, `${label}: first frame client width`).toBeGreaterThan(0);
}

async function assertRibbonSettled(page, label) {
  await expect.poll(async () => {
    const value = await ribbonSnapshot(page);
    return value.state === "settled"
      && value.selectedRibbonDate === value.selectedDateKey
      && value.intersects;
  }, { timeout: 7_000 }).toBe(true);
  assertUsable(await ribbonSnapshot(page), label);
}

function assertUsable(snapshot, label) {
  expect(snapshot.state, `${label}: positioning state`).toBe("settled");
  expect(snapshot.selectedDateKey, `${label}: header date`).toBeTruthy();
  expect(snapshot.selectedRibbonDate, `${label}: selected ribbon date`).toBe(snapshot.selectedDateKey);
  expect(snapshot.intersects, `${label}: selected cell intersects`).toBe(true);
  expect(snapshot.renderedDayCount, `${label}: rendered day bound`).toBeLessThanOrEqual(56);
  expect(snapshot.renderedDayCount, `${label}: rendered day presence`).toBeGreaterThan(0);
  expect(snapshot.firstRenderedDate, `${label}: first rendered date`).toBeTruthy();
  expect(snapshot.lastRenderedDate, `${label}: last rendered date`).toBeTruthy();
  expect(snapshot.stripRect?.width, `${label}: ribbon width`).toBeGreaterThan(0);
}

function dayDistance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs(
    (Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) /
      86_400_000,
  );
}

test.describe("Week ribbon readiness", () => {
  test("settles selected day without interaction and keeps the scroll layer unmasked", async ({ page }) => {
    await boot(page);
    await expect.poll(() => ribbonSnapshot(page), { timeout: 7000 }).toMatchObject({
      state: "settled",
      opacity: "1",
      intersects: true,
      mask: "none",
      webkitMask: "none",
    });
    const snapshot = await ribbonSnapshot(page);
    expect(snapshot.edgePointerEvents.every((value) => value === "none")).toBe(true);
  });

  test("settles after a narrow viewport remount", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await expect.poll(() => ribbonSnapshot(page), { timeout: 7000 }).toMatchObject({
      state: "settled",
      opacity: "1",
      intersects: true,
      mask: "none",
      webkitMask: "none",
    });
  });

  test("fresh phone heights keep the ribbon usable", async ({ page }) => {
    for (const [width, height] of [[390, 844], [390, 601]]) {
      await page.setViewportSize({ width, height });
      await boot(page);
      await dismissWelcome(page);
      await expect.poll(async () => {
        const value = await ribbonSnapshot(page);
        return value.state === "settled"
          && value.selectedRibbonDate === value.selectedDateKey
          && value.intersects;
      }, { timeout: 7_000 }).toBe(true);
      assertUsable(await ribbonSnapshot(page), `${width}x${height}`);
    }
  });

  test("responsive width changes preserve selected-day readiness", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await dismissWelcome(page);
    const sizes = [
      [1280, 900],
      [900, 844],
      [390, 844],
      [1280, 900],
    ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await expect.poll(async () => {
        const value = await ribbonSnapshot(page);
        return value.state === "settled"
          && value.stripRect?.width > 0
          && value.selectedRibbonDate === value.selectedDateKey
          && value.intersects;
      }, { timeout: 7_000 }).toBe(true);
      const snapshot = await ribbonSnapshot(page);
      assertUsable(snapshot, `${width}x${height}`);
    }
  });

  /* PR #13 gave the ribbon a roving tab stop on the selected day, which is right
     while that day is rendered. It is not the only supported state: this suite
     already exercises browsing the selected date out of the 56-day window, and in
     that state every rendered cell was `tabIndex=-1` and the strip had no keyboard
     entry at all. */
  test("a browsed-out ribbon still owns exactly one keyboard entry point", async ({ page }) => {
    await boot(page);
    await dismissWelcome(page);
    const selected = await browseUntilSelectedIsUnrendered(page);

    const state = await page.evaluate((selectedDate) => {
      const strip = document.querySelector('[data-test="day-ribbon"]');
      const cells = [...strip.querySelectorAll("button[data-day]")];
      const box = strip.getBoundingClientRect();
      const tabbable = cells.filter((node) => node.tabIndex === 0);
      const intersects = (node) => {
        const r = node.getBoundingClientRect();
        return r.right > box.left + 1 && r.left < box.right - 1;
      };
      return {
        renderedCount: cells.length,
        selectedRenderedCount: cells.filter((n) => n.getAttribute("data-day") === selectedDate).length,
        tabbableCount: tabbable.length,
        tabbableDate: tabbable[0]?.getAttribute("data-day") ?? null,
        tabbableIntersects: tabbable[0] ? intersects(tabbable[0]) : false,
        tabbableDisabled: tabbable[0]?.disabled ?? null,
      };
    }, selected);

    expect(state.selectedRenderedCount, "the browse must leave the selected date unrendered").toBe(0);
    expect(state.renderedCount, "the ribbon must still be rendering days").toBeGreaterThan(0);
    expect(state.tabbableCount, "a rendered ribbon must have exactly one keyboard entry point").toBe(1);
    expect(state.tabbableDisabled, "the entry point must be a live control").toBe(false);
    expect(state.tabbableIntersects, "the entry point should be a day the user can see").toBe(true);
  });

  test("the browsed-out entry point takes focus by Tab and selects on activation", async ({ page }) => {
    await boot(page);
    await dismissWelcome(page);
    const selected = await browseUntilSelectedIsUnrendered(page);

    const anchorDate = await page.evaluate(() => document
      .querySelector('[data-test="day-ribbon"] button[data-day][tabindex="0"]')
      ?.getAttribute("data-day") ?? null);
    expect(anchorDate, "a browsed-out ribbon must expose an anchor to focus").not.toBeNull();
    expect(anchorDate).not.toBe(selected);

    /* Start on the real control before the strip and press Tab once. The first
       version of this test focused the anchor itself when it could not find that
       control — `day-ribbon` is the first child of `ribbon-viewport`, so its
       previousElementSibling is null — and then broke out of its own loop before
       pressing anything. It passed 50/50 while proving only that Enter activates
       a focused button. No loop and no fallback here: if one Tab does not reach
       the anchor, the tab order is wrong and this must fail. */
    const previousDay = page.getByRole("button", { name: "Previous day", exact: true });
    await previousDay.focus();
    await expect(previousDay).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(`[data-test="day-ribbon"] button[data-day="${anchorDate}"]`)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("day-heading")).toHaveAttribute("data-date", anchorDate);

    /* Ownership returns to the selection once it is the rendered selected day. */
    const afterSelect = await page.evaluate(() => {
      const strip = document.querySelector('[data-test="day-ribbon"]');
      const tabbable = [...strip.querySelectorAll("button[data-day]")].filter((n) => n.tabIndex === 0);
      return { count: tabbable.length, date: tabbable[0]?.getAttribute("data-day") ?? null };
    });
    expect(afterSelect.count, "selection must not leave two tab stops behind").toBe(1);
    expect(afterSelect.date).toBe(anchorDate);
  });

  test("manual ribbon browsing preserves the logical center across resize", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await dismissWelcome(page);
    await expect.poll(async () => (await ribbonSnapshot(page)).state, { timeout: 7_000 }).toBe("settled");
    const ribbon = page.locator('[data-test="day-ribbon"]');
    await ribbon.evaluate((node) => {
      node.scrollLeft = Math.min(node.scrollWidth - node.clientWidth, node.scrollLeft + node.clientWidth * 3);
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    let stableBrowsedCenter = null;
    await expect.poll(async () => {
      const value = await ribbonSnapshot(page);
      if (!value.centerDate || value.centerDate === value.selectedDateKey) return false;
      const stable = stableBrowsedCenter === value.centerDate;
      stableBrowsedCenter = value.centerDate;
      return stable;
    }, { timeout: 7_000 }).toBe(true);
    const browsed = await ribbonSnapshot(page);
    const centerBeforeResize = browsed.centerDate;
    for (const [width, height] of [[900, 844], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(async () => {
        const value = await ribbonSnapshot(page);
        return value.state === "settled"
          && Boolean(value.centerDate)
          && dayDistance(centerBeforeResize, value.centerDate) <= 1;
      }, { timeout: 7_000 }).toBe(true);
      const after = await ribbonSnapshot(page);
      expect(after.state, `${width}x${height}: positioning state`).toBe("settled");
      expect(after.centerDate, `${width}x${height}: center date`).toBeTruthy();
      expect(after.renderedDayCount, `${width}x${height}: rendered day bound`).toBeLessThanOrEqual(56);
      expect(after.renderedDayCount, `${width}x${height}: rendered day presence`).toBeGreaterThan(0);
      expect(after.stripRect?.width, `${width}x${height}: ribbon width`).toBeGreaterThan(0);
      expect(dayDistance(centerBeforeResize, after.centerDate),
        `${width}x${height}: manual center moved from ${centerBeforeResize} to ${after.centerDate}`)
        .toBeLessThanOrEqual(1);
    }
  });

  test("a browser that advertises scrollend still settles without delivering it", async ({ page }) => {
    await page.addInitScript(() => {
      if (!("onscrollend" in Element.prototype)) {
        Object.defineProperty(Element.prototype, "onscrollend", { configurable: true, get: () => null, set: () => {} });
      }
      const native = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
        if (type === "scrollend" && this instanceof Element && this.matches?.('[data-test="day-ribbon"]')) return;
        return native.call(this, type, listener, options);
      };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await dismissWelcome(page);
    const next = page.getByRole("button", { name: "Next day" });
    for (let i = 0; i < 14; i += 1) await next.click();
    await expect
      .poll(async () => {
        const value = await ribbonSnapshot(page);
        return value.state === "settled"
          && value.selectedRibbonDate === value.selectedDateKey
          && value.intersects;
      }, { timeout: 7_000 })
      .toBe(true);
    const snapshot = await ribbonSnapshot(page);
    expect(snapshot.state, "missing scrollend should not leave a positioning lock").toBe("settled");
    assertUsable(snapshot, "missing scrollend");
  });

  /* Exactly one tab stop on the frame a re-entry commits, before anything has
     settled. This guards the anchor policy across a remount — 0 stops if the
     anchor names an unrendered day, 2 if selection and fallback both claim it.
     It does NOT guard the hook's initial state: Planner never unmounts here, so
     the anchor survives the strip. Seeding that initializer synchronously is
     construction rather than timing, and no test in this suite can fail for it. */
  test("a re-entered ribbon frame owns exactly one keyboard entry point", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await dismissWelcome(page);
    await assertRibbonSettled(page, "Day before Actions");

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await armFirstRibbonFrameObserver(page);
    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();

    const frame = await firstRibbonFrame(page);
    expect(frame.renderedDayCount, "the re-entered frame must render days").toBeGreaterThan(0);
    expect(frame.tabbableDayCount, "the re-entered frame must own exactly one tab stop").toBe(1);
  });

  test("Day re-entry renders the browsed-out selection on its first frame", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await dismissWelcome(page);
    await assertRibbonSettled(page, "Day before browse");

    const selected = await browseUntilSelectedIsUnrendered(page);
    assertSelectedOutOfRenderedWindow(await ribbonSnapshot(page), selected, "Day before Actions");
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await armFirstRibbonFrameObserver(page);
    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    const firstFrame = await firstRibbonFrame(page);
    assertFirstFrameReady(firstFrame, "Day re-entry");
    await assertRibbonSettled(page, "Day after Actions");
  });

  test("Week re-entry renders the browsed-out selection on its first frame", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await dismissWelcome(page);
    await page.getByTestId("zoom-out").click();
    await assertRibbonSettled(page, "Week before browse");

    const selected = await browseUntilSelectedIsUnrendered(page);
    assertSelectedOutOfRenderedWindow(await ribbonSnapshot(page), selected, "Week before Actions");
    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await armFirstRibbonFrameObserver(page);
    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    const firstFrame = await firstRibbonFrame(page);
    assertFirstFrameReady(firstFrame, "Week re-entry");
    await expect(page.getByTestId("zoom-in")).toHaveText(/DAY/);
    await assertRibbonSettled(page, "Week after Actions");
  });

  test("Month return renders the browsed-out selection on its first ribbon frame", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await dismissWelcome(page);
    await page.getByTestId("zoom-out").click();
    await assertRibbonSettled(page, "Month path before browse");

    const selected = await browseUntilSelectedIsUnrendered(page);
    assertSelectedOutOfRenderedWindow(await ribbonSnapshot(page), selected, "Month before zoom");
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await expect(page.locator(".nb-month-navigator.is-month")).toBeVisible();
    await armFirstRibbonFrameObserver(page);
    await page.getByTestId("zoom-in").click();
    const firstFrame = await firstRibbonFrame(page);
    assertFirstFrameReady(firstFrame, "Month return");
    await assertRibbonSettled(page, "Month return");
  });

  test("Timeline → Actions → Timeline restores a settled ribbon", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await dismissWelcome(page);
    await expect(page.getByTestId("day-ribbon")).toBeVisible();

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toHaveCount(0);
    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    await expect(page.getByTestId("day-ribbon")).toBeVisible();
    await expect.poll(async () => {
      const value = await ribbonSnapshot(page);
      return value.state === "settled"
        && value.selectedRibbonDate === value.selectedDateKey
        && value.intersects;
    }, { timeout: 7_000 }).toBe(true);
    assertUsable(await ribbonSnapshot(page), "Timeline after Actions");
  });

  test("mobile navigation return restores the ribbon after CALENDAR", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await dismissWelcome(page);
    await page.getByTestId("nav-toggle").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    await page.getByTestId("mobile-calendar-return").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
    await expect(page.getByTestId("day-ribbon")).toBeVisible();
    await expect.poll(async () => {
      const value = await ribbonSnapshot(page);
      return value.state === "settled"
        && value.selectedRibbonDate === value.selectedDateKey
        && value.intersects;
    }, { timeout: 7_000 }).toBe(true);
    assertUsable(await ribbonSnapshot(page), "mobile calendar return");
  });

  test("manual ribbon movement followed by reload returns to a verified selection", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await dismissWelcome(page);
    const ribbon = page.locator('[data-test="day-ribbon"]');
    await ribbon.evaluate((node) => {
      node.scrollLeft = Math.min(node.scrollWidth - node.clientWidth, node.scrollLeft + node.clientWidth * 2);
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect.poll(async () => Boolean((await ribbonSnapshot(page)).centerDate), { timeout: 7_000 }).toBe(true);

    await page.reload();
    await page.waitForSelector('[data-test="day-ribbon"]');
    await expect.poll(async () => {
      const value = await ribbonSnapshot(page);
      return value.state === "settled"
        && value.selectedRibbonDate === value.selectedDateKey
        && value.intersects;
    }, { timeout: 7_000 }).toBe(true);
    assertUsable(await ribbonSnapshot(page), "after reload");
  });

  test("virtual-window edge movement stays bounded at both ends", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await dismissWelcome(page);
    const ribbon = page.locator('[data-test="day-ribbon"]');
    for (const edge of ["start", "end"]) {
      await ribbon.evaluate((node, side) => {
        node.scrollLeft = side === "start" ? 0 : node.scrollWidth;
        node.dispatchEvent(new Event("scroll", { bubbles: true }));
      }, edge);
      await expect.poll(async () => {
        const value = await ribbonSnapshot(page);
        return Boolean(value.renderedDayCount > 0
          && value.renderedDayCount <= 56
          && value.firstRenderedDate
          && value.lastRenderedDate);
      }, { timeout: 7_000 }).toBe(true);
      const snapshot = await ribbonSnapshot(page);
      expect(snapshot.renderedDayCount, `${edge}: rendered day bound`).toBeLessThanOrEqual(56);
      expect(snapshot.scrollWidth, `${edge}: scroll surface`).toBeGreaterThan(snapshot.clientWidth);
      expect(snapshot.windowStart, `${edge}: virtual start`).toBeTruthy();
      expect(snapshot.windowEnd, `${edge}: virtual end`).toBeTruthy();
    }
  });
});
