# Framer-Fidelity Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Calendar Master's already-shipping NEW morph and compact view pills *read* as close to the Framer reference as this product will allow, without Framer, without springs, and without reopening the elastic-width failure of 2026-08-17.

**Architecture:** Translation, not a port. The Framer files (`layoutId` + `layout` + `width: 0 → auto` springs) describe a look. This repo already owns the equivalent mechanism: one true-size sheet revealed by `clip-path` + `transform`, and three compact siblings on a reserved 174px track. The remaining work is choreography (close lead, who wears the accent), one missing desktop origin (`+ ADD`), and one curve sync. Do not add `framer-motion`. Do not create `MorphingModal.tsx` or `DynamicPillNavbar.tsx`. Do not restyle the inspect editors in this plan.

**Tech Stack:** React 19, Vite, native CSS + WAAPI, Node test runner, Playwright. No animation library.

**Baseline:** `origin/main` at `99491e2` (`feat(timeline): collapse the day heading on a desktop scroll too`). Fast-forward the worktree onto that SHA before Task 1. `Planner.jsx` is ~9,158 lines. Compact pills, notch wash, cascade, view slide, gesture isolation, and the two 2026-08-17 chrome commits are already on main.

## Global Constraints

- Steal the reference *motion*, not the Ikigro costume. Composer contents stay this app's composer.
- No `framer-motion`, Moti, Reanimated, GSAP, or new animation dependency.
- Do not animate `width` / `height` / `top` / `left` / `padding` / `margin` / `grid-template-columns` **except** the single contained compact-pill width tween in Task 3, and only between the reserved 30px / 114px slots. Never `width: 0 → auto`.
- Never `scale()` a container that has a form in it. Content groups stay opacity-only (`93ee3b9`).
- Accent is `T.accent`, never `#E2F952`. Type is Jost / mono / Georgia, never Inter.
- Icons are the drawn `UiIcon` marks, never ⏱📅✓.
- Compact drawn height stays ~25px. The 44px floor is `.nb-tap::after`. Do not set `height: 44` on the tabs.
- Desktop (`≥ 640px`) keeps three words and the travelling `LiquidPillIndicator`. Do not collapse desktop labels.
- Keyboard-initiated NEW and view changes stay instant (`morph: "none"`, `data-motion="instant"`).
- `prefers-reduced-motion` and the in-app Reduce motion preference skip travel.
- Horizontal body swipe turns the **day**. View changes stay on the pill nav (`7f24686`). Do not reintroduce the page-wide view-swipe.
- Do not modify `fluidGeometry.js`, `useLiquidPill`, or `LiquidPillIndicator`'s desktop path except where Task 3 opts compact out of the indicator.
- Do not grow the navigator row (baseline 38.9px) or chrome (181px) at 390×844.
- Named files only. No `git add .`. Leave untracked audit / `.planning` artifacts alone.
- Planner.jsx is ~9,158 lines. Prefer the smallest edit that lands the motion. Do not extract a new motion runtime.
- Do not delete `nbnotchgroupin` or invert `motion.spec.js:160`. Content still waits until the clip has a place to land. Claude's 2026-08-17 editor plan (KTD3) proposed the opposite; that call is rejected below.
- Empty-state dashed panels and keyboard `a` / `n` do not morph. Only a pressed, measurable pill does.

---

## 0. What landed since the last shared-layout plan — read this first

The previous plan (`2026-08-15-shared-layout-motion.md`) shipped as `712a010` / `e2f66fc` / `c3a1992` / `a0b332f`. Twenty-five commits then landed on `main` (twenty-three through `3d28a69`, then `7960aa5` and `99491e2`). Most of the Framer look is **already built**. An implementer who starts from the Framer paste will undo working code.

### Already the analog of `layoutId` (NEW)

| Piece | Where | Commit |
| --- | --- | --- |
| True-size sheet, clip + translate, no scale | `Sheet` + `fluidMorphFromRects` | pre-existing, kept |
| Accent wash on the clip timeline (`nbnotchwash`) | `Planner.jsx` notch CSS | `712a010` |
| `MORPH_MS = 480`, open curve `cubic-bezier(.22,.85,.28,1)` | `Planner.jsx:299` | `93ee3b9`, then pulled back from 667 in `672fa19` |
| Staggered content cascade, opacity only | `.nb-notch-cascade` + `nbnotchgroupin` | `93ee3b9` |
| Reverse close from `currentTime` | `Sheet.requestClose` WAAPI | pre-existing, duration now `MORPH_MS` |
| Keyboard `morph: "none"` | `Sheet` + `n` shortcut | pre-existing |
| Keyboard does not re-layout mid-morph | `index.html` `interactive-widget=overlays-content`, width-gated recap | `f8b6459` |

`MORPH_MS` is 480 on purpose. The Lottie reference is 667ms + a cascade to 1233ms. That failed the fortieth-time test for a control opened dozens of times a day. Do not put it back to 667. 480 is the ceiling.

### Already the analog of `layout` (pills)

