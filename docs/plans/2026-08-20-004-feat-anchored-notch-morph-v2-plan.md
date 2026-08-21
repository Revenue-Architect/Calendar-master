---
title: Anchored Notch Morph v2
type: feature
status: proposed
date: 2026-08-20
baseline_commit: 68963771664f78c81529663c9ee9996eeb67ff16
origin:
  - DESIGN.md
  - docs/spec/structure.md
  - docs/plans/2026-08-17-001-feat-editor-variety-and-morph-arrival-plan.md
  - docs/plans/2026-08-20-002-feat-apple-design-micro-interactions-plan.md
target_domains:
  - src/features/motion/
  - src/features/planner/
  - tests/e2e/
priority: P2
independent_from:
  - docs/plans/2026-08-20-003-fix-navigation-shell-reload-and-ribbon-continuity-plan.md
---

# Anchored Notch Morph v2

## 1. Executive intent

Calendar Master's creation surfaces already use the correct architectural idea: the control that opens a Sheet is measured, the final Sheet is laid out at true size, and a translated `clip-path` reveal makes that Sheet appear to grow from the source control. The desktop `NEW` button and mobile `+ ACTION` button use this path through `fluidTrigger.js`, `fluidGeometry.js`, `Sheet.jsx`, `morphTiming.js`, and the notch CSS in `plannerStyles.js`.

This plan does **not** replace that system. It evolves it so the motion reads more clearly as one physical object changing state.

The target perception is:

> `NEW` became the Composer.

not:

> `NEW` disappeared and a modal appeared in the middle.

For desktop `NEW`, the Sheet should remain visually anchored to the button's top/right relationship and expand primarily leftward and downward. For mobile `+ ACTION`, the exact same engine must derive its anchor from the measured trigger rather than from hard-coded source IDs or viewport assumptions.

This track is independent of the Week ribbon P1 in Plan #003. Do not combine their implementation or commits.

---

## 2. Current implementation that must be preserved

The existing system has already solved important failure modes and is the baseline, not disposable code.

Current behavior to preserve:

1. `fluidTrigger.js` records the pressed control's `getBoundingClientRect()` and real corner radius. Keyboard opens clear stale trigger identity rather than borrowing whichever control happens to hold focus.
2. Planner's `NEW` and mobile `+ ACTION` create a Composer with `notch: true` and an explicit `morphSource`.
3. `Sheet.jsx` measures the final resting panel before first paint.
4. `fluidMorphFromRects()` computes the translation and clip needed to reveal the final-size Sheet from the trigger-sized source.
5. The full Sheet is **revealed, never scaled**. This is a design-system rule in `DESIGN.md` because full-container scaling previously caused text/form resampling and visual glitches.
6. The trigger's accent/material is carried into the opening Sheet before it washes into the card material.
7. Composer content arrives as staggered clip reveals through `.nb-notch-cascade`; it is not a single generic fade.
8. Sheet entry and dynamic Sheet height are separate concerns. `ResizeObserver` only owns content-driven height changes after the entrance geometry has settled.
9. A settled Sheet folds back toward its source on close.
10. If close occurs while entry is still running, `Sheet.jsx` samples the rendered transform and clip, cancels the current entry animation, and reverses from that exact visible state using WAAPI.
11. Focus trap, Escape handling, opener focus restoration, body scroll locking, backdrop protection, reduced motion, viewport capping, and mobile keyboard behavior are part of the Sheet contract.

Any v2 implementation that loses one of these properties is a regression even if the animation looks more impressive in a single demo.

---

## 3. Reference interaction versus implementation contract

The visual inspiration is similar to a control-to-menu morph such as the Transitions.dev plus-to-menu example:

- one object changes from control to panel;
- radius evolves from control-like to panel-like;
- source identity survives into the destination;
- opening can be slightly more expressive than closing;
- content waits until the physical surface has somewhere to exist.

But Calendar Master must **not** copy the reference implementation literally.

### Forbidden for the main Sheet entrance

