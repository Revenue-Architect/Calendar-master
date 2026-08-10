# Phase 3B Follow-up Pressure Test

**Scope:** Fresh verification of the published reminder ledger and its shared
planner seams after the Phase 3B delivery commit.

## Automated evidence

| Gate | Result |
| --- | --- |
| Full automated suite | 229 passing, 0 failing |
| Production build | Vite completed successfully; 94 modules transformed |
| Source hygiene | `git diff --check` completed with no whitespace errors |
| Production dependencies | `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities |

The full suite covers Calendar, Tasks, Notes, shared day composition, reminder
model validation, reconciliation, delivery, snooze, dismissal, and independent
ledger persistence. The follow-up probe additionally exercised two boundary
paths against the real reminder modules:

- A daily recurring event produced 14 distinct occurrence reminder intents in a
  14-day half-open horizon. Each instance kept its own opaque Calendar occurrence
  identity and resolved to the expected local alert time.
- A snoozed task reminder remained a single `snoozed` ledger record after the
  next source-intent reconciliation; it was neither replaced with the original
  schedule nor duplicated.

## Browser-flow evidence limit

The local Vite server started successfully, but the available cloud browser
rejected `http://localhost:5173` with `net::ERR_BLOCKED_BY_CLIENT`. The shell
environment could not reach that transient preview port either. No screenshots
or interactive UI flows are claimed as passed from this run.

## Required device/browser follow-up

- Create an event and a task reminder, reload, and confirm each future reminder
  remains scheduled exactly once.
- Let each become due. Confirm the in-app toast offers `SNOOZE 10M` and
  `DISMISS`, and that either action leaves its source event or task unchanged.
- Move, complete, and delete near-term sources. Confirm old active ledger items
  become superseded or cancelled and do not fire.
- Check keyboard focus, screen-reader announcement, narrow-screen reflow, and
  reduced-motion behavior for the reminder toast.

## Result

The published code passes all executable checks and the reminder edge probes.
Visual and assistive-technology validation remains an explicit environment
blocker, not a passed result.