| Piece | Where | Commit |
| --- | --- | --- |
| Reserved 174px track, computed slots | `src/features/motion/viewPills.js` | `e2f66fc` |
| Compact icon + one word, clip-wipe, FLIP siblings | `PillNav` | `c3a1992` |
| Keyboard / reduced-motion instant | `PillNav` `data-motion` | `a0b332f` |
| Plate travels on `translate3d`, not `left`/`width` | `LiquidPillIndicator` | `e159a85` |
| Inactive tabs have faint bodies | compact `PillNav` | `7a4fcb4` |
| Filled tray (`T.card` + hairline) | view-mode call site | `35b1623` |
| Direction-aware word squeeze | `viewPillLabelClip(active, side)` | `8dfe6a2` |
| 260ms `--motion-lane` (not the lunge `--motion-enter`) | compact transitions | `8dfe6a2` / `7f24686` |
| Inactive word `overflow: clip` (not `hidden`) | compact tab style | `3d28a69` |
| Whole-pane view slide, armed on `pointerdown` | `armSlide` + `.nb-view-track` | `672fa19` |
| Gesture isolation (`data-owns-swipe`) | cards, ANY TIME, ribbon | `470cc8c` |

### Measured and reverted — do not rediscover

`7e3a45b` records an A/B at 6× CPU throttle:

| Version | p95 | worst | width states |
| --- | --- | --- | --- |
| Shipped clip + FLIP | ~133ms | ~167ms | 2 |
| Elastic width, no FLIP | ~100ms | ~133ms | 6–7 |

Width was *cheaper* than the FLIP. It was still reverted, because:

1. Computed plate geometry misses by ~17px the moment widths stop being the reserved 30 / 114.
2. Measured plate geometry (`offsetWidth` in `useLayoutEffect`) reports the pre-transition box and lands a full 84px word behind — the original permanent-drift bug.
3. Dropping the plate and letting each pill wear its own accent made the suite green only after the assertions were rewritten around a render where the active pill ate the tray and the word vanished.

**The plate is the constraint, not the width.** Task 3 starts from that sentence.

### Two more commits after the first draft of this plan

| Commit | What it is | Effect on this plan |
| --- | --- | --- |
| `7960aa5` `fix(reveal): stop the load-in fade deciding what is visible` | `mounted` was one `rAF`; an unpainted tab never set it, so 56 ribbon cells stayed at opacity 0 | Lesson applies to *load-in*, not to NEW. Nobody is watching an unpainted page, so reveal at once. Somebody *is* watching a press on NEW. Do not use this commit as a reason to drop the cascade. |
| `99491e2` `feat(timeline): collapse the day heading on a desktop scroll too` | Desktop focus collapse; new `tests/e2e/timeline-chrome-scroll.spec.js` | Out of scope. Must stay green in Task 5. |

### Claude's 2026-08-17 editor plan — review, then what was absorbed

Source: `C:\Users\Kamran\Calendar-master\docs\plans\2026-08-17-001-feat-editor-variety-and-morph-arrival-plan.md` (`ce-unified-plan/v1`, baseline claimed `99491e2`). Two products stapled together. Only the motion-true units belong here.

| Unit | Verdict | Why |
| --- | --- | --- |
| **U2** desktop `+ ADD` never morphs | **Absorb as Task 2** | Real hole. `Planner.jsx:3947` is `setComposer({ kind: "task" })` — no `notch`, no `morphSource`. Mobile `+ ACTION` at `5258` does it correctly. At 1280 the control is the unlabelled `+ ADD` at `6294`. Framer's modal has one trigger; we have two and one of them is mute. |
| **U1 / KTD3** delete the cascade, content opaque from frame 0 | **Reject** | Inverts PRD §6.3 and `motion.spec.js:160` ("form content must wait until the physical move has established the new space"). The comment at `Planner.jsx:4358` forbids an *independent* body fade that left a hole, not a stagger bound to the same 480ms. The Lottie, the 183549 video, and Framer's own delayed fade all hold the form until the shape has somewhere to land. Killing the cascade makes mid-open look like Framer's 80ms `FadeIn` — the paste we already refused. Cascade group 8 finishing at 1176ms is a real smell; the fix is Task 1's close lead and keeping `MORPH_MS` at 480, not making the form ride the accent clip. |
| **U3** rewrite the 40% opacity assertion to `>= 1` | **Reject** | Follows U1. An assertion rewritten to match a deleted cascade is the `7e3a45b` failure mode. |
| **U4–U6** one row primitive, pair Category/When, Status-as-primary | **Park** | Inspect-sheet visual rhythm, not NEW or pills. Different review gate, different abort. Lives as a follow-up, not this file. |
| Empty-state dashed panel morphs from its own bounds | **Reject** | A 390-wide dashed block is not a pill. Neutral arrival. Same Raycast rule as keyboard `a`. |

Claude's own risk note is the giveaway: "Content is visible on the accent fill for the first ~264ms… This is the one place where the removed cascade was doing real work." That is why U1 does not ship.

