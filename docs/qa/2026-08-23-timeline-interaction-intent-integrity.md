# Timeline interaction intent integrity

Date: 2026-08-23
Branch: `fix/timeline-interaction-intent-integrity`
Environment: Windows PowerShell, Node/Vite production preview, Playwright Chromium, one worker. Touch cases use CDP `Input.dispatchTouchEvent` at the mobile viewport declared by each spec.

## Implemented geometry

- Eligible Events expose visible 44px start/end corner controls. The body is padded into a 44px move gutter on each side; linked Events reserve a separate 56px JOIN lane and place the end control immediately before it.
- Event eligibility remains height-gated at two 44px control lanes and width-gated at 132px, with a 56px JOIN lane plus its 4px inset reserved in linked geometry. Compact or congested cards therefore stay move-first.
- Estimated Actions expose a visible cue plus duration inside the existing 48px estimate rail only when completion (32px), body (44px), and estimate lanes fit. Narrow and unestimated Actions do not render a direct resize owner.
- Day always mounts `ANY TIME`; an empty Day renders the neutral empty message without a horizontal scroller. Populated chips retain the existing scroller, callbacks, and edge fade.

## RED evidence before/against the correction

The new checks were run against the exact base before production correction where applicable. The final implementation was then restored and the same checks passed.

| Negative control | Command/result | Intended failure |
| --- | --- | --- |
| Restore centered 44x44 Event controls | `PLAYWRIGHT_PORT=49236 npx playwright test tests/e2e/timeline-touch.spec.js --project=chromium --workers=1 --grep "dense Event title"` — 1 failed | `elementFromPoint()` at the dense visible title resolved `data-touch-resize="start"`; the body ownership assertion REDed. |
| Remove Action minimum body-lane gate | `PLAYWRIGHT_PORT=49242 npx playwright test tests/e2e/actions.spec.js --project=chromium --workers=1 --grep "narrow collision"` — 1 failed | The narrow fixture rendered one `timeline-action-resize` owner where the contract requires zero. |
| Restore conditional `ANY TIME` mounting | `PLAYWRIGHT_PORT=49243 npx playwright test tests/e2e/timeline-polish.spec.js --project=chromium --workers=1 --grep "empty Day still renders"` — 1 failed | `ANY TIME` was absent from the empty Day. |
| Disable post-lift scroll-lock enforcement | `PLAYWRIGHT_PORT=49244 npx playwright test tests/e2e/timeline-touch.spec.js --project=chromium --workers=1 --grep "active Event owns the Day scroll position"` — 1 failed | Forced stream drift cancelled the active sequence; the Event never committed after the scroll-lock check. |

Each sabotage was applied only locally with `apply_patch`, observed RED, and immediately restored. No sabotage remains in the branch.

## Green verification

- `node --test src/features/planner/timelineTouchTarget.test.js src/features/planner/timelineGesture.test.js src/features/planner/timelineInteractionState.test.js` — 50 passed.
- `node --test src/architecture.test.js` — 3 passed; `Planner.jsx` remains within its architecture ceiling.
- `npm run build` — passed (190 modules transformed).
- `npm test` — 651 passed.
- `npx playwright test tests/e2e/timeline-touch.spec.js --project=chromium --workers=1` on port 49261 — 20 passed, including real touch body move, start/end resize invariants, linked JOIN separation, cancellation, two-finger ownership, scroll lock, dense title ownership, and unmodified Action touch coverage.
- `npx playwright test tests/e2e/timeline-touch.spec.js --project=chromium --workers=1 --grep "point grid|dense Event title"` on port 49237 — 2 passed.
- `npx playwright test tests/e2e/actions.spec.js --project=chromium --workers=1` on port 49257 — 46 passed. The browser geometry assertion uses a 90-minute estimate and confirms the cue and duration stay inside the 48px estimate rail.
- `npx playwright test tests/e2e/timeline-polish.spec.js --project=chromium --workers=1` on port 49258 — 28 passed.
- `npx playwright test tests/e2e/interaction-contracts.spec.js --project=chromium --workers=1` on port 49259 — 11 passed.
- `npx playwright test tests/e2e/timeline-gestures.spec.js tests/e2e/gesture-isolation.spec.js --project=chromium --workers=1` on port 49260 — 29 passed.
- `npx playwright test tests/e2e/timeline-polish.spec.js --project=chromium --workers=1 --grep "empty Day still renders"` on port 49239 — 1 passed.

## Residual validation

The parent agent should run the full Verification Contract: the complete Action/gesture-isolation, Timeline polish/interaction-contract, adjacent calendar, full unit, and full Chromium suites; visible Windows Chrome review at 1280x900, 390x844, and 390x601; and final code review. Android Chrome and iOS Safari physical-device validation remain pending.
