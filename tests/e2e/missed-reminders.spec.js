import { expect, test } from "@playwright/test";
import { openPlanner, settledState } from "./helpers.js";
import { createScheduledReminder } from "../../src/domains/reminders/index.js";

/* A page cannot set an alarm for a time when it is not running, and this notebook
 * has no server to send one. What it can do is notice, the moment it opens, that
 * a reminder's time came and went while nothing was there to say so.
 *
 * Before this the ledger simply kept those records as `scheduled` for ever:
 * `getDueReminders` only looks five minutes back, so nothing ever picked them up
 * and nothing ever mentioned them. */

const REMINDER_KEY = "nbmp:reminders:v1";

const local = (offsetMinutes) => {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function reminderAt(scheduledFor, id, title) {
  return createScheduledReminder({
    source: { domain: "event", entityId: id, occurrenceId: null, intentId: "alert:0" },
    title, body: "Starting now", scheduledFor,
  }, { now: local(-60 * 24 * 30) });
}

async function seedReminders(page, records) {
  await page.goto("/");
  await page.evaluate(() => { try { window.localStorage.clear(); } catch { /* nothing stored */ } });
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [REMINDER_KEY, JSON.stringify(records)]);
  await page.reload();
  await expect(page.getByTestId("day-stream")).toBeVisible();
  const firstRun = page.locator('[data-test="sheet"][data-sheet-title="Welcome"]');
  if (await firstRun.isVisible().catch(() => false)) {
    await firstRun.getByRole("button", { name: "START EMPTY" }).click();
    await expect(firstRun).toBeHidden();
  }
  await page.waitForTimeout(400);
}

test.describe("what came due while the notebook was closed", () => {
  test("is reported on the next open, with what and when", async ({ page }) => {
    await seedReminders(page, [
      reminderAt(local(-180), "evt-standup", "Standup"),
      reminderAt(local(-90), "evt-review", "Client review"),
    ]);

    const strip = page.getByTestId("missed-reminders");
    await expect(strip, "two missed reminders should be reported").toBeVisible();
    await expect(strip).toContainText("2 reminders came due");

    await page.getByTestId("missed-reminders-review").click();
    const rows = page.getByTestId("missed-reminder-row");
    await expect(rows).toHaveCount(2);
    /* Most recent first: what you missed an hour ago matters more than this morning. */
    await expect(rows.first()).toContainText("Client review");
    await expect(rows.last()).toContainText("Standup");
  });

  test("one missed reminder is named rather than counted", async ({ page }) => {
    await seedReminders(page, [reminderAt(local(-120), "evt-solo", "Pick up the parcel")]);
    await expect(page.getByTestId("missed-reminders")).toContainText("Pick up the parcel");
  });

  test("clearing the report settles the ledger so it never reappears", async ({ page }) => {
    await seedReminders(page, [reminderAt(local(-120), "evt-standup", "Standup")]);
    await expect(page.getByTestId("missed-reminders")).toBeVisible();
    await page.getByTestId("missed-reminders-dismiss").click();
    await expect(page.getByTestId("missed-reminders")).toBeHidden();

    /* The status has to be written down, not just hidden: a reminder that is
       merely dismissed from view comes back on the next open. */
    await expect(async () => {
      const stored = await page.evaluate((key) => window.localStorage.getItem(key), REMINDER_KEY);
      const seeded = JSON.parse(stored ?? "[]").filter((r) => r.sourceKey.includes("evt-standup"));
      expect(seeded.map((r) => r.status)).toEqual(["missed"]);
    }).toPass({ timeout: 5000 });

    await page.reload();
    await expect(page.getByTestId("day-stream")).toBeVisible();
    await page.waitForTimeout(700);
    await expect(page.getByTestId("missed-reminders")).toBeHidden();
  });

  test("nothing missed means nothing said", async ({ page }) => {
    await seedReminders(page, [reminderAt(local(180), "evt-later", "Later today")]);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("missed-reminders")).toBeHidden();
  });

  test("a reminder older than the lookback is retired quietly, not reported", async ({ page }) => {
    /* Reopening after a month must not produce a wall of things you long ago
       stopped caring about — but they cannot stay active either. */
    await seedReminders(page, [reminderAt(local(-60 * 24 * 30), "evt-ancient", "Last month")]);
    await page.waitForTimeout(600);
    await expect(page.getByTestId("missed-reminders")).toBeHidden();
    await expect(async () => {
      const stored = await page.evaluate((key) => window.localStorage.getItem(key), REMINDER_KEY);
      const seeded = JSON.parse(stored ?? "[]").filter((r) => r.sourceKey.includes("evt-ancient"));
      expect(seeded.map((r) => r.status), "it must not be left active to be examined again for ever")
        .toEqual(["missed"]);
    }).toPass({ timeout: 5000 });
  });

  test("the settings say what notifications can and cannot do", async ({ page }) => {
    /* A toggle called "system notifications" implies the system will notify you.
       It will not, and being told that here is better than discovering it by
       missing something that mattered. */
    await openPlanner(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Only while the app is open", { exact: false })).toBeVisible();
  });
});
