# Anchored Notch Morph v2 — Implementation Report

**Date:** 2026-08-21  
**Repository:** Revenue-Architect/Calendar-master  
**Branch:** `main`  
**Initial implementation commit:** [`e44b058`](https://github.com/Revenue-Architect/Calendar-master/commit/e44b058388851e6e8c89b8b817811cafcbf55519)
**Remote state at initial report:** `origin/main` was at the same commit.

> **Superseded:** the review remediation is now in [`9333296`](https://github.com/Revenue-Architect/Calendar-master/commit/9333296) and the evidence/corrections are recorded in the [remediation report](./2026-08-21-anchored-notch-morph-v2-remediation-report.md). Read that report for the current sign-off status; this document describes the initial implementation only.

## Executive summary

The initial implementation in `docs/plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md` was pushed to `main`. A subsequent review identified scope and verification gaps; those are corrected in the remediation report linked above.

The existing Sheet architecture was retained: the Sheet is measured and laid out at its final size, then revealed with a translated four-sided `clip-path`. The implementation now derives the source anchor from the measured trigger and panel geometry, supports all four anchor quadrants, preserves source identity during the handoff, and reverses from the actual rendered frame when dismissed in flight.

The visual pass found and corrected one issue that the first automated geometry assertions did not expose: a nominal `999px` pill radius became a circular portal as the clip window passed through a near-square intermediate size. The source radius is now bounded by the effective source-box radius, eliminating that portal phase while preserving the planned transition to the 24px Sheet radius.

`Planner.jsx` was not changed. The composition root remains responsible for orchestration; the motion behavior remains in the existing motion modules.

## Authority and constraints followed

The implementation was checked against and kept subordinate to:

- [`docs/plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md`](../plans/2026-08-20-004-feat-anchored-notch-morph-v2-plan.md)
- [`DESIGN.md`](../../DESIGN.md)
- [`docs/spec/structure.md`](../spec/structure.md)
- the existing `fluidTrigger`, `Sheet`, timing, CSS, accessibility, and navigation-motion architecture

The following explicit non-goals were preserved:

- no width/height animation for the source-to-Sheet reveal;
- no full-Sheet `scale()` animation;
- no animated blur or changing backdrop-filter radius;
- no second modal/dialog framework;
- no literal copy of Transitions.dev CSS;
- no duplicate desktop/mobile motion paths;
- no change to Event ↔ Action switching or More Options behavior.

## Repository and worktree verification

At the start, local `main` was verified at the pre-plan baseline `6896377`. After fetching, `origin/main` contained the requested plan in `70a3920`; local `main` was advanced with a fast-forward-only merge. No dirty user work was overwritten.

The pre-existing user-owned worktree changes were recorded and preserved throughout. They remain outside the implementation commits:

```text
M  docs/plans/2026-08-18-001-refactor-planner-ui-extraction-plan.md
M  docs/plans/2026-08-20-001-feat-hybrid-sync-and-cross-pane-drag-plan.md
M  docs/plans/2026-08-20-002-feat-apple-design-micro-interactions-plan.md
M  docs/plans/HANDOFF.md
M  tests/e2e/planning.spec.js
?? docs/qa/2026-08-19-navigation-loaf-profile.md
?? screenshots/
?? scripts/profile-navigation-loaf.mjs
```

The initial branch check confirmed:

```text
HEAD        e44b058388851e6e8c89b8b817811cafcbf55519
origin/main e44b058388851e6e8c89b8b817811cafcbf55519
```

## Implementation details

### 1. Anchored geometry

[`src/features/motion/fluidGeometry.js`](../../src/features/motion/fluidGeometry.js) now contains the production `anchoredFluidMorphFromRects()` calculation.

The helper:

1. reads the trigger and final panel rectangles;
2. compares their centers to derive `anchorX` (`left`/`right`) and `anchorY` (`top`/`bottom`);
3. aligns the selected source edge with the corresponding final panel edge;
4. computes independent `insetTop`, `insetRight`, `insetBottom`, and `insetLeft` values;
5. clamps oversized-source insets at zero;
6. returns source and target radii plus the translation and anchor metadata.

For example, a desktop `NEW` trigger above and to the right of the panel returns `right/top`, translates the true-size panel to the trigger's right/top relationship, and opens the clip primarily leftward and downward. A mobile `+ ACTION` trigger near the lower-right edge derives `right/bottom` from the same algorithm; there is no source-ID special case.

The old `fluidMorphFromRects()` export remains the centered compatibility path for ordinary trigger-origin Sheets; only notch Composer surfaces use the asymmetric helper.

### 2. True-size Sheet wiring

[`src/features/motion/Sheet.jsx`](../../src/features/motion/Sheet.jsx) now uses the anchored helper for notch Composer morphs while preserving the centered ordinary trigger path.

The layout effect continues to suppress the entry animation for one measurement so the panel rectangle is the final, untransformed size. It then writes:

```text
--fluid-x
--fluid-y
--fluid-inset-top
--fluid-inset-right
--fluid-inset-bottom
--fluid-inset-left
--fluid-source-width
--fluid-source-height
--fluid-radius
--fluid-target-radius
```

The source width/height variables are static geometry used to position the decorative source label inside the measured source window. They are not animated layout dimensions.

The source radius is normalized to the effective radius the trigger can actually render:

```text
min(measured trigger radius, min(trigger width, trigger height) / 2)
```

This keeps a square trigger square, keeps a pill a pill, and prevents an unbounded `999px` token from becoming an intermediate circular portal. A real `0px` radius remains zero; it is no longer treated as a missing radius.

The existing close path remains intact:

- entry animation state is inspected for in-flight reversal;
- the rendered transform and clip are frozen before the CSS animation is removed;
- WAAPI reverses from that exact rendered frame toward the source geometry;
- settled sheets use the existing close animation;
- close timing and unmount behavior remain bounded.

ResizeObserver sizing, viewport capping, keyboard behavior, scroll snapshots, focus trapping, Escape handling, opener restoration, backdrop protection, and reduced-motion handling were not replaced or bypassed.

### 3. CSS motion choreography

[`src/features/motion/plannerStyles.js`](../../src/features/motion/plannerStyles.js) now applies the four asymmetric insets to the existing keyframes:

- `nbfluidorigin` / `nbfluidoriginout` for regular trigger-origin Sheets;
- `nbnotchin` / the existing close path for Composer notch morphs.

The entry progression is intentionally staged:

```text
0%       source clip and source radius
15%      source radius retained while the shape is still identifiable
35%      panel radius established
100%     full true-size Sheet, 24px target radius
```

The full Sheet never scales. Its contents are laid out once at true size and are revealed by the clip. The source label is `pointer-events:none` and decorative; it occupies the measured source window and hands off as the Composer cascade arrives. The existing staggered `.nb-notch-cascade` groups remain the destination-content choreography.

The scrim blur remains a fixed paint value. No primary Sheet keyframe introduces `width`, `height`, `scale`, or `filter` animation.

### 4. Timing

[`src/features/motion/morphTiming.js`](../../src/features/motion/morphTiming.js) retimes the notch entry to `380ms`, with the existing fractional stage handoffs preserved. Ordinary Sheets use a shared `420ms` entry token, and each path's scroll guard now matches its actual entrance duration.

### 5. Test coverage added or updated

[`src/features/motion/fluidGeometry.test.js`](../../src/features/motion/fluidGeometry.test.js) covers:

- top-right, top-left, bottom-right, and bottom-left anchors;
- source narrower than the panel;
- source wider than the panel;
- unusual source heights;
- subpixel rectangles;
- nonnegative inset clamping;
- absence of scale-related geometry output.

[`tests/e2e/motion.spec.js`](../../tests/e2e/motion.spec.js) now verifies:

- desktop `NEW` starts at measured top/right bounds and expands left/down;
- mobile `+ ACTION` derives the bottom/right anchor from its measured rectangle;
- source identity occupies the measured source window at frame zero;
- source identity remains present through the handoff until destination content starts;
- the early radius stays bounded and does not become a portal;
- content remains true-size and the panel carries no scale;
- reduced motion, staged content, stalled clocks, in-flight reversal, and close behavior remain intact.

## Milestone commits

Every implementation milestone was committed and pushed directly to `main`:

| Commit | Milestone |
| --- | --- |
| `8217a15` | Add pure anchored fluid geometry and quadrant coverage. |
| `80895cd` | Wire asymmetric geometry into the existing Sheet/notch reveal and update E2E geometry assertions. |
| `592b141` | Retime the morph to the planned 380ms entry and shared timing constant. |
| `3f1d833` | Preserve measured source identity through the Composer handoff. |
| `e44b058` | Bound effective source radius and add the no-portal regression assertion. |

## Root cause found during visual QA

The first implementation passed frame-zero geometry checks but failed a visual requirement from the plan. At roughly 10–15% of the entry, the trigger's nominal `999px` radius was still applied while the asymmetric clip had expanded into a nearly square window. CSS radius normalization made that window look like a large circular lime portal floating above the planner.

The issue was not a panel scale, a blur, or a wrong translation. It was the mismatch between:

- the nominal CSS radius token (`999px`), and
- the trigger's effective rendered radius bounded by its own dimensions.

The fix carries the effective bounded radius into the clip. A square `NEW` source now remains rectangular during the early expansion; a genuinely rounded source retains its actual corner character; both transition to the 24px Sheet radius at the planned handoff.

## Validation results

### Focused unit tests

```text
node --test src/features/motion/fluidGeometry.test.js src/features/motion/morphTiming.test.js
14 passed, 0 failed
```

### Focused Playwright suites

```text
npx playwright test tests/e2e/motion.spec.js
39 passed, 0 failed

npx playwright test tests/e2e/composer.spec.js
6 passed, 0 failed
```

### Repository gates

```text
npm test
628 passed, 0 failed

npm run build
passed
```

The build emitted the existing Vite advisory that the main JavaScript chunk is larger than 500 kB. It did not fail the build.

The complete Playwright run finished with:

```text
307 passed
2 failed
```

The two failures are the same unrelated Week timeline-chrome failures already present in the branch's baseline behavior:

- mobile Week view: `timeline-chrome-scroll.spec.js` — “scrolling away from midnight must collapse the chrome”;
- desktop Week view: `timeline-chrome-scroll.spec.js` — the same assertion.

Both fail at the existing collapse assertion with `Expected: true` and `Received: false`. No navigation or timeline files were changed by this implementation, and all 39 motion tests passed inside the full run.

## Visual validation

### Desktop

A full-size 1280×900 capture pass inspected the planner at base, early morph, mid morph, and settled states. The settled Sheet measured approximately `448×505` at `x=416`, `y=197.5`, with `right/top` anchoring. The frame-zero visible bounds matched the measured `NEW` trigger; the early scrubbed frame showed a bounded source-shaped rectangle rather than the former circular portal; the settled Composer was centered and fully usable.

### Mobile 390×844

Chrome validation opened `+ ACTION`, observed the `right/bottom` anchor, waited for the Composer handoff, and closed it again. The settled Sheet was full-width with no edge gap, the Composer remained inside the viewport, and the close returned to the timeline without leaving a stale source surface.

### Mobile 390×601

Chrome validation repeated the flow at the short viewport. The bottom Sheet stayed within the viewport, did not introduce horizontal overflow, and settled without a blank or clipped Composer. The source label and destination form remained part of one continuous surface.

## Final conformance statement

The implementation keeps the authoritative motion architecture intact and fulfills the plan's core contract:

- one general geometry algorithm for desktop and mobile;
- true-size Sheet plus asymmetric clip reveal;
- measured source identity and source radius;
- no portal phase after visual correction;
- in-flight reversal from the rendered frame;
- ResizeObserver sizing after entry;
- reduced-motion and dialog accessibility behavior retained;
- Event ↔ Action and More Options flows retained;
- unrelated user work preserved.

The initial implementation is superseded by the pushed remediation at `9333296`; the current branch and QA evidence are tracked in the remediation report.
