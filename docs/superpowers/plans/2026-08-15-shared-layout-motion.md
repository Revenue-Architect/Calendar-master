# Shared Layout Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the NEW-to-composer material morph and the compact TIMELINE / AGENDA / ACTIONS expanding-sibling motion on Calendar Master's existing web clip-path and liquid-pill systems.

**Architecture:** Keep `fluidMorphFromRects` and `Sheet` notch geometry. Move the accent-to-card wash onto the entry animation's own timeline so paint follows the clip, not the clock. Keep `useLiquidPill` / `LiquidPillIndicator` untouched for the five existing call sites; at compact width only, give `PillNav` a deterministic slot geometry, a clip-wiped word, FLIP-translated siblings, and a computed indicator box. No new animation library.

**Tech Stack:** React 19, Vite, native CSS / WAAPI, Node test runner, Playwright e2e against production Vite preview on port 4321.

**Spec:** `docs/superpowers/specs/2026-08-15-shared-layout-motion-prd.md`

---

## Revision note — read this before executing

This plan replaces a first draft that could not be executed as written. Every claim below was measured against `origin/main` before rewriting. The PRD is unchanged and remains the authority; only the *route* changed, and only where the draft contradicted the PRD or the code.

**Measured baseline (chromium, production preview):** `npm run build` clean · `npm test` 550/550 · `tests/e2e/motion.spec.js` 30/30 · `accessibility-quality.spec.js` overflow guard green.

What changed and why:

| Draft said | Measured reality | This plan does |
| --- | --- | --- |
| Task 1's mid-morph fill test fails on main | It **passes**. At 40% of `nbnotchin` (128ms) `morphStage` is still `source`, which already paints accent: `fill: rgb(204,255,0)`, `stage: "source"`, `fill === trigger accent → true`. The draft's literal assertion (`not.toBe("rgba(0, 0, 0, 0)")`) is a tautology that can never fail. | Probe 40% **and** 70%, compare against the trigger's own computed accent, and pause animations before reading. Red on main for the right reason. |
| Hold accent through `reveal` via `morphStage` | Paint stays on a wall clock while the test scrubs an animation timeline. With 400ms between click and probe the animation is **gone** (`NO ANIMATION LEFT`, `stage: "open"`) and the draft's snippet — which drops the `if (!entry?.effect)` guard that `motion.spec.js:128` has — throws. | Move the wash into a keyframe animation on the panel. Verified: keyframes override React's inline `background-color`, scrub correctly (`f40` accent → `f100` card), and fall back to the inline value under `animation-name: none`. The inline expression is left **exactly** as-is, so the close path and reduced motion are unaffected. |
| Keep `LiquidPillIndicator`, `useLiquidPill` still measures | With a fixed-width wrap plus per-tab track animation, **one** measurement fires in the whole interaction and the plate never corrects: indicator `{left:141,width:32}` vs true `{left:80,width:91}` — **61px right, 59px narrow, permanently**. Causes: `useLayoutEffect` reads `offsetWidth` pre-transition; `ResizeObserver` watches the *wrap*, which a fixed width stops resizing; `compact` is absent from the hook's deps. | Compact mode never measures. Slot geometry is a pure function in `viewPills.js`; the indicator box is computed from it. `useLiquidPill` is not modified, so the five other `PillNav` call sites carry zero risk. |
| `grid-template-columns: auto 0fr → auto 1fr` | WebKit has historically not animated grid tracks, and `playwright.config.js` is Chromium-only, so the suite can never catch it. `replit.md:17` confirms iOS Safari is a target — the only platform compact mode is *for*. | Grid columns are **static**. The word wipes with `clip-path` + `opacity` (verified scrubbing: `inset(0px 100% 0px 0px)` → `inset(0px 0% 0px 0px)`), siblings FLIP with `transform`. Both universally supported, both compositor-only, and closer to the PRD's own "no layout-property animation" rule than the mechanism §7.2 names. |
| `height 44` on compact tabs; `boundingBox().height >= 44` | Tabs are **24.9px** tall. The 44px target is `.nb-tap::after` (`Planner.jsx:4027` — `::after`, not `:before`), which does not affect `boundingBox()`, and `pointer:coarse` does not match in plain Desktop Chrome. The only way to pass was a real `height: 44`, growing the navigator row 38.9 → ~56px and chrome 181 → ~198px on a 390×844 phone — the exact trade `Planner.jsx:4008-4015` rejects in writing. | Drawn control keeps its height. Assert the pseudo-element in a `hasTouch: true` context, where `pointer:coarse` matches and `::after` measures **94.47 × 44** on a 25px button. No header growth, no PRD amendment. |
| `viewPillTrackWidth()` = 236, "must not crush WEEK / MONTH" | Today's tablist is **276.4px** wide. A reserved track is a *shrink*, not a grow — WEEK/MONTH gain room. The draft's concern was real but pointed the wrong way. | Track is 174px. The `<= 240` ceiling still holds with room to spare. |
| Keyboard/reduced motion assert `transitionDuration` is `"0s"` | The global rule at `Planner.jsx:4250` sets `transition-duration:1ms!important`; the measured value under reduced motion is `"0.001s"`. `"0.001s".startsWith("0s")` is false — the assertion cannot pass. | Assert `transitionProperty === "none"`. |
| — | `Sheet`'s stage effect (`:7852`) checks only the media query, while `reducedMotion` (`:1298`) is preference-**or**-query. With the in-app preference on, stage timers still run under `animation-name:none!important`. | Task 1 Step 6 closes that gap with the signal `requestClose` already uses. |
| "measure in the existing chrome, do not invent a second breakpoint system" | There is no 640px breakpoint to reuse. The only JS breakpoint is an ad-hoc `matchMedia("(max-width:1023px)")` at `:2895`; CSS uses `max-width:639px` at `:4242`. `max-width: 640px` also disagrees with Tailwind `sm` (min-width 640) at exactly 640px. | Task 2 adds `VIEW_PILL_COMPACT_MAX = 639.98` and Task 3 adds a `useCompactViewPills` hook with a `change` listener, so rotation works. |