Do not animate:

- Sheet `width`;
- Sheet `height`;
- `top`, `left`, `right`, or `bottom`;
- margin or padding;
- grid tracks;
- full-Sheet `scale()`;
- animated `filter: blur(...)`.

Do not:

- cross-fade the entire Composer as one block;
- replace `Sheet` with a fixed-size popover;
- introduce a second modal framework;
- add Framer Motion solely for this effect;
- add an extra Event/Action/Note chooser before the Composer.

The reference is interaction language, not architecture.

### Allowed primary-motion properties

Prefer:

- `transform: translate(...)`;
- `clip-path: inset(...)`;
- clip/border radius interpolation;
- background/material handoff;
- limited source-identity opacity only where necessary.

The Sheet remains at its true final layout size for the entire source-to-Sheet transformation.

---

## 4. Target motion behavior

### 4.1 Desktop NEW

`NEW` sits in the upper-right HUD. Its source geometry should remain perceptually pinned to that edge while the opposite edges expand.

Conceptually:

```text
                         ┌──── NEW ────┐
                         └─────────────┘
                                │
                                │ preserve top/right anchor
                                ▼
                  ┌────────────────────┐
                  │ NEW                │
                  └────────────────────┘
                            │
                            │ expand left + down
                            ▼
        ┌──────────────────────────────────┐
        │ NEW / NEW EVENT                  │
        │                                  │
        │ What's happening?                │
        │                                  │
        │ EVENT              ACTION        │
        │ ...                              │
        └──────────────────────────────────┘
```

The initial visible Sheet rectangle must match the pressed `NEW` button within ordinary subpixel tolerance.

### 4.2 Mobile + ACTION

Mobile must use the same algorithm from the actual measured `+ ACTION` rectangle.

Do not encode `new-entry => top-right` and `new-action => bottom-right` as special-case source IDs. Anchor selection belongs to geometry.

The mobile result must still read as one object changing state rather than a generic bottom sheet sliding in.

---

## 5. Geometry model

The current helper uses symmetric `insetX` and `insetY`. That is enough to make a centered trigger-sized window, but it does not express a source edge that should remain visually anchored while the opposite side opens.

V2 should support asymmetric clipping.

Recommended conceptual result:

```js
{
  translateX,
  translateY,
  insetTop,
  insetRight,
  insetBottom,
  insetLeft,
  sourceRadius,
  targetRadius,
  anchorX,
  anchorY,
}
```

Exact names may differ. The capability may not.

### 5.1 Anchor selection

Derive the anchor from trigger and final-panel geometry.

A reasonable starting rule:

```text
trigger center right of panel center  => anchorX = right
otherwise                              => anchorX = left

trigger center above panel center     => anchorY = top
otherwise                              => anchorY = bottom
```

Desktop `NEW` should normally resolve to `right/top`.

### 5.2 Frame-zero invariant

At animation time zero:

```text
visible clipped Sheet rect ~= trigger rect
```

This is stronger than matching approximate width/height near the source.

The visible start bounds should match:

- source x;
- source y;
- source width;
- source height;
- source corner character.

### 5.3 Pure helper ownership

Put the asymmetric geometry math in `src/features/motion/fluidGeometry.js`, not in `Planner.jsx`, `Composer.jsx`, or ad hoc Sheet branches.

A suitable conceptual API is:

```js
anchoredFluidMorphFromRects(triggerRect, panelRect, {
  sourceRadius,
  targetRadius: 24,
})
```

Keep the helper pure so the real production math can be unit tested directly.

---

## 6. Timing and easing

Current notch entry is approximately 480ms and close approximately 240ms.

Once anchored geometry is correct, prototype:

```text
open:  380ms
close: 240ms
```

Acceptable exploration range:

```text
open:  360-400ms
close: 220-250ms
```

Do **not** retime first. Geometry correctness comes first, timing second.

The app's fortieth-time test governs this decision: creation is a high-frequency planner action, so the motion must retain physical meaning without making the user repeatedly wait for it.

