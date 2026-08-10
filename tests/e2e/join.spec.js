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

const joins = (page) => page.getByRole("link", { name: /^Join / });

test.describe("joining a meeting", () => {
  test("the ALL DAY strip offers JOIN", async ({ page }) => {
    await seedPlanner(page, seeded());
    const join = page.getByRole("link", { name: "Join All day with link" });
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute("href", LINK);
    await expect(join).toHaveAttribute("target", "_blank");
    await expect(join).toHaveAttribute("rel", "noopener noreferrer");
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
