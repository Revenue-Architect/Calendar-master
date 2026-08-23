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

## Final integrated verification

The interaction correction and the CALENDAR-rail continuity correction were integrated on one clean branch and independently re-reviewed after the original three review findings were repaired.

- Combined focused run: `navigation-shell`, `timeline-touch`, `actions`, `timeline-polish`, `interaction-contracts`, `timeline-gestures`, and `gesture-isolation` — **156 passed**.
- Post-review focused run: complete `navigation-shell`, `actions`, and `timeline-polish` specs — **96 passed**.
- The one grouped `motion.spec.js` setup miss was rerun alone on the same head and passed; the final full suite also passed that exact test.
- `npm test` — **651 passed**.
- `npm run build` — passed (190 modules transformed).
- After rebasing onto main `61903cef715e3d2b99ce209f6a7c0100f0426e6d`, the four directly affected specs (`navigation-shell`, `actions`, `timeline-touch`, and `timeline-polish`) — **117 passed**.
- `npx playwright test --project=chromium --workers=1` on the exact final tree and isolated port 49432 — **381 passed** in 12.0 minutes.
- Final independent diff review — **PASS**, with no remaining P1/P2/P3 finding.

### Visible Windows Chrome product review

Production preview port 49420 was reviewed in connected Windows Chrome at 1280x900, 390x844, and 390x601.

- A native held touch on an Event body moved `Client review — Nordwell` from 3:00–4:30 to 4:00–5:30 while preserving its duration and the Day stream scroll position.
- Native touches on the visible end and start controls changed only the intended boundary; the opposite boundary stayed fixed and the stream did not move underneath the active gesture.
- The Event controls stayed visually distinct at opposite corners and left the title/body lane unobstructed. The linked/JOIN reservation remained separate.
- Scheduled Actions retained a dedicated move face; automated native-touch coverage passed for held movement, active scroll ownership, estimate resize, completion isolation, cancellation, and remount behavior.
- `ANY TIME` remained visibly present in Day at both mobile heights and desktop, with populated chips remaining horizontally scrollable. Week rendered no `ANY TIME` landmark. The seeded empty-state regression verifies the compact one-line empty landmark without an empty scroller and retains at least three Timeline hours in the controlled 390x601 fixture.
- Desktop Timeline and Actions remained aligned; no application-wide stray horizontal line or card-lane overlay appeared.

Android Chrome and iOS Safari physical-device validation remain pending.
