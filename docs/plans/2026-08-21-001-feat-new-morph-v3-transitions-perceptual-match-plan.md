---
title: NEW Morph v3 — Transitions.dev Perceptual Match
type: feature
status: proposed
date: 2026-08-21
baseline_commit: 58e20f91ddcd0851ca7f0ed422dcf8499b886297
origin:
  - user-supplied Transitions.dev Plus-to-menu morph reference, 2026-08-21
  - DESIGN.md
  - docs/spec/structure.md
  - docs/plans/2026-08-17-001-feat-editor-variety-and-morph-arrival-plan.md
  - docs/plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md
  - docs/qa/2026-08-21-full-visual-validation-report.md
target_domains:
  - src/features/motion/
  - tests/e2e/
  - docs/qa/
priority: P2
supersedes_choreography_of:
  - docs/plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md
preserves_architecture_from:
  - docs/plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md
---

# NEW Morph v3 — Transitions.dev Perceptual Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop `NEW` and mobile `+ ACTION` read perceptually like the supplied Transitions.dev Plus-to-menu morph: one continuously growing object, source identity moving out, destination content moving in, a fast spring-like settle, and a symmetric close — without scaling or relaying out the real Sheet container.

**Architecture:** Keep the existing true-size `Sheet` + measured trigger + asymmetric `clip-path` architecture from Anchored Notch v2. Replace v2's choreography: the Sheet geometry must move continuously from the first frame; the source label becomes a short-lived handoff element that translates left and softens out; the real Composer body becomes one destination plane that enters from the right with tightly bounded opacity/translate/micro-scale/blur. The actual Sheet container remains at its final layout size throughout and continues to own dialog semantics, focus, dynamic height, close/reversal, and scroll behavior.

**Tech Stack:** React, CSS keyframes/transitions, Web Animations API for interruption/reversal, Playwright, Node test runner. No new runtime dependency.

**Spec:** This document is the self-contained v3 implementation spec and executable plan. Architectural predecessor: `docs/plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md`.

## Global Constraints

- Baseline for this plan is `58e20f91ddcd0851ca7f0ed422dcf8499b886297`; implementation must fetch latest `origin/main` first and report if main advanced.
- Preserve the existing true-size Sheet architecture. Do not animate the real Sheet's layout width, layout height, `top`, `left`, `right`, `bottom`, margins, padding, or grid tracks.
- Never apply `scale()` or animated blur to the real `.nb-fluid` Sheet container.
- Limited transient scale/blur is explicitly allowed only on the source-label handoff and Composer content plane, within the numeric limits defined below, because v3 intentionally prioritizes closer perceptual reference matching than v2.
- Do not create a second modal/dialog framework, duplicate the Composer form, clone interactive form DOM, or add Framer Motion.
- `Planner.jsx` should not be modified. `Composer.jsx` should not become the owner of Sheet motion.
- Ordinary trigger-origin Sheets must retain their current symmetric motion. V3 applies only to `data-fluid-origin="notch"` creation flows.
- Desktop `NEW` and mobile `+ ACTION` must use one implementation path based on measured trigger geometry, not source-ID-specific animation code.
- Preserve existing focus trap, Escape close, focus restoration, backdrop guard, body-scroll lock, keyboard behavior, 88svh cap, `ResizeObserver` height behavior, Event↔Action switching, More Options, recurrence, and in-flight WAAPI reversal.
- Reduced motion must remain immediately usable and must not depend on animation timers completing.
- Opening must stay high-frequency-friendly. Target open duration is 350ms; target settled close is 250ms.
- Do not weaken or delete existing regression tests to make the new choreography pass.
- Visual fidelity to the supplied reference is a release criterion, not a subjective afterthought. The implementation must be inspected at 0%, 20%, 40%, 60%, 80%, and 100% progress.

---

## 1. Why v2 is technically correct but visually off-reference

Anchored Notch v2 solved important engineering problems, but it does not reproduce the supplied reference's perceptual construction closely enough.

The supplied reference communicates four simultaneous ideas:

1. the source control and destination panel are one continuously changing surface;
2. the source identity leaves laterally while the destination identity arrives from the opposite side;
3. the surface changes shape for the whole open duration rather than performing an early reveal phase and a later travel phase;
4. the open curve has a lightly elastic character, while close is faster and more controlled.

Current v2 differs in several visible ways:

- `nbnotchin` holds the Sheet's full source translation through the 15% and 35% keyframes while clip insets change, which makes the first third read more like an expanding window followed by panel travel than one continuously changing object.
- The `NEW` / `+ ACTION` source label mostly changes opacity. It does not visibly leave in the reference's leftward direction.
- Composer content is divided into many `.nb-notch-cascade` clip reveals. The reference menu is one destination content plane translating in from the right.
- The v2 open easing is controlled and monotonic. The supplied reference uses a visibly springier open curve.
- The material wash and multi-group content assembly create more simultaneous cues than the reference, which is comparatively simple: surface growth + source exit + destination arrival.

V3 intentionally changes those choreography decisions while preserving v2's safe architecture.

The target perception is no longer merely:

> `NEW` became the Composer.

It is specifically:

> `NEW` continuously expanded into the Composer while the `NEW` identity moved out and the Composer content moved in.

---

## 2. Reference mechanics to match

The supplied Transitions.dev reference uses the following motion language:

```text
open duration:       350ms
close duration:      250ms
content/source fade: 200ms
open ease:           cubic-bezier(0.34, 1.25, 0.64, 1)
close ease:          cubic-bezier(0.22, 1, 0.36, 1)
source slide:        about 40px left
menu slide:          about 40px from right to rest
source/menu scale:   0.97 ↔ 1
source/menu blur:    2px ↔ 0
closed radius:       control-like
open radius:         panel-like
```

Calendar Master does **not** need literal numerical duplication where that would reintroduce known regressions. The perceptual mapping is:

| Reference behavior | Calendar Master v3 contract |
| --- | --- |
| 40×40 element grows to menu width/height | True-size Sheet remains laid out; visible `clip-path` window continuously expands from trigger bounds to full Sheet bounds |
| Width/height spring | Continuous clip + translation with a fast spring-like settle that never creates negative clip insets |
| Plus slides left/fades/blurs | `NEW` / `+ ACTION` source clone translates left, fades, micro-scales, and may blur up to 2px |
| Menu enters from right/scale/blur | Real `.nb-notch-body` enters as one content plane from the right with bounded translate, opacity, micro-scale, and optional bounded blur |
| Radius 40→20 | Actual source radius → Calendar Master Sheet radius 24px, decisively panel-like early |
| Close 250ms | Settled close target 250ms and reverses the same source/destination handoff |

### V3 tuning constants

Initial production target:

```js
MORPH_MS = 350;
MORPH_CLOSE_MS = 250;
MORPH_HANDOFF_MS = 200;
MORPH_HANDOFF_SLIDE_PX = 32;
MORPH_CONTENT_SCALE = 0.985;
MORPH_CONTENT_BLUR_PX = 1.5;
```

Allowed tuning envelope after visual validation:

```text
open:         330–370ms
close:        230–270ms
slide:        28–40px
content scale 0.98–0.995
content blur: 0–2px
```

Do not exceed these ranges without a new design decision.

The reference's exact `cubic-bezier(.34,1.25,.64,1)` must **not** be blindly applied to the Sheet clip if it causes negative inset overshoot or reveals beyond panel bounds. Match the spring perception while keeping primary surface geometry bounded. It is acceptable to use the reference-like overshoot curve on the tiny source/content handoff transforms because those are clipped by the Sheet and do not own panel geometry.

---

## 3. Chosen architecture

### 3.1 Keep one real Sheet

Do not add a second visible modal shell unless the existing true-size Sheet proves incapable of the target after the required prototype. The default architecture is:

```text
measured trigger
      ↓
real Sheet at final layout size
      ├─ clip + translate = apparent source→panel surface growth
      ├─ source-label clone = source identity exits left
      └─ .nb-notch-body = destination content enters from right
```

This is deliberately simpler than duplicating the panel or form.

### 3.2 Sheet owns physical geometry

`.nb-fluid[data-fluid-origin="notch"]` remains the one physical surface. It may animate:

```text
transform: translate(...)
clip-path
background-color/material
```

It may **not** animate:

```text
layout width
layout height
top/left/right/bottom
scale
filter blur
```

### 3.3 Source identity is a transient visual handoff

`.nb-morph-source-label` is already decorative, `aria-hidden`, and non-interactive. V3 gives that clone the reference-like leftward departure.

Target source choreography:

```text
0–10%   identity exact and readable
10–55%  move ~32px left, scale 1→.985, opacity 1→0, blur 0→1.5px
55–100% absent
```

The real trigger remains hidden during the morph and returns only when close resolves.

### 3.4 Composer body becomes one destination plane

V2's eight-group cascade is intentionally superseded for notch entry.

For notch creation only, `.nb-notch-body` becomes the reference-equivalent menu plane:

```text
0–28%    opacity 0; translateX(+32px); scale(.985); optional blur(1.5px)
28–65%   resolve to opacity 1; translateX(0); scale(1); blur(0)
65–100%  static
```

The whole form must be settled well before the final surface frame. There must be no visible content tail after the panel has stopped moving.

The existing `.nb-notch-cascade` markup may remain because Composer structure should not be rewritten for motion. Its notch-entry child animations should be disabled or reduced so they do not fight the body-plane handoff.

### 3.5 Why the real body is allowed to micro-scale and blur

This is an intentional v3 relaxation of v2.

The prohibited historical operation was scaling the **whole Sheet**, which resampled the panel, changed the apparent geometry of every descendant, and interfered with the source-to-panel match. V3 may briefly scale the inner content plane by no more than 2% because:

- the Sheet itself remains true-size;
- layout metrics remain owned by the untransformed flow box;
- scale is less than 1, so it should not increase vertical overflow;
- horizontal translation is clipped by the Sheet;
- blur is at most 2px and is applied only to the content plane/source clone, never the viewport backdrop or Sheet container.

This allowance is conditional on tests proving `scrollHeight`, resting geometry, sticky header behavior, and first-open performance remain stable.

If animated blur causes measurable first-open stutter, remove blur first while preserving translate/opacity/scale. Do not abandon the entire reference handoff because one optional property is expensive.

---

## 4. Surface geometry contract

V3 must remove the current early transform hold.

At every sampled opening frame after 0%, the Sheet transform should have moved measurably toward its final translation unless reduced motion is active.

The easiest bounded model is to move transform and each clip inset with the same normalized remainder factor:

```text
remainder = 1 at source
remainder = 0 at final

transformX = sourceTranslateX * remainder
transformY = sourceTranslateY * remainder
insetTop    = sourceInsetTop    * remainder
insetRight  = sourceInsetRight  * remainder
insetBottom = sourceInsetBottom * remainder
insetLeft   = sourceInsetLeft   * remainder
```

This causes every visible edge to interpolate continuously from the source rectangle to the destination rectangle without relaying out the Sheet.

Recommended keyframe remainder targets:

```text
0%    1.00
20%   0.72
45%   0.34
72%   0.08
88%   0.00
100%  0.00
```

Exact percentages may move inside the tuning envelope after visual review, but these invariants may not:

1. frame 0 visible bounds match the trigger within normal subpixel tolerance;
2. no 0–35% transform hold;
3. visible width/height expand monotonically;
4. no negative clip inset;
5. no visible spill outside the final Sheet bounds;
6. by roughly 80–90% the physical panel is effectively settled so the last beat reads as spring settle rather than continued travel.

### Radius

Target:

```text
0–12%   actual source radius
12–32%  decisive transition toward 24px
32–100% 24px
```

Do not preserve the pill/circle radius deep into the expansion.

### Final resting placement

V3 does not reposition the resting desktop Composer. The current final placement remains authoritative. The supplied reference's final menu footprint is source-corner-anchored, whereas Calendar Master's desktop Sheet rests centrally; this plan matches the reference's **motion language**, not its final screen coordinates.

If visual validation proves final resting placement is the dominant remaining mismatch, stop and report that as a separate product/layout decision. Do not silently turn the Composer into an anchored popover inside this motion PR.

---

## 5. Material handoff