What we keep from that file: the per-frame measurement (NEW panel opacity 1.00 throughout, content 0.00 at ~550ms, `+ ADD` origin `trigger`, close body gone by ~110ms), the `+ ADD` wiring, and the empty-state caution.

### Product decisions already locked (do not reopen)

- Body swipe turns the day. The pill nav changes the view (`7f24686`).
- Native/Expo port is a spec, not this work (`3438e39`, `docs/superpowers/specs/2026-08-16-native-motion-port-spec.md`).
- No goo on `PillNav`. Search goo stays.
- Ikigro EVENT/ACTION costume, zinc tray, Inter, emoji, 38px tabs: out.

### What the Framer paste still gets wrong on this tree

| Framer paste | Why it is not the path |
| --- | --- |
| `layoutId` unmounts the NEW button | Header collapses; WEEK / NOTES jump. We `visibility: hidden`. |
| Spring 24/220/0.8 on the card | Fortieth-time; cannot reverse from `currentTime`. |
| Form `opacity` at 80ms | Visible while the clip is still a button. Cascade already waits. |
| `layout` + `width: 0 → auto` + `AnimatePresence` | Layout animation + mount/unmount. Word stays mounted here. |
| Each pill paints its own zinc fill, no shared accent | Drops DESIGN.md's one-accent identity. |
| Hardcoded `#E2F952` / `#18181B` / Inter / emoji | Wrong product. |
| New files under `src/features/navigation` and `src/features/modals` | This is `PillNav` + `Sheet` + `Composer` in `Planner.jsx`. |

---

## 1. What "as close as Framer" actually means here

The reference videos and the Framer files agree on a *picture*. They disagree with this repo on *mechanism*, and the mechanism they want is the one that already failed in-tree.

### NEW — the picture

One object. It is lime while it is still the button, still lime as a full card with no readable form, then it washes to the sheet and the form assembles. Close is the same object folding back into the exact button, with the form gone before the shape finishes.

That picture is ~90% shipped. The miss is the **close**: content and shape still collapse together (body `opacity` in 80ms plus a leftover `translateY(-4px)`), so the fold reads as the sheet being deleted rather than the form leaving and the button remaining.

### Pills — the picture

Three siblings on one tray. Active = raised accent plate + icon + word. Inactive = icon-only square with a body. Outgoing word is squeezed from the side that is doing the pushing. Neighbours slide. Mid-frame you can read a half-word.

That picture is ~85% shipped. The miss versus Framer is that **Framer's plate is the active sibling**. Ours is still a travelling indicator *under* siblings whose used width is snapped in one frame and then FLIP-corrected. The eye almost cannot tell, because `7a4fcb4` painted bodies. The remaining tell is that the active pill does not *grow* — the word wipes inside a slot that was already that wide.

### The one allowed step toward Framer's pill

Give the **active compact tab** the accent fill and let its **used width** tween between the reserved slots (`30 ↔ 114`) on the same 260ms `--motion-lane` the clip already uses. Retire the compact `LiquidPillIndicator`. Keep the word mounted and still clip-wipe it, so the word reveal does not depend on the width tween.

This is not `width: 0 → auto`. This is not measuring. Both end states are the functions already in `viewPills.js`. The plate cannot drift because there is no separate plate.

If, at any point in Task 3, the active word is narrower than 20px, an inactive tab is wider than 56px, WEEK moves, or document overflow appears at 390px — **revert the width tween and stop**. Ship Tasks 1, 2 and 4 only. That abort is a successful reading of `7e3a45b`, not a failed task.

### Approaches considered

| Approach | Verdict |
| --- | --- |
| Add `framer-motion` and paste the two components | Rejected. Wrong costume, springs, layout animation, new files, keyboard morph. |
| Elastic `0 → auto` + springs, drop the plate | Rejected. Measured, rendered wrong, reverted (`7e3a45b`). |
| Keep clip + FLIP + travelling plate forever | Honest, already good. Leaves the last Framer tell on the table. |
| **Reserved-slot width tween + the active tab wears the accent** | **Recommended.** Closest look that can still name every box before the frame runs. |

---

## File map

| File | Role |
| --- | --- |
| `docs/superpowers/specs/2026-08-15-shared-layout-motion-prd.md` | Authority for material continuity and compact siblings. Task 3 amends §7.2 for this one tween. |
| `docs/superpowers/specs/2026-08-16-view-switching-motion-design.md` | Authority for cascade timing and the reserved-slot rule. |
| `docs/superpowers/plans/2026-08-16-motion-regression-repair.md` addendum | Authority for why elastic width was reverted. Read before Task 3. |
| `src/features/motion/viewPills.js` | Slot math. Add `viewPillSlotWidth(active)`. Do not change defaults. |
| `src/features/motion/viewPills.test.js` | Slot / clip / track tests. |
| `src/Planner.jsx` | Notch close CSS + `Sheet.requestClose`; `onAddTask` / `+ ADD` morph source; compact `PillNav` fill/width; view-track curve. |
| `tests/e2e/motion.spec.js` | Close-lead contract and desktop `+ ADD` notch contract. |
| `tests/e2e/view-pills.spec.js` | Compact fill / width / WEEK / plate-absence contract. |
| `tests/e2e/actions.spec.js` | Desktop `+ ADD` still creates a task. Do not rename existing ACTIONS tabs. |
| `tests/e2e/join.spec.js` | Must keep resolving. Do not edit unless a name breaks — then stop. |

