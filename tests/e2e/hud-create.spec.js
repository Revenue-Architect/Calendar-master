import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

const visibleLabel = (page) => page.getByTestId("hud-notes").evaluate((node) => {
  const shown = [...node.querySelectorAll("span")].find((span) => getComputedStyle(span).display !== "none");
  return (shown || node).textContent.trim();
});

test.describe("the HUD create story", () => {
  test("desktop keeps two equal create verbs, and NOTES stays labelled", async ({ page }) => {
    await openPlanner(page);
    const event = page.getByTestId("new-entry");
    const action = page.getByTestId("hud-new-action");
    await expect(event).toHaveText("EVENT");
    await expect(action).toHaveText("ACTION");
    await expect(page.getByTestId("hud-notes")).toBeVisible();
    expect(await visibleLabel(page)).toBe("NOTES");

    await event.click();
    await expect(page.getByTestId("composer")).toHaveAttribute("data-composer-kind", "event");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).toHaveCount(0, { timeout: 3000 });

    await action.click();
    await expect(page.getByTestId("composer")).toHaveAttribute("data-composer-kind", "task");
  });

  test("a phone keeps WRITE as the path to today's note", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const write = page.getByTestId("hud-notes");
    await expect(write).toBeVisible();
    expect(await visibleLabel(page)).toBe("WRITE");
    const box = await write.boundingBox();
    expect(box && box.width, "WRITE must stay a compact HUD verb").toBeLessThan(72);

    await write.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-sheet-title", "NOTE");
    await expect(page.getByText("NEW NOTE")).toBeVisible();
  });
});
