# Interaction Integrity: direct Timeline manipulation

Date: 2026-08-22  
Branch: `fix/timeline-direct-drag-resize`  
Origin baseline: `927ffe7414fc2a00a68bb579ea8ea98154f1e41e`  
PR #7 merge baseline: `f644fbc`  
Starting branch head: `927ffe7414fc2a00a68bb579ea8ea98154f1e41e`  
Implementation commit: `fb59f71`  
Plan commit: `e01c375`  
QA artifact commit: `26c2e8e`  
Final delivery tip: the branch tip shown on [PR #8](https://github.com/Revenue-Architect/Calendar-master/pull/8)

## Executive result

The two commits after PR #7 were explicitly reversed before implementation:

- `0beae92` — revert `927ffe7 Too many regressions`
- `3086254` — revert `424a585 Reverting back due to many regressions`

The corrective work restores direct mouse/pen manipulation for Day Events,
scheduled Actions, and Week Events while preserving the existing touch
scroll-versus-lift arbitration, resize arithmetic, persistence, recurrence,
JOIN, Action completion, Timeline chrome, navigation, ribbon, and motion
systems.

The implementation is intentionally not declared fully green: the isolated
full Playwright run finished with **337 passed and 2 failed**. The two failures
are the existing Week timeline-chrome scroll cases. The exact PR #7 merge
baseline reproduced the same physical-scroll failure (`scrollTop` remained
`0`) under the same Chromium/worker setup, so that separate timeline-chrome
determinism issue is not attributed to this branch.

## Files changed

Production:

- `src/Planner.jsx`
- `src/features/planner/WeekGrid.jsx`
- `src/features/planner/timelineGesture.js`

Unit tests:

- `src/features/planner/timelineGesture.test.js`

Browser tests/helpers:

- `tests/e2e/timeline-gestures.spec.js`
- `tests/e2e/actions.spec.js`
- `tests/e2e/week-drag.spec.js`
- `tests/e2e/recurring.spec.js`
- `tests/e2e/helpers.js`

Documentation:

- `docs/plans/2026-08-22-001-fix-interaction-integrity-direct-manipulation-plan.md`
- this report

No files under `src/features/motion`, Composer, navigation, ribbon, Timeline
chrome, persistence, themes, calendar/task domain APIs, or recurrence
implementation were changed.

## RED evidence and proven causes

The new regressions were run before the corresponding fixes.

1. Day Event immediate mouse movement did not start a move. The old handler
   only matured after `LIFT_MS`; immediate movement cancelled the candidate.
2. Scheduled Action immediate mouse movement had the same hold-only failure.
3. Week Event immediate desktop movement failed for the same reason. The old
   Week test encoded that obsolete contract as “a press without a hold does not
   move anything.”
4. Action resize initially failed because the newly added browser scenario
   measured a resize affordance outside the visible scroll surface. Scrolling
   the chip into view made the existing movement-armed resize path pass; no
   new resize arithmetic was necessary.
5. A deliberate temporary sabotage of the empty-canvas release branch restored
   `setInspect({ kind: "event", id: ev.id })`. The browser reproduced
   `ev is not defined`, proving the branch needed cancellation rather than an
   arbitrary Event identifier.
6. The first Week held-touch move characterization failed after the lifted
   card changed columns and its original button unmounted. This proved that
   finalization had to be owned by a stable Week surface/window listener.

Negative controls were restored and were not committed:

- disabling the desktop direct activation made the immediate Day/Action/Week
  movement tests fail;
- removing the real Action resize movement made its stored-estimate assertion
  fail;
- removing the Week stable touch finalizer left the held touch move unsettled;
- restoring the undefined canvas reference produced a page error.

## Implementation

`timelineGesture.js` now owns one pure
`movedEnoughToActivateDirectDrag()` contract with
`DIRECT_DRAG_ACTIVATION_PX = 3`. Unit coverage checks zero movement, 2px
sub-threshold movement, the exact boundary, diagonal movement, and invalid
input. The existing `HOLD_CANCEL_PX = 8` remains separate for touch/hold
arbitration.

`Planner.jsx` and `WeekGrid.jsx` retain their existing refs-based interaction
owner/state machine. A desktop card press remains a click candidate until the
shared distance threshold is crossed. At that point the code disarms the hold,
starts the existing move payload, preserves the original grab offset, and
applies the current pointer coordinates in the activation frame. A stationary
release remains an inspector click. Resize continues using the existing
movement-armed edge/estimate paths.

Week touch ownership now has stable surface finalization plus bounded window
listeners so a lifted card can move between columns without losing its
`touchend`/`touchcancel` commit path.

`directMouseDrag()` was added as an explicit no-wait browser helper. The
existing `pressHoldAndDrag()` remains for intentional long-press scenarios and
is no longer used to hide desktop Event/Action/Week activation requirements.

## Behavior results

### Day Event

- immediate mouse move persists the new start and preserves duration;
- bottom resize preserves start and changes end/duration;
- top resize changes start and preserves the exact end;
- 1–2px tremor remains a click and opens the inspector;
- completed drag does not open a post-drop inspector;
- pointer cancellation leaves the record unchanged.

### Day scheduled Action

- immediate mouse move persists `planned.startMinute` and preserves date and
  estimate;
- estimated Action resize changes only `planned.estimateMinutes`;
- no-estimate Actions retain move-only behavior;
- Action completion remains owned by its explicit completion affordance;
- cancellation leaves the plan unchanged and the next drag succeeds.

### Week Event

- immediate desktop move changes day/time and preserves duration;
- tap without meaningful movement still opens the Event inspector;
- touch movement before lift scrolls the Week surface without rescheduling;
- held touch movement persists a Week Event move after lift;
- existing cross-day and recurring occurrence paths remain green.

### Touch and ownership

Real CDP touch input was used for the new browser cases, not only synthetic DOM
events. Covered behavior includes:

- Event and Action vertical movement before lift scrolls without mutation or
  inspector opening;
- held Event and Action body movement persists a move;
- held Event edge movement resizes without moving start;
- held Action estimate movement resizes without moving start;
- Week Event scroll-vs-lift arbitration;
- Action completion swipe isolation;
- pointer cancellation and next-interaction recovery.

## Verification

| Gate | Result |
| --- | --- |
| `node --test src/features/planner/timelineGesture.test.js` | **22 passed, 0 failed** |
| `node --test src/features/planner/timelineInteractionState.test.js` | **20 passed, 0 failed** |
| combined focused interaction matrix | **78 passed, 0 failed** |
| immediate move/resize matrix, run 1 | **5 passed, 0 failed** |
| immediate move/resize matrix, run 2 | **5 passed, 0 failed** |
| immediate move/resize matrix, run 3 | **5 passed, 0 failed** |
| `npm test` | **635 passed, 0 failed** |
| `npm run build` | **passed**; Vite completed with existing chunk-size warnings |
| full Playwright, isolated port, `--workers=1` | **337 passed, 2 failed** |

The full-run failures were only:

- phone Week timeline-chrome physical-scroll poll;
- desktop Week timeline-chrome physical-scroll poll.

The same test was run against the exact PR #7 merge base `f644fbc` with the
same Chromium/worker shape. Both Week variants reproduced `scrollTop = 0`
there as well. The older pre-PR7 `927ffe7` test showed the prior lower-bound
collapse failures. This branch does not modify Timeline chrome, so the issue
remains a separate follow-up rather than being hidden as “green.”

## Manual Chrome validation

Production behavior was inspected in Windows Chrome against the isolated
preview at native browser zoom.

### Desktop 1280×900

- Day timeline opened with ribbon, header, cards, now marker, and Actions pane
  readable and aligned.
- NEW Composer opened as the expected centered true-size sheet with intact
  scrim and controls.
- Event/Action surfaces remained usable after the direct-manipulation changes.

### Mobile 390×844

- Day Timeline, header/ribbon, cards, and Actions footer remained visible.
- Week view remained readable without a blank or white surface.
- Actions view remained full-screen and legible.
- Opening the mobile navigation produced a full-bleed drawer. The bright red
  vertical calendar return bar covered the right edge with no black gap; a
  real click on the bar closed the drawer cleanly.

### Mobile 390×601

- Short viewport kept Timeline and Week controls readable.
- No blank reload surface, clipped drawer, stale Composer, or interaction dead
  zone was observed.

These checks were performed live in Chrome after the implementation test pass;
the generated local screenshots directory remains untracked user work and was
not staged.

## Product Design follow-ups

1. Land the separate timeline-chrome determinism correction so the full suite
   no longer depends on the planner's current-hour auto-scroll position.
2. Run one physical Android Chrome and one iOS Safari pass for touch ownership;
   CDP Chromium evidence does not replace device/browser arbitration testing.
3. Define desktop empty-space drag-to-create as a separate Phase 2 contract;
   this remediation intentionally preserves existing creation semantics.
4. Migrate the remaining gesture-isolation cases that rely on synthetic touch
   events to real CDP/device-level input where browser arbitration is the
   behavior under test.

## Delivery status

The branch is pushed as a separate corrective PR and is not merged. The only
known residual failures are the two exact-base-reproduced Week
timeline-chrome-scroll cases described above.