---

### Task 1: Close the composer the way it opened

**Files:**
- Modify: `tests/e2e/motion.spec.js`
- Modify: `src/Planner.jsx` (notch close CSS ~4410–4418, `Sheet.requestClose` ~8260–8298)

**Interfaces:**
- Consumes: `MORPH_MS` (480), `MORPH_LEAD` (0.35), existing WAAPI reverse path
- Produces: content groups at opacity 0 before the clip has finished folding; no `translateY` on the closing body; total close still ≤ `MORPH_MS` except the already-scaled in-flight reverse

The reference leaves content **233ms** before the container moves. We will not add 233ms onto 480. We spend the existing lead *inside* `MORPH_MS`: groups fade for `MORPH_LEAD` (168ms), the fold runs for `MORPH_MS - MORPH_LEAD` (312ms) with `animation-delay: var(--nb-morph-lead)`, unmount stays at `MORPH_MS`. In-flight reverse (WAAPI from `currentTime`) does not take an extra lead — the form is mid-arrival and should leave with the shape.

- [ ] **Step 1: Write the failing close-lead test**

Append inside `test.describe("the notch morph")`, after the in-flight reverse test:

```js
test("the form leaves before the sheet finishes folding", async ({ page }) => {
  await openPlanner(page);
  await page.getByTestId("new-entry").click();
  const sheet = page.getByTestId("sheet");
  await expect(sheet).toHaveAttribute("data-morph-stage", "open");

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");

  const mid = await sheet.evaluate((node) => {
    const fold = node.getAnimations().find((animation) => (
      animation.animationName === "nbnotchin"
      || animation.animationName === "nbnotchout"
      || animation.playState === "running"
    ));
    const duration = Number(fold?.effect?.getTiming().duration || 0);
    const delay = Number(fold?.effect?.getTiming().delay || 0);
    if (fold) {
      fold.pause();
      fold.currentTime = delay + duration * 0.15;
    }
    const groups = [...node.querySelectorAll(".nb-notch-cascade > *, .nb-notch-body > :first-child")]
      .map((el) => Number(getComputedStyle(el).opacity));
    return {
      body: groups.length ? Math.max(...groups) : Number(getComputedStyle(node.querySelector(".nb-notch-body")).opacity),
      label: Number(getComputedStyle(node.querySelector('[data-test="morph-source-label"]')).opacity),
      foldDelay: delay,
    };
  });

  expect(mid.body, "form groups must be gone while the clip is still folding").toBeLessThan(0.2);
  expect(mid.label, "NEW returns as the visible material of the fold").toBeGreaterThan(0.8);
  expect(mid.foldDelay, "the fold waits the lead so the form can leave first").toBeGreaterThan(0);
});
```

Do not assert a `translateY` on the body. The leftover `-4px` is a bug, not a contract.

- [ ] **Step 2: Run and confirm failure**

```
npx playwright test tests/e2e/motion.spec.js --grep "form leaves before"
```

Expected: FAIL. Today the fold has no delay and the body is snapped to 0 in 80ms *with* the shape, so either `foldDelay` is 0 or the probe races the unmount. A failure on `foldDelay` is the right red.

- [ ] **Step 3: Implement the lead-in close**

Replace the closing-body rule (the one that currently sets `transform:translateY(-4px)` and `transition-duration:80ms`) with opacity-only, no transform:

```css
.nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-notch-body,
.nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-notch-cascade>*,
.nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-notch-body>:first-child{
  animation:none;
  opacity:0;
  pointer-events:none;
  transition:opacity var(--nb-morph-lead,168ms) cubic-bezier(.4,0,.3,1);
}
.nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-morph-source-label{
  animation:none;
  opacity:1;
  transition:opacity var(--nb-morph-lead,168ms) cubic-bezier(.4,0,.3,1);
}
.nb-fluid.nb-fluid-closing[data-fluid-origin="notch"]:not([data-fluid-reverse="true"]){
  animation:nbnotchout calc(var(--nb-morph-dur) * (1 - 0.35)) cubic-bezier(.4,0,.3,1) forwards;
  animation-delay:var(--nb-morph-lead);
}
```

Keep the in-flight WAAPI path exactly as it is: no added delay, duration still `(currentTime / duration) * MORPH_MS`. Reduced motion still unmounts at 0.

In `requestClose`, when the close is the CSS fold (not the WAAPI reverse), `closeDuration` stays `MORPH_MS` so the delay + shortened fold still fit the existing unmount clock.