Avoid elastic overshoot outside the source or final panel bounds. A controlled fast-out material curve close to the current `cubic-bezier(.22,.85,.28,1)` is a better baseline than a showpiece spring.

All Composer cascade groups must finish by the end of the primary opening duration:

```text
max(group.delay + group.duration) <= morphDuration
```

A content tail that keeps arriving after the container is stationary reads as a fade laid over a finished modal rather than one coherent transformation.

---

## 7. Radius choreography

Radius is a primary physical signal in v2.

At t=0:

```text
clip radius = actual source radius
```

At rest:

```text
Sheet radius = 24px
```

Do not linearly keep a pill-like `999px` radius for most of the run. That previously produced the circular/portal effect the repo already corrected.

Target choreography:

```text
0-15%   source radius remains clearly recognizable
15-35%  radius transitions decisively toward panel-like
35-100% panel radius dominates
```

Use Chrome frame inspection to choose exact keyframes. Do not tune only from the final frame.

---

## 8. Source identity handoff

Current behavior hides the real source control and paints a temporary `NEW` / `+ ACTION` identity on the Sheet during the material carry.

V2 may refine this, but must preserve identity continuity.

Required invariant:

> There is no visible frame where both source identity and destination identity are absent.

Also avoid the opposite failure:

> `NEW` must not float over a mostly finished Composer long enough to compete with the destination UI.

Preferred perception:

```text
NEW
  -> same identity physically attached to expanding surface
  -> resolves into destination Sheet/composer identity
```

Do this **after** anchored geometry works. Geometry and identity choreography should not be changed simultaneously if that makes regressions hard to diagnose.

Any visual clone must remain `aria-hidden` and non-interactive.

---

## 9. Content choreography

Keep `.nb-notch-cascade`.

Do not reintroduce:

- one-block opacity fade;
- child scaling;
- animated blur.

Sequence:

1. physical surface establishes source-to-panel geometry;
2. material wash reaches Sheet material;
3. content groups begin revealing;
4. all content groups settle before or with the main shape.

For a top-right source, v2 may test a subtle directional clip reveal biased from source side toward the Sheet interior. It must still read as Composer content assembling, not as a horizontal page transition.

Clip-path remains preferred because it does not affect layout measurements.

---

## 10. Close and reversal contract

### 10.1 Settled close

A fully open Composer should retrace the same physical story:

```text
full Sheet
 -> content clears
 -> surface contracts toward measured source
 -> source identity returns
 -> original source control becomes visible
```

### 10.2 In-flight reversal

This is non-negotiable.

Test close at approximately 25%, 50%, and 75% through opening.

Forbidden behavior:

- snap to fully open before closing;
- restart close from a fake full-size state;
- jump to source before disappearing.

Required behavior:

1. read actual rendered `transform` + `clip-path`;
2. cancel current entry animation;
3. reverse from that exact visible frame;
4. stale entry completion must not later reopen or restyle the closing Sheet.

Preserve the current WAAPI reversal or improve it equivalently.

---

## 11. Reduced motion and accessibility

The morph is visual only. Dialog semantics remain unchanged:

```text
role="dialog"
aria-modal="true"
aria-labelledby=<sheet title>
```

Preserve:

- focus enters the Sheet correctly;
- Tab remains trapped;
- Escape closes;
- focus restores to opener where appropriate;
- original hidden source is not simultaneously keyboard reachable;
- backdrop timing guard remains unless evidence proves it obsolete;
- page scroll does not jump during autofocus or the morph.

With OS or in-app reduced motion:

- no long morph;
- no staged travel;
- no stuck source-label intermediate state;
- Composer becomes immediately usable;
- focus is still correct.

Do not make reduced-motion correctness depend on animation timers completing.

---

## 12. Performance contract

The primary entrance must stay out of layout animation.

Do not animate primary geometry via:

```text
width / height / top / left / right / bottom / margin / padding / grid tracks
```

