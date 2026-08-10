---
name: Calendar read projections
description: Which calendar-domain query each kind of UI read must use (visibility vs availability vs raw)
---

# Calendar read projections

Rule: UI surfaces must never read events via the raw occurrence query.

- **Anything the user sees** (grids, agendas, peeks, density dots) → `getVisibleOccurrencesForRange` — filters hidden, archived, and disconnected calendars.
- **Anything about free/busy** (slot finding, busyness heat, conflict checks) → `getTimedBusyIntervals` / `getFreeSlotsForDay` — additionally excludes `includeInAvailability: false` calendars. A visible non-availability calendar shows its events but never blocks a slot or darkens a heatmap.
- Raw `getOccurrencesForRange` is for domain-internal composition only.

**Why:** Task completion review rejected week-view work twice for bypassing these projections; using raw reads makes hidden/archived calendars reappear and non-availability calendars block meeting slots.

**Status (2026-08-10): enforced.** Every user-facing read now goes through a
projection — the day (via `domains/planner/dayAggregate`), the agenda, the week
grid, the month peek and heatmap, the density dots, and find-a-slot. `Planner.jsx`
no longer imports the raw query at all. Unit tests in `dayAggregate.test.js` and
`planningQueries.test.js` fail if a hidden, archived or disconnected calendar
reappears, and `tests/e2e/calendars.spec.js` asserts the same in a browser.

Two deliberate exceptions:

- **A notebook with no `calendars` roster is not filtered.** No roster means
  nothing to hide by, and filtering against an empty one would erase every event
  silently. An explicit `calendarIds` argument still narrows, because the caller
  named what it wanted.
- **Reminders (`domains/reminders/reminderIntents.js`) still read raw.** A reminder
  is a commitment you asked for, not a display of a calendar, so hiding a calendar
  does not cancel it. Revisit if provider sync makes "disconnected" mean the events
  are stale rather than merely hidden.

**How to apply:** New feature-layer projections belong in `src/features/planner/` as pure tested functions. Also: `{ segments: true }` reads stamp each per-day segment with its own `date` and `segmentId` — bucket by `occurrence.date` and key React lists by `segmentId`, or multi-day events pile onto their first day with duplicate keys.
