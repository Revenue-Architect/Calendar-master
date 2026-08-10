# Reminders Phase 3B QA

**Scope:** Independent reminder ledger, Calendar/Task intent reconciliation,
in-app delivery, snooze, dismissal, and local persistence.

## Automated evidence

| Gate | Result |
| --- | --- |
| Reminder domain + storage tests | 11 passing, 0 failing |
| Production build | Vite completed successfully; 94 modules transformed |
| Browser attempt | Not rerun: local preview access remains blocked in this environment |

The tests cover deterministic schedule IDs, invalid record rejection, Calendar
and Task intent derivation, event/task time anchors, a changed schedule becoming
superseded, removal cancellation, stale-delivery suppression, three-item burst
cap, delivery, snooze, dismissal, missing storage, round-trip persistence, and
malformed ledger rejection.

## Browser/device verification still required

- A due event and a due task show one in-app reminder at a time.
- `SNOOZE 10M` reappears only at the new time and does not alter the event/task.
- `DISMISS` closes the reminder for that occurrence only.
- Reload before a future reminder retains it; reopening long after a missed reminder
  does not flood the screen.
- Browser notification permission is treated as an optional second channel; denied
  permission leaves the in-app reminder working.

The cloud-browser local-preview block is recorded in the preceding Phase 3A report.