- [ ] **Step 4: Re-run the notch describe**

```
npx playwright test tests/e2e/motion.spec.js --grep "the notch morph"
```

Expected: PASS, including the existing reverse-from-current-geometry test and both reduced-motion tests.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/motion.spec.js src/Planner.jsx
git commit -m "fix(ui): let the composer leave before the sheet folds back into NEW"
```

---

### Task 2: Give desktop `+ ADD` the same origin NEW already has

**Files:**
- Modify: `tests/e2e/motion.spec.js`
- Modify: `src/Planner.jsx` — `onAddTask` at `3947`, the `+ ADD` button at `6294`
- Do not modify: the empty-state dashed button at `6399`

**Interfaces:**
- Consumes: the existing `new-entry` / `new-action` triple (`data-morph-source`, `tabIndex`, `visibility`) at `4568` and `5258`
- Produces: desktop `+ ADD` opens `setComposer({ kind: "task", notch: true, morphSource: { id: "actions-add", label: "+ ADD" } })`; the button hides while that source owns the sheet; empty-state and keyboard `a` stay `morph: "none"` / no source

Claude measured this at 1280×860: desktop `+ ADD` lands `data-fluid-origin="trigger"`, never washes, never labels, and on close never enters `closing`. That is the Framer modal with a mute trigger. Mobile `+ ACTION` is already correct — do not retouch it.

- [ ] **Step 1: Write the failing desktop-origin test**

Append inside `test.describe("the notch morph")`:

```js
test("desktop + ADD grows the task composer out of itself", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openPlanner(page);
  const add = page.getByRole("button", { name: "+ ADD", exact: true });
  await expect(add).toBeVisible();
  await add.click();

  const sheet = page.getByTestId("sheet");
  await expect(sheet).toHaveAttribute("data-fluid-origin", "notch");
  await expect(sheet).toHaveAttribute("data-morph-source", "actions-add");
  await expect(sheet.getByTestId("morph-source-label")).toHaveText("+ ADD");
  await expect(page.getByTestId("composer")).toHaveAttribute("data-composer-kind", "task");
  await expect(add).toHaveCSS("visibility", "hidden");

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0, { timeout: 3000 });
  await expect(add).toHaveCSS("visibility", "visible");
});

