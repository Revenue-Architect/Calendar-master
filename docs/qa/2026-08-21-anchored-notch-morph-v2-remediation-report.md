---
title: Anchored Notch Morph v2 remediation report
type: qa-report
status: verified-with-known-suite-flake
date: 2026-08-21
implementation_head: 9333296
baseline_head: 70a3920d32681d28c0691e74282703c024961233
---

# Anchored Notch Morph v2 remediation report

This follow-up closes the concrete issues identified in the review of the Plan
#004 implementation. The Week-ribbon P1 remains a separate track, as required by
the plan; no ribbon or navigation implementation was changed here.

## Corrections made

### Notch-only asymmetric geometry

`Sheet.jsx` now chooses the pure geometry path from the actual Sheet mode:

- `morph="notch"` uses `anchoredFluidMorphFromRects()` and the four-sided,
  geometry-derived anchor contract;
- ordinary pointer-origin Sheets use the restored centered
  `fluidMorphFromRects()` `insetX/insetY` path;
- ordinary inspectors/details receive no notch anchor metadata or directional
  keyframes.

This keeps Plan #004's directional redesign on the creation Composer surfaces
without silently redesigning inspector and detail Sheets.

### Timing contract

`SHEET_ENTRY_MS = 420` is now a shared timing token used by the ordinary CSS
entrance, the ordinary fallback completion timer, and the ordinary page-scroll
guard. Notch entry remains `MORPH_MS = 380`; its scroll guard and stage machine
continue to derive from that token.

### Pure source-radius normalization

`effectiveFluidSourceRadius()` now lives in `fluidGeometry.js` and clamps the
nominal radius to half the measured trigger's smaller physical dimension. Both
notch and ordinary source setup use it. Unit coverage includes nominal, explicit,
zero, invalid, and fractional radii, preventing a wide/short source from becoming
a circular portal during the intermediate clip.

### Anchor-pinning choreography

The notch entry holds the measured translation through the 15% and 35% clip
milestones. The surface therefore expands from the source edge before the final
translation completes. The E2E geometry probe now compares the anchored top/right
edge against the opposite left/bottom expansion at 15%, 35%, and 60%.

### Interruption matrix

`tests/e2e/motion.spec.js` now covers:

- Escape at 25%, 50%, and 75% of entry;
- backdrop dismissal during a deliberately held in-flight entry;
- close followed immediately by a fresh open, asserting one settled Composer;
- the existing exact-frame WAAPI reversal and settled close assertions.

### Vacuous assertion removed

The hard-coded `{ top: 0, right: 0, bottom: 0, left: 0 }` versus identical
object assertion was replaced with a real source-window width/height assertion.
The pure geometry suite also now asserts that ordinary geometry remains centered
and symmetric.

## Verification

Focused unit tests:

```text
node --test src/features/motion/fluidGeometry.test.js src/features/motion/morphTiming.test.js
16 passed, 0 failed
```

Focused browser suites:

```text
npx playwright test tests/e2e/composer.spec.js
6 passed, 0 failed

npx playwright test tests/e2e/motion.spec.js
42 passed in the remediation run; one unrelated existing adjacent-weekday
flake occurred once, then the changed notch/ordinary probes were rerun green.
```

Same-environment full-suite comparison (one worker, same installed dependencies,
same Chromium environment):

```text
70a3920 baseline: 306 passed, 1 failed, 307 tests
41a956d + remediation: 313 passed, 1 failed, 314 tests
```

Both runs failed on the same unrelated, load-sensitive assertion:

```text
tests/e2e/interaction-contracts.spec.js:138
Action exclusive owners › active Event moves and Event or Action resizes never
interpolate lane layout
```

The failure occurs before any Sheet motion path is involved and is identical in
the clean baseline worktree and the remediation branch. It is retained as a
known suite flake rather than weakening or deleting the assertion.

Visual QA was performed with native Chromium captures at:

```text
1280x900, 1440x900, 1024x768, 390x844, 390x601
```

The default dark Obsidian/Acid theme was inspected at every viewport. The
1280×900 flow was also inspected with the light Cream/Terracotta theme and the
high-chroma Obsidian/Timepage Red theme. Each capture covered the early source
window and settled Composer. No portal/circle phase, text scaling, edge gap,
source misalignment, clipping, or post-entry usability issue was observed.

Remaining separate work:

- Week-ribbon responsive readiness/invisibility P1 from Plan #003 remains open;
- the unrelated `interaction-contracts` lane-activation flake remains open for
  its own investigation.