V2's accent→card wash currently remains a prominent part of the first half. In v3 it should become subordinate to geometry.

Initial target:

```text
0–10%   source accent
10–32%  accent → card
32–100% card
```

The Composer content must not become readable while sitting on a strong source-accent slab.

The source identity may continue using the source control's foreground color during its exit.

Do not animate the scrim blur radius. Existing static backdrop blur + opacity behavior remains.

---

## 6. Open timeline

Target desktop/mobile choreography:

```text
0ms / 0%
- Sheet visible window exactly equals trigger.
- Source identity exact.
- Composer body hidden to the right.

~35ms / 10%
- Surface already moving and expanding.
- Source still readable.

~90ms / 26%
- Radius is becoming panel-like.
- Source begins obvious leftward exit.
- Material is mostly card-like.
- Composer body still mostly hidden.

~120ms / 34%
- Destination body begins moving in from the right.
- Source identity and destination identity overlap briefly enough to communicate continuity, not long enough to compete.

~200ms / 57%
- Source is effectively gone.
- Composer body is mostly readable and nearly at rest.
- Surface is near final geometry.

~285ms / 81%
- Surface has effectively landed.
- Content is fully static.

350ms / 100%
- No animation tail.
- No blur.
- No transform on body.
- No source label.
- Sheet stage is open.
```

There must be no frame in which both identities are absent.

There must also be no long interval where both identities fight for attention.

---

## 7. Close and interruption contract

### 7.1 Settled close

The close should read as the reference reversed:

```text
Composer body moves right + softens out
source identity returns from the left
surface contracts toward source
real trigger reappears only after the fold resolves
```

Target settled close duration: 250ms.

Body target on close:

```text
translateX(0) scale(1) blur(0) opacity(1)
→
translateX(+32px) scale(.985) blur(1.5px) opacity(0)
```

Source target on close:

```text
translateX(-32px) scale(.985) blur(1.5px) opacity(0)
→
translateX(0) scale(1) blur(0) opacity(1)
```

The source label should be visible before the surface reaches source size so the final control does not appear from nothing.

### 7.2 In-flight reversal

Existing Sheet logic already samples the rendered panel transform/clip and reverses it with WAAPI. Preserve that.

V3 adds a requirement: body/source handoff cannot pop when an opening is interrupted.

For Escape/backdrop close at ~25%, 50%, and 75% opening progress:

- sample current computed `opacity`, `transform`, and `filter` for `.nb-notch-body` and `.nb-morph-source-label`;
- the close path must begin from those rendered values or reverse their running animations cleanly;
- no element may jump first to its fully-open or fully-closed handoff state before moving;
- stale opening completion must not later set stage back to `open`.

Preferred implementation order:

1. first test whether reversing/cancelling the existing subtree animations through WAAPI can preserve current values without extra state;
2. if not, snapshot computed handoff values during `requestClose()` alongside the existing panel transform/clip snapshot and animate from those values;
3. do not introduce React state updated every animation frame.

### 7.3 Rapid reopen

Test:

```text
open → close during entry → reopen immediately after unmount
```

The second open must start from a fresh source snapshot and must not inherit stale animation handles, source transforms, filters, or stage timers.

---

## 8. Reduced motion, accessibility, and input

Preserve existing dialog contract:

```text
role="dialog"
aria-modal="true"
aria-labelledby=<sheet title>
```

Preserve:

- focus entry;
- focus trap;
- Escape;
- opener restoration;
- source clone `aria-hidden` and non-interactive;
- hidden real source not keyboard-reachable while Composer is open;
- backdrop timing protection;
- page-scroll freeze during entry;
- mobile keyboard behavior.

Reduced motion:

```text
- no source travel
- no body travel/scale/blur
- no staged surface morph
- no late timers required for usability
- Sheet immediately reaches card material
- source clone hidden
- body fully visible
- focus correct
```

Keyboard/programmatic opens without a valid recent pointer source must continue to use the existing non-notch/none-origin behavior rather than inventing an origin.

---

## 9. Performance contract

V3 is allowed to be visually richer than v2, but it must remain cheaper than animating the real form layout.

Required checks:

- `.nb-fluid` `offsetWidth` and `offsetHeight` remain constant throughout entry sampling;
- content `scrollHeight` is stable while the temporary body transform/scale/filter runs;
- no horizontal scrollbar appears because of `translateX(+32px)`;
- `ResizeObserver` does not begin the post-entry height transition until the primary morph is complete;
- first open in a fresh browser session does not visibly hitch;
- no animated backdrop-filter radius;
- no filter is left applied after 65%/settled state;
- no `will-change` remains permanently on large surfaces after open if it is not already part of the established architecture.

If blur is the only source of a measurable first-open hitch, set `MORPH_CONTENT_BLUR_PX = 0` and keep the rest of v3. Record the evidence in the QA report.

---

## 10. Expected file surface

Primary:

```text
src/features/motion/morphTiming.js
src/features/motion/plannerStyles.js
src/features/motion/Sheet.jsx
tests/e2e/motion.spec.js
```

Potentially:

```text
src/features/motion/morphTiming.test.js
src/features/motion/fluidGeometry.js
src/features/motion/fluidGeometry.test.js
```

Only touch geometry if the current helper cannot expose the needed continuous start/final values cleanly. Do not rewrite the already-correct source-rect/anchor math merely to change keyframe timing.

Validation artifact after implementation:

```text
docs/qa/2026-08-21-new-morph-v3-visual-validation.md
```

Do not modify:

```text
src/Planner.jsx
src/features/planner/Composer.jsx
navigation/ribbon files
```

unless a failing production test proves a direct dependency. If that happens, stop and report before expanding scope.

---

## 11. Task 1 — Characterize the current mismatch with failing production tests

**Files:**
- Modify: `tests/e2e/motion.spec.js`
- Read only: `src/features/motion/Sheet.jsx`
- Read only: `src/features/motion/plannerStyles.js`
- Read only: `src/features/motion/morphTiming.js`

**Interfaces:**
- Consumes: existing `data-fluid-origin="notch"`, `data-morph-source`, `data-morph-stage`, `nbnotchin`, `.nb-morph-source-label`, `.nb-notch-body`.
- Produces: reusable frame-sampling helper inside `motion.spec.js` that later tasks use to verify the real production animation.