Verified safe, no action needed:

- All **66** `getByRole("tab", { name })` calls across 13 spec files survive: `UiIcon` is `aria-hidden="true" focusable="false"` (`:540`) and an `opacity:0` / `clip-path`-hidden label stays in the accessible name.
- The word column is safe against user font scaling: `--t-label` is a fixed `13px` (`index.css:47`); measured TIMELINE text is ~70.5px.
- Rollout order (NEW first, pills second) is correct; both commits stay independently revertible.

---

## Global Constraints

- Honor `DESIGN.md`: one ground + one accent, three voices, origin-revealed sheets, fortieth-time test.
- Do not animate `width`, `height`, `top`, `left`, `padding`, `margin`, or `grid-template-columns`. Compact pills change box size in **one frame** and animate only `transform`, `clip-path`, and `opacity`.
- Never scale a container that has content. See `src/features/motion/fluidGeometry.js`.
- Do not modify `useLiquidPill`, `LiquidPillIndicator`, or `fluidGeometry.js`. Five other call sites depend on them.
- Keyboard-initiated composer and view changes use `morph: "none"` / instant state.
- `prefers-reduced-motion` **and** `preferences.display.reducedMotion` skip travel, leave no source skin, keep opacity and focus.
- No React Native, no Framer Motion, no Reanimated, no hardcoded `#E2F952` / zinc, no Ikigro copy.
- Production code is preceded by a failing regression test. If a test written to be red comes up green, **stop and report it** — do not proceed to the production change.
- Commit named files only. Do not `git add .`.
- Preserve untracked audit / planning artifacts.
- Focused e2e + `npm test` are the gate. Do not block on the historically timing-out full Playwright suite.

### Running the e2e suite in a sandbox

If Playwright's own browser download is unavailable, the config already honours an override (`playwright.config.js:22`):

```bash
npm ci
npm run build
npx vite preview --port 4321 --strictPort &
PLAYWRIGHT_PORT=4321 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  npx playwright test tests/e2e/motion.spec.js --reporter=list
```

---

### Task 1: Put the NEW accent-to-card wash on the clip's own timeline

The material story the PRD asks for is real; the draft put it on the wrong clock. `morphStage` keeps owning the label and body staging. The background stops depending on it during entry.

**Files:**
- Modify: `tests/e2e/motion.spec.js` (the `the notch morph` describe)
- Modify: `src/Planner.jsx` — the notch CSS block near `:4116`, the `Sheet` dialog `style` at `:7951`, and the stage effect at `:7844`

**Interfaces:**
- Consumes: `data-test="sheet"`, `data-test="morph-source-label"`, `data-test="new-entry"`, `nbnotchin`, `morphStage`
- Produces: at 40% of the entry timeline the panel fill equals the trigger's computed accent; by 70% it has left accent; at 100% it is `T.card`. Close and both reduced-motion paths are unchanged in behaviour.

- [ ] **Step 1: Write the failing mid-morph fill assertion**

Extend the existing `creation carries the trigger material until the composer content can arrive` test. Read the trigger's accent **before** the click — never a hardcoded lime — and keep the existing null guard and the pause-before-probe order.

