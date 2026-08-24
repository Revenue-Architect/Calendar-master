# Restore Proven Timeline Card Interaction Ownership

**Base:** `a3acd50c7e6ab6fba472fe98fd837882d5332b69`

**Historical reference:** `3086254454719992fd9d04e5ed8ef4fb86120536`
(tree-equivalent to the PR #7 merge at `f644fbc6921ef6ed645623fffb82d2a4c3979c47`)

## Objective

Restore the last coherent Event and scheduled Action hit-area grammar without
reverting newer desktop direct-drag, active-touch scroll locking, cancellation,
recurrence, persistence, ribbon, navigation, or motion fixes.

## Confirmed regression

The historical Timeline divided a card by role:

- Event top edge: resize start;
- Event bottom edge: resize end;
- remaining Event body: move after touch lift;
- Action completion lane: complete;
- Action estimate lane: resize estimate;
- remaining Action body: move after touch lift.

Current main overlays optional 44px move/resize plates. At 390px, a typical
one-hour Event is about 59px high and receives a 44px move plate but no touch
resize plate. The direct-move path therefore owns only about 15% of the card
width while the rest retains the hold/scroll path. Other heights and lane widths
produce different combinations. The gesture contract changes according to the
exact pixel touched, and ordinary-duration Events cannot be touch-resized.

## Corrective architecture

1. Keep the current gesture state, persistence, scroll lock, cancellation, and
   desktop activation machinery.
2. Replace Event corner plates with the historical full-width thin start/end
   edges. Mark those same visible edges as the touch resize owners.
3. Event edge touch remains hold-to-own so an immediate vertical swipe can still
   scroll. Once lifted, the existing active-touch lock keeps the Timeline fixed.
4. Remove the special Event and Action move plates. The readable card body is the
   sole move surface and uses one hold-to-lift touch rule everywhere.
5. Keep the Action estimate as its explicit resize lane and keep completion
   isolated. Estimated Actions expose resize only when a readable body lane fits.

## Test-first regressions

- A normal one-hour Event exposes both full-width edge owners.
- Event center/title/body points are never captured by a special move plate.
- Holding and dragging either Event edge changes only that edge.
- Holding and dragging the Event body moves it and preserves duration.
- An Action has no special move plate; its body remains one continuous move
  surface between completion and estimate.
- Estimated Action resize preserves date/start; Action body move preserves date
  and estimate.
- Before lift, vertical touch movement can scroll and writes nothing.
- After lift, forced Timeline scroll drift is restored and the card commits.

## Regression boundary

Run Event/Action touch and desktop gesture suites, Week gestures, cancellation,
recurrence, JOIN, Timeline chrome, navigation shell, motion, unit tests, build,
and full Playwright. Production changes must remain inside the Day Timeline
interaction/rendering files; no motion, navigation, ribbon, persistence, domain,
or Week implementation changes are permitted.