- [ ] **Step 1: Add a real frame sampler for the production notch**

Add a test helper that pauses the actual `nbnotchin` animation and all relevant subtree animations, sets all of them to the same wall-clock fraction of `MORPH_MS`, then returns at least:

```js
{
  fraction,
  panelTransform,
  panelClip,
  panelOffsetWidth,
  panelOffsetHeight,
  panelBackground,
  sourceOpacity,
  sourceTransform,
  sourceFilter,
  bodyOpacity,
  bodyTransform,
  bodyFilter,
  bodyScrollHeight,
}
```

Do not reimplement production interpolation in the test.

- [ ] **Step 2: Write the failing continuous-travel assertion**

Open desktop `NEW`, sample 0%, 20%, 40%, 60%, 80%, 100%.

Required new assertion:

```text
abs(transformX at 20%) < abs(transformX at 0%) * 0.9
abs(transformY at 20%) < abs(transformY at 0%) * 0.9
```

Use sign-safe magnitude comparisons. The current v2 transform hold should fail this test.

- [ ] **Step 3: Write the failing source-exit assertion**

At approximately 40%:

```text
source translateX < -8px
source opacity < 0.9
```

At approximately 65%:

```text
source opacity <= 0.1
```

Current opacity-only source behavior should fail the directional requirement.

- [ ] **Step 4: Write the failing destination-arrival assertion**

At approximately 30–40% the real `.nb-notch-body` must show a positive X translation and be less than fully opaque; by approximately 65% it must be at rest and nearly fully opaque.

Example contract:

```text
40%: translateX >= 8px, opacity between .1 and .95
65%: abs(translateX) <= 2px, opacity >= .95
100%: transform none/matrix identity, filter none/blur(0), opacity >= .99
```

Current inert body/cascade behavior should fail.

- [ ] **Step 5: Write the stable-layout assertion**

Across all sampled fractions:

```text
panel offsetWidth identical
panel offsetHeight identical
body scrollHeight change <= 1px
```

This may already pass and becomes the safety guard for later richer motion.

- [ ] **Step 6: Run only the new tests and observe RED for the intended reasons**

Run:

```bash
npx playwright test tests/e2e/motion.spec.js --workers=1 --grep "notch"
```

Record which assertions fail on baseline. Do not change production until the intended continuous-travel/source-exit/body-arrival assertions are demonstrably red.

- [ ] **Step 7: Commit test characterization**

```bash
git add tests/e2e/motion.spec.js
git commit -m "test(motion): characterize reference morph handoff"
```

---

## 12. Task 2 — Retune timing tokens for the reference cadence

**Files:**
- Modify: `src/features/motion/morphTiming.js`
- Modify: `src/features/motion/morphTiming.test.js` if existing timing assertions require updates
- Test: `tests/e2e/motion.spec.js`

**Interfaces:**
- Produces: `MORPH_MS`, `MORPH_CLOSE_MS`, `MORPH_HANDOFF_MS`, `MORPH_HANDOFF_SLIDE_PX`, `MORPH_CONTENT_SCALE`, `MORPH_CONTENT_BLUR_PX`.

- [ ] **Step 1: Add explicit v3 timing constants**

Target implementation:

```js
export const MORPH_MS = 350;
export const MORPH_CLOSE_MS = 250;
export const MORPH_HANDOFF_MS = 200;
export const MORPH_HANDOFF_SLIDE_PX = 32;
export const MORPH_CONTENT_SCALE = 0.985;
export const MORPH_CONTENT_BLUR_PX = 1.5;
```

Keep `SHEET_ENTRY_MS = 420` for ordinary Sheets.

Do not silently reuse `MORPH_MS` for close anymore; the reference explicitly distinguishes open and close.

- [ ] **Step 2: Retune stage fractions to match the earlier handoff**

Initial target:

```js
export const MORPH_STAGE_REVEAL = 0.38;
export const MORPH_STAGE_CONTENT = 0.52;
```

`open` remains at `MORPH_MS`.

Stages are recovery/state boundaries, not the primary animation engine. CSS/WAAPI owns visual interpolation.

- [ ] **Step 3: Update timing tests with arithmetic, not literals copied from implementation**

Assert:

```text
handoff duration < open duration
close duration < open duration
reveal < content < 1
all transient content effects end before MORPH_MS
```

- [ ] **Step 4: Run timing/unit tests**

```bash
node --test src/features/motion/morphTiming.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/features/motion/morphTiming.js src/features/motion/morphTiming.test.js
git commit -m "refactor(motion): define v3 morph cadence"
```

---

## 13. Task 3 — Make the Sheet surface grow continuously

**Files:**
- Modify: `src/features/motion/plannerStyles.js`
- Test: `tests/e2e/motion.spec.js`

**Interfaces:**
- Consumes: existing CSS variables `--fluid-x`, `--fluid-y`, four source insets, `--fluid-radius`, `--fluid-target-radius`.
- Produces: new bounded `nbnotchin` keyframes with continuous translation + clip progress.

- [ ] **Step 1: Replace the v2 transform hold with continuous keyframes**

Use the same remainder factor for transform and all four insets.

Starting shape:

```css
@keyframes nbnotchin {
  0% {
    transform: translate(var(--fluid-x), var(--fluid-y));
    clip-path: inset(
      var(--fluid-inset-top)
      var(--fluid-inset-right)
      var(--fluid-inset-bottom)
      var(--fluid-inset-left)
      round var(--fluid-radius)
    );
  }
  20% {
    transform: translate(
      calc(var(--fluid-x) * .72),
      calc(var(--fluid-y) * .72)
    );
    clip-path: inset(
      calc(var(--fluid-inset-top) * .72)
      calc(var(--fluid-inset-right) * .72)
      calc(var(--fluid-inset-bottom) * .72)
      calc(var(--fluid-inset-left) * .72)
      round var(--fluid-radius)
    );
  }
  45% {
    transform: translate(
      calc(var(--fluid-x) * .34),
      calc(var(--fluid-y) * .34)
    );
    clip-path: inset(
      calc(var(--fluid-inset-top) * .34)
      calc(var(--fluid-inset-right) * .34)
      calc(var(--fluid-inset-bottom) * .34)
      calc(var(--fluid-inset-left) * .34)
      round var(--fluid-target-radius)
    );
  }
  72% {
    transform: translate(
      calc(var(--fluid-x) * .08),
      calc(var(--fluid-y) * .08)
    );
    clip-path: inset(
      calc(var(--fluid-inset-top) * .08)
      calc(var(--fluid-inset-right) * .08)
      calc(var(--fluid-inset-bottom) * .08)
      calc(var(--fluid-inset-left) * .08)
      round var(--fluid-target-radius)
    );
  }
  88%, 100% {
    transform: translate(0, 0);
    clip-path: inset(0 0 0 0 round var(--fluid-target-radius));
  }
}
```

