import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

const visibleLabel = (page) => page.getByTestId("hud-notes").evaluate((node) => {
  const shown = [...node.querySelectorAll("span")].find((span) => getComputedStyle(span).display !== "none");
  return (shown || node).textContent.trim();
});

test.describe("the HUD create story", () => {
  test("NEW opens one composer that can become an event or an action", async ({ page }) => {
    await openPlanner(page);
    const create = page.getByTestId("new-entry");
    await expect(create).toHaveText("NEW");
    await expect(page.getByTestId("hud-new-action")).toHaveCount(0);
    await expect(page.getByTestId("hud-notes")).toBeVisible();
    expect(await visibleLabel(page)).toBe("NOTES");

    await create.click();
    const composer = page.getByTestId("composer");
    await expect(composer).toHaveAttribute("data-composer-kind", "event");
    await composer.getByRole("tab", { name: "ACTION", exact: true }).click();
    await expect(composer).toHaveAttribute("data-composer-kind", "task");
    await expect(composer.getByPlaceholder("What gets finished?")).toBeVisible();
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
