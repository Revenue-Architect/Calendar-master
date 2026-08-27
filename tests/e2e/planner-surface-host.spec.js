import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test.describe("planner surface composition", () => {
  test("mounts the composer through PlannerSurfaceHost", async ({ page }) => {
    await openPlanner(page);

    const host = page.getByTestId("planner-surface-host");
    await expect(host).toHaveCount(1);
    await expect(host).toHaveAttribute("data-surface-kind", "idle");

    await page.getByTestId("new-entry").click();
    await expect(page.getByTestId("composer")).toBeVisible();
    await expect(host).toHaveAttribute("data-surface-kind", "composer");
  });
});