Exact syntax may be adjusted for browser parsing, but preserve the normalized geometry model.

- [ ] **Step 2: Use a fast spring-like bounded surface ease**

Do not apply the reference's overshooting curve directly if it makes clip insets negative. Start with the app-safe close-style material curve:

```css
cubic-bezier(.22, 1, .36, 1)
```

The explicit keyframe progress provides the fast settle. If side-by-side review still reads too linear, tune keyframe percentages/remainders before introducing overshoot into panel geometry.

- [ ] **Step 3: Accelerate radius handoff**

Source-like through roughly 10–12%, panel-like by roughly 30–32%.

- [ ] **Step 4: Accelerate material wash**

Initial target:

```css
@keyframes nbnotchwash {
  0%, 10% { background-color: var(--morph-accent); }
  32%, 100% { background-color: var(--morph-card); }
}
```

- [ ] **Step 5: Run the notch frame tests**

The continuous-travel test from Task 1 must now turn green while layout-stability tests stay green.

- [ ] **Step 6: Commit**

```bash
git add src/features/motion/plannerStyles.js tests/e2e/motion.spec.js
git commit -m "feat(motion): make notch surface grow continuously"
```

---

## 14. Task 4 — Replace the v2 cascade with the reference source/content exchange

**Files:**
- Modify: `src/features/motion/plannerStyles.js`
- Modify: `src/features/motion/Sheet.jsx` only if state/reversal support is required
- Test: `tests/e2e/motion.spec.js`

**Interfaces:**
- Consumes: `.nb-morph-source-label`, `.nb-notch-body`, `data-fluid-origin="notch"`, v3 timing tokens.
- Produces: reference-like source-out and body-in animations.

- [ ] **Step 1: Animate source identity leftward**

Target CSS shape:

```css
@keyframes nbnotchlabelout {
  0%, 10% {
    opacity: 1;
    transform: translateX(0) scale(1);
    filter: blur(0);
  }
  58%, 100% {
    opacity: 0;
    transform: translateX(calc(-1 * var(--nb-morph-slide))) scale(var(--nb-morph-content-scale));
    filter: blur(var(--nb-morph-content-blur));
  }
}
```

Set the variables from timing constants in `plannerStyles.js`.

The source clone remains `pointer-events:none` and `aria-hidden`.

- [ ] **Step 2: Make `.nb-notch-body` the one destination plane**

For notch opening only, target:

```css
.nb-fluid[data-fluid-origin="notch"] .nb-notch-body {
  transform-origin: top right;
  animation: nbnotchbodyin var(--nb-morph-handoff) cubic-bezier(.34,1.15,.64,1) both;
  animation-delay: calc(var(--nb-morph-dur) * .28);
}

@keyframes nbnotchbodyin {
  from {
    opacity: 0;
    transform: translateX(var(--nb-morph-slide)) scale(var(--nb-morph-content-scale));
    filter: blur(var(--nb-morph-content-blur));
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
    filter: blur(0);
  }
}
```

The exact open handoff curve may use the supplied `cubic-bezier(.34,1.25,.64,1)` if visual sampling shows no excessive overshoot. Start at 1.15 for the real content plane and only increase with evidence.

- [ ] **Step 3: Disable the eight-group notch cascade during this entry**

Do not delete Composer markup. Suppress the existing `.nb-notch-cascade > *` notch-entry animation so there is one destination-plane motion rather than eight independent arrivals.

Existing non-notch reveal behavior must remain unchanged.

- [ ] **Step 4: Protect horizontal overflow**

Ensure the temporary +32px content translation does not create an interactive horizontal scroll area. Use an existing clipping ancestor where possible; do not change vertical scrolling ownership.

- [ ] **Step 5: Prove the richer handoff does not change layout metrics**

At 0%, 40%, 65%, 100% assert:

```text
panel offsetWidth stable
panel offsetHeight stable
body scrollHeight within 1px
no horizontal scrollbar/scrollable overflow exposed to user
```

- [ ] **Step 6: Run the source/body RED→GREEN tests**

```bash
npx playwright test tests/e2e/motion.spec.js --workers=1 --grep "notch"
```

- [ ] **Step 7: Commit**

```bash
git add src/features/motion/plannerStyles.js src/features/motion/Sheet.jsx tests/e2e/motion.spec.js
git commit -m "feat(motion): hand off NEW into composer content"
```

---

## 15. Task 5 — Make settled close and in-flight reverse preserve the new handoff

**Files:**
- Modify: `src/features/motion/Sheet.jsx`
- Modify: `src/features/motion/plannerStyles.js`
- Modify: `src/features/motion/morphTiming.js`
- Test: `tests/e2e/motion.spec.js`

**Interfaces:**
- Consumes: existing panel WAAPI reversal path.
- Produces: body/source close animations that begin from the actual rendered state.

- [ ] **Step 1: Set settled close to `MORPH_CLOSE_MS`**

Replace notch close literals with the timing token.

- [ ] **Step 2: Add body-out/source-return keyframes**

Target:

```css
@keyframes nbnotchbodyout {
  from { opacity:1; transform:translateX(0) scale(1); filter:blur(0); }
  to   { opacity:0; transform:translateX(var(--nb-morph-slide)) scale(var(--nb-morph-content-scale)); filter:blur(var(--nb-morph-content-blur)); }
}

@keyframes nbnotchlabelin {
  from { opacity:0; transform:translateX(calc(-1 * var(--nb-morph-slide))) scale(var(--nb-morph-content-scale)); filter:blur(var(--nb-morph-content-blur)); }
  to   { opacity:1; transform:translateX(0) scale(1); filter:blur(0); }
}
```

