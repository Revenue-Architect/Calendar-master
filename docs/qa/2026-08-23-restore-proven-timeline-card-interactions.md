# Timeline card interaction restoration — QA record

Date: 2026-08-23

Branch: `fix/restore-proven-timeline-card-interactions`

Base: `a3acd50c7e6ab6fba472fe98fd837882d5332b69`

Historical reference: `3086254454719992fd9d04e5ed8ef4fb86120536` (tree-equivalent to PR #7 merge `f644fbc6921ef6ed645623fffb82d2a4c3979c47`)

## Environment

- Windows 11
- Node `v24.18.0`
- npm `11.16.0`
- Playwright `1.62.1`
- bundled Chromium `151.0.7922.34`
- visible Windows Chrome `151.0.7922.170`

## Root cause

The recent explicit-control work replaced the previously continuous card grammar with conditional 44×44 move and resize plates. At the 390px phone viewport:

- a typical Event was about `283.76px` wide;
- its move plate was about `43.99px` wide, only `15.5%` of the card;
- a typical one-hour Event was about `59.33px` tall and exposed no semantic touch resize controls;
- taller Events exposed a different combination of move and resize plates;
- scheduled Actions also reserved a separate 44px move plate.

The interaction therefore changed according to the exact pixel touched and the rendered duration: the same apparent card could scroll, move, or resize. This matched the reported intermittent behavior. The PR #7 tree used one continuous body plus thin full-width Event boundaries instead.

## RED evidence

On the exact base, before production changes:

- `an ordinary one-hour Event keeps full-width start and end ownership` failed because the start edge measured `44px` instead of the card's full width;
- `a scheduled Action uses one continuous body move surface` failed because `timeline-action-move` still existed.

Command:

```text
npx playwright test tests/e2e/timeline-touch.spec.js tests/e2e/actions.spec.js --project=chromium --workers=1 --grep "ordinary one-hour Event|continuous body move surface"
```

Result: `2 failed` for the intended ownership mismatches.

## Correction

- Restored one readable Event body as the move candidate.
- Restored stable full-width `8px` start and `12px` end Event boundaries at every duration and lane width.
- Restored one continuous Action body between completion and estimate.
- Kept the explicit 48px Action estimate as the direct resize owner.
- Kept touch body/edge movement scroll-safe before the stationary lift.
- Kept the newer active-gesture scroll lock, multi-touch cancellation, direct desktop activation, recurrence, JOIN, navigation, ribbon, Timeline chrome, and motion behavior.

## Automated verification

| Gate | Result |
| --- | --- |
| Timeline interaction units | 52/52 passed |
| Timeline touch | 32/32 passed |
| Actions | 54/54 passed |
| Day/Week gesture + isolation | 40/40 passed |
| Recurrence/JOIN/chrome/navigation | 43/43 passed |
| Motion | 49/49 passed |
| Critical touch repeat gate | 24/24 passed (8 cases × 3) |
| Interaction contracts after stale move-plate assertion correction | 11/11 passed |
| `npm test` | 650/650 passed |
| `npm run build` | passed |
| Full Chromium | Final clean run: 402/402 passed. |

The first full run passed 401/402 because one stale interaction-contract test still asserted the deliberately removed `timeline-action-move` plate. After that assertion was corrected to protect the continuous Action body, its complete spec passed 11/11.

A subsequent full run also passed 401/402, with one order-sensitive palette-to-Timeline motion assertion missing its state deadline. The unchanged test passed alone and then passed 5/5 on both this branch and exact base `a3acd50` under the same Node, Playwright, Chromium, worker, and preview-server setup. A final clean full run passed 402/402 in 12.4 minutes. This provenance is retained rather than reporting only the green run.

## Windows Chrome product-design validation

| Viewport | Observation |
| --- | --- |
| 1280×900 | ANY TIME visible; Event bodies continuous; full-width boundary cues align with card edges; no horizontal overflow; Action body continuous; desktop move and resize contracts pass. |
| 390×844 | ANY TIME visible; a `59.33px` one-hour Event has full-width `283.76px` start/end ownership; no move plate; stream/card geometry has no horizontal overflow. |
| 390×601 | ANY TIME visible; the same full-width edge/body grammar remains intact in the short viewport; no horizontal overflow or detached controls. |

The visual hierarchy is quieter than the plate-based version: the title remains the primary surface, the two small horizontal boundary cues communicate duration editing, and the Action estimate remains the only separate resize affordance.

## Regression boundary

- No motion, navigation, ribbon, Timeline chrome, domain, persistence, Composer, or Sheet production file changed.
- Week interaction code did not change.
- The generated sandbox screenshots produced by `npm test` were removed from the worktree and were not staged.

## Post-fix quality

- Scope: fix-only branch against `a3acd50`.
- Simplify: three focused reuse/quality/efficiency reviews; one safe one-use numeric wrapper was removed.
- Review: no behavior, performance, or ownership blocker found. The obsolete `eventMove` / `actionMove` enum vocabulary was intentionally left outside this narrow mutation boundary; it has no runtime effect.
- Re-verification after the simplification: touch-target units `6/6`; critical browser regressions `4/4`.
- Residuals: physical Android Chrome and iOS Safari remain prudent release checks for real-device gesture arbitration; automated tests use real Chromium CDP touch input, not mouse-in-a-mobile-viewport substitutes.
