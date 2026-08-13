import { expect } from "@playwright/test";

/* Shared setup for every browser spec.
 *
 * The planner keeps everything in localStorage, so a spec that inherits the
 * previous one's notebook is a spec that passes for the wrong reason. Each test
 * opens on a cleared origin and answers the first-run question the same way, so
 * what it asserts is what it created. */

export const STATE_KEY = "nbmp:state:v8";

/** Open the app on a clean notebook, with the sample week cleared. */
export async function openPlanner(page, { keepSample = false, showGestureHint = false } = {}) {
  /* Cleared once, before the run the test actually observes — not via
     `addInitScript`, which would fire again on every later navigation and wipe
     the notebook out from under any test that reloads to prove something was
     persisted. */
  await page.goto("/");
  await page.evaluate(() => { try { window.localStorage.clear(); } catch { /* nothing stored yet */ } });
  await page.reload();
  await expect(page.getByTestId("day-stream")).toBeVisible();

  /* First run offers the sample week. Both answers are legitimate app states;
     the specs mostly want an empty notebook so their own records are the only
     ones on screen. */
  const firstRun = page.locator('[data-test="sheet"][data-sheet-title="Welcome"]');
  if (await firstRun.isVisible().catch(() => false)) {
    await firstRun.getByRole("button", { name: keepSample ? "EXPLORE THE SAMPLE" : "START EMPTY" }).click();
    await expect(firstRun).toBeHidden();
  }
  /* The hint is intentionally first-use UI. Keep the default fixture focused
     on the surface under test, while allowing the resilience spec to opt into
     the user-visible onboarding copy explicitly. */
  if (!showGestureHint) {
    const hint = page.getByTestId("gesture-hint");
    if (await hint.isVisible().catch(() => false)) {
      await hint.getByTestId("gesture-hint-dismiss").click();
      await expect(hint).toBeHidden();
    }
  }
  /* Motion is real in this app; letting it settle keeps assertions about
     position from racing a sheet that is still morphing open. */
  await page.waitForTimeout(200);
}

/** Open the command palette and type a line into it. */
export async function palette(page, text) {
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByTestId("palette-input");
  await expect(input).toBeFocused();
  if (text) await input.fill(text);
  return input;
}

/** Create something through quick add and wait for the palette to close. */
export async function quickAdd(page, line) {
  await palette(page, line);
  const row = page.getByTestId("palette-quick-add");
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId("palette-input")).toBeHidden();
  await page.waitForTimeout(150);
}

/* Saving is debounced, so reading localStorage the instant after a write races
   the write. Poll the stored notebook instead of sleeping and hoping. */
export async function expectStored(page, predicate, message) {
  await expect.poll(async () => {
    const state = await storedState(page);
    return state ? Boolean(predicate(state)) : false;
  }, { message, timeout: 7_000 }).toBe(true);
}

/** The stored notebook, once it satisfies `predicate`. */
export async function settledState(page, predicate = () => true, message = "state never settled") {
  await expectStored(page, predicate, message);
  return storedState(page);
}

/** Is `element` inside the visible box of `container`? */
export async function isWithinViewport(element, container) {
  const inner = await element.boundingBox();
  const outer = await container.boundingBox();
  if (!inner || !outer) return false;
  return inner.y >= outer.y - 1 && inner.y + inner.height <= outer.y + outer.height + 1;
}

/** The planner state as the app has actually persisted it. */
export async function storedState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Snapshot one persisted event or task by id. */
export async function storedRecord(page, kind, id) {
  const state = await storedState(page);
  if (!state) return null;
  const list = kind === "task" ? state.tasks : state.events;
  return (list ?? []).find((item) => item.id === id) ?? null;
}

/** Is the inner box fully inside the outer box on both axes? */
export async function isContainedBy(inner, outer, axis = "both") {
  const child = await inner.boundingBox();
  const parent = await outer.boundingBox();
  if (!child || !parent) return false;
  const horizontal = child.x >= parent.x - 1 && child.x + child.width <= parent.x + parent.width + 1;
  const vertical = child.y >= parent.y - 1 && child.y + child.height <= parent.y + parent.height + 1;
  if (axis === "horizontal") return horizontal;
  if (axis === "vertical") return vertical;
  return horizontal && vertical;
}

