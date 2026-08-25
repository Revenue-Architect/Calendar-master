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

  await new Promise((resolve) => {
    devServer.stdout.on("data", (data) => {
      const out = data.toString();
      if (out.includes("Local:") || out.includes("5173")) {
        resolve();
      }
    });
    setTimeout(resolve, 4000);
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto("http://localhost:5173");
    await page.waitForTimeout(1000);

    // Dismiss initial sample modal if present
    const exploreBtn = page.getByRole("button", { name: /explore the sample/i });
    if (await exploreBtn.isVisible()) {
      await exploreBtn.click();
      await page.waitForTimeout(500);
    }

    // 1. Day View + Actions
    await page.screenshot({ path: path.join(screenshotsDir, "01-main-dashboard.png") });
    console.log("Captured 01-main-dashboard.png");

    // 2. Week View
    await page.keyboard.press("]");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, "02-week-timeline.png") });
    console.log("Captured 02-week-timeline.png");

    // 3. Command Palette
    await page.keyboard.press("/");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, "03-command-palette.png") });
    console.log("Captured 03-command-palette.png");

    // 4. Keyboard Shortcuts
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.keyboard.press("?");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, "04-shortcuts.png") });
    console.log("Captured 04-shortcuts.png");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
    devServer.kill();
    process.exit(0);
  }
}

main();
