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

**How to apply:** New feature-layer projections belong in `src/features/planner/` as pure tested functions. Also: `{ segments: true }` reads stamp each per-day segment with its own `date` and `segmentId` — bucket by `occurrence.date` and key React lists by `segmentId`, or multi-day events pile onto their first day with duplicate keys.