/** The element under a point, using the page's own hit-testing. */
export async function hitTarget(page, x, y) {
  return page.evaluate(({ x: px, y: py }) => {
    const node = document.elementFromPoint(px, py);
    if (!node) return null;
    return {
      tag: node.tagName.toLowerCase(),
      test: node.getAttribute("data-test"),
      id: node.id || null,
      role: node.getAttribute("role"),
      name: node.getAttribute("aria-label") || node.textContent?.trim()?.slice(0, 80) || "",
      resize: node.closest("[data-resize]")?.getAttribute("data-resize-edge") ?? null,
      complete: Boolean(node.closest("[data-timeline-complete]")),
      join: Boolean(node.closest("a[href]")),
      chip: node.closest("[data-task-chip]")?.getAttribute("data-task-chip") ?? null,
      event: node.closest("[data-event-id]")?.getAttribute("data-event-id") ?? null,
    };
  }, { x, y });
}

/** Dispatch a browser cancellation against the current pointer or touch. */
export async function cancelCurrentPointer(page, kind = "pointer") {
  await page.evaluate((type) => {
    const target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) || document.body;
    const eventName = type === "touch" ? "touchcancel" : "pointercancel";
    const EventCtor = type === "touch" ? Event : PointerEvent;
    const init = type === "touch"
      ? { bubbles: true, cancelable: true }
      : { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" };
    target.dispatchEvent(new EventCtor(eventName, init));
    window.dispatchEvent(new EventCtor(eventName, init));
    document.dispatchEvent(new EventCtor(eventName, init));
  }, kind);
}

/* A point the pointer can actually be at: a week column is the full 24-hour
   height and mostly scrolled out of view, so its own centre is usually off the
   screen, where `elementFromPoint` returns nothing and the drop hits no day. */
async function droppablePoint(page, target, preferredY) {
  const box = await target.boundingBox();
  if (!box) throw new Error("cannot drag: the target has no box");
  const view = page.viewportSize() ?? { width: 1280, height: 900 };
  const top = Math.max(box.y, 0) + 4;
  const bottom = Math.min(box.y + box.height, view.height) - 4;
  if (bottom <= top) throw new Error("cannot drag: the target is not on screen");
  const y = preferredY == null
    ? (top + bottom) / 2
    : Math.min(Math.max(preferredY, top), bottom);
  return { x: box.x + box.width / 2, y };
}

/* A press-and-hold that lifts, then a move, then a drop. The app deliberately
   requires a hold before a drag so reading a column never turns into moving an
   event, so a plain `dragTo` would never lift anything. */
export async function pressHoldAndDrag(page, source, target, { holdMs = 600, steps = 12 } = {}) {
  /* The week grid opens scrolled to the current hour, so a card at another hour
     starts outside the visible strip. Bring it in before measuring: a press at a
     point that is not on screen lifts nothing. */
  await source.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const from = await source.boundingBox();
  if (!from) throw new Error("cannot drag: the source has no box");
  const grabY = from.y + Math.min(8, from.height / 2);
  /* Keep the same height in the day unless the target forces otherwise, so what
     is being tested is the horizontal move rather than an accidental reschedule. */
  const to = await droppablePoint(page, target, grabY);

  await page.mouse.move(from.x + from.width / 2, grabY);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/* Seed a notebook directly.
 *
 * Some states are impractical to build by clicking — a recurring series, a
 * hidden calendar, a notebook mid-migration. The spec runs in Node, so it can
 * build one with the same domain commands the app uses and hand the app a
 * notebook that is valid by construction rather than by hope. */
export async function seedPlanner(page, state, { showGestureHint = false } = {}) {
  await page.goto("/");
  await page.evaluate(([key, value]) => {
    window.localStorage.clear();
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [STATE_KEY, state]);
  await page.reload();
  await expect(page.getByTestId("day-stream")).toBeVisible();
  if (!showGestureHint) {
    const hint = page.getByTestId("gesture-hint");
    if (await hint.isVisible().catch(() => false)) {
      await hint.getByTestId("gesture-hint-dismiss").click();
      await expect(hint).toBeHidden();
    }
  }
  await page.waitForTimeout(250);
}
