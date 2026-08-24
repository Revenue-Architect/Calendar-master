# Timeline touch direct-manipulation validation

## Provenance

- Base: `32122e02fe1f1cc0e1c0718d2cf41099c2b8cfc8`
- Final integration target before push: `37217de7d5ef1f377b811f0e67d7de9c4ea8db2f` (independent navigation-rail correction; no overlapping files)
- Branch: `fix/timeline-touch-direct-manipulation-v2`
- Environment: Windows; Node `v24.18.0`; npm `11.16.0`; Playwright `1.62.1`; bundled Chromium `151.0.7922.34`
- Plan: `docs/plans/2026-08-23-003-fix-timeline-touch-direct-manipulation-plan.md`

## Root cause

The old touch contract placed two different meanings on the same pixels. Event
controls and card bodies used `touch-action: pan-y` and a hidden 300ms lift.
Movement beyond the 8px cancellation threshold before the timer gave the
Timeline scroll ownership; the same movement after the timer moved or resized
the card. Scroll locking began only after lift, so natural finger drift could
make the result depend on timing rather than the visible affordance.

The implementation now separates explicit manipulation controls from
scroll-safe body regions. Event start, move, and end controls and scheduled
Action move/estimate controls are visible 44px owners with
`touch-action: none`. They activate the existing gesture on the first deliberate
movement and apply that movement in the same frame. The remaining card body
keeps `pan-y`, tap-to-inspect, vertical scrolling before lift, stationary
hold-to-move compatibility, and the Action horizontal completion swipe.

During review, two spatial dependencies were corrected before acceptance:

- The Action completion owner is now a real 44px lane. This prevents the
  global coarse-pointer `.nb-tap::after` expansion from covering the first
  5–6px of the adjacent move control. A boundary probe was RED before this
  correction and GREEN afterward.
- Scheduled Actions are packed using their 44px minimum visual footprint, then
  restored to their real stored estimate for rendering and live-time logic.
  Nearby short Actions therefore cannot occupy the same pixels while their
  domain duration remains unchanged.
- Dense Event and Action lanes expose direct controls only when the remaining
  title/body lane is at least 44px. Denser cards keep a readable body and use
  the existing scroll-safe tap/hold fallback instead of hiding their title.
- A compact Event whose resize controls do not fit puts its move lane at the
  card edge and reserves 44px, rather than reserving an absent resize lane.

Delegated touch ownership resolves from the actual client point before using
the browser event target. This prevents Chromium transformed-edge retargeting
from turning a body completion swipe into a neighboring move gesture.

## RED evidence

Before production changes, the new target-role unit suite observed `8 passed / 1
failed` because no Event move role existed. The immediate Event CDP group
observed `1 passed / 5 failed`: move/start/end manipulation did not activate
without the hidden hold while the body-scroll control remained green. The old
implementation therefore failed for the intended mechanism, not merely an end
state.

## Automated verification

| Gate | Result |
| --- | --- |
| Timeline gesture/target/interaction/architecture units | 57/57 passed |
| Full Event touch suite | 28/28 passed |
| Full Actions suite | 52/52 passed |
| Immediate move/resize repeat gate | 15/15 passed across three consecutive runs |
| Adjacent interaction, JOIN, recurrence, Timeline chrome, and navigation group | 82/82 passed |
| Final Event + Action combined run | 83/84 passed; one boot/setup miss, then the same case passed 5/5 alone |
| Final adjacent gesture/Week/chrome run | 53/55 passed; both setup-path misses then passed 5/5 each |
| `npm test` | 655/655 passed |
| `npm run build` | Passed; 190 modules transformed |
| Full Chromium | 394/399 passed; five long-run readiness/setup misses, while every interaction added by this pass otherwise passed |
| Full-run residual reconciliation on branch | All five passed together, then 15/15 across three repeats |
| Exact-base comparison | The four cases present on base passed 4/4 with the same browser, worker count, and server strategy; the fifth is new coverage and passed 3/3 on the branch |

The full-run failures were not hidden or reclassified as passing: their exact
assertions are recorded above. Four failed before reaching the tested behavior
because the expected initial Day surface was absent; one palette command did
not reach Week before its readiness deadline. None reproduced in the controlled
branch run, its three-repeat gate, or the same-environment exact-base run. The
truthful result remains the observed `394/399` full run plus the isolated
reconciliation; no test wait or assertion was weakened.

## Stored-model and ownership checks

- Event move changes start while preserving duration and same-day identity.
- Event start resize preserves the exact end; Event end resize preserves the
  exact start.
- Action move changes `planned.startMinute` while preserving date and estimate.
- Action resize changes only `planned.estimateMinutes`.
- Direct-control manipulation leaves Day `scrollTop` unchanged.
- Body-origin vertical touch physically scrolls and writes nothing.
- A tap or 2px tremor opens the inspector and writes nothing.
- Action completion and partial-swipe behavior remain distinct and green.
- Completion and move own opposite sides of their shared boundary; the
  completion button's coarse pseudo-target no longer intrudes into move.
- Nearby short Actions are visually disjoint, and dense Event/Action titles
  stay measurable without advertising controls that do not fit.
- JOIN, cancellation, next interaction, recurrence, Timeline chrome, navigation,
  and ANY TIME remain green.
- `Planner.jsx` is 5,543 lines against the existing 5,544-line architecture
  ceiling; the ratchet was not raised.

## Visual product review

The final independent review used visible Windows Chrome against fresh
production bundle `index-DPU6HrkM.js` at `1280x900`, `390x844` (reported inner
height 845), and `390x601`.

- Compact Action geometry measured 43.99x43.99px for completion,
  43.99x44.24px for move, and 48x44.24px for estimate. Completion owned x+0–44,
  move owned x+44–88, and the title began at x+88 with no pseudo-target overlap.
- At 390x844, Action move persisted 7:00 PM to 8:00 PM and estimate resize
  persisted 30m to 1h20m while Timeline scroll position stayed fixed. Body
  scrolling moved the Timeline without changing the Action; body tap inspected
  without a model write. The 390x601 compact layout showed the same disjoint
  ownership and readable title.
- Event move/start/end controls measured 44x44px. Start/end manipulation
  preserved the opposite boundary; ordinary body scroll/tap remained separate.
- Dense overlapping Events and Actions retained readable titles and hid direct
  controls when the required lanes did not fit. Nearby short Actions did not
  overlap visually.
- ANY TIME, navigation, ribbon, Day chrome, and Timeline scrolling remained
  visually stable after the interaction cycles.

| Before | After | Why |
| --- | --- | --- |
| Completion expansion could cover the first pixels of Action move; dense controls pressured titles. | Completion owns a real 44px lane, move starts at +44px, title at +88px; dense cards omit controls that do not fit. | Removes ambiguous ownership while preserving legibility and coarse-pointer sizing. |
| Card body and manipulation competed for the same touch movement. | Explicit controls use `touch-action:none`; readable body regions remain `pan-y`. | Separates move/resize intent from scroll and tap without hidden timing. |

## Scope

Changed production behavior is limited to Day Timeline touch target geometry,
classification, and activation. No motion, navigation, ribbon, Timeline chrome,
calendar/task domain API, persistence, recurrence, JOIN, theme, or Week gesture
implementation changed.

## Device status

Windows Chrome and real Chromium CDP touch input were exercised. CDP validates
browser arbitration but is not physical-device evidence. Android Chrome and iOS
Safari physical-device validation remain pending.