Do not instantly set body opacity to zero on close as v2 does.

- [ ] **Step 3: Preserve exact in-flight values**

Extend the existing `requestClose()` interruption handling only as much as needed so source/body do not pop.

Preferred first attempt:

```js
const handoffAnimations = panel.getAnimations({ subtree: true })
  .filter((animation) => ["nbnotchbodyin", "nbnotchlabelout"].includes(animation.animationName));
```

If reversing/cancelling these animations directly can maintain continuity, use that.

If not, snapshot computed styles for body/source before cancellation:

```js
{
  opacity,
  transform,
  filter,
}
```

and WAAPI-animate from those exact values to their close targets over a duration proportional to remaining source distance.

Do not add per-frame React updates.

- [ ] **Step 4: Add interruption tests at 25%, 50%, 75%**

For each progress value:

1. open NEW;
2. pause/scrub production animations to the target frame;
3. record body/source computed values;
4. Escape;
5. assert the first closing frame is within small tolerance of the recorded opening frame;
6. assert Sheet eventually unmounts and trigger returns.

- [ ] **Step 5: Add rapid reopen test**

Open → close during entry → wait for unmount → immediately open again.

Assert no stale transform/filter/stage state.

- [ ] **Step 6: Commit**

```bash
git add src/features/motion/Sheet.jsx src/features/motion/plannerStyles.js src/features/motion/morphTiming.js tests/e2e/motion.spec.js
git commit -m "fix(motion): preserve v3 handoff through reversal"
```

---

## 16. Task 6 — Validate all existing Composer behavior after the choreography change

**Files:**
- Test: `tests/e2e/motion.spec.js`
- Test: `tests/e2e/composer.spec.js`
- Create after validation: `docs/qa/2026-08-21-new-morph-v3-visual-validation.md`

**Interfaces:**
- No new production interface.

- [ ] **Step 1: Focused motion tests**

```bash
npx playwright test tests/e2e/motion.spec.js --workers=1
```

- [ ] **Step 2: Composer flow tests**

```bash
npx playwright test tests/e2e/composer.spec.js --workers=1
```

Required manual/product flows:

```text
desktop NEW → Event
desktop NEW → switch Action
desktop NEW → More Options
mobile + ACTION → Action
mobile + ACTION → switch Event
Escape close
backdrop close after guard
close during entry at 25/50/75
rapid close/reopen
reduced motion
keyboard/non-pointer open path
```

- [ ] **Step 3: Verify post-open dynamic height**

After the Sheet reaches open state:

```text
Event → Action
Action → Event
More Options expand/collapse
recurrence controls
```

must still animate height using the existing post-entry mechanism, not restart the primary morph.

- [ ] **Step 4: Fresh-session first-open performance check**

Use real Chrome, not only Playwright's animation scrubbing.

Check first NEW open after browser launch at:

```text
1280×900
390×844
```

If blur causes a visible first-open hitch, set body/source blur to 0 and rerun. Do not change panel geometry or reintroduce backdrop blur animation.

- [ ] **Step 5: Full unit/build/browser verification**

```bash
npm test
npm run build
npx playwright test --workers=1
```

If the full suite has a known unrelated flake, rerun that exact failing test three times and document the result. Do not call the full suite green if a new motion/composer test is failing.

---

## 17. Visual validation matrix — mandatory

This task is not complete from tests alone.

Capture the actual production morph at:

```text
0%
20%
40%
60%
80%
100%
```

for:

```text
1280×900 desktop NEW
390×844 mobile + ACTION
390×601 mobile + ACTION
```

Also inspect at least:

```text
one dark theme
one light theme
one high-chroma/accent-heavy theme
```

### Side-by-side perceptual checklist

For each progress sample compare to the supplied reference mechanics, not merely to v2.

Pass only if all are true:

1. **Continuous object:** the panel is visibly moving/growing from the first fifth; there is no obvious clip-first/travel-later split.
2. **Source departure:** `NEW` / `+ ACTION` visibly moves left while fading/softening.
3. **Destination arrival:** Composer content visibly comes from the right and resolves into the panel.
4. **Opposing exchange:** source and destination move in opposite directions through one surface.
5. **Radius:** the source shape quickly becomes panel-like rather than remaining circular.
6. **Material:** strong accent is gone before readable form content dominates.
7. **Settle:** by roughly 80% the gesture reads as landing, not continued assembly.
8. **No late tail:** 100% is completely static.
9. **No resampling artifact:** text and inputs do not visibly wobble, stretch, or change layout.
10. **Close symmetry:** close reads as the same object folding back, with body out/source back.

### Relative similarity target

The implementation does not need to reproduce the reference's final panel position because Calendar Master's Sheet rests in a different location. It must reproduce the same **sequence of visual causes**:

```text
source control
→ continuously expanding surface
→ source identity exits left
→ destination content enters from right
→ fast spring-like settle
→ symmetric return on close
```

If a reviewer still describes the result as “an anchored modal reveal” rather than “the button morphs into the Composer,” do not mark the plan complete.

---

## 18. QA report requirements

Create:

```text
docs/qa/2026-08-21-new-morph-v3-visual-validation.md
```

Include:

- baseline and final commit SHAs;
- exact files changed;
- RED tests observed before production work;
- final unit/build/E2E results;
- desktop/mobile viewport matrix;
- 0/20/40/60/80/100 frame observations;
- whether body/source blur remained enabled or was removed for performance;
- measured Sheet `offsetWidth`/`offsetHeight` stability;
- measured body `scrollHeight` stability;
- interruption/reversal results;
- reduced-motion result;
- any remaining visual difference from the supplied reference.

Do not use “looks good” as evidence. Record specific motion behavior.

---

## 19. Acceptance criteria

All must pass:

