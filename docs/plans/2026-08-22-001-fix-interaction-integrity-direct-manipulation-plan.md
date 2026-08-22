# Interaction Integrity: Direct Timeline Manipulation

Status: implementation complete on `fix/timeline-direct-drag-resize`; PR pending

## Objective

Restore natural Event and scheduled Action manipulation without changing the
Timeline's domain arithmetic, persistence contract, motion system, navigation,
Timeline chrome, recurrence semantics, or touch scrolling safety.

The product contract is modality-specific:

- Mouse and pen use direct manipulation. A small movement activates move/resize
  immediately; a stationary release remains a click candidate.
- Touch keeps the existing hold-to-lift protection on card bodies so vertical
  movement can remain a Timeline scroll. Explicit Action estimate controls keep
  their deliberate vertical resize path.
- Once a gesture activates, one owner controls it through finish or cancel.
- Cancellation restores the original record and leaves the next gesture usable.

## Baseline and history repair

`origin/main` at start was `927ffe7414fc2a00a68bb579ea8ea98154f1e41e`.
PR #7 was merged at `f644fbc`; the two commits after that merge were:

1. `424a585 Reverting back due to many regressions`
2. `927ffe7 Too many regressions`

The corrective branch first reverted those two commits explicitly:

- `0beae92 Revert "Too many regressions"`
- `3086254 Revert "Reverting back due to many regressions"`

The resulting source baseline is byte-equivalent to the PR #7 merge before the
new interaction changes. `main` was not rewritten or modified.

## Root causes proven

1. Day Event and scheduled Action body handlers armed only a `LIFT_MS` timer.
   Immediate mouse movement cancelled the arm and never started a gesture.
2. Week Event used the same hold-only desktop path. A direct Week drag therefore
   failed until a hold was inserted.
3. The first Action resize regression attempt measured a handle that was outside
   the visible scroll surface. Bringing the chip into view made the existing
   movement-armed resize path pass; no new resize arithmetic was needed.
4. A lifted Week card is rendered in the destination column. The original touch
   button can unmount before `touchend`, so Week required a stable surface-level
   touch finalizer to commit or cancel the active owner.
5. `canvasUp` contained an undefined `ev.id` reference in the unchanged-draft
   branch. A deliberate browser sabotage reproduced `ev is not defined`; the
   correct empty-canvas behavior is to abort the unchanged draft, not inspect a
   nonexistent Event.

## Implementation

### Shared gesture arithmetic

`timelineGesture.js` now exposes the pure
`movedEnoughToActivateDirectDrag()` helper and
`DIRECT_DRAG_ACTIVATION_PX = 3`. It uses one Euclidean-distance contract for
Events, Actions, and Week Events, while retaining `HOLD_CANCEL_PX = 8` for
touch/hold cancellation. Unit coverage includes zero movement, sub-threshold
movement, the threshold boundary, diagonal movement, and invalid input.

### Day Event and scheduled Action

`Planner.jsx` keeps the existing refs-based owner/state machine. Card presses
remain armed candidates, but the window pointer-move path now activates a
mouse/pen move once the shared threshold is crossed. The activation callback:

1. disarms the hold;
2. marks the press as a gesture rather than a click;
3. starts the existing move payload;
4. applies the current pointer coordinates in the same frame.

The original press point remains the grab anchor, so the first active frame does
not jump under the pointer. Timer-based activation remains available for the
existing touch/hold-compatible path, and resize continues to use the existing
movement-armed edge architecture.

### Week Event

`WeekGrid.jsx` now follows the same desktop activation contract while retaining
its touch hold/scroll split. The original grab offset is preserved when direct
activation occurs, and the current pointer position is applied immediately.
When a lifted card changes columns, stable `.nb-s` capture handlers and window
touch listeners finish/cancel the active gesture even if the original button is
unmounted during the move.

### Cancellation and empty canvas

The existing owner cancellation path remains authoritative. Browser coverage
now verifies Event and Action records stay unchanged after `pointercancel` and
that the next direct drag succeeds. Unchanged canvas drafts abort cleanly and no
longer dereference an out-of-scope Event.

### Test semantics

`directMouseDrag()` is a no-wait helper for ordinary desktop manipulation.
`pressHoldAndDrag()` remains available only for intentional long-press
scenarios. Desktop Day, Week, recurring occurrence, and Action tests no longer
hide activation behind 300–600ms waits. Real CDP touch input covers scroll vs
move, held Event/Action moves, Event edge resize, Action estimate resize, Week
scroll vs move, and Week held move.

## Scope guardrails

No motion, Composer, navigation, ribbon, Timeline chrome, persistence schema,
calendar/task domain API, theme, or recurrence implementation was changed.
Existing snapping, minimum durations, lane packing, JOIN ownership, Action
completion, and recurrence exception behavior remain the source of truth.

## Verification gates

Required gates for this branch:

- `node --test src/features/planner/timelineGesture.test.js`
- `node --test src/features/planner/timelineInteractionState.test.js`
- focused gesture suites, each single-worker
- immediate desktop move/resize matrix three consecutive times
- `npm test`
- `npm run build`
- full Playwright suite, with any residual failures compared against the exact
  base under the same browser/session before classification
- Chrome visual checks at 1280×900, 390×844, and 390×601, including Timeline,
  Week, Actions, Composer, and mobile navigation/bar transitions

## Follow-up (out of scope)

Empty-space desktop drag-to-create remains a separate product decision. The
existing desktop click/hold creation behavior is preserved until a dedicated
creation PR can define preview sizing and cancellation semantics without mixing
them into object manipulation.