```js
test("creation carries the trigger material until the composer content can arrive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  const trigger = page.getByTestId("new-action");
  const accent = await trigger.evaluate((node) => getComputedStyle(node).backgroundColor);
  await trigger.click();

  const sheet = page.getByTestId("sheet");
  /* Pause first, scrub second. An unpaused entry animation finishes on the wall
     clock while the probe is still in flight, and a finished animation is a
     removed animation — which is how the previous draft of this test both
     crashed and passed for the wrong reason on the same machine. */
  const opening = await sheet.evaluate((node) => {
    for (const animation of node.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 0;
    }
    return {
      panel: Number(getComputedStyle(node).opacity),
      source: Number(getComputedStyle(node.querySelector('[data-test="morph-source-label"]')).opacity),
      fill: getComputedStyle(node).backgroundColor,
    };
  });
  expect(opening.panel, "the real sheet owns the trigger's material").toBeGreaterThanOrEqual(.99);
  expect(opening.source, "the trigger label must be visible while the sheet opens").toBeGreaterThanOrEqual(.99);
  expect(opening.fill, "the first frame is the trigger, repainted at sheet size").toBe(accent);

  const sample = await sheet.evaluate((node) => {
    const entry = node.getAnimations().find((animation) => animation.animationName === "nbnotchin");
    if (!entry?.effect) return null;
    const at = (fraction) => {
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        const duration = Number(animation.effect?.getTiming().duration || 0);
        if (duration > 0) animation.currentTime = duration * fraction;
      }
      return {
        source: Number(getComputedStyle(node.querySelector('[data-test="morph-source-label"]')).opacity),
        body: Number(getComputedStyle(node.querySelector(".nb-notch-body")).opacity),
        fill: getComputedStyle(node).backgroundColor,
      };
    };
    return { mid: at(0.4), late: at(0.7), end: at(1) };
  });

  expect(sample, "the notch entry animation must still be running").not.toBeNull();
  expect(sample.mid.source, "the trigger label must remain the visible material until the sheet has a place to land").toBeGreaterThanOrEqual(.9);
  expect(sample.mid.body, "form content must wait until the physical move has established the new space").toBeLessThan(.2);
  expect(sample.mid.fill, "at 40% the clipped window is still the accent trigger, not the settled card").toBe(accent);
  expect(sample.late.fill, "by 70% the surface has begun washing into its own card").not.toBe(accent);
});
```

Add a companion test for the settled end state:

```js
test("the notch lands on the composer's own surface", async ({ page }) => {
  await openPlanner(page);
  const trigger = page.getByTestId("new-entry");
  const accent = await trigger.evaluate((node) => getComputedStyle(node).backgroundColor);
  await trigger.click();
  const sheet = page.getByTestId("sheet");
  await expect(sheet).toHaveAttribute("data-morph-stage", "open");
  const settled = await sheet.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(settled, "a settled composer is not an accent slab").not.toBe(accent);
  await expect(sheet.getByTestId("morph-source-label")).toHaveCSS("opacity", "0");
});
```

- [ ] **Step 2: Run the focused test and confirm it fails for the right reason**

```
npx playwright test tests/e2e/motion.spec.js --grep "creation carries the trigger material"
```

Expected: FAIL on `sample.late.fill` — at a scrubbed 70% the paint is still whatever `morphStage` last wrote, so it is still accent. (If wall-clock timing pushed the stage past `reveal` before the probe, it fails on `sample.mid.fill` instead. Either failure is the correct red; both go green once paint moves onto the timeline.)

- [ ] **Step 3: Expose the two materials as custom properties on the panel**

Keyframes cannot read a React inline `background-color`. In the `Sheet` dialog `style` object at `:7951`, add alongside the existing entries — **leave the existing `backgroundColor` expression exactly as it is**:

```js
"--morph-accent": morph === "notch" && morphSurface ? morphSurface.background : "transparent",
"--morph-card": T.card,
```

The inline `backgroundColor` remains the underlying value. It is what the close path (`morphStage === "closing"` → accent) and every no-animation fallback resolve to, which is why it must not change.

- [ ] **Step 4: Add the wash animation**

In the notch CSS block, add a second animation on the same element rather than editing `nbnotchin`'s keyframes. A per-keyframe `animation-timing-function` inside `nbnotchin` would also retime the clip's final segment, because `transform` and `clip-path` are declared only at 0% and 100% and would inherit the easing of whichever interval they fall in.

Replace `:4116` and add the keyframes after `nbnotchin`:

```css
.nb-fluid[data-fluid-origin="notch"]{animation-name:nbnotchin,nbnotchwash;animation-duration:320ms;animation-timing-function:cubic-bezier(.23,1,.32,1),cubic-bezier(.4,0,.6,1);transition:background-color 210ms cubic-bezier(.22,.85,.28,1)}
/* The window stays the button's material until the shape has somewhere to land,
   then washes into the sheet's own surface on the same 320ms the clip runs on.
   This used to be React state on three setTimeouts, which meant a paused frame
   showed whatever the wall clock had reached rather than what the clip was
   doing — the paint and the shape were two different animations wearing one
   name. `nbnotchin` keeps its own easing; the wash keeps a gentler one. */
@keyframes nbnotchwash{0%,55%{background-color:var(--morph-accent)}100%{background-color:var(--morph-card)}}
```

Do not touch the clip-path math. Do not reintroduce wall-clock label timeouts. `morphStage` continues to drive `nb-morph-source-label` and `nb-notch-body` exactly as it does today.

- [ ] **Step 5: Re-run the notch contract in full**

```
npx playwright test tests/e2e/motion.spec.js --grep "notch morph"
npx playwright test tests/e2e/motion.spec.js
```

Expected: PASS, all 30 plus the new test. Pay attention to three that exercise the paths a second animation could disturb:

- `an in-flight composer morph reverses from its current geometry` — `requestClose` finds `entry` by name and then sets `panel.style.animation = "none"`, which removes both animations and exposes the inline accent that `setMorphStage("closing")` writes. Confirm `data-fluid-reverse="true"` still appears.
- `NEW grows the composer out of the button, and folds it back` — the panel's `animationend` now fires twice; `Sheet`'s `done()` handler is idempotent (`openedRef`/`setHeightReady`), so this should be inert. Confirm it is.
- `reduced motion leaves no source skin behind` — with `animation-name: none !important` the wash is gone and the inline value governs.