The existing post-entry Sheet height interpolation may continue for real content changes such as Event -> Action or More Options.

Do not animate `filter: blur(...)`. The repo already avoids changing blur radius every frame because it invalidates the compositor's cached backdrop and can make first-open performance visibly worse.

Prefer compositor-friendly translation and clipping. First open of a session must not visibly stutter.

---

## 13. Expected file surface

Primary expected files:

```text
src/features/motion/fluidGeometry.js
src/features/motion/fluidGeometry.test.js
src/features/motion/Sheet.jsx
src/features/motion/morphTiming.js
src/features/motion/plannerStyles.js
tests/e2e/motion.spec.js
```

Potentially:

```text
src/features/motion/fluidTrigger.js
```

only if the existing source snapshot lacks information the general geometry algorithm genuinely needs.

`src/Planner.jsx` should require little or no modification.

Do not put motion ownership in `Composer.jsx`; Composer owns form composition, not Sheet mechanics.

---

## 14. Test-first implementation phases

### Phase A — characterize baseline

Before editing:

1. read `DESIGN.md` and `docs/spec/structure.md`;
2. read the existing Sheet/geometry/trigger/timing/style files;
3. run relevant unit tests;
4. run `tests/e2e/motion.spec.js`;
5. run `tests/e2e/composer.spec.js`;
6. visually inspect desktop `NEW` at 1280x900;
7. visually inspect mobile `+ ACTION` at 390x844;
8. inspect entry at t=0, early, mid, settled, close, and close-during-entry.

Do not code from memory.

### Phase B — pure anchored geometry

Add unit tests against the real production helper for:

- top-right source -> panel;
- top-left source -> panel;
- bottom-right source -> panel;
- bottom-left source -> panel;
- source narrower than panel;
- source wider than panel;
- unusual source height;
- mobile source near lower viewport edge;
- fractional/subpixel rectangles.

For each case assert:

- every inset is non-negative;
- start visible width ~= source width;
- start visible height ~= source height;
- translated start position ~= source position;
- selected anchor edge relationship is correct;
- final clip resolves to full panel.

Do not duplicate the production geometry implementation inside tests.

### Phase C — wire v2 into existing notch mode

Do not create a second Sheet implementation.

During development, a temporary `notch-v2` switch is acceptable for comparison, but remove duplicated paths before final delivery unless a deliberate feature flag is required.

One owner, one production implementation.

### Phase D — retime

Only after geometry passes:

- prototype ~380ms entry;
- retain ~240ms close initially;
- update stage fractions consistently;
- verify material wash and content cascade remain within the new duration.

### Phase E — identity refinement

Once geometry and timing are stable, refine the source-label-to-destination handoff.

Frame-by-frame invariant:

```text
source identity exists
 -> transformation carries identity
 -> destination identity exists
```

### Phase F — reverse behavior

Validate:

```text
settled -> close
25% open -> Escape
50% open -> Escape
75% open -> Escape
rapid open -> close -> open
backdrop close during entry
```

No snap is allowed.

---

## 15. Required E2E coverage

Extend `tests/e2e/motion.spec.js`.

### 15.1 Desktop source geometry

At 1280x900:

1. measure `NEW` before click;
2. click `NEW`;
3. pause entry at t=0;
4. reconstruct/measure the visible Sheet clip;
5. prove it matches the source rect within tolerance;
6. verify source anchor is top/right;
7. inspect mid-transition and prove the opposite edges do most of the expansion;
8. scrub to end and verify full Sheet.

### 15.2 Mobile source geometry

At 390x844:

- measure `+ ACTION`;
- open Composer;
- verify `data-morph-source="new-action"`;
- verify initial clipped bounds match the real button;
- verify the anchor is geometry-derived, not desktop coordinates.

### 15.3 No full-Sheet scale

During primary entry, fail if the Sheet's animation keyframes introduce `scale()` on the full container.

Translation is allowed.

### 15.4 No animated blur

Fail if the main Sheet or Composer entry has active keyframes for `filter`/blur.

