# Shared Layout Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the NEW-to-composer material morph and the compact TIMELINE / AGENDA / ACTIONS expanding-sibling motion on Calendar Master's existing web clip-path and liquid-pill systems.

**Architecture:** Keep `fluidMorphFromRects` and `Sheet` notch geometry. Hold accent fill through the reveal stage, then wash to `T.card` on the same surface. Keep `useLiquidPill` / `LiquidPillIndicator`. At compact width only, give `PillNav` icon+clipping-word siblings and FLIP translations; desktop stays three labeled tabs. No new animation library.

**Tech Stack:** React 19, Vite, native CSS / WAAPI, Node test runner, Playwright e2e against production Vite preview on port 4321.

## Global Constraints

- Honor `DESIGN.md`: one ground + one accent, three voices, origin-revealed sheets, fortieth-time test.
- Do not animate `width`, `height`, `top`, `left`, `padding`, or `margin` on the sheet. Pill siblings use `grid-template-columns` + `transform`, not width springs.
- Never scale a container that has content. See `src/features/motion/fluidGeometry.js`.
- Keyboard-initiated composer and view changes use `morph: "none"` / instant state.
- `prefers-reduced-motion` skips travel, leaves no source skin, keeps opacity and focus.
- No React Native, no Framer Motion, no Reanimated, no hardcoded `#E2F952` / zinc, no Ikigro copy.
- Production code is preceded by a failing regression test.
- Commit named files only. Do not `git add .`.
- Preserve untracked audit / planning artifacts.
- Focused e2e + `npm test` are the gate. Do not block on the historically timing-out full Playwright suite.

**Spec:** `docs/superpowers/specs/2026-08-15-shared-layout-motion-prd.md`

---

### Task 1: Lock the NEW mid-morph material contract

**Files:**
- Modify: `tests/e2e/motion.spec.js`
- Modify: `src/Planner.jsx` (`Sheet` background staging around the existing `morphStage` / `nbnotchin` block near the `backgroundColor: morph === "notch"` style)
- Test: `tests/e2e/motion.spec.js` notch-morph describe

**Interfaces:**
- Consumes: existing `data-test="sheet"`, `data-test="morph-source-label"`, `data-test="new-entry"`, `nbnotchin`, `morphStage`
- Produces: at 40% of `nbnotchin`, sheet fill is still `morphSurface.background` / accent; at 100% it is `T.card`

- [ ] **Step 1: Write the failing mid-morph fill assertion**

In the existing notch-morph test that already pauses `nbnotchin` at `duration * 0.4`, add a fill probe next to the source/body opacity checks:

```js
const mid = await sheet.evaluate((node) => {
  const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
  entry.currentTime = entry.effect.getComputedTiming().duration * 0.4;
  const body = node.querySelector(".nb-notch-body");
  const source = node.querySelector('[data-test="morph-source-label"]');
  return {
    source: Number(getComputedStyle(source).opacity),
    body: Number(getComputedStyle(body).opacity),
    fill: getComputedStyle(node).backgroundColor,
  };
});
expect(mid.source, "the trigger label must remain the visible material until the sheet has a place to land").toBeGreaterThanOrEqual(0.9);
expect(mid.body, "the form must not arrive before the clip has a sheet").toBeLessThan(0.2);
expect(mid.fill, "the clipped window is still the accent trigger, not the settled card").not.toBe("rgba(0, 0, 0, 0)");
```

Also assert the settled sheet fill differs from the mid-open fill after the animation is allowed to finish. Read the trigger's computed background before click and compare mid-open fill to that accent, not to a hardcoded lime.

- [ ] **Step 2: Run the focused test and confirm it fails for the right reason**

Run: `npx playwright test tests/e2e/motion.spec.js --grep "creation carries the trigger material"`

Expected: FAIL because mid-open background has already become `T.card`.

- [ ] **Step 3: Hold accent through reveal**

In `Sheet`, change the inline `backgroundColor` so accent is used for `source`, `reveal`, and `closing`, and `T.card` is used for `content` and `open`. Keep the existing `transition: background-color 210ms cubic-bezier(.22,.85,.28,1)` on `.nb-fluid[data-fluid-origin="notch"]`.

Do not change clip-path math. Do not reintroduce wall-clock label timeouts.

- [ ] **Step 4: Re-run the focused test**

Run: `npx playwright test tests/e2e/motion.spec.js --grep "notch morph"`

Expected: PASS, including reverse-close, reduced-motion, and keyboard `morph: none` cases.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/motion.spec.js src/Planner.jsx
git commit -m "fix(ui): keep NEW accent material until the composer lands"
```

---

### Task 2: Teach PillNav how to describe compact vs labeled options

**Files:**
- Create: `src/features/motion/viewPills.js`
- Create: `src/features/motion/viewPills.test.js`
- Modify: `src/Planner.jsx` only later, in Task 3

**Interfaces:**
- Consumes: option tuples `[key, label]`
- Produces:

```js
export const VIEW_PILL_COMPACT_MAX = 640;