- [ ] **Step 6: Close the app-preference reduced-motion gap**

`Sheet`'s stage effect at `:7852` tests only the media query, but `reducedMotion` at `:1298` is `preferences.display.reducedMotion` **or** the query. With the in-app preference on, the stage timers still run while CSS has stripped every animation. Use the same signal `requestClose` already trusts (`:7749-7752`):

```js
const panel = dialogRef.current;
const reduced = typeof window !== "undefined" && (
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  || (panel && window.getComputedStyle(panel).animationName === "none")
);
```

Add the covering test:

```js
test("the in-app reduced-motion preference also skips the morph staging", async ({ page }) => {
  await openPlanner(page);
  await page.getByTestId("nav-toggle").click();
  // Settings → Display → Reduced motion. Follow whatever path settings.spec-style
  // helpers already use; if none exists, set the preference through the Settings
  // sheet UI rather than by writing localStorage directly.
  // Then:
  await page.getByTestId("new-entry").click();
  const sheet = page.getByTestId("sheet");
  await expect(sheet).toHaveAttribute("data-morph-stage", "open");
  await expect(sheet.getByTestId("morph-source-label")).toHaveCSS("opacity", "0");
});
```

If reaching the preference through the UI turns out to need more than a few steps, note it and assert the unit-level condition instead — do not skip the fix.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/motion.spec.js src/Planner.jsx
git commit -m "fix(ui): wash the NEW accent on the clip's timeline, not the wall clock"
```

---

### Task 2: Deterministic compact slot geometry

Compact mode computes its layout instead of measuring it. That is what removes the indicator drift, the `ResizeObserver` dependency, and the FLIP measure pass in one move.

**Files:**
- Create: `src/features/motion/viewPills.js`
- Create: `src/features/motion/viewPills.test.js`

**Interfaces:**

```js
/* Tailwind's `sm` is min-width 640px and the chrome's own compact rules are
   max-width 639px, so a `max-width: 640px` query would claim compact on the one
   pixel where the stylesheet has already gone wide. */
export const VIEW_PILL_COMPACT_MAX = 639.98;

/* 13px glyph in a slot that clears the icon on both sides. */
export const VIEW_PILL_ICON = 30;
/* TIMELINE measures ~70.5px at --t-label (13px, .1em tracking); 84 leaves room
   for a fallback face if Jost has not loaded. */
export const VIEW_PILL_WORD = 84;
/* Today's tabs are contiguous — measured left edges 103 / 197 / 285 against
   widths 94.5 / 88.4 / 91.6. Compact keeps that. */
export const VIEW_PILL_GAP = 0;

export function viewPillTrackWidth({ icon, gap, word, count } = {}) {}   // -> 174
export function viewPillSlots({ count, activeIndex, icon, gap, word } = {}) {} // -> [{ left, width }]
export function viewPillIndicatorBox({ count, activeIndex, height, ... } = {}) {} // -> { left, top, width, height }
export function viewPillFlipOffset({ count, fromIndex, toIndex, index, ... } = {}) {} // -> px
export function viewPillLabelClip(active) {} // -> "inset(0 0 0 0)" | "inset(0 100% 0 0)"
```

- [ ] **Step 1: Write the failing unit tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  VIEW_PILL_COMPACT_MAX, VIEW_PILL_ICON, VIEW_PILL_WORD, VIEW_PILL_GAP,
  viewPillTrackWidth, viewPillSlots, viewPillIndicatorBox, viewPillFlipOffset, viewPillLabelClip,
} from "./viewPills.js";

test("reserves one word plus three icon slots so WEEK is not crushed", () => {
  assert.equal(viewPillTrackWidth(), VIEW_PILL_ICON * 3 + VIEW_PILL_GAP * 2 + VIEW_PILL_WORD);
  /* Today's labelled tablist measures 276.4px, so a reserved track is a shrink.
     240 is the ceiling the PRD's layout contract allows. */
  assert.ok(viewPillTrackWidth() <= 240);
});

test("the track is the same width whichever sibling is open", () => {
  for (const activeIndex of [0, 1, 2]) {
    const slots = viewPillSlots({ activeIndex });
    const last = slots[slots.length - 1];
    assert.equal(last.left + last.width, viewPillTrackWidth());
  }
});

test("only the active sibling carries a word", () => {
  const slots = viewPillSlots({ activeIndex: 1 });
  assert.deepEqual(slots.map((slot) => slot.width), [
    VIEW_PILL_ICON, VIEW_PILL_ICON + VIEW_PILL_WORD, VIEW_PILL_ICON,
  ]);
  assert.deepEqual(slots.map((slot) => slot.left), [0, VIEW_PILL_ICON, VIEW_PILL_ICON * 2 + VIEW_PILL_WORD]);
});

test("the indicator box is the active slot, so it can never drift from it", () => {
  const box = viewPillIndicatorBox({ activeIndex: 2, height: 25 });
  const slots = viewPillSlots({ activeIndex: 2 });
  assert.deepEqual(box, { left: slots[2].left, top: 0, width: slots[2].width, height: 25 });
});

test("siblings translate by the word they are making room for", () => {
  const offset = (from, to, index) => viewPillFlipOffset({ fromIndex: from, toIndex: to, index });
  /* TIMELINE -> ACTIONS: the leftmost sibling is already home; the two to its
     right start one word further along and travel back. */
  assert.deepEqual([0, 1, 2].map((i) => offset(0, 2, i)), [0, VIEW_PILL_WORD, VIEW_PILL_WORD]);
  assert.deepEqual([0, 1, 2].map((i) => offset(2, 0, i)), [0, -VIEW_PILL_WORD, -VIEW_PILL_WORD]);
  assert.deepEqual([0, 1, 2].map((i) => offset(1, 2, i)), [0, 0, VIEW_PILL_WORD]);
  assert.deepEqual([0, 1, 2].map((i) => offset(0, 0, i)), [0, 0, 0]);
});

test("the word is revealed by a clip, never by a track animation", () => {
  assert.equal(viewPillLabelClip(true), "inset(0 0 0 0)");
  assert.equal(viewPillLabelClip(false), "inset(0 100% 0 0)");
});

test("compact behavior stops one hundredth of a pixel below Tailwind's sm", () => {
  assert.equal(VIEW_PILL_COMPACT_MAX, 639.98);
});
```

