import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test.describe("the floating navigation shell", () => {
  test("opens a labelled floating shell and restores focus after Escape", async ({ page }) => {
    await openPlanner(page);
    const trigger = page.getByTestId("nav-toggle");
    const shell = page.getByTestId("nav-shell");
    const surface = page.getByTestId("app-surface");

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(shell).toHaveAttribute("data-nav-state", "open");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expect(surface).toHaveClass(/nb-app-surface-open/);

    await page.keyboard.press("Escape");
    await expect(shell).toHaveAttribute("data-nav-state", "closed");
    await expect(trigger).toBeFocused();
  });

  test("destinations call existing planner actions and close navigation", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await page.getByRole("button", { name: "Actions", exact: true }).click();

    await expect(page.getByRole("tab", { name: "ACTIONS", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("shortcuts move into the side navigation", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await page.getByRole("button", { name: "Shortcuts", exact: true }).click();

    await expect(page.getByRole("dialog", { name: "SHORTCUTS" })).toBeVisible();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("outside press closes the panel", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();
    await page.getByTestId("app-surface").click({ position: { x: 700, y: 500 } });
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("mobile resolves the open calendar into a return rail", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    await expect(page.getByTestId("new-entry")).toBeVisible();
    await page.getByTestId("nav-toggle").click();

    const surface = page.getByTestId("app-surface");
    await expect(surface).toHaveClass(/nb-app-surface-open/);
    await expect(surface).toHaveCSS("border-top-left-radius", "16px");
    await expect(page.getByTestId("mobile-calendar-return")).toBeVisible();
    await page.getByTestId("mobile-calendar-return").click();
    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
  });

  test("reduced motion retains navigation semantics without staged movement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlanner(page);
    await page.getByTestId("nav-toggle").click();

    await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "open");
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  });
});