1. `NEW` frame-zero visible Sheet bounds match the pressed trigger.
2. `+ ACTION` frame-zero visible Sheet bounds match its pressed trigger.
3. Panel transform has measurably progressed by 20%; no v2-style early transform hold.
4. Visible panel growth remains bounded with no negative clip or spill.
5. Actual Sheet layout width/height stay constant throughout entry.
6. Source identity moves left and is effectively gone by about 60%.
7. Composer body enters from the right and is effectively settled by about 65%.
8. Notch entry no longer presents eight visible staggered Composer arrivals.
9. Body/source handoff scale never goes below `.98`.
10. Animated body/source blur never exceeds `2px` and is zero at rest.
11. Panel itself is never scaled or blurred.
12. Strong source material is gone before readable Composer body dominates.
13. Open is approximately 350ms and no visual tail continues beyond it.
14. Settled close is approximately 250ms.
15. Close at 25%, 50%, 75% begins from the actual rendered frame without snapping.
16. Rapid reopen starts cleanly.
17. Event↔Action switching remains correct.
18. More Options and recurrence remain correct.
19. Post-entry dynamic Sheet height remains correct.
20. Focus trap, Escape, opener restore, backdrop guard, and body-scroll behavior remain correct.
21. Reduced motion is immediate and stable.
22. Desktop and mobile use the same general implementation.
23. Ordinary non-notch Sheets are unchanged.
24. Full unit/build/E2E verification has no new failures.
25. Side-by-side review passes the source→surface→destination sequence at 0/20/40/60/80/100.

---

## 20. Non-goals

Do not use this PR to:

- reposition the resting desktop Composer;
- turn the Composer into a popover;
- redesign event/action fields;
- redesign inspector sheets;
- change navigation/ribbon motion;
- add spring libraries;
- add a generic animation abstraction for unrelated surfaces;
- convert every app Sheet to the v3 notch choreography;
- replace the scrim/backdrop architecture;
- change the visual theme system.

---

## 21. Stop conditions

Stop and report instead of forcing implementation if:

1. the current baseline tests do not reproduce the intended v2 mismatch signals;
2. matching the reference appears to require scaling the `.nb-fluid` Sheet itself;
3. matching the reference appears to require animating real Sheet layout width/height;
4. body micro-scale/blur changes `scrollHeight`, breaks sticky header behavior, or causes visible text/input wobble;
5. first-open performance visibly regresses and cannot be fixed by removing optional blur;
6. in-flight reversal cannot preserve source/body continuity without a broad Sheet rewrite;
7. ordinary trigger-origin Sheets change;
8. Planner/navigation/ribbon changes appear necessary;
9. reduced motion requires timers to reach a usable state;
10. tests have to be weakened or removed;
11. the only way to look like the reference is to change the final resting Composer placement — report that as a separate product decision;
12. implementation starts duplicating Composer DOM or interactive form controls for visual proxies.

---

## 22. Git and PR discipline

Implementation must happen off latest `main` in an isolated worktree.

Suggested branch:

```text
feat/new-morph-v3-transitions-match
```

Before editing:

```bash
git fetch origin
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

Do not overwrite unrelated dirty files.

Never use:

```text
git add -A
git add .
git reset --hard
git clean
```

Stage exact files per task.

Do not merge the implementation directly to `main`. Open a PR and include the v3 QA report/evidence.

---

## 23. Hardened Codex implementation prompt

Copy the following prompt into a fresh Codex session after this plan is present on `main`:

```text
You are implementing a high-fidelity motion change in Revenue-Architect/Calendar-master.

PRIMARY OBJECTIVE

Make the desktop NEW → Composer and mobile + ACTION → Composer creation morph perceptually match the user-supplied Transitions.dev “Plus to menu morph” motion language much more closely.

The target is NOT merely “an anchored modal reveal.”
The target perception is:

source control
→ continuously expanding surface
→ source identity exits left
→ destination content enters from right
→ fast spring-like settle
→ symmetric return on close

AUTHORITATIVE PLAN

Read completely before editing:

docs/plans/2026-08-21-001-feat-new-morph-v3-transitions-perceptual-match-plan.md

Also read completely:

DESIGN.md
docs/spec/structure.md
docs/plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md
src/features/motion/Sheet.jsx
src/features/motion/fluidGeometry.js
src/features/motion/fluidTrigger.js
src/features/motion/morphTiming.js
src/features/motion/plannerStyles.js
tests/e2e/motion.spec.js
tests/e2e/composer.spec.js

REPO STATE AND SAFETY

Fetch origin first. Do not assume the baseline SHA in the plan is still main.
Report:
- origin/main SHA
- local HEAD
- branch
- worktree status
- whether main advanced beyond the plan baseline

Use an isolated worktree and branch:
feat/new-morph-v3-transitions-match

Preserve all unrelated user-owned work.
Never use git add -A, git add ., git reset --hard, or git clean.
Stage explicit files only.
Do not merge to main.

REFERENCE MOTION

The supplied Transitions.dev reference uses approximately:
- open 350ms
- close 250ms
- source/content handoff 200ms
- springy open cubic-bezier around (.34,1.25,.64,1)
- controlled close cubic-bezier around (.22,1,.36,1)
- source identity slides left ~40px while fading/softening
- destination menu starts to the right, slightly smaller/blurred, then resolves to rest
- control-like radius becomes panel-like radius
- surface grows continuously for the gesture

Calendar Master must match those PERCEPTUAL CAUSES, not literally copy the reference CSS architecture.

NON-NEGOTIABLE ARCHITECTURE

Preserve the real true-size Sheet.
Do NOT animate the .nb-fluid Sheet's layout width, layout height, top, left, right, bottom, margin, padding, or grid tracks.
Do NOT scale or blur .nb-fluid itself.
Do NOT create a second modal framework.
Do NOT duplicate the Composer form or clone interactive DOM.
Do NOT add Framer Motion or another dependency.
Do NOT move motion ownership into Planner.jsx or Composer.jsx.
Do NOT change ordinary trigger-origin Sheet motion.

V3 INTENTIONALLY RELAXES ONE V2 RULE

For notch creation only, a tightly bounded transient translate/opacity/micro-scale/blur is allowed on:
- .nb-morph-source-label
- .nb-notch-body