export function viewPillTrackWidth({ icon = 44, gap = 8, word = 88, count = 3 } = {}) {
  return icon * count + gap * (count - 1) + word;
}

export function viewPillColumns(active) {
  return active ? "auto 1fr" : "auto 0fr";
}
```

- [ ] **Step 1: Write the failing unit tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { viewPillTrackWidth, viewPillColumns, VIEW_PILL_COMPACT_MAX } from "./viewPills.js";

test("reserves one word plus three icon slots so WEEK is not crushed", () => {
  assert.equal(viewPillTrackWidth(), 44 * 3 + 8 * 2 + 88);
  assert.ok(viewPillTrackWidth() <= 240);
});

test("only the active sibling opens a word column", () => {
  assert.equal(viewPillColumns(true), "auto 1fr");
  assert.equal(viewPillColumns(false), "auto 0fr");
});

test("compact behavior is a phone-width contract", () => {
  assert.equal(VIEW_PILL_COMPACT_MAX, 640);
});
```

- [ ] **Step 2: Run the unit file and confirm it fails**

Run: `node --test src/features/motion/viewPills.test.js`

Expected: FAIL with `Cannot find module` or `viewPillTrackWidth is not a function`.

- [ ] **Step 3: Implement the helper**

Create `src/features/motion/viewPills.js` with the signatures above. Keep numbers named and documented: 44 is the coarse target, 88 is enough for `TIMELINE` at `label` size, 640 matches Tailwind `sm`.

- [ ] **Step 4: Re-run the unit file**

Run: `node --test src/features/motion/viewPills.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/motion/viewPills.js src/features/motion/viewPills.test.js
git commit -m "feat(ui): reserve a compact view-pill track"
```

---

### Task 3: Compact expanding sibling PillNav

**Files:**
- Create: `tests/e2e/view-pills.spec.js`
- Modify: `src/Planner.jsx` `PillNav` (near the current `function PillNav`) and the three view options at the month-navigator call site
- Reuse: `CalendarIcon`, `CheckIcon`, and a list/agenda SVG in the existing `UiIcon` family
- Test: `tests/e2e/view-pills.spec.js`, plus existing `getByRole("tab", { name: "ACTIONS" })` callers

**Interfaces:**
- Consumes: `viewPillTrackWidth`, `viewPillColumns`, `VIEW_PILL_COMPACT_MAX`, `useLiquidPill`, `LiquidPillIndicator`
- Produces: `data-test="view-mode"` tablist, each tab `data-test="view-mode-<key>"`, compact inactive tabs expose `data-compact="icon"`

- [ ] **Step 1: Write the failing compact-lane e2e**

```js
import { test, expect } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test("a phone view switcher grows one word and keeps icon-sized neighbors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  const timeline = page.getByTestId("view-mode-timeline");
  const actions = page.getByTestId("view-mode-actions");
  await expect(timeline).toBeVisible();
  const timelineWord = timeline.getByTestId("view-mode-label");
  expect((await timelineWord.boundingBox()).width, "active TIMELINE must keep a readable word").toBeGreaterThan(20);
  expect((await actions.boundingBox()).width, "inactive ACTIONS is an icon, not a third word").toBeLessThan(56);
  expect((await actions.boundingBox()).height).toBeGreaterThanOrEqual(44);

  await actions.click();
  await expect(actions).toHaveAttribute("aria-selected", "true");
  expect((await actions.getByTestId("view-mode-label").boundingBox()).width).toBeGreaterThan(20);
  expect((await timeline.boundingBox()).width).toBeLessThan(56);

  const zoomOut = page.getByTestId("zoom-out");
  expect((await zoomOut.boundingBox()).width, "WEEK / MONTH must survive the pill expansion").toBeGreaterThan(20);
});
```

Add a second test at 1280x900 that all three labels have width > 20, and a reduced-motion test that picking ACTIONS does not leave an in-flight transform.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test tests/e2e/view-pills.spec.js`

Expected: FAIL because `data-test="view-mode-timeline"` does not exist and all three words are visible on a 390-wide page.

- [ ] **Step 3: Implement compact PillNav**

Give `PillNav` an optional `compact` boolean and optional `icons` map. At the month-navigator call site, pass compact when `window.matchMedia("(max-width: 640px)")` matches (measure in the existing chrome, do not invent a second breakpoint system).

Each option renders as a two-column grid button:

- `role="tab"`, `aria-selected`, `aria-label={label}`
- `data-test={`view-mode-${key}`}`
- `data-compact={compact && !on ? "icon" : "label"}`
- `gridTemplateColumns: compact ? viewPillColumns(on) : "auto auto"`
- height 44, radius 999, color `on ? T.on : T.dim`

Wrap the tablist with `data-test="view-mode"` and `style={{ width: compact ? viewPillTrackWidth() : undefined }}`. Keep `LiquidPillIndicator`. Do not mount/unmount labels. Do not add goo.

Icons: Timeline = `CalendarIcon`, Agenda = a new `ListIcon` via `UiIcon` (three horizontal strokes), Actions = `CheckIcon`. Same stroke and `currentColor` as the rest of the set.

- [ ] **Step 4: Re-run compact, desktop, reduced-motion, and an existing ACTIONS tab test**

Run:

```
npx playwright test tests/e2e/view-pills.spec.js tests/e2e/actions.spec.js --grep "the actions column"
node --test src/features/motion/viewPills.test.js
```

Expected: PASS. Existing `getByRole("tab", { name: "ACTIONS" })` still resolves via `aria-label` / visible name.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/view-pills.spec.js src/Planner.jsx src/features/motion/viewPills.js
git commit -m "feat(ui): expand one view pill word at compact width"
```

