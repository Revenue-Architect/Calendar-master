import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

async function main() {
  const screenshotsDir = path.resolve("./screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log("Starting Vite dev server...");
  const devServer = spawn("npx", ["vite", "--port", "5173", "--strictPort"], {
    shell: true,
    stdio: "pipe",
  });

  // wait for server to start
  await new Promise((resolve) => {
    devServer.stdout.on("data", (data) => {
      const out = data.toString();
      console.log("[vite]", out);
      if (out.includes("Local:") || out.includes("5173")) {
        resolve();
      }
    });
    devServer.stderr.on("data", (data) => {
      console.error("[vite err]", data.toString());
    });
    setTimeout(resolve, 5000);
  });

  console.log("Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto("http://localhost:5173");
    await page.waitForTimeout(1500);

    // 1. Day View
    await page.screenshot({ path: path.join(screenshotsDir, "01-day-view.png"), fullPage: true });
    console.log("Captured 01-day-view.png");

    // 2. Week View
    const weekBtn = page.getByRole("button", { name: /week/i }).or(page.locator('[data-test="view-week"]'));
    if (await weekBtn.count() > 0) {
      await weekBtn.first().click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotsDir, "02-week-view.png"), fullPage: true });
      console.log("Captured 02-week-view.png");
    }

    // 3. Command Palette
    await page.keyboard.press("/");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, "03-command-palette.png") });
    console.log("Captured 03-command-palette.png");

    // 4. Keyboard Shortcuts Sheet
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.keyboard.press("?");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, "04-shortcuts.png") });
    console.log("Captured 04-shortcuts.png");

  } catch (err) {
    console.error("Error capturing screenshots:", err);
  } finally {
    await browser.close();
    devServer.kill();
    process.exit(0);
  }
}

main();