Initial limits:
- slide 32px
- scale .985, never below .98
- blur 1.5px, never above 2px
- handoff ~200ms

This is allowed because the Sheet remains true-size and stable. If blur alone causes measurable first-open stutter, remove blur and retain the rest of the handoff.

DO NOT CODE FIRST

Before production edits:

1. inspect the current v2 animation at 0%, 20%, 40%, 60%, 80%, 100%;
2. report exactly why it differs from the reference in the running app;
3. add the failing regression tests required by Task 1 of the plan;
4. run them against current production and show that the intended continuous-travel/source-exit/body-arrival assertions are RED;
5. only then change production.

Do not claim TDD unless you observed those tests fail for the expected reason.

IMPLEMENTATION ORDER

Follow the plan task-by-task:

1. production frame sampler + red tests;
2. timing tokens;
3. continuous surface geometry;
4. source-left / body-right handoff;
5. settled close + in-flight reversal;
6. full behavioral and visual validation.

Do not combine all motion changes into one giant edit. Commit at meaningful task boundaries.

TARGET OPEN CHOREOGRAPHY

0%:
- visible Sheet window exactly matches trigger
- source identity exact
- body hidden to right

~20%:
- panel translation and clip have both moved materially toward final
- no v2 early transform hold

~30–40%:
- radius is panel-like
- source is moving left and fading
- body begins moving in from right
- material is already mostly the final card

~60–65%:
- source effectively absent
- body effectively settled and readable

~80%:
- physical surface effectively landed

100% / ~350ms:
- zero visual tail
- source hidden
- body transform identity
- body filter none/blur(0)
- panel fully open

TARGET CLOSE

~250ms settled close:
- body exits right + softens
- source returns from left
- surface contracts to source
- real trigger returns only when fold completes

Interruption at 25%, 50%, 75% must start close from the exact visible frame for panel, source identity, and destination body.

TEST QUALITY RULES

Tests must inspect production animations and computed styles.
Do not duplicate the interpolation implementation inside tests.
Do not assert only class names or animation names.
Prove:
- real Sheet offsetWidth/offsetHeight remain constant
- body scrollHeight remains stable
- no horizontal scroll surface leaks
- source moves left
- body enters from right
- transform has progressed by 20%
- all transient effects are gone at rest
- ordinary Sheets are unchanged
- reduced motion is immediate
- close/reversal has no snap

VISUAL VALIDATION IS MANDATORY

Use real Chrome at native 100% browser zoom.
Capture/scrub production frames at:
0%, 20%, 40%, 60%, 80%, 100%

At minimum:
- 1280x900 desktop NEW
- 390x844 mobile + ACTION
- 390x601 mobile + ACTION
- one dark theme
- one light theme
- one high-chroma theme

The review question is not “does this look smooth?”
It is:

Does this now communicate the same causal sequence as the Transitions.dev reference?

source → continuously growing object → source exits left → destination arrives from right → settle

If it still reads as “a modal is being revealed from a button,” keep tuning within the plan's allowed envelope before declaring success.

PERFORMANCE GATE

Fresh-session first open must be checked.
If optional blur causes the only hitch, remove blur first.
Do not fall back to scaling the Sheet or animating layout.

FULL VERIFICATION

Run focused first:
node --test src/features/motion/morphTiming.test.js
npx playwright test tests/e2e/motion.spec.js --workers=1
npx playwright test tests/e2e/composer.spec.js --workers=1

Then:
npm test
npm run build
npx playwright test --workers=1

Use an isolated Playwright/server port so another worktree cannot serve stale code.

QA ARTIFACT

Create:
docs/qa/2026-08-21-new-morph-v3-visual-validation.md

It must document:
- baseline/final SHA
- red tests observed
- files changed
- test/build results
- 0/20/40/60/80/100 observations
- layout/scrollHeight stability
- whether blur stayed enabled
- reversal/reduced-motion results
- remaining differences from reference

STOP CONDITIONS

Stop and report instead of forcing code if:
- baseline mismatch tests cannot be made to fail honestly;
- matching the reference appears to require scaling or blurring the Sheet itself;
- matching requires animating Sheet layout width/height;
- body micro-motion changes scrollHeight/sticky behavior or visibly resamples the form;
- first-open performance regresses and removing optional blur does not fix it;
- ordinary Sheets regress;
- Planner/navigation/ribbon changes appear necessary;
- reversal requires a broad modal rewrite;
- final resting Composer position appears to be the dominant remaining mismatch.

If the last condition is true, report it as a separate product/layout decision. Do not silently convert the Composer into an anchored popover.

DELIVERY

When complete, do not merge.
Push the implementation branch and open a PR.
In the PR description include:
- root visual mismatch proven
- architecture used
- exact red→green tests
- full verification results
- visual QA summary
- any deliberate deviation from the supplied reference

Then stop for review.
```

---

## 24. Final implementation review checklist

Before the implementation PR is considered ready for merge, a reviewer should be able to answer **yes** to each:

```text
[ ] Is the real Sheet still true-size and layout-stable?
[ ] Does panel translation start moving before 20%?
[ ] Does the visible window expand continuously rather than in two phases?
[ ] Does NEW/+ACTION visibly leave left?
[ ] Does Composer content visibly arrive from the right?
[ ] Is the body effectively settled by ~65%?
[ ] Is the surface effectively settled by ~80–90%?
[ ] Is 100% fully static?
[ ] Is the source material gone before readable content dominates?
[ ] Is there no eight-group visible arrival tail?
[ ] Is any content scale >= .98?
[ ] Is any animated content blur <= 2px and zero at rest?
[ ] Is the Sheet itself never scaled/blurred?
[ ] Does close reverse the same perceptual story?
[ ] Do 25/50/75% interruptions avoid snapping?
[ ] Does rapid reopen start cleanly?
[ ] Are Event/Action/More Options still correct?
[ ] Is reduced motion immediate?
[ ] Are ordinary Sheets unchanged?
[ ] Does first open remain smooth?
[ ] Did focused tests, full unit suite, build, and full Playwright complete without new failures?
[ ] Does side-by-side 0/20/40/60/80/100 review read like the reference motion language?
```

If the final answer to the last question is no, the plan is not complete merely because all automated tests pass.
