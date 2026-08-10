# Preferences, Motivation, and Persistence — Phase 3D QA

**Scope:** Separate device preferences and an auditable motivation ledger from the
schema-v7 planner notebook, then adopt the existing Settings and task-completion
flows.

## Automated evidence

| Gate | Result |
| --- | --- |
| Focused Phase 3D tests | 25 passing, 0 failing |
| Full automated suite | 259 passing, 0 failing |
| Production build | Vite completed successfully; 104 modules transformed |
| Source hygiene | `git diff --check` completed with no whitespace errors |
| Production dependencies | `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities |

The focused tests and direct pressure paths prove that:

- Legacy display settings seed an independent validated v1 record; malformed
  preferences or motivation storage rejects rather than being silently replaced.
- Task-completion rewards carry task source and action identity, reject a retry
  with a fresh action ID while an award is active, and can earn again after an
  immutable reopen reversal.
- Orphaned, duplicate, or mismatched reversal records are rejected so the ledger
  stays auditable.
- Points, level progress, and neutral streaks derive only from unreversed task
  completion awards. Controls hide optional motivation UI without mutating the
  ledger or Task state.
- Bulk task completion no longer mutates the legacy notebook `xp` field; the
  ledger is the owner of all newly-earned rewards.

## Browser-flow evidence limit

The ordinary Vite development server started at `http://localhost:5173`.
Attempting the network-hosted variant failed in this sandbox because Node could
not enumerate interfaces (`uv_interface_addresses`, error 1). The available cloud
browser client is not present in this runtime; a previous local-address attempt
also returns `net::ERR_BLOCKED_BY_CLIENT`. No interactive Settings, completion, or
assistive-technology flow is claimed as passed here.

## Required browser/device follow-up

- Change theme, clock, sound, reduced motion, and each motivation control; reload
  and confirm each setting survives without changing an event, task, or note.
- Complete, undo, reopen, and re-complete one-off and recurring tasks. Confirm one
  reward per active completion, a neutral streak, and no task debt created.
- Bulk-complete selected work, undo it, import a backup, and use full wipe. Confirm
  the visible level/streak reflects ledger behavior while device preferences remain.
- Verify notification permission denial, haptic preference, focus order, keyboard
  controls, narrow-screen reflow, and reduced-motion behavior on real devices.

## Result

The domain, persistence, and integration seams pass executable regression and
pressure checks. Browser/device validation remains explicitly blocked by the
available environment and is not represented as a product pass.
