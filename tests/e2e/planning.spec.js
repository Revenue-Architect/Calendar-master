import { expect, test } from "@playwright/test";
import { openPlanner, palette, quickAdd, isWithinViewport, settledState } from "./helpers.js";

/* Untimed actions and the detail editor.
 *
 * An action with no day is the ordinary case for capture — you write it down
 * before you decide when. It has to open like anything else, carry forward
 * across days until it is decided about, and be schedulable onto the timeline. */

const TITLE = "Book the rehearsal room";
const row = (page, text) => page.getByText(text, { exact: true }).first();

test.describe("untimed actions", () => {
  test("open from the list like anything else", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, TITLE);

    await row(page, TITLE).click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    /* The detail view *is* the editor, so the title is a field holding the
       value rather than static text. */
    await expect(sheet.getByRole("textbox").first()).toHaveValue(TITLE);
    await expect(sheet.getByRole("button", { name: /^EDIT/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("stay on every day ahead until they are given one", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, TITLE);
    await expect(row(page, TITLE)).toBeVisible();

    /* Forward a week, one day at a time: an undated action is work still owed,
       so it must be on each of them rather than only on the day it was typed. */
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press("ArrowRight");
      await expect(row(page, TITLE), `missing ${i + 1} day(s) ahead`).toBeVisible();
    }

    /* And not behind: it was not owed on a day that has already gone. */
    await page.keyboard.press("t");
    for (let i = 0; i < 2; i += 1) await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0);
  });

  test("stop carrying once they are completed", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, TITLE);
    await expect(row(page, TITLE)).toBeVisible();

    await page.keyboard.press("c");
    await settledState(
      page,
      (state) => state.tasks.find((item) => item.title === TITLE)?.status === "completed",
      "completing the action was never written",
    );

    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0);
  });

  test("can be dragged onto the timeline, and then stop carrying", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, TITLE);

    /* The drag handle starts the gesture on pointerdown — no hold — and the day
       stream is the drop target that schedules it at the minute under the
       pointer. This is the real path a person takes. */
    const card = page.locator("[data-task]").filter({ hasText: TITLE }).first();
    const handle = card.getByRole("button", { name: /^Drag to schedule/ });
    await expect(handle).toBeVisible();

    const from = await handle.boundingBox();
    const stream = page.getByTestId("day-stream");
    const target = await stream.boundingBox();

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 14 });
    await page.waitForTimeout(120);
    await page.mouse.up();

    const state = await settledState(
      page,
      (s) => s.tasks.find((item) => item.title === TITLE)?.planned?.startMinute != null,
      "the drag never scheduled the action",
    );
    const task = state.tasks.find((item) => item.title === TITLE);
    expect(task.planned.date).toBeTruthy();
    expect(task.planned.startMinute).toBeGreaterThanOrEqual(0);
    expect(task.planned.startMinute).toBeLessThan(1440);

    /* Now that it has a day, it belongs to that day and stops following. */
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0);
  });
});

