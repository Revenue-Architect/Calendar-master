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