test("the empty Actions panel does not borrow a morph", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openPlanner(page);
  await page.getByRole("button", { name: "+ ADD", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sheet")).toHaveCount(0, { timeout: 3000 });

  const empty = page.getByText("Nothing claimed for this day yet");
  if (await empty.isVisible().catch(() => false)) {
    await empty.click();
    const sheet = page.getByTestId("sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-fluid-origin", "none");
    await expect(sheet.getByTestId("morph-source-label")).toHaveCount(0);
  }
});
```

The empty-state test is a guard, not a requirement that the empty panel exist after `+ ADD` was opened and closed on a clean notebook — on a clean notebook it *does* exist. If the copy has moved, fail on the missing string rather than skip.

- [ ] **Step 2: Run and confirm failure**

```
npx playwright test tests/e2e/motion.spec.js --grep "desktop \\+ ADD"
```

Expected: FAIL. Today `+ ADD` has no `data-morph-source` and the sheet is `data-fluid-origin="trigger"` or `"none"`, not `"notch"`.

- [ ] **Step 3: Wire the header control only**

Change the parent handler so the caller can name itself:

```js
onAddTask={(source) => {
  beep("click");
  setComposer(source?.id
    ? { kind: "task", notch: true, morphSource: source }
    : { kind: "task" });
}}
```

On the header button at `6294`:

```jsx
<button
  data-test="actions-add"
  data-morph-source="actions-add"
  tabIndex={composer?.morphSource?.id === "actions-add" ? -1 : undefined}
  onClick={() => onAddTask({ id: "actions-add", label: "+ ADD" })}
  style={{
    fontFamily: MONO,
    color: T.accentText,
    visibility: composer?.morphSource?.id === "actions-add" ? "hidden" : undefined,
  }}
  className="nb-tap nb-hover-control nb-data"
>
  + ADD
</button>
```

`ActionsPanel` does not currently receive `composer`. Do **not** thread the whole composer object down. Pass a boolean:

```js
<ActionsPanel
  ...
  hidingAdd={composer?.morphSource?.id === "actions-add"}
  onAddTask={(source) => { ... }}
/>
```

and use `hidingAdd` for `tabIndex` / `visibility`.

Leave the empty-state button as `onClick={() => onAddTask()}`. Leave keyboard `a` as `setComposer({ kind: "task", morph: "none" })`.

`+ ADD` is ink on card, not an accent pill. That is fine. The morph still takes `morphSurface.background` from the trigger's computed style — do not hardcode lime onto this control.

- [ ] **Step 4: Re-run the notch describe and the actions column**

```
npx playwright test tests/e2e/motion.spec.js --grep "the notch morph"
npx playwright test tests/e2e/actions.spec.js --grep "full-screen actions view|Actions view removes"
```

Expected: PASS. Existing `new-action` tests at 390 still resolve `+ ACTION`, not `+ ADD`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/motion.spec.js src/Planner.jsx
git commit -m "fix(ui): grow the desktop task composer out of + ADD"
```

---

### Task 3: Let the active compact pill wear the accent

**Files:**
- Modify: `src/features/motion/viewPills.js`
- Modify: `src/features/motion/viewPills.test.js`
- Modify: `tests/e2e/view-pills.spec.js`
- Modify: `src/Planner.jsx` `PillNav` only (compact branch)

**Interfaces:**
- Consumes: `VIEW_PILL_ICON` (30), `VIEW_PILL_WORD` (84), `viewPillSlots`, `viewPillLabelClip`, `viewPillLabelSide`
- Produces: `viewPillSlotWidth(active) => active ? 114 : 30`; compact tabs tween `width` between those two values; compact `LiquidPillIndicator` is not mounted; active tab `background` is `T.accent`

This is the only layout-property animation this plan authorises. It is contained: three buttons, track width constant at 174, both end states known before the frame. It is **not** the reverted experiment — that experiment measured `offsetWidth` and/or dropped the reserved slots.

- [ ] **Step 1: Unit — reserved slot widths stay the only legal widths**

Add to `src/features/motion/viewPills.test.js`:

```js
test("a compact tab only ever occupies a reserved slot", () => {
  assert.equal(viewPillSlotWidth(true), VIEW_PILL_ICON + VIEW_PILL_WORD);
  assert.equal(viewPillSlotWidth(false), VIEW_PILL_ICON);
  const slots = viewPillSlots({ activeIndex: 1 });
  assert.deepEqual(slots.map((slot) => slot.width), [
    viewPillSlotWidth(false),
    viewPillSlotWidth(true),
    viewPillSlotWidth(false),
  ]);
});
```

- [ ] **Step 2: Run and confirm failure**

```
node --test src/features/motion/viewPills.test.js
```

Expected: FAIL `viewPillSlotWidth is not defined`.

- [ ] **Step 3: Export the helper**

```js
export function viewPillSlotWidth(active, {
  icon = VIEW_PILL_ICON,
  word = VIEW_PILL_WORD,
} = {}) {
  return icon + (active ? word : 0);
}
```

Re-run. Expected: PASS. Track width and FLIP helpers stay; compact `PillNav` will stop calling `viewPillFlipOffset` after Step 6.

- [ ] **Step 4: Write the failing e2e for "the active tab is the plate"**

In `tests/e2e/view-pills.spec.js`, keep the WEEK / 44px / desktop / keyboard / reduced-motion tests. Change the first compact test and the wipe test as follows.

Replace the plate-alignment probe in `"grows one word…"` with:

```js
const paint = async (tab) => tab.evaluate((node) => ({
  width: node.getBoundingClientRect().width,
  fill: getComputedStyle(node).backgroundColor,
  indicator: node.parentElement.querySelector('[data-test="pill-indicator"]'),
}));

const timelinePaint = await paint(timeline);
const actionsPaint = await paint(actions);
expect(timelinePaint.width, "active TIMELINE occupies the word slot").toBeGreaterThan(100);
expect(actionsPaint.width, "inactive ACTIONS occupies the icon slot").toBeLessThan(40);
expect(timelinePaint.indicator, "compact mode has no travelling plate").toBeNull();

const accent = await page.getByTestId("new-entry").evaluate((node) => getComputedStyle(node).backgroundColor);
expect(timelinePaint.fill, "the active tab is the accent surface").toBe(accent);
expect(actionsPaint.fill, "an inactive tab is not the accent").not.toBe(accent);

await actions.click();
await expect(actions).toHaveAttribute("aria-selected", "true");
await page.waitForTimeout(400);
const after = await paint(actions);
expect(after.width).toBeGreaterThan(100);
expect(after.fill).toBe(accent);
expect((await timeline.evaluate((node) => node.getBoundingClientRect().width))).toBeLessThan(40);
```

Add one mid-tween assertion that the width is actually travelling. Do not set `style.transitionDuration` before the click — React will rewrite the inline `transition` on the next render and wipe it. Scrub the running CSS transition, the same way `motion.spec.js` scrubs `nbnotchin`:

```js
test("the active compact tab grows along the reserved slot, not in one frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  const actions = page.getByTestId("view-mode-actions");
  await actions.click();
  const width = await actions.evaluate((node) => {
    const tween = node.getAnimations().find((animation) => {
      const property = animation.transitionProperty || animation.effect?.pseudoElement;
      return animation.transitionProperty === "width"
        || String(animation.effect?.getKeyframes?.()?.[0] || "").includes("width");
    }) || node.getAnimations().find((animation) => animation.playState === "running");
    if (!tween?.effect) return node.getBoundingClientRect().width;
    tween.pause();
    const duration = Number(tween.effect.getTiming().duration || 0);
    if (duration > 0) tween.currentTime = duration * 0.4;
    return node.getBoundingClientRect().width;
  });
  expect(width, "mid-flight the tab is between the icon slot and the word slot").toBeGreaterThan(40);
  expect(width).toBeLessThan(100);
});
```

Keep the wipe test: the word still transitions `clip-path`. Add that the **tab** may now list `width` in `transitionProperty`, and that the **label** still must not.

Update the reduced-motion test: it currently probes `[data-test="pill-indicator"]`. After this task that node is gone in compact mode. Probe the active tab's own box instead:

```js
const drift = await page.getByTestId("view-mode").evaluate((list) => {
  const active = list.querySelector('[aria-selected="true"]');
  return active.getBoundingClientRect().width;
});
expect(drift, "reduced motion lands the active tab on the word slot").toBeGreaterThan(100);
```

- [ ] **Step 5: Run and confirm the new assertions fail**

```
npx playwright test tests/e2e/view-pills.spec.js --grep "active tab is the plate|grows along the reserved|grows one word"
```

Expected: FAIL on `indicator` not null and/or fill not matching NEW.

- [ ] **Step 6: Implement compact `PillNav`**

Import `viewPillSlotWidth`. In the compact branch only:

1. Do not render `LiquidPillIndicator` when `compact` is true.
2. Drop the FLIP state (`flip` / `previousIndex` / the `useLayoutEffect` that writes offsets) for the compact path. Desktop is unchanged.
3. Each compact tab:

```js
width: viewPillSlotWidth(on),
background: on ? T.accent : "transparent",
transition: instant
  ? "none"
  : "width 260ms var(--motion-lane), background-color 200ms ease, color 200ms ease, transform 260ms var(--motion-lane)",
transform: "none",
```

4. Keep the faint inactive body (`inset: 0 2px`, `T.faint`).
5. Keep the direction-aware `clip-path` on the label.
6. Keep `overflow: "clip"` (not `hidden`).
7. Keep `gridTemplateColumns: 30px 84px`.
8. Do not set `height`.
9. Desktop branch still mounts `LiquidPillIndicator` and still uses `useLiquidPill`.

Do **not** put `overflow: hidden` on the tab. Do **not** mount/unmount the label. Do **not** animate `grid-template-columns`.

- [ ] **Step 7: Run compact, desktop, and the existing tab callers**

```
npx playwright test tests/e2e/view-pills.spec.js
npx playwright test tests/e2e/actions.spec.js tests/e2e/interaction-contracts.spec.js tests/e2e/navigation-shell.spec.js tests/e2e/join.spec.js
node --test src/features/motion/viewPills.test.js
```

Expected: PASS.

**Abort gate.** If any of these fail and the fix would be "rewrite the assertion to accept a missing word" or "let WEEK shrink", stop. Revert the `PillNav` edit, leave Tasks 1 and 2 in place, and skip the Task 3 commit.

- [ ] **Step 8: Commit**

```bash
git add src/features/motion/viewPills.js src/features/motion/viewPills.test.js tests/e2e/view-pills.spec.js src/Planner.jsx
git commit -m "feat(ui): let the active compact view pill wear the accent and grow into its word"
```

---

### Task 4: Run the view slide on the same curve as the pills

**Files:**
- Modify: `src/Planner.jsx` `.nb-view-track.is-sliding` (~4291)
- Modify: `tests/e2e/view-pills.spec.js` (one assertion)

**Interfaces:**
- Consumes: `VIEW_SLIDE_MS` (300), `--motion-lane`
- Produces: page track and compact pills share `--motion-lane`; duration stays 300ms (a full pane is a longer distance than a 84px word)

`--motion-enter` is `cubic-bezier(.23,1,.32,1)` — four fifths of the distance in the first quarter. That is why the pill used to lunge. The page slide still uses it (`672fa19`). The pills already moved to `--motion-lane`. A tap that slides the pane *and* grows a pill currently tells two easing stories.

- [ ] **Step 1: Write the failing curve assertion**

```js
test("the page slide and the compact pill share a curve", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  await page.getByTestId("view-mode-actions").click();
  const curves = await page.evaluate(() => {
    const track = document.querySelector(".nb-view-track");
    const tab = document.querySelector('[data-test="view-mode-actions"]');
    const first = (value) => String(value).split(",")[0].trim();
    return {
      track: first(getComputedStyle(track).transitionTimingFunction),
      tab: first(getComputedStyle(tab).transitionTimingFunction),
      lane: getComputedStyle(document.documentElement).getPropertyValue("--motion-lane").trim(),
    };
  });
  expect(curves.track, "the pane must not lunge on --motion-enter").toBe(curves.tab);
  expect(curves.track).toBe(curves.lane);
});
```

- [ ] **Step 2: Run and confirm failure**

```
npx playwright test tests/e2e/view-pills.spec.js --grep "share a curve"
```

Expected: FAIL. Track is `--motion-enter`, tab is `--motion-lane`.

- [ ] **Step 3: Switch the track**

```css
.nb-view-track.is-sliding{transition:transform ${VIEW_SLIDE_MS}ms var(--motion-lane);will-change:transform}
```

Do not change `VIEW_SLIDE_MS`. Do not change `armSlide`. Do not touch gesture isolation.

- [ ] **Step 4: Re-run**

```
npx playwright test tests/e2e/view-pills.spec.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Planner.jsx tests/e2e/view-pills.spec.js
git commit -m "fix(ui): slide the view pane on the same curve the pills already use"
```

---

### Task 5: Verify and stop

- [ ] **Step 1: Unit suite**

```
npm test
```

Expected: 567 existing plus the new `viewPillSlotWidth` test (568 if Task 3 shipped).

- [ ] **Step 2: Focused e2e**

```
npx playwright test tests/e2e/motion.spec.js tests/e2e/view-pills.spec.js \
  tests/e2e/actions.spec.js tests/e2e/join.spec.js \
  tests/e2e/interaction-contracts.spec.js tests/e2e/navigation-shell.spec.js \
  tests/e2e/timeline-polish.spec.js tests/e2e/accessibility-quality.spec.js \
  tests/e2e/gesture-isolation.spec.js tests/e2e/timeline-chrome-day-turn.spec.js \
  tests/e2e/timeline-chrome-scroll.spec.js tests/e2e/reveal-without-paint.spec.js
```

`gesture-isolation`, `timeline-chrome-day-turn`, `timeline-chrome-scroll`, and `reveal-without-paint` landed after the last shared-layout plan. They must stay green. Do not start the full suite unless asked.

- [ ] **Step 3: Navigator did not grow**

Scratch check, not a committed test. Baseline at 390×844: row **38.9px**, chrome **181px**, tab **24.9px**, tablist **174px**.

```js
await page.setViewportSize({ width: 390, height: 844 });
await openPlanner(page);
console.log(await page.evaluate(() => {
  const row = document.querySelector(".nb-month-navigator");
  const tab = document.querySelector('[data-test="view-mode-timeline"]');
  return {
    row: row.getBoundingClientRect().height,
    chrome: document.querySelector('[data-test="timeline-chrome"]').getBoundingClientRect().height,
    tab: tab.getBoundingClientRect().height,
    tablist: document.querySelector('[data-test="view-mode"]').getBoundingClientRect().width,
  };
}));
```

Row and tab height must not exceed baseline. Tablist stays 174. If the row grew, something set an explicit height — remove it.

- [ ] **Step 4: Diff hygiene**

Allowed: `Planner.jsx` (close CSS, `+ ADD` morph source, compact `PillNav`, one track-curve line), `viewPills.js{,.test.js}`, `tests/e2e/motion.spec.js`, `tests/e2e/view-pills.spec.js`, this plan. Forbidden: RN files, theme hexes, `fluidGeometry.js`, desktop `useLiquidPill` rewrite, inspect-row refactor, new `src/features/navigation` or `src/features/modals`, `git add .`.

- [ ] **Step 5: Final commit only if Step 4 required a fix**

Otherwise stop.

---

## Spec coverage

| Authority | Task |
| --- | --- |
| PRD §6.3 material continuity, wash on the clip | Already shipped (`712a010`). Do not retune. Do not invert via Claude KTD3. |
| View-switching design §8.3 close content lead | Task 1 |
| View-switching design §8.4 "do not return to 667ms" | Global constraint (`MORPH_MS = 480`) |
| Claude U2 / measured mute desktop trigger | Task 2 |
| PRD §7.1 plate is the active sibling | Task 3 |
| PRD §7.2 no layout-property animation | Amended for the reserved-slot width tween only; word still clip-wipes |
| Repair addendum "plate first" | Task 3 abort gate |
| PRD §7.3 reserved track, 44px target, drawn icons | Task 3 keeps all three |
| PRD §9 keyboard / reduced motion | Existing tests; Task 3 updates the indicator probe |
| View slide / pill desync (curve, not progress) | Task 4 |
| Fortieth-time / Operate / no springs | Global constraints |

## Out of scope

- `framer-motion` and the two pasted components.
- Restyling `Composer` into the Ikigro EVENT/ACTION card.
- Deleting `nbnotchgroupin` / making composer content opaque at 0% (Claude U1 / KTD3).
- Rewriting `motion.spec.js:160` to assert content is already visible at 40%.
- Inspect-sheet row unification and two-up pairing (Claude U4–U6). Different product, different plan.
- Morphing the empty Actions dashed panel, or keyboard `a` / `n`.
- Desktop collapsing pills.
- Body-swipe-to-change-view (`8ddfa3b` / `7f24686` already settled this).
- Shared `--view-progress` drag model from the 2026-08-16 design. Tap + slide already exist; a progress ref is a different plan.
- Native / Moti / Reanimated (`2026-08-16-native-motion-port-spec.md`).
- Putting `MORPH_MS` back to 667.
- Goo on `PillNav`.
- Growing `Planner.jsx` with a new motion runtime.
- Full Playwright suite.
- Untracked audit files.
