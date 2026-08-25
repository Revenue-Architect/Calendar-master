import { chromium } from "playwright";
import path from "path";
import fs from "fs";

async function main() {
  const outDir = path.resolve("./screenshots/micro-audit");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const fileUrl = `file:///${path.resolve("artifact/planner.html").replace(/\\/g, "/")}`;
  console.log("Navigating to:", fileUrl);
  await page.goto(fileUrl);
  await page.waitForTimeout(600);

  // 0. Dismiss Initial Modal
  const exploreBtn = page.getByRole("button", { name: /explore the sample/i });
  if (await exploreBtn.isVisible()) {
    await exploreBtn.click();
    await page.waitForTimeout(400);
  }

  // 1. Resting Day Timeline & Actions List
  await page.screenshot({ path: path.join(outDir, "01-resting-day.png") });
  console.log("Captured 01-resting-day.png");

  // 2. Action Card Hover & Swipe Simulation (hold on action)
  const firstAction = page.locator("[data-task]").first();
  if (await firstAction.isVisible()) {
    const box = await firstAction.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, "02-action-hold-ratchet.png") });
    console.log("Captured 02-action-hold-ratchet.png");
    await page.mouse.up();
    await page.waitForTimeout(200);
  }

  // 3. Event Sheet / Morph Reveal
  await page.keyboard.press("n");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "03-event-composer-morph.png") });
  console.log("Captured 03-event-composer-morph.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 4. Quick Add Command Palette (⌘K / /)
  await page.keyboard.press("/");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "04-command-palette-hud.png") });
  console.log("Captured 04-command-palette-hud.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 5. Week View
  await page.keyboard.press("]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "05-week-grid-timeline.png") });
  console.log("Captured 05-week-grid-timeline.png");

  // 6. Navigation Shell / Drawer (Hamburger)
  const hamburger = page.locator("button.nb-shell-control").first();
  if (await hamburger.isVisible()) {
    await hamburger.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, "06-nav-shell-drawer.png") });
    console.log("Captured 06-nav-shell-drawer.png");
  }

  await browser.close();
  console.log("All audit screenshots captured successfully!");
}

main().catch(console.error);
