import { expect, test } from "@playwright/test";

async function boot(page) {
  await page.goto("/");
  await page.waitForSelector('[data-test="day-ribbon"]');
}

async function ribbonSnapshot(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('[data-test="ribbon-viewport"]');
    const strip = document.querySelector('[data-test="day-ribbon"]');
    const date = document.querySelector('[data-test="day-heading"]')?.getAttribute("data-date");
    const cell = date ? strip?.querySelector(`[data-day="${date}"]`) : null;
    const viewportRect = strip?.getBoundingClientRect();
    const cellRect = cell?.getBoundingClientRect();
    const inset = Math.min(24, Math.max(0, ((strip?.clientWidth ?? 0) - (cell?.offsetWidth ?? 0)) / 2));
    return {
      state: viewport?.getAttribute("data-ribbon-position"),
      opacity: cell ? getComputedStyle(cell).opacity : null,
      mask: strip ? getComputedStyle(strip).maskImage : null,
      webkitMask: strip ? getComputedStyle(strip).webkitMaskImage : null,
      intersects: Boolean(viewportRect && cellRect
        && cellRect.left >= viewportRect.left + inset - 1
        && cellRect.right <= viewportRect.right - inset + 1),
      edgePointerEvents: [...document.querySelectorAll('[data-test^="ribbon-edge-"]')]
        .map((node) => getComputedStyle(node).pointerEvents),
    };
  });
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
});
