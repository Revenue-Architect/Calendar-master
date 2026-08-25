import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

async function main() {
  const outDir = path.resolve("./screenshots/micro-audit");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log("Starting Vite dev server...");
  const devServer = spawn("npx", ["vite", "--port", "5173", "--strictPort"], {
    shell: true,
    stdio: "pipe",
  });

  await new Promise((resolve) => {
    devServer.stdout.on("data", (d) => {
      const s = d.toString();
      if (s.includes("Local:") || s.includes("5173")) resolve();
    });
    setTimeout(resolve, 4000);
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto("http://localhost:5173");
    await page.waitForTimeout(1000);

    const exploreBtn = page.getByRole("button", { name: /explore the sample/i });
    if (await exploreBtn.isVisible()) {
      await exploreBtn.click();
      await page.waitForTimeout(500);
    }

    // 1. Resting Dashboard
    await page.screenshot({ path: path.join(outDir, "01-resting-dashboard.png") });
    console.log("Captured 01-resting-dashboard.png");

    // 2. Action Card Hover
    const firstTask = page.locator("[data-task]").first();
    if (await firstTask.isVisible()) {
      await firstTask.hover();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(outDir, "02-action-hover.png") });
      console.log("Captured 02-action-hover.png");
    }

    // 3. New Event / Action Composer
    await page.keyboard.press("n");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, "03-composer-event.png") });
    console.log("Captured 03-composer-event.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // 4. Quick Add Palette
    await page.keyboard.press("/");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, "04-command-palette.png") });
    console.log("Captured 04-command-palette.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // 5. Week View
    await page.keyboard.press("]");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, "05-week-view.png") });
    console.log("Captured 05-week-view.png");

    // 6. Navigation / Drawer / Menu
    const navBtn = page.locator('button[aria-label*="menu"], button[data-test="nav-toggle"], button.nb-shell-control').first();
    if (await navBtn.isVisible()) {
      await navBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, "06-nav-drawer.png") });
      console.log("Captured 06-nav-drawer.png");
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
    devServer.kill();
    process.exit(0);
  }
}

main();
