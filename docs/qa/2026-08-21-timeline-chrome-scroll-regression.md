# Timeline chrome scroll regression

Date: 2026-08-21  
Branch: `fix/timeline-chrome-scroll-determinism`  
Base SHA: `174ba206c13fe172d82645ad28c6fad711e9d9bf` (latest `origin/main`,
including merged PR #6)  
Verified implementation SHA: `df9b123`  
Production code changed: **No**

## Scope

This separate regression PR repairs the four E2E cases that asserted that a
downward timeline scroll collapses the chrome. It does not change the planner,
WeekGrid, timeline state machine, morph, navigation, ribbon, or CSS behavior.

Files changed:

- `tests/e2e/timeline-chrome-scroll.spec.js`
- `docs/plans/2026-08-21-002-fix-timeline-chrome-scroll-determinism-plan.md`
- this QA report

## Original failure

The untouched latest main reproduced 0 passed / 4 failed in
`tests/e2e/timeline-chrome-scroll.spec.js`:

- phone / Day
- phone / Week
- desktop / Day
- desktop / Week

Every failure was the same assertion: “scrolling away from midnight must
collapse the chrome” expected `true`, received `false`.

Temporary diagnostic instrumentation measured the actual scroll node before and
after the original `wheel(0, 500)`:

| surface | initial `scrollTop` | `scrollHeight` | `clientHeight` | max scrollTop | after wheel | native scroll events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| phone / Day | 1126 | 1632 | 506 | 1126 | 1126 | 0 |
| phone / Week | 1215 | 1632 | 417 | 1215 | 1215 | 0 |
| desktop / Day | 1055 | 1632 | 577 | 1055 | 1055 | 0 |
| desktop / Week | 1163 | 1632 | 469 | 1163 | 1163 | 0 |

The product intentionally auto-positions the timeline around the current hour.
At the run time, all four surfaces were already at their lower scroll bound.
The test then requested more downward movement, so the browser correctly
produced neither a scroll nor a native scroll event. With no user movement,
the chrome correctly stayed open.

**Confirmed root cause:** the E2E test relied on wall-clock-dependent initial
scroll position and asked for a downward gesture without first establishing
the midnight state required by its scenario.

## Test correction

The test now:

1. resolves the actual vertical Day or Week scroll node;
2. sets that node to `scrollTop = 0` as setup and polls until the browser
   reaches the top;
3. verifies the chrome is open at midnight;
4. moves the pointer over the node and sends a real downward wheel gesture;
5. polls for a physical `scrollTop` increase before asserting
   `data-collapsed="true"`;
6. sends a real upward wheel gesture, polls for `scrollTop <= 24`, and asserts
   `data-collapsed="false"`.

The old arbitrary `waitForTimeout(500)` was removed. Product state and actual
scroll position are the synchronization signals.

## Negative controls

Both local controls failed as required and were reverted before commit:

- Removing the real downward wheel caused all four cases to fail at the
  physical-movement poll (`scrollTop` remained 0); the test cannot pass by
  observing only the chrome state.
- Removing midnight normalization returned the original lower-bound behavior
  in the characterized environment: the four original cases failed, with
  `scrollTop` unchanged and zero native scroll events.

## Verification results

| Gate | Result |
| --- | --- |
| focused timeline chrome spec | **4 passed, 0 failed** |
| focused spec, `--repeat-each=10` | **40 passed, 0 failed** |
| `node --test src/features/planner/timelineInteractionState.test.js` | **20 passed, 0 failed** |
| `tests/e2e/week-drag.spec.js` | **8 passed, 0 failed** |
| calendar/timeline interaction matrix (84 tests) | **84 passed, 0 failed** |
| `npm test` | **634 passed, 0 failed** |
| `npm run build` | **passed** |
| full Playwright, `--workers=1` | **327 passed, 0 failed** |

The full Playwright run was executed against the isolated worktree preview on
port 4372 and contains zero remaining timeline-chrome failures.

## Chrome visual validation

The production build was opened in Windows Chrome at the default desktop size
and at 390×844:

- desktop Day timeline opened with the ribbon, heading, cards, and Actions
  pane intact;
- a real scroll over the timeline collapsed the chrome while leaving timeline
  cards, the now marker, and the reading surface intact;
- a real return-to-top gesture restored the heading and ribbon;
- the same collapse/restore sequence worked on the 390×844 mobile layout;
- no blank surface, clipping, stale overlay, or interaction dead zone was
  observed.

## Product impact

No product behavior changed. The existing test was dependent on wall-clock time
because the planner intentionally auto-positions the timeline around the
current hour. The fix makes the test establish its documented midnight setup
while preserving the real user gesture and all existing interaction semantics.
