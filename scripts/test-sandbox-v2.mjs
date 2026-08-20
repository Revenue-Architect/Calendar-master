import { chromium } from "playwright";
import path from "path";
import fs from "fs";

async function main() {
  const screenshotsDir = path.resolve("./screenshots");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const fileUrl = `file:///${path.resolve("interactive-sandbox.html").replace(/\\/g, "/")}`;
  console.log("Loading updated sandbox:", fileUrl);
  await page.goto(fileUrl);
  await page.waitForTimeout(400);

  // 1. Drag task 1 from Actions Pane to Timeline (10:00 AM, top = 240px)
  const task1 = page.locator("#card-task-1");
  const box1 = await task1.boundingBox();
  await page.mouse.move(box1.x + 40, box1.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(400, 310, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotsDir, "v2-01-initial-schedule.png") });
  console.log("Captured v2-01-initial-schedule.png");

  // 2. Drag the newly placed card DIRECTLY ON THE TIMELINE to 2:00 PM (top = 480px)
  const timelineCard = page.locator("#timeline-task-1");
  const tBox = await timelineCard.boundingBox();
  await page.mouse.move(tBox.x + 100, tBox.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(tBox.x + 100, 560, { steps: 8 }); // drag down to 2 PM
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotsDir, "v2-02-rescheduled-on-timeline.png") });
  console.log("Captured v2-02-rescheduled-on-timeline.png");

  // 3. Drag task 1 again from the RIGHT PANE (should move the existing block, NO duplicate)
  const box1Again = await task1.boundingBox();
  await page.mouse.move(box1Again.x + 40, box1Again.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(400, 200, { steps: 8 }); // move to 8:00 AM
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotsDir, "v2-03-rescheduled-from-actions-no-dupe.png") });
  console.log("Captured v2-03-rescheduled-from-actions-no-dupe.png");

  await browser.close();
  console.log("All v2 tests completed successfully!");
}

main().catch(console.error);
