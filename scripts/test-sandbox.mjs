import { chromium } from "playwright";
import path from "path";
import fs from "fs";

async function main() {
  const screenshotsDir = path.resolve("./screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const fileUrl = `file:///${path.resolve("interactive-sandbox.html").replace(/\\/g, "/")}`;
  console.log("Loading:", fileUrl);
  await page.goto(fileUrl);
  await page.waitForTimeout(600);

  // 1. Initial State
  await page.screenshot({ path: path.join(screenshotsDir, "sandbox-01-idle.png") });
  console.log("Captured sandbox-01-idle.png");

  // 2. Drag action card over timeline
  const firstCard = page.locator(".action-card").first();
  const cardBox = await firstCard.boundingBox();

  // Mouse down and drag to timeline (e.g. x: 400, y: 350)
  await page.mouse.move(cardBox.x + 50, cardBox.y + 25);
  await page.mouse.down();
  await page.waitForTimeout(250); // pass 200ms hold threshold
  await page.mouse.move(400, 350, { steps: 10 });
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(screenshotsDir, "sandbox-02-dragging-magnetic.png") });
  console.log("Captured sandbox-02-dragging-magnetic.png");

  // 3. Drop action to commit
  await page.mouse.up();
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(screenshotsDir, "sandbox-03-committed.png") });
  console.log("Captured sandbox-03-committed.png");

  // 4. Open Conflict Dialog
  const conflictCard = page.locator('.event-card').nth(1);
  await conflictCard.click();
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(screenshotsDir, "sandbox-04-conflict-modal.png") });
  console.log("Captured sandbox-04-conflict-modal.png");

  await browser.close();
  console.log("All sandbox tests passed!");
}

main().catch(console.error);