- [ ] **Step 2: Run the unit file and confirm it fails**

```
node --test src/features/motion/viewPills.test.js
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement the helper**

Create `src/features/motion/viewPills.js`. Every export is pure and takes its geometry as defaulted named options, so the e2e can be told the same numbers the CSS is. `viewPillFlipOffset` is `viewPillSlots(from)[index].left - viewPillSlots(to)[index].left` — the FLIP delta is derivable, which is why compact mode needs no measure pass at all.

Carry a comment block explaining why this file exists: the geometry is computed rather than measured because a fixed-width wrap stops `ResizeObserver` from ever firing, and a `useLayoutEffect` read lands before the box has changed — together they left the accent plate 61px right and 59px narrow, permanently.

- [ ] **Step 4: Re-run the unit file**

```
node --test src/features/motion/viewPills.test.js
npm test
```

Expected: PASS, 550 existing plus the new file.

- [ ] **Step 5: Commit**

```bash
git add src/features/motion/viewPills.js src/features/motion/viewPills.test.js
git commit -m "feat(ui): compute a compact view-pill track instead of measuring it"
```

---

### Task 3: Compact expanding sibling PillNav

**Files:**
- Create: `tests/e2e/view-pills.spec.js`
- Modify: `src/Planner.jsx` — `PillNav` (`:7593`), a `useCompactViewPills` hook, a `ListIcon`, and the view-mode call site (`:4297`)
- Reuse: `CalendarIcon` (`:615`), `CheckIcon` (`:599`), `UiIcon` (`:540`)

**Interfaces:**
- Consumes: `viewPillTrackWidth`, `viewPillSlots`, `viewPillIndicatorBox`, `viewPillFlipOffset`, `viewPillLabelClip`, `VIEW_PILL_COMPACT_MAX`
- Produces: `data-test="view-mode"` tablist; each tab `data-test="view-mode-<key>"` with `data-compact="icon" | "label"`; label span `data-test="view-mode-label"`; `data-motion="instant"` on the tablist for keyboard and reduced-motion picks
- **Does not touch** `useLiquidPill` or `LiquidPillIndicator`

- [ ] **Step 1: Write the failing compact-lane e2e**

```js
import { test, expect } from "@playwright/test";
import { openPlanner } from "./helpers.js";

test.describe("the compact view switcher", () => {
  test.use({ hasTouch: true });

  test("grows one word, keeps icon-sized neighbours, and never moves the plate off the active tab", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);

    const timeline = page.getByTestId("view-mode-timeline");
    const actions = page.getByTestId("view-mode-actions");
    await expect(timeline).toHaveAttribute("aria-selected", "true");
    expect((await timeline.getByTestId("view-mode-label").boundingBox()).width,
      "active TIMELINE must keep a readable word").toBeGreaterThan(20);
    expect((await actions.boundingBox()).width,
      "inactive ACTIONS is an icon, not a third word").toBeLessThan(56);

    /* The regression this file exists for. The accent plate is the active
       sibling; if it is ever measured mid-transition it lands on a neighbour and
       stays there. Assert alignment, not the mechanism. */
    const aligned = async () => page.getByTestId("view-mode").evaluate((list) => {
      const plate = list.querySelector('[data-test="pill-indicator"]').getBoundingClientRect();
      const active = list.querySelector('[aria-selected="true"]').getBoundingClientRect();
      return { dLeft: Math.abs(plate.left - active.left), dWidth: Math.abs(plate.width - active.width) };
    });
    let drift = await aligned();
    expect(drift.dLeft, "plate must start on the active tab").toBeLessThanOrEqual(1);
    expect(drift.dWidth).toBeLessThanOrEqual(1);

    await actions.click();
    await expect(actions).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(400);
    drift = await aligned();
    expect(drift.dLeft, "plate must settle on the newly active tab").toBeLessThanOrEqual(1);
    expect(drift.dWidth, "plate must be the width of the newly active tab").toBeLessThanOrEqual(1);

    expect((await actions.getByTestId("view-mode-label").boundingBox()).width).toBeGreaterThan(20);
    expect((await timeline.boundingBox()).width).toBeLessThan(56);
  });

  test("the reserved track leaves the month navigator its lane", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const zoomOut = page.getByTestId("zoom-out");
    const before = (await zoomOut.boundingBox()).width;
    await page.getByTestId("view-mode-actions").click();
    await page.waitForTimeout(400);
    expect((await zoomOut.boundingBox()).width,
      "WEEK / MONTH must survive the pill expansion").toBeCloseTo(before, 0);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
  });

  test("an icon-only tab still takes a finger", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    /* The 44px floor is `.nb-tap::after`, not the drawn box — the control stays
       the size it was drawn so the navigator does not eat the timeline's rows.
       See the comment at Planner.jsx:4008. */
    const target = await page.getByTestId("view-mode-agenda").evaluate((node) => {
      const after = getComputedStyle(node, "::after");
      return { coarse: window.matchMedia("(pointer: coarse)").matches, height: after.height, width: after.width };
    });
    expect(target.coarse, "this assertion is meaningless without a coarse pointer").toBe(true);
    expect(parseFloat(target.height)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(target.width)).toBeGreaterThanOrEqual(44);
  });

  test("the word wipes rather than the track resizing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlanner(page);
    const props = await page.getByTestId("view-mode-agenda").getByTestId("view-mode-label")
      .evaluate((node) => getComputedStyle(node).transitionProperty);
    expect(props, "a compact word is revealed by a clip, never by a track animation").toContain("clip-path");
    expect(props).not.toContain("grid-template-columns");
    expect(props).not.toContain("width");
  });
});