### 15.5 No primary width/height animation

Fail if width or height participates in the source-to-Sheet animation. Post-entry `.nb-sheet-h` behavior remains permitted after entrance completion.

### 15.6 Cascade timing

Read active `.nb-notch-cascade` group timing and assert:

```text
max(delay + duration) <= primary morph duration
```

### 15.7 Partial reversal

Pause/scrub entry around the middle, trigger Escape, and prove the closing animation begins from the current rendered state rather than first becoming fully open.

### 15.8 Reduced motion

With reduced motion:

- Composer is immediately visible and usable;
- no staged source-label stall remains;
- no notch travel runs;
- focus behavior remains correct.

Also rerun `tests/e2e/composer.spec.js` so Event/Action switching and dynamic Sheet sizing remain proven.

---

## 16. Visual QA matrix

Required native viewports:

```text
1280x900
1440x900
1024x768
390x844
390x601
```

At minimum inspect:

- one dark theme;
- one light theme;
- one high-chroma accent theme.

Flows:

```text
NEW -> Event
NEW -> immediately switch to Action
NEW -> More Options
NEW -> immediate close
NEW -> close mid-animation
NEW -> reopen quickly
mobile + ACTION -> Action
mobile + ACTION -> switch to Event
```

Look specifically for:

- source misalignment;
- circular/portal effect;
- text resampling;
- blur flicker;
- accent/background flash;
- form clipping;
- first-open stutter;
- close snap;
- stale hidden source button;
- focus loss;
- page scroll jump;
- keyboard-induced Sheet resize during entry.

Chrome visual validation is required before final commit/push.

---

## 17. Acceptance criteria

Anchored Notch Morph v2 is complete only when all are true:

1. `NEW` perceptually becomes the Composer.
2. Expansion remains visibly anchored to the source's correct edge/corner.
3. Frame-zero visible Sheet geometry matches the source control.
4. Sheet is laid out at true final size throughout entry.
5. Primary entry does not animate width or height.
6. Full Sheet is never scaled.
7. No animated blur is used.
8. Radius evolves from real trigger radius to 24px Sheet radius without a portal phase.
9. Source identity survives until destination identity exists.
10. Content does not arrive before the surface is established.
11. All content groups finish by the end of the main morph.
12. Event <-> Action switching still works.
13. More Options still works.
14. Dynamic Sheet height still works after entry.
15. Close during entry reverses without snapping.
16. Settled close folds toward source geometry.
17. Reduced motion is immediate and usable.
18. Desktop and mobile work through one general geometry algorithm.
19. Existing dialog accessibility remains intact.
20. No unrelated Sheet/modal behavior regresses.

---

## 18. Non-goals

Do not use this track to:

- redesign Composer fields;
- add a NEW submenu;
- add Event/Action/Note as a preflight menu;
- change calendar/task persistence;
- change save or recurrence semantics;
- fix the Week ribbon;
- alter navigation-shell motion;
- redesign inspector sheets;
- broadly refactor Planner;
- introduce a second modal framework.

---

## 19. Stop conditions

Stop and report evidence rather than forcing an implementation if:

1. width/height animation appears necessary;
2. full-Sheet scaling appears necessary;
3. the change requires a broad `Sheet.jsx` rewrite;
4. current in-flight reverse cannot be preserved;
5. Composer height measurement starts driving entry-frame layout;
6. one geometry algorithm cannot support both desktop and mobile;
7. More Options or Event/Action switching becomes clipped or unreachable;
8. reduced-motion correctness becomes timer-dependent;
9. an existing test must be weakened/deleted to pass;
10. unrelated navigation/ribbon work becomes necessary;
11. repeated visual testing shows the effect is attractive once but slower or irritating in ordinary planner use.

---

## 20. Verification sequence

Focused first:

```bash
node --test src/features/motion/fluidGeometry.test.js
npx playwright test tests/e2e/motion.spec.js
npx playwright test tests/e2e/composer.spec.js
```

Then full gates:

```bash
npm test
npm run build
npm run test:e2e
```

Then Chrome visual QA at the native viewport matrix above.

Before commit:

```bash
git diff --check
git status --short
```

Inspect and stage only explicit intended files. Never use `git add -A`, `git add .`, blanket reset, or clean.

Do not combine this work with the Week ribbon P1 commit.

---

## 21. Hardened implementation prompt for Codex / Luna

Copy/paste this into the implementation session:

```text
You are implementing Anchored Notch Morph v2 in Revenue-Architect/Calendar-master.

This is a surgical evolution of the EXISTING Sheet motion system, NOT a modal rewrite.

FIRST verify the repo, worktree, branch, HEAD, origin/main, and dirty state. Preserve every unrelated user-owned change. Never use git add -A, git add ., blanket reset, or clean.

Read before editing:
- DESIGN.md
- docs/spec/structure.md
- docs/plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md
- src/features/motion/Sheet.jsx
- src/features/motion/fluidGeometry.js
- src/features/motion/fluidTrigger.js
- src/features/motion/morphTiming.js
- src/features/motion/plannerStyles.js
- tests/e2e/motion.spec.js
- tests/e2e/composer.spec.js

Before writing code, report:
1. your reading of the current morph architecture;
2. the exact geometry change you intend;
3. the files you expect to touch;
4. the regression tests you will add.

PRODUCT INTENT

Desktop NEW and mobile + ACTION already morph into the actual Composer Sheet. That architecture is fundamentally correct.

The goal is to make the Sheet feel physically anchored to the source control.

Desktop NEW:
- should normally preserve a top/right anchor;
- should visually expand leftward + downward;
- must feel like NEW became the Composer.

Mobile + ACTION:
- must use its exact measured trigger geometry;
- must not use desktop hard-coded coordinates;
- anchor must be derived from trigger/panel geometry.

HARD CONSTRAINTS

DO NOT replace Sheet.
DO NOT create a second modal framework.
DO NOT copy a generic Transitions.dev expanding-menu implementation literally.
DO NOT animate primary Sheet width during entry.
DO NOT animate primary Sheet height during entry.
DO NOT scale the full Sheet.
DO NOT animate blur/filter.
DO NOT cross-fade the entire Composer as one block.
DO NOT add Framer Motion.
DO NOT put motion ownership in Planner.jsx or Composer.jsx.

The final Sheet must remain at true layout size throughout entry.

Primary entry may use:
- translate;
- asymmetric clip-path;
- clip/border radius;
- background/material handoff;
- limited source-identity opacity where needed.

Composer descendants continue to use staggered clip reveals. Do not scale or blur them.

PRESERVE

- fluidTrigger source measurement;
- actual source radius;
- Sheet focus trap;
- Escape close;
- focus restoration;
- backdrop behavior;
- page-scroll snapshot/lock;
- reduced motion;
- dynamic Sheet ResizeObserver height behavior AFTER entry;
- Event <-> Action switching;
- More Options expansion;
- recurring-item flows;
- settled reverse close;
- in-flight WAAPI reverse from the ACTUAL rendered frame;
- current material carry unless intentionally improved after geometry is correct.

GEOMETRY

Evolve fluidGeometry.js from symmetric insetX/insetY to asymmetric clipping.

A suitable conceptual result is:

{
  translateX,
  translateY,
  insetTop,
  insetRight,
  insetBottom,
  insetLeft,
  sourceRadius,
  targetRadius,
  anchorX,
  anchorY
}

Names may differ; capability may not.

At t=0, the visible clipped rectangle of the full-size Sheet must match the trigger's getBoundingClientRect() within normal subpixel tolerance.

Determine anchor from geometry, not source ID.

Reasonable starting rule:
- trigger center right of panel center => anchor right
- otherwise => anchor left
- trigger center above panel center => anchor top
- otherwise => anchor bottom

TEST FIRST

Before changing production behavior:
1. characterize current desktop NEW and mobile + ACTION visually;
2. add pure unit tests for anchored geometry;
3. ensure those tests import the production geometry helper rather than duplicating its logic.

Cover top-right, top-left, bottom-right, bottom-left, desktop NEW-like geometry, mobile + ACTION-like geometry, fractional rectangles, and unusual trigger sizes.

Then wire it into the EXISTING notch mode.

TIMING

Do not retime until geometry works.

After geometry is correct, prototype approximately:
- 380ms open
- 240ms close

All Composer group arrivals must finish <= main morph duration.

Do not introduce elastic overshoot outside the source/final bounds.

RADIUS

Start from actual trigger radius.
End at 24px Sheet radius.
Do not linearly preserve 999px for most of the run.
Avoid the circular portal phase.

SOURCE IDENTITY

There must never be a visible frame where both source identity and destination identity are absent.
Do not keep NEW floating over a mostly finished Composer either.
Refine source identity only after anchored geometry works.

REVERSE

Mandatory:
- close at 25%, 50%, and 75% entry progress must not snap;
- read actual rendered transform + clip;
- cancel current entry;
- reverse from exactly what is on screen;
- stale entry completion must not win later.

E2E REQUIREMENTS

Extend tests/e2e/motion.spec.js to prove:
1. desktop NEW initial visible Sheet bounds match the button;
2. desktop expansion is top/right anchored rather than symmetric center growth;
3. mobile + ACTION uses its own measured origin;
4. main Sheet entry has no scale();
5. main Sheet entry has no animated filter/blur;
6. main Sheet entry does not animate width/height;
7. content group arrivals all complete <= morph duration;
8. partial-entry Escape reverses from current rendered state;
9. reduced motion is immediate and usable.

Run tests/e2e/composer.spec.js to prove Event/Action switching and dynamic Sheet sizing still work.

VISUAL QA

Native viewport checks:
- 1280x900
- 1440x900
- 1024x768
- 390x844
- 390x601

Flows:
- NEW -> Event
- NEW -> immediate Action switch
- NEW -> More Options
- immediate close
- close mid-animation
- reopen quickly
- mobile + ACTION
- mobile switch to Event

Look for:
- portal/circle effect;
- text resampling;
- blur flicker;
- background flash;
- clipping;
- scroll jump;
- first-open stutter;
- close snap;
- stale hidden source button;
- focus loss.

STOP AND REPORT rather than forcing a solution if:
- width/height animation seems necessary;
- full Sheet scaling seems necessary;
- in-flight reverse breaks;
- a general geometry algorithm cannot serve desktop and mobile;
- Composer resizing becomes unstable;
- tests need to be weakened;
- unrelated navigation/ribbon changes appear necessary;
- repeated use makes the motion feel slower or more annoying than the current interaction.

EXPECTED PRIMARY FILES

- src/features/motion/fluidGeometry.js
- src/features/motion/fluidGeometry.test.js
- src/features/motion/Sheet.jsx
- src/features/motion/morphTiming.js
- src/features/motion/plannerStyles.js
- tests/e2e/motion.spec.js

Potentially fluidTrigger.js only if truly required.
Planner.jsx should require little or no change.

FINAL VALIDATION

Run:
- focused geometry unit tests;
- tests/e2e/motion.spec.js;
- tests/e2e/composer.spec.js;
- npm test;
- npm run build;
- npm run test:e2e.

Then perform Chrome visual validation.
Inspect git diff and git status.
Stage explicit files only.
Commit/push only if all relevant checks pass and no unrelated dirty work is included.
```

---

## 22. Track separation

Recommended sequence:

```text
Track A — Plan #003 Week ribbon correctness
reproduce -> diagnose -> regression -> fix -> validate -> commit

Track B — Plan #004 Anchored Notch Morph v2
baseline -> geometry tests -> anchored implementation -> retime -> identity refinement -> reverse QA -> full validation -> commit
```

If Track A is still under active diagnosis, do not let Track B alter its browser evidence, test files, or commit surface.
