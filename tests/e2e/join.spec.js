import { expect, test } from "@playwright/test";
import { seedPlanner } from "./helpers.js";
import { createBlankPlannerState } from "../../src/platform/persistence/plannerStateImport.js";
import { createEvent } from "../../src/domains/calendar/index.js";
import { keyOf } from "../../src/shared/time/dateKey.js";

/* A meeting link has to be one tap from wherever the meeting appears. It already
 * was on the timed timeline card and in the detail sheet; the agenda and the
 * ALL DAY strip made you open the detail first, because a row is a button and an
 * anchor inside a button is invalid HTML.
 *
 * These assert both halves: the link is reachable in every surface, and the
 * markup that reaches it is still valid. */

const today = keyOf(new Date());
const LINK = "https://meet.example.com/abc-defg";

function seeded() {
  let state = createBlankPlannerState({});
  state = createEvent(state, {
    calendarId: "calendar-default", title: "Timed with link", category: "PEOPLE", link: LINK,
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${today}T09:00`, endLocal: `${today}T09:30` },
  }, { id: "evt-timed" }).state;
  state = createEvent(state, {
    calendarId: "calendar-default", title: "All day with link", category: "PEOPLE", link: LINK,
    timing: { kind: "all-day", startDate: today, endDateExclusive: keyOf(new Date(Date.now() + 86400000)) },
  }, { id: "evt-allday" }).state;
  return createEvent(state, {
    calendarId: "calendar-default", title: "No link at all", category: "ADMIN",
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${today}T14:00`, endLocal: `${today}T14:30` },
  }, { id: "evt-plain" }).state;
}