test("desktop keeps three words and a travelling plate", async ({ page }) => {
  await openPlanner(page);
  for (const key of ["timeline", "agenda", "actions"]) {
    const label = page.getByTestId(`view-mode-${key}`).getByTestId("view-mode-label");
    expect((await label.boundingBox()).width, `${key} must keep its word on a wide header`).toBeGreaterThan(20);
  }
  await expect(page.getByTestId("view-mode")).not.toHaveAttribute("data-compact", "icon");
});
```

- [ ] **Step 2: Run it and confirm it fails**

```
npx playwright test tests/e2e/view-pills.spec.js
```

Expected: FAIL — `view-mode-timeline` does not exist yet.

- [ ] **Step 3: Add the breakpoint hook**

Nothing in the file models a 640px boundary, and a bare `matchMedia().matches` read during render never updates on rotation. Add near the other hooks:

```js
function useCompactViewPills() {
  const query = `(max-width: ${VIEW_PILL_COMPACT_MAX}px)`;
  const [compact, setCompact] = useState(() => (
    typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches)
  ));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const sync = (event) => setCompact(event.matches);
    setCompact(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return compact;
}
```

- [ ] **Step 4: Add the agenda mark**

Beside `CalendarIcon` (`:615`), in the same one-stroke `currentColor` idiom. No emoji.

```js
function ListIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M3 4.5h10M3 8h10M3 11.5h7" /></UiIcon>;
}
```

- [ ] **Step 5: Implement compact PillNav**

Give `PillNav` two optional props — `compact = false` and `icons = null` — so the other five call sites are untouched by default. Keep `useLiquidPill` running for the desktop path; in compact mode ignore its box and use the computed one.

```js
function PillNav({ T, value, options, onPick, ariaLabel, surface = "transparent",
                   className = "", style = {}, compact = false, icons = null }) {
  const wrapRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(wrapRef, [value, options.length, compact]);
  const activeIndex = Math.max(0, options.findIndex(([key]) => key === value));
  const slots = compact ? viewPillSlots({ count: options.length, activeIndex }) : null;

  /* FLIP, with the measure pass removed. Compact slot geometry is a pure
     function of the active index, so both the old and the new left edge are
     known without touching the DOM — which is the whole reason the plate can no
     longer drift from the tab it belongs to. */
  const previousIndex = useRef(activeIndex);
  const [flip, setFlip] = useState(null);
  const [instant, setInstant] = useState(false);
  useLayoutEffect(() => {
    const from = previousIndex.current;
    previousIndex.current = activeIndex;
    if (!compact || from === activeIndex || instant) return undefined;
    setFlip(options.map((_, index) => viewPillFlipOffset({
      count: options.length, fromIndex: from, toIndex: activeIndex, index,
    })));
    const frame = window.requestAnimationFrame(() => setFlip(null));
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, compact, instant, options.length]);
  ...
}
```

Render contract:

- Tablist: `data-test="view-mode"` (pass through as a prop or derive from `ariaLabel`), `data-motion={instant ? "instant" : "travel"}`, `data-compact={compact ? "icon" : "label"}`, and `style={{ width: compact ? viewPillTrackWidth() : undefined }}`.
- `LiquidPillIndicator` receives `box={compact ? viewPillIndicatorBox({ count: options.length, activeIndex, height: <the tab height> }) : box}` and `settled={compact ? !flip : settled}`. Leave `stretch` on the desktop path only — compact travel is already carried by the plate's own `left`/`width` transition, and PRD §7.3 accepts that for this release.
- Each tab: `role="tab"`, `aria-selected`, `aria-label={label}`, `data-test={`view-mode-${key}`}`, `data-active`, `data-compact={compact && !on ? "icon" : "label"}`, and keeps `nb-tap nb-hover-choice`. In compact mode: `width: slots[index].width`, `display: grid`, `gridTemplateColumns: `${VIEW_PILL_ICON}px ${VIEW_PILL_WORD}px``, `transform: flip ? translate3d(${flip[index]}px,0,0) : none`, `transition: flip || instant ? "none" : "transform 200ms cubic-bezier(.23,1,.32,1), color 260ms ease"`.
- **Do not put `overflow: hidden` on the tab.** It would clip `.nb-tap::after` down from 44px and quietly delete the coarse-pointer target the third test asserts. The word is hidden by its own `clip-path`, not by the button's box.
- Label span: `data-test="view-mode-label"`, `whiteSpace: "nowrap"`, and in compact mode `clipPath: viewPillLabelClip(on)`, `opacity: on ? 1 : 0`, `transition: instant ? "none" : "clip-path 200ms cubic-bezier(.23,1,.32,1), opacity 160ms ease 40ms"`.
- Grid columns are **static**. Labels are never mounted or unmounted. No goo.
- Keep the drawn control's height as it is. Do not set `height: 44`.

At the call site (`:4297`), pass `compact={useCompactViewPills()}` and `icons={{ timeline: CalendarIcon, agenda: ListIcon, actions: CheckIcon }}`. Leave the `onPick` body alone — `selectViewMode` already distinguishes `pointer` from `keyboard` (`:1300-1311`).

- [ ] **Step 6: Re-run compact, desktop, and the existing tab callers**

```
npx playwright test tests/e2e/view-pills.spec.js
npx playwright test tests/e2e/actions.spec.js tests/e2e/interaction-contracts.spec.js tests/e2e/navigation-shell.spec.js
node --test src/features/motion/viewPills.test.js
```

Expected: PASS. There are 66 `getByRole("tab", { name })` calls across 13 spec files; they resolve through `aria-label` and through name-from-content, and an `opacity:0` / clip-hidden label stays in the accessible name, so none should need editing. **If any one of them needs editing, stop** — that is the signal that the accessible name broke, not that the test was wrong.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/view-pills.spec.js src/Planner.jsx
git commit -m "feat(ui): expand one view-pill word at compact width"
```

