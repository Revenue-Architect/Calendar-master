import { expect, test } from "@playwright/test";
import { openPlanner, settledState } from "./helpers.js";

/* Seven note templates have been in the build, tested, since v8 -- and entirely
 * unreachable, because nothing offered them. The note model has had a
 * `templateProvenance` field for just as long with nothing able to write to it.
 *
 * These assert both halves: the body a template puts on the page, and the record
 * of which template it was. */

async function newNote(page) {
  await openPlanner(page);
  await page.getByRole("button", { name: "NOTES" }).click();
  await page.getByTestId("sheet").getByRole("button", { name: "+ NEW NOTE" }).click();
  await expect(page.getByTestId("note-templates")).toBeVisible();
}

test.describe("starting a note from a template", () => {
  test("the templates that exist are the templates offered", async ({ page }) => {
    await newNote(page);
    /* Named from the domain's own list rather than a second copy of it here: a
       template added there and not surfaced is exactly the bug being fixed. */
    const { listBuiltInNoteTemplates } = await import("../../src/domains/notes/index.js");
    for (const template of listBuiltInNoteTemplates()) {
      await expect(page.getByTestId(`note-template-${template.id}`)).toBeVisible();
    }
  });

  test("choosing one fills the page with its body", async ({ page }) => {
    await newNote(page);
    const body = page.getByTestId("sheet").getByRole("textbox").nth(1);
    await expect(body).toHaveValue("");

    await page.getByTestId("note-template-meeting").click();
    const filled = await body.inputValue();
    expect(filled.length, "the meeting template should put something on the page").toBeGreaterThan(0);
    expect(filled).toContain("#");
  });

  test("the note records which template it came from, and which version", async ({ page }) => {
    await newNote(page);
    await page.getByTestId("note-template-decision-record").click();
    await page.getByTestId("sheet").getByRole("textbox").first().fill("Pick a database");
    await page.getByTestId("sheet").getByRole("button", { name: "SAVE" }).click();

    const state = await settledState(page, (s) => (s.notes ?? []).some((n) => n.title === "Pick a database"));
    const note = state.notes.find((n) => n.title === "Pick a database");
    expect(note.templateProvenance, "the field the model has had since v8").toEqual({
      id: "decision-record", version: 1,
    });
    expect(note.blocks.length, "and the body it started from").toBeGreaterThan(0);
  });

  test("the blank template records no provenance, because there is nothing to record", async ({ page }) => {
    await newNote(page);
    await page.getByTestId("note-template-blank").click();
    await page.getByTestId("sheet").getByRole("textbox").first().fill("Just a thought");
    await page.getByTestId("sheet").getByRole("button", { name: "SAVE" }).click();

    const state = await settledState(page, (s) => (s.notes ?? []).some((n) => n.title === "Just a thought"));
    expect(state.notes.find((n) => n.title === "Just a thought").templateProvenance).toBeNull();
  });

  test("a note that already exists is not offered a template", async ({ page }) => {
    /* A template is a way to start, not a way to restructure something already
       written: applying one would either overwrite the note or need a merge
       nobody asked for. */
    await newNote(page);
    await page.getByTestId("sheet").getByRole("textbox").first().fill("Written already");
    await page.getByTestId("sheet").getByRole("button", { name: "SAVE" }).click();
    await expect(page.getByTestId("sheet")).toHaveCount(0, { timeout: 3000 });

    await page.getByRole("button", { name: "NOTES" }).click();
    await page.getByTestId("sheet").getByText("Written already").first().click();
    await expect(page.getByTestId("sheet")).toBeVisible();
    await expect(page.getByTestId("note-templates")).toHaveCount(0);
  });

  test("notebook rows enter with a restrained stagger", async ({ page }) => {
    await newNote(page);
    const sheet = page.getByTestId("sheet");
    await sheet.getByRole("textbox").first().fill("Animated note");
    await sheet.getByRole("textbox").nth(1).fill("A note whose row should arrive clearly.");
    await sheet.getByRole("button", { name: "SAVE" }).click();
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: "NOTES" }).click();
    const row = page.getByTestId("sheet").locator(".nb-list-enter").first();
    await expect(row).toBeVisible();
    const motion = await row.evaluate((node) => {
      const style = getComputedStyle(node);
      return { name: style.animationName, duration: style.animationDuration, delay: style.animationDelay };
    });
    expect(motion.name).toBe("nb-list-enter");
    expect(motion.duration).toBe("0.18s");
    expect(motion.delay).toBe("0s");
  });

  test("switching template replaces the body rather than stacking on it", async ({ page }) => {
    await newNote(page);
    const body = page.getByTestId("sheet").getByRole("textbox").nth(1);
    await page.getByTestId("note-template-meeting").click();
    const meeting = await body.inputValue();
    await page.getByTestId("note-template-weekly-review").click();
    const weekly = await body.inputValue();
    expect(weekly).not.toBe(meeting);
    expect(weekly.includes(meeting), "the previous template should be gone, not prepended").toBe(false);
  });
});