---

### Task 4: Keyboard, reduced motion, and close-path hardening

**Files:**
- Modify: `tests/e2e/view-pills.spec.js`
- Modify: `tests/e2e/motion.spec.js` only if close-path assertions need the new accent hold
- Modify: `src/Planner.jsx` `PillNav` `onPick` and `Sheet` close path

**Interfaces:**
- Consumes: existing `onPick(mode, source)` where `source` is `"keyboard"` or `"pointer"`
- Produces: keyboard and reduced-motion paths set compact columns with no transition; NEW close still restores trigger visibility

- [ ] **Step 1: Write the failing input-path tests**

```js
test("keyboard view changes do not travel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  await page.getByTestId("view-mode-timeline").focus();
  await page.keyboard.press("Enter");
  const tab = page.getByRole("tab", { selected: true });
  const duration = await tab.evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(duration === "0s" || duration.startsWith("0s")).toBeTruthy();
});
```

If Enter on the already-selected tab is a no-op, focus `view-mode-agenda` via Tab and press Enter. Do not invent a roving tabindex unless one already exists.

- [ ] **Step 2: Run and confirm failure or document already-green**

Run: `npx playwright test tests/e2e/view-pills.spec.js tests/e2e/motion.spec.js --grep "keyboard|reduced"`

- [ ] **Step 3: Wire instant paths**

When `source === "keyboard"` or reduced motion is on, set a `data-motion="instant"` attribute on the tablist and disable transitions. On NEW close, cancel `nbnotchlabelout` / `nbnotchin` and restore the real trigger's visibility only after the reverse clip finishes, matching the current close contract.

- [ ] **Step 4: Re-run input-path tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/view-pills.spec.js tests/e2e/motion.spec.js src/Planner.jsx
git commit -m "fix(ui): keep keyboard and reduced-motion view changes instant"
```

---

### Task 5: Verify and stop

**Files:**
- None, unless a focused test reveals a one-line regression

- [ ] **Step 1: Unit suite**

Run: `npm test`

Expected: existing 550+ tests plus the new view-pill units pass.

- [ ] **Step 2: Focused e2e**

Run:

```
npx playwright test tests/e2e/motion.spec.js tests/e2e/view-pills.spec.js tests/e2e/actions.spec.js tests/e2e/join.spec.js
```

Expected: PASS. Do not start the full suite unless asked.

- [ ] **Step 3: Diff hygiene**

Confirm the diff touches only morph staging, `PillNav`, the new helper/tests, and this docs pair. No RN files. No theme hexes. No `git add .`.

- [ ] **Step 4: Final commit only if Step 3 required a fix**

Otherwise stop. Implementation of Tasks 1-4 is a later session.

---

## File map

| File | Role |
| --- | --- |
| `docs/superpowers/specs/2026-08-15-shared-layout-motion-prd.md` | Product + motion design (this work's authority) |
| `docs/superpowers/plans/2026-08-15-shared-layout-motion.md` | This plan |
| `src/features/motion/fluidGeometry.js` | Read-only geometry unless a bug is proven |
| `src/features/motion/viewPills.js` | Compact track math |
| `src/Planner.jsx` | `Sheet` accent hold; compact `PillNav` |
| `tests/e2e/motion.spec.js` | NEW material contract |
| `tests/e2e/view-pills.spec.js` | Compact / desktop / a11y pill contract |

## Spec coverage

| PRD section | Task |
| --- | --- |
| NEW material continuity | Task 1 |
| Compact reserved track | Task 2 |
| Expanding siblings + icons | Task 3 |
| Keyboard / reduced motion / reverse close | Task 4 |
| Verification / anti-goals | Task 5 |
| Desktop stays labeled | Task 3 desktop e2e |
| No RN / no layout springs | Global constraints + Task 5 hygiene |

## Out of scope for implementers

Ikigro form contents. Desktop collapsing pills. Goo on `PillNav`. Animation dependencies. Rewriting `fluidMorphFromRects`. Full Playwright suite. Untracked audit files.