function shortBackToBack() {
  let state = createBlankPlannerState({});
  state = createEvent(state, {
    calendarId: "calendar-default", title: "Short linked meeting", category: "PEOPLE", link: LINK,
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${today}T10:00`, endLocal: `${today}T10:15` },
  }, { id: "evt-short-linked" }).state;
  return createEvent(state, {
    calendarId: "calendar-default", title: "Following meeting", category: "ADMIN",
    timing: { kind: "timed", timeZoneMode: "floating", startLocal: `${today}T10:15`, endLocal: `${today}T10:30` },
  }, { id: "evt-following" }).state;
}

const joins = (page) => page.getByRole("link", { name: /^Join / });

test.describe("joining a meeting", () => {
  test("Day JOIN opens the meeting instead of the Event sheet", async ({ page }) => {
    await seedPlanner(page, seeded());
    const join = page.getByRole("link", { name: "Join Timed with link" });
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute("href", LINK);
    await join.click();
    await expect(page.getByTestId("sheet")).toHaveCount(0);
  });

  test("the ALL DAY strip offers JOIN", async ({ page }) => {
    await seedPlanner(page, seeded());
    const join = page.getByRole("link", { name: "Join All day with link" });
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute("href", LINK);
    await expect(join).toHaveAttribute("target", "_blank");
    await expect(join).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("short Day JOIN stays inside its card and cannot steal the following event", async ({ page }) => {
    await seedPlanner(page, shortBackToBack());
    const card = page.locator('[data-event-id="evt-short-linked"]');
    const join = page.getByRole("link", { name: "Join Short linked meeting" });
    await card.scrollIntoViewIfNeeded();
    const [cardBox, joinBox] = await Promise.all([card.boundingBox(), join.boundingBox()]);
    expect(cardBox).not.toBeNull();
    expect(joinBox).not.toBeNull();
    expect(joinBox.y).toBeGreaterThanOrEqual(cardBox.y - 1);
    expect(joinBox.y + joinBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  });

  test("mobile short Day JOIN reserves a horizontal lane without moving card data down", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlanner(page, shortBackToBack());
    const card = page.locator('[data-event-id="evt-short-linked"]');
    const title = card.getByText("Short linked meeting", { exact: true });
    const range = card.locator(".nb-event-short-time");
    const join = page.getByRole("link", { name: "Join Short linked meeting" });
    await card.scrollIntoViewIfNeeded();

    const [cardBox, titleBox, rangeBox, joinBox] = await Promise.all([
      card.boundingBox(), title.boundingBox(), range.boundingBox(), join.boundingBox(),
    ]);
    for (const [label, box] of [["card", cardBox], ["title", titleBox], ["range", rangeBox], ["JOIN", joinBox]]) {
      expect(box, `${label} is missing`).not.toBeNull();
    }
    expect(titleBox.y, "the title must remain top-aligned in a short linked card").toBeLessThanOrEqual(cardBox.y + 2);
    expect(rangeBox.y, "the range must stay in the card's existing row").toBeLessThanOrEqual(cardBox.y + 3);
    expect(titleBox.x + titleBox.width, "JOIN must not cover the title").toBeLessThanOrEqual(joinBox.x - 4);
    expect(rangeBox.x + rangeBox.width, "JOIN must not cover the time range").toBeLessThanOrEqual(joinBox.x - 4);
    expect(joinBox.y + joinBox.height, "JOIN must stay inside the existing card height").toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  });

  test("Week exposes direct JOIN for all-day meetings", async ({ page }) => {
    await seedPlanner(page, seeded());
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    const join = page.getByRole("link", { name: "Join All day with link" });
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute("href", LINK);
  });

  test("Week JOIN reserves space instead of covering its title", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlanner(page, shortBackToBack());
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    const join = page.getByRole("link", { name: "Join Short linked meeting" });
    const wrapper = join.locator("..");
    const eventFace = wrapper.getByTestId("week-event");
    const [joinBox, eventBox] = await Promise.all([join.boundingBox(), eventFace.boundingBox()]);
    expect(joinBox).not.toBeNull();
    expect(eventBox).not.toBeNull();
    expect(eventBox.x + eventBox.width).toBeLessThanOrEqual(joinBox.x - 1);
    await expect(eventFace.getByText("Short linked meeting", { exact: true })).toHaveCSS("overflow", "hidden");
  });

  test("agenda rows offer JOIN for both timed and all-day events", async ({ page }) => {
    await seedPlanner(page, seeded());
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await page.waitForTimeout(200);

    for (const title of ["Timed with link", "All day with link"]) {
      const join = page.getByRole("link", { name: `Join ${title}` });
      await expect(join, `${title} has no JOIN in the agenda`).toBeVisible();
      await expect(join).toHaveAttribute("href", LINK);
      await expect(join).toHaveAttribute("rel", "noopener noreferrer");
    }
    await expect(page.getByRole("link", { name: "Join No link at all" })).toHaveCount(0);
  });

  test("agenda keeps titles and metadata in readable lanes beside JOIN", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await seedPlanner(page, seeded());
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await page.waitForTimeout(200);

    for (const [title, metadata] of [["Timed with link", "9:00 AM"], ["All day with link", "ALL DAY"]]) {
      const join = page.getByRole("link", { name: `Join ${title}` });
      const row = join.locator("..");
      const titleText = row.getByText(title, { exact: true });
      const trailing = row.getByText(metadata, { exact: true });
      const [joinBox, titleBox, trailingBox] = await Promise.all([
        join.boundingBox(), titleText.boundingBox(), trailing.boundingBox(),
      ]);
      expect(joinBox).not.toBeNull();
      expect(titleBox).not.toBeNull();
      expect(trailingBox).not.toBeNull();
      expect(
        await titleText.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        `${title} should fit instead of being sacrificed to metadata`,
      ).toBe(true);
      expect(
        trailingBox.x + trailingBox.width,
        `${title} metadata must not run under JOIN`,
      ).toBeLessThanOrEqual(joinBox.x - 1);
      expect(
        trailingBox.y,
        `${title} metadata should sit below the title instead of through its line`,
      ).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
    }
  });

  test("an event with no link shows no JOIN anywhere", async ({ page }) => {
    await seedPlanner(page, seeded());
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await page.waitForTimeout(200);
    const labels = await joins(page).evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));
    expect(labels).not.toContain("Join No link at all");
  });

  test("the row still opens the event, and JOIN does not", async ({ page }) => {
    await seedPlanner(page, seeded());
    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await page.waitForTimeout(200);

    /* Tapping the row body opens the detail — the link overlay must not have
       eaten the row's own tap target. */
    await page.getByText("Timed with link", { exact: true }).first().click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("textbox").first()).toHaveValue("Timed with link");
  });

  test("no anchor is nested inside a button, on any surface", async ({ page }) => {
    await seedPlanner(page, seeded());
    const check = async (where) => {
      const nested = await page.evaluate(() => document.querySelectorAll("button a, a button").length);
      expect(nested, `invalid nested interactive markup in ${where}`).toBe(0);
    };
    await check("the day view");

    await page.getByRole("tab", { name: "AGENDA", exact: true }).click();
    await page.waitForTimeout(200);
    await check("the agenda");

    await page.getByRole("tab", { name: "TIMELINE", exact: true }).click();
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await check("the week view");

    await page.getByTestId("zoom-in").click();
    await page.getByText("Timed with link", { exact: true }).first().click();
    await expect(page.getByTestId("sheet")).toBeVisible();
    await check("the detail sheet");
  });
});
