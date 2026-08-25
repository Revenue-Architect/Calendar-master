# Claude `feat/sheet-presentation-physicality` Source Audit

**Date:** 2026-08-25  
**Purpose:** Record what was actually found on Claude's remote branch and how it affects the canonical Physical Planner plan.

## Remote state

At audit time:

- current `main`: `a8cf905b878e913256dc3e3518d133c2583cb443`
- branch: `feat/sheet-presentation-physicality`
- branch relation: 2 commits ahead, 0 behind
- changed files: planning/session artifacts plus four capture scripts
- product source changes on branch: none

## Claude artifacts

- `docs/plans/2026-08-24-003-feat-sheet-presentation-physicality-plan.md` — 387 lines
- `docs/plans/2026-08-24-003-feat-sheet-presentation-physicality-session-log.md` — 7,840 lines
- `docs/plans/2026-08-24-003-feat-sheet-presentation-physicality-session-raw.jsonl` — raw session
- capture scripts under `scripts/`

## Earlier product direction

Claude's plan used two presentation rules:

1. create controls morph into Composer;
2. Event/Action editing uses a half-sheet beside the record.

It also proposed half-sheet geometry for Settings/palette and source-less creation.

This is **not** the final product direction. The later approved visual reference requires Event/Action object morphing and
timeline-space creation morphing.

## High-value findings retained

1. narrow viewport needs one bottom-edge owner;
2. current Sheet responsibilities are broader than animation;
3. fixed descendants under transformed nav carrier require explicit coordinate-space handling;
4. large surfaces should remain true-size and not scale live form contents;
5. frame-zero visible geometry should match source;
6. source radius and asymmetric anchoring matter;
7. source/destination identity may not have a hole;
8. interrupted open must reverse from actual rendered frame;
9. content must finish within shell timing;
10. current legacy Sheet performance warrants remeasurement;
11. performance gates need a negative control;
12. mobile visualViewport/keyboard behavior is a blast-radius item;
13. multi-viewport/theme visual QA is mandatory.

## Claims rechecked against current source

### Already present now

`src/features/motion/fluidGeometry.js` already includes:

- `effectiveFluidSourceRadius`
- `anchoredFluidMorphFromRects`
- asymmetric insets
- geometry-derived anchor selection

`tests/e2e/motion.spec.js` already includes:

- stalled morph/stage regressions
- interrupted reverse
- 25/50/75% Escape reversals
- backdrop reversal
- quick close/reopen

`src/architecture.test.js` currently has:

`PLANNER_CEILING = 5531`

### Important current coupling

Current legacy Composer handoff tests intentionally inspect/expect a transient blur. The Physical Planner target does not
need animated blur for large object continuity, so those tests must be migrated deliberately rather than blindly preserved.

## Final authority

`docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`

If any old Claude requirement conflicts with that reference's interaction outcome, the visual reference wins.