test.describe("quick add", () => {
  test("reads a whole line into an event", async ({ page }) => {
    await openPlanner(page);
    await quickAdd(page, "Lunch w/ Sara tomorrow 1pm 45m");

    const state = await settledState(
      page,
      (s) => s.events.some((item) => item.title === "Lunch w/ Sara"),
      "the parsed event was never written",
    );
    const event = state.events.find((item) => item.title === "Lunch w/ Sara");
    expect(event.timing.kind).toBe("timed");
    expect(event.timing.startLocal.slice(11)).toBe("13:00");
    expect(event.timing.endLocal.slice(11)).toBe("13:45");
    /* Tomorrow, not today — the day was part of the line. */
    const today = await page.evaluate(() => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    });
    expect(event.timing.startLocal.slice(0, 10)).not.toBe(today);
  });

  test("shows what it read before committing", async ({ page }) => {
    await openPlanner(page);
    await palette(page, "Lunch w/ Sara tomorrow 1pm 45m");
    const quick = page.getByTestId("palette-quick-add");
    await expect(quick).toContainText("Lunch w/ Sara");
    await expect(quick).toContainText("1:00 PM");
  });

  test("an unparseable line falls back to the composer, prefilled", async ({ page }) => {
    await openPlanner(page);
    await palette(page, "Something with no time or day at all");
    await page.getByTestId("palette-open-composer").click();

    const composer = page.getByTestId("composer");
    await expect(composer).toBeVisible();
    await expect(composer.getByRole("textbox").first()).toHaveValue("Something with no time or day at all");
  });

  test("the palette runs commands as well as finding things", async ({ page }) => {
    await openPlanner(page);
    await palette(page, "week view");
    await page.getByTestId("palette-cmd-view-week").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
  });

  test("arrow keys and Enter drive the palette without the mouse", async ({ page }) => {
    await openPlanner(page);
    await palette(page, "Walk the dog");
    /* The first row is the quick add; Enter on it commits. */
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("palette-input")).toBeHidden();
    await expect(row(page, "Walk the dog")).toBeVisible();
  });
});

test.describe("the detail editor", () => {
  const openReview = async (page) => {
    /* Quick add moves to the day it just wrote to, so the event is already on
       screen — stepping a day here would step past it. */
    await quickAdd(page, "Quarterly review tomorrow 3pm 90m");
    await row(page, "Quarterly review").click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /^EDIT/ }).click();
    return sheet;
  };

  test("keeps the field being edited in view", async ({ page }) => {
    await openPlanner(page);
    const sheet = await openReview(page);

    /* Walk every focusable field in the sheet. Each one, once focused, has to be
       inside the sheet's own scroll viewport — a field you are typing into and
       cannot see is the specific regression this guards. */
    const fields = sheet.locator("input, textarea, [contenteditable='true']");
    const count = await fields.count();
    expect(count, "the editor should expose several fields").toBeGreaterThan(2);

    let checked = 0;
    for (let i = 0; i < count; i += 1) {
      const field = fields.nth(i);
      if (!(await field.isVisible().catch(() => false))) continue;
      await field.scrollIntoViewIfNeeded();
      await field.focus();
      await page.waitForTimeout(120);
      expect(
        await isWithinViewport(field, sheet),
        `field ${i} scrolled out of the sheet when focused`,
      ).toBe(true);
      checked += 1;
    }
    expect(checked, "no visible field was actually checked").toBeGreaterThan(1);
  });

  test("an edit is held until it is saved, and Revert puts it back", async ({ page }) => {
    await openPlanner(page);
    const sheet = await openReview(page);

    const title = sheet.getByRole("textbox", { name: "Event title" });
    await title.fill("Renamed while editing");
    await title.press("Tab"); /* inline fields commit to the draft on leaving */

    /* The control says REVERT rather than CANCEL exactly when there is a held
       edit to throw away — so this assertion is also the proof that the draft
       took, and that the button below is undoing something real. */
    const revert = sheet.getByRole("button", { name: /^(REVERT|CANCEL)$/ });
    await expect(revert).toHaveText("REVERT");
    await revert.click();
    await page.waitForTimeout(400);

    const state = await settledState(page, (s) => s.events.length > 0);
    expect(state.events.some((item) => item.title === "Quarterly review")).toBe(true);
    expect(state.events.some((item) => item.title === "Renamed while editing")).toBe(false);
  });

  test("an edit that is saved is kept", async ({ page }) => {
    await openPlanner(page);
    const sheet = await openReview(page);

    const title = sheet.getByRole("textbox", { name: "Event title" });
    await title.fill("Renamed and saved");
    await title.press("Tab");
    /* The accessible name carries the unsaved-changes dot, so match the prefix. */
    await sheet.getByRole("button", { name: /^SAVE/ }).click();

    await settledState(
      page,
      (s) => s.events.some((item) => item.title === "Renamed and saved"),
      "the saved rename was never written",
    );
  });
});