---

### Task 4: Keyboard and reduced-motion instant paths

**Files:**
- Modify: `tests/e2e/view-pills.spec.js`
- Modify: `src/Planner.jsx` `PillNav`

- [ ] **Step 1: Write the failing input-path tests**

Assert `transitionProperty`, not duration. The global reduced-motion rule at `:4250` sets `transition-duration: 1ms !important`, so the computed value is `"0.001s"` and no `"0s"` assertion can ever pass.

```js
test("a keyboard pick does not travel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  const agenda = page.getByTestId("view-mode-agenda");
  await agenda.focus();
  await page.keyboard.press("Enter");
  await expect(agenda).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("view-mode")).toHaveAttribute("data-motion", "instant");
  const props = await agenda.evaluate((node) => ({
    tab: getComputedStyle(node).transitionProperty,
    label: getComputedStyle(node.querySelector('[data-test="view-mode-label"]')).transitionProperty,
    transform: getComputedStyle(node).transform,
  }));
  expect(props.tab).toBe("none");
  expect(props.label).toBe("none");
  expect(props.transform === "none" || props.transform === "matrix(1, 0, 0, 1, 0, 0)").toBeTruthy();
});

test("reduced motion applies the end state with no travel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  await page.getByTestId("view-mode-actions").click();
  const actions = page.getByTestId("view-mode-actions");
  await expect(actions).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("view-mode")).toHaveAttribute("data-motion", "instant");
  const drift = await page.getByTestId("view-mode").evaluate((list) => {
    const plate = list.querySelector('[data-test="pill-indicator"]').getBoundingClientRect();
    const active = list.querySelector('[aria-selected="true"]').getBoundingClientRect();
    return Math.abs(plate.left - active.left);
  });
  expect(drift, "reduced motion still lands the plate on the active tab").toBeLessThanOrEqual(1);
  expect((await actions.getByTestId("view-mode-label").boundingBox()).width).toBeGreaterThan(20);
});
```

- [ ] **Step 2: Run and confirm failure**

```
npx playwright test tests/e2e/view-pills.spec.js --grep "keyboard|reduced"
```

- [ ] **Step 3: Wire the instant paths**

In `PillNav`, set `instant` from the pick source and from the combined reduced-motion signal, before the FLIP effect can queue a transform:

```js
const reduced = typeof window !== "undefined"
  && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const pick = (key, event) => {
  const source = event.detail === 0 ? "keyboard" : "pointer";
  setInstant(source === "keyboard" || reduced);
  onPick(key, source);
};
```

`event.detail === 0` is already the plumbed keyboard signal (`:7612`) — keep it. `instant` must be `true` for the render that changes `activeIndex`, so set it in the handler rather than in an effect. Clear it on the next pointer pick.

The app-level `preferences.display.reducedMotion` is already covered here: it injects `transition-duration: 1ms !important` globally, so travel is imperceptible even when `instant` is false. Do not thread the preference through as a new prop.

