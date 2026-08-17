import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test("timeline chrome and the week ribbon stay visible until focus collapses them", async ({ page }) => {
  await openPlanner(page);
  const chrome = page.getByTestId("timeline-chrome");
  await expect(chrome).toHaveAttribute("data-collapsed", "false");
  const hud = await page.locator(".nb-hud").evaluate((node) => node.getBoundingClientRect().height);
  expect(hud, "the HUD must keep its buttons and text").toBeGreaterThan(24);
  await expect(page.getByTestId("new-entry")).toBeVisible();
  await expect(page.getByTestId("hud-notes")).toBeVisible();

  await page.getByTestId("zoom-out").click();
  const ribbon = page.getByTestId("day-ribbon");
  await expect(ribbon).toBeVisible();
  const ribbonBox = await ribbon.boundingBox();
  expect(ribbonBox && ribbonBox.height, "the week ribbon must have a real lane").toBeGreaterThan(20);
});
