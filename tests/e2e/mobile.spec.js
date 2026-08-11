import { expect, test } from "@playwright/test";
import { openPlanner, quickAdd } from "./helpers.js";

/* On a phone the Actions list has two homes: a bottom sheet that slides over the
 * day, and a full-screen view that replaces it. They are the same list, so both
 * at once is the same content twice — and the sheet, being fixed and on top,
 * covers the view it duplicates. */

test.use({ viewport: { width: 390, height: 844 } });

const sheet = (page) => page.locator(".nb-msheet");

test.describe("the mobile actions sheet", () => {
  test("does not exist while Actions owns the whole screen", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Reconcile the ledger");

    /* Open the bottom sheet first — this is the state that used to leave a
       641px panel sitting over the full-screen view. */
    await page.getByRole("button", { name: "Toggle actions" }).click();
    await page.waitForTimeout(600);
    await expect(sheet(page)).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 0\)/);

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await page.waitForTimeout(500);
    await expect(sheet(page), "the bottom sheet is still mounted over the view").toHaveCount(0);

    /* And the full-screen view is the one you can actually use. */
    await expect(page.getByText("Reconcile the ledger").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "BACK TO DAY" })).toBeVisible();
  });

  test("comes back collapsed after returning to the day", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("button", { name: "Toggle actions" }).click();
    await page.waitForTimeout(600);

    await page.getByRole("tab", { name: "ACTIONS", exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "BACK TO DAY" }).click();
    await page.waitForTimeout(700);

    /* Collapsed, not open: the user never reopened it, so it must not reappear
       covering the day they just came back to. */
    await expect(sheet(page)).toHaveCount(1);
    const covers = await sheet(page).evaluate((node) => node.getBoundingClientRect().top < window.innerHeight * 0.6);
    expect(covers, "the sheet reappeared expanded over the day").toBe(false);
  });

  test("the day surface is reachable under a collapsed sheet", async ({ page }) => {
    await openPlanner(page);
    const stream = page.getByTestId("day-stream");
    await expect(stream).toBeVisible();
    const box = await stream.boundingBox();
    /* The surface stops short of the collapsed handle rather than running under it. */
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  });
});