- [ ] **Step 4: Re-run the input-path tests, then the whole file**

```
npx playwright test tests/e2e/view-pills.spec.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/view-pills.spec.js src/Planner.jsx
git commit -m "fix(ui): keep keyboard and reduced-motion view changes instant"
```

---

### Task 5: Verify and stop

- [ ] **Step 1: Unit suite**

```
npm test
```

Expected: 550 existing plus the new `viewPills` tests.

- [ ] **Step 2: Focused e2e**

```
npx playwright test tests/e2e/motion.spec.js tests/e2e/view-pills.spec.js \
  tests/e2e/actions.spec.js tests/e2e/join.spec.js \
  tests/e2e/interaction-contracts.spec.js tests/e2e/navigation-shell.spec.js \
  tests/e2e/timeline-polish.spec.js tests/e2e/accessibility-quality.spec.js
```

`motion.spec.js` was 30/30 before this work; it must still be. `timeline-polish.spec.js` is in the list because eleven of its tests measure `timeline-chrome`, which is the row the compact pills live in — if the navigator grew, this is where it shows. `accessibility-quality.spec.js` carries the horizontal-overflow and 200%-reflow guards. Do not start the full suite unless asked.

- [ ] **Step 3: Confirm the navigator did not grow**

The one number a passing suite can still hide. Baseline at 390×844, week zoom: navigator row **38.9px**, chrome **181px**, tab height **24.9px**, tablist **276.4px**.

```js
// scratch check, not a committed test
await page.setViewportSize({ width: 390, height: 844 });
await openPlanner(page);
console.log(await page.evaluate(() => {
  const row = document.querySelector(".nb-month-navigator");
  const tab = document.querySelector('[role="tab"]');
  return {
    row: row.getBoundingClientRect().height,
    chrome: document.querySelector('[data-test="timeline-chrome"]').getBoundingClientRect().height,
    tab: tab.getBoundingClientRect().height,
    tablist: document.querySelector('[data-test="view-mode"]').getBoundingClientRect().width,
  };
}));
```

Row and tab height must not exceed baseline. Tablist should now be ~174px. If the row grew, something set an explicit height — remove it rather than re-baselining the numbers.

- [ ] **Step 4: Verify the compact motion on WebKit**

`playwright.config.js` runs Chromium only, and compact mode exists for phones. Open the preview on a real iOS Safari (or add a temporary `webkit` project locally — do not commit it) and confirm the word wipes and the siblings slide. `clip-path` and `transform` are the mechanism precisely so this passes; if either is inert, report it rather than reaching for a grid-track animation.

- [ ] **Step 5: Diff hygiene**

The diff should touch only: the notch CSS and `Sheet` style/stage in `Planner.jsx`, `PillNav` plus the two new helpers there, `src/features/motion/viewPills.js{,.test.js}`, `tests/e2e/motion.spec.js`, `tests/e2e/view-pills.spec.js`, and this docs pair. No RN files. No theme hexes. No changes to `fluidGeometry.js`, `useLiquidPill`, or `LiquidPillIndicator`. No `git add .`.

- [ ] **Step 6: Final commit only if Step 5 required a fix**

Otherwise stop.

---

## File map

| File | Role |
| --- | --- |
| `docs/superpowers/specs/2026-08-15-shared-layout-motion-prd.md` | Product + motion design (this work's authority) |
| `docs/superpowers/plans/2026-08-15-shared-layout-motion.md` | This plan |
| `src/features/motion/fluidGeometry.js` | Read-only. Do not touch. |
| `src/features/motion/viewPills.js` | Compact slot / indicator / FLIP math |
| `src/Planner.jsx` | `nbnotchwash`; `Sheet` custom properties + stage signal; compact `PillNav`; `useCompactViewPills`; `ListIcon` |
| `tests/e2e/motion.spec.js` | NEW material contract |
| `tests/e2e/view-pills.spec.js` | Compact / desktop / a11y / input-path pill contract |

## Spec coverage

| PRD section | Task |
| --- | --- |
| §6.3 NEW material continuity, paint follows the clip | Task 1 Steps 3-4 |
| §6.3(5) reduced motion leaves no source skin | Task 1 Steps 5-6 |
| §7.1 expanding siblings, plate is the active sibling | Task 3 Steps 5-6 |
| §7.2 no layout-property animation | Task 3 Step 5 (clip + transform; supersedes the grid-track mechanism §7.2 names — see the revision note) |
| §7.3 reserved track, drawn icons, 44px target, indicator | Task 2, Task 3 Steps 1/4/5 |
| §7.4 compact breakpoint | Task 2 (`VIEW_PILL_COMPACT_MAX`), Task 3 Step 3 |
| §9 accessibility and input | Task 3 Step 1, Task 4 |
| §10 testing strategy | Tasks 1-4 tests, Task 5 |
| §14 completion criteria | Task 5 Steps 1-4 |

## Out of scope for implementers

Ikigro form contents. Desktop collapsing pills. Goo on `PillNav`. Animation dependencies. Rewriting `fluidMorphFromRects`, `useLiquidPill`, or `LiquidPillIndicator`. Growing the navigator row. Full Playwright suite. Untracked audit files.
