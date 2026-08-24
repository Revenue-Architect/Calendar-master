# QA — Action card work progress visualization

**Date:** 2026-08-24  
**Commit:** (filled at ship)  
**Scope:** Two-track Action progress on full cards, inspector, and Timeline compact rails.

## Verification

- Unit: 657/657
- Focused Playwright gates: 149/149 (`timeline-polish`, `actions`, `timeline-touch`, `interaction-contracts`, `recurring`)
- 10 consecutive runs, no retries: mixed STEPS/SUBTASKS, 15-minute Timeline rails, completion swipe, body drag, estimate resize — 50/50
- Full Chromium, `workers: 1`: 424/425 on the first pass. The single failure was `week-drag` “a card moves to another day”: `quickAdd` left the command palette open (click did not land). Unrelated to Action progress. Retry 5/5, then `week-drag.spec.js` 11/11
- `Planner.jsx` 5533 lines against a 5534 ceiling (was 5544)

## What changed

Full Actions cards, the Action inspector, and Timeline Action cards now share
`ActionProgress`. Checklist steps and required subtasks stay separate tracks
(`STEPS` then `SUBTASKS`). Timeline rails are `pointer-events: none` inside the
body lane and do not change card height. Compact viewports keep existing
navigation paint.

## Domain

- `taskProgress` reports checklist and subtasks separately.
- Cancelled children are excluded; waiting children stay incomplete.
- Promoting a checklist item moves that unit onto the subtask track.

## Browser

- Checklist-only, subtask-only, mixed, cancelled-denominator, and no-work cases.
- Timeline 15 / 30 / 60 / 120 minute mixed rails stay in the body lane.
- `elementFromPoint` on the rail still hits the Action body, not a progress target.
- Existing checklist fill-by-count and inspector parity remain green.
- Reduced motion fills the next segment immediately.

## Motion

Fill is `transform: scaleX` only, 200ms `--motion-enter`, stagger capped at 160ms.
OS `prefers-reduced-motion` and in-app Reduce motion both set `transition: none`
on `.nb-progress-fill`.
