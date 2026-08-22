# Fix timeline-chrome scroll determinism

Status: implemented on `fix/timeline-chrome-scroll-determinism`

## Objective

Make the four `timeline-chrome-scroll.spec.js` cases deterministic and green
without changing the planner's intentional current-time positioning or the
timeline interaction state machine:

- phone / Day
- phone / Week
- desktop / Day
- desktop / Week

The behavior under test remains: a real user scroll away from midnight
collapses the timeline chrome, and a real scroll back to the top restores it.

## Authority and scope

The implementation follows `DESIGN.md`, `docs/spec/structure.md`, the shared
timeline interaction contract, and the existing Day/Week implementations.
Only the E2E harness and QA/planning artifacts are in scope. No production
React, CSS, timeline state, WeekGrid, navigation, ribbon, or morph files are
to be changed unless a normalized browser reproduction proves a product defect.

## Root-cause hypothesis and characterization

The planner intentionally auto-positions its vertical timelines around the
current hour. WeekGrid derives its initial position from `nowMin`, and the E2E
helpers document that Week opens at the current hour. The old test then sent
`wheel(0, 500)` without establishing a starting position.

On the failing run every surface was already at its lower scroll bound. The
downward wheel therefore produced no `scrollTop` change and no native scroll
event, so the chrome correctly remained open. This is a test precondition
failure, not a product-state failure.

## Implementation

1. Resolve the actual vertical scroller for the active surface:
   `[data-test="day-stream"]` for Day and the inner
   `[data-test="week-grid"] .nb-s` for Week.
2. Normalize that node to `scrollTop = 0` as setup, then use `expect.poll` to
   observe the browser reaching the midnight position.
3. Assert the chrome is open at that setup state.
4. Move the pointer over the actual scroller before sending a real
   `page.mouse.wheel(0, 500)` gesture.
5. Use `expect.poll` to prove physical movement occurred before asserting the
   product's `data-collapsed="true"` state.
6. Send a real upward wheel gesture, poll for `scrollTop <= 24`, and assert
   `data-collapsed="false"`.
7. Remove the old arbitrary 500ms wait; visibility and scroll-state polls are
   the synchronization signals.

## Safety gates

- Do not disable the product's current-time auto-positioning.
- Do not set React state or `data-collapsed` directly.
- Do not weaken the four true/false state assertions or remove a matrix case.
- Do not tune the 24px threshold or the scroll-session timeout without a new
  failing product characterization.
- If a normalized, physically scrolling browser case still fails, stop and
  trace wheel intent, native scroll, session authorization, and
  `timelineChromeIntent` before touching production.

## Negative controls

The harness must fail if the real downward wheel is removed: the physical
scroll poll must time out. The original non-normalized setup must also retain
its characterized lower-bound failure when the environment starts at the
current-hour position. Neither sabotage is committed.

## Acceptance criteria

- focused spec: 4/4 passed;
- focused spec repeated ten times: 40/40 passed;
- the downward gesture demonstrably changes `scrollTop`;
- returning to `scrollTop <= 24` restores the chrome;
- no arbitrary wait remains in this spec;
- timeline interaction unit tests and Week drag remain green;
- full project tests, build, and Playwright complete with no remaining
  timeline-chrome failures;
- production behavior is unchanged when the deterministic setup is sufficient.

## Verification

Run the focused spec, its ten-run repeat gate, timeline interaction unit tests,
Week drag and related calendar/timeline suites, then `npm test`, `npm run build`,
and the full Playwright suite with one worker and an isolated preview port.
