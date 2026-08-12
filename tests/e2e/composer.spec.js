import { expect, test } from "@playwright/test";
import { openPlanner } from "./helpers.js";

/* The composer's kind switch drives a sliding pill indicator whose geometry is
 * measured from the DOM. Measuring runs on layout, so a switch that happens while
 * the sheet is still resizing has previously left the indicator at zero width or
 * stranded off the end of its row — visible as a missing or floating highlight.
 * Nothing in a unit test can see that; the numbers only exist in a real layout. */

const openComposer = async (page) => {
  await page.keyboard.press("n");
  await expect(page.getByTestId("composer")).toBeVisible();
};

/* Scoped to the kind switch's own tablist: the composer draws several pill rows,
   and asserting against whichever indicator happens to be first in the DOM would
   measure the category chips instead. */
const kindSwitch = (page) => page.getByTestId("composer").getByRole("tablist", { name: "What to add" });
const indicator = (page) => kindSwitch(page).getByTestId("pill-indicator");

test.describe("the composer", () => {
  test("opens on event and switches kind", async ({ page }) => {
    await openPlanner(page);
    await openComposer(page);
    const composer = page.getByTestId("composer");
    await expect(composer).toHaveAttribute("data-composer-kind", "event");

    await composer.getByRole("tab", { name: "ACTION", exact: true }).click();
    await expect(composer).toHaveAttribute("data-composer-kind", "task");

    await composer.getByRole("tab", { name: "EVENT", exact: true }).click();
    await expect(composer).toHaveAttribute("data-composer-kind", "event");
  });

  test("the pill indicator keeps a real size and stays inside its row", async ({ page }) => {
    await openPlanner(page);
    await openComposer(page);
    const composer = page.getByTestId("composer");

    for (const kind of ["ACTION", "EVENT", "ACTION", "EVENT"]) {
      await composer.getByRole("tab", { name: kind, exact: true }).click();
      await page.waitForTimeout(450); /* the slide is 420ms */

      const pill = indicator(page);
      await expect(pill).toBeVisible();
      const box = await pill.boundingBox();
      const row = await kindSwitch(page).boundingBox();

      expect(box, `no indicator box after switching to ${kind}`).not.toBeNull();
      expect(box.width, `indicator collapsed after switching to ${kind}`).toBeGreaterThan(8);
      expect(box.height, `indicator has no height after switching to ${kind}`).toBeGreaterThan(4);
      if (row) {
        expect(box.x).toBeGreaterThanOrEqual(row.x - 2);
        expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width + 2);
      }
    }
  });

  test("switching kind rapidly does not strand the indicator", async ({ page }) => {
    await openPlanner(page);
    await openComposer(page);
    const composer = page.getByTestId("composer");
    /* No settling time between clicks: the measurement has to survive being
       interrupted mid-animation, which is when it used to read zero. */
    for (let i = 0; i < 6; i += 1) {
      await composer.getByRole("tab", { name: i % 2 ? "EVENT" : "ACTION", exact: true }).click();
    }
    await page.waitForTimeout(600);
    const box = await indicator(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(8);
  });

  test("tile labels stay above their traveling fill", async ({ page }) => {
    await openPlanner(page);
    await openComposer(page);
    const composer = page.getByTestId("composer");
    const timing = composer.getByRole("button", { name: "AT A TIME", exact: true });

    const layers = await timing.evaluate((node) => {
      const indicator = node.parentElement.querySelector('[data-test="pill-indicator"]');
      return {
        buttonZ: getComputedStyle(node).zIndex,
        indicatorZ: indicator ? getComputedStyle(indicator).zIndex : null,
      };
    });

    expect(Number(layers.buttonZ), "the tile must paint above its fill").toBeGreaterThan(Number(layers.indicatorZ));
    await expect(timing).toBeVisible();
  });

  test("the sheet stays usable after the kind changes", async ({ page }) => {
    await openPlanner(page);
    await openComposer(page);
    const composer = page.getByTestId("composer");
    const sheet = page.getByTestId("sheet");

    await composer.getByRole("tab", { name: "ACTION", exact: true }).click();
    await expect(composer).toHaveAttribute("data-composer-kind", "task");

    /* The sheet remeasures its own height as the fields change; the save control
       has to still be reachable rather than clipped below the fold. */
    const save = sheet.getByRole("button", { name: /^(ADD TO TIMELINE|ADD ACTION|SAVE CHANGES)$/ });
    await expect(save).toBeVisible();
    const saveBox = await save.boundingBox();
    const sheetBox = await sheet.boundingBox();
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height + 2);

    /* And the sheet has to have actually resized rather than kept the event
       form's height with a gap at the bottom. */
    expect(sheetBox.height).toBeGreaterThan(120);
  });

  test("an action created from the composer lands in the notebook", async ({ page }) => {
    await openPlanner(page);
    await openComposer(page);
    const composer = page.getByTestId("composer");
    await composer.getByRole("tab", { name: "ACTION", exact: true }).click();
    await composer.getByRole("textbox").first().fill("Composer made this");
    await page.getByTestId("sheet").getByRole("button", { name: /^(ADD TO TIMELINE|ADD ACTION|SAVE CHANGES)$/ }).click();
    await expect(page.getByTestId("composer")).toBeHidden();
    await expect(page.getByText("Composer made this").first()).toBeVisible();
  });
});
