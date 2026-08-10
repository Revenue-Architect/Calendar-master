# Calendar Availability, Conflict, and Briefing — Phase 3E Design

**Status:** Approved implementation design

## Outcome

Calendar availability, conflict detection, and briefings become pure Calendar
queries over canonical occurrence expansion. They do not persist derived blocks,
infer attendance, or change an event or task automatically.

## Product decisions

- Calendar visibility is a view policy: active visible calendars appear in
  projections; archived, disconnected, and explicitly hidden calendars do not.
  A query can explicitly include a visible subset, but cannot resurrect an
  inactive calendar.
- Availability uses only visible calendars whose `includeInAvailability` is not
  `false`. Timed occurrences consume their exact half-open local interval.
  All-day occurrences are reported separately and do not silently consume a full
  workday unless a future policy asks them to.
- Conflicts are pairs of timed occurrences that overlap by a positive duration.
  Adjacent events are not conflicts. All-day overlap is informative context, not
  a timed double-booking claim.
- A free slot is a half-open interval within a caller-supplied day and working
  window. Slots are returned in chronological order, honour a requested minimum
  duration, and are suggestions only; no query schedules a task.
- Briefing reports facts: visible event count, all-day count, timed busy minutes,
  first/next timed occurrence, conflicts, all-day context, and free slots. It
  does not claim attendance, travel time, priority, or a recommended action.

## Boundaries

| Concern | Owner | Excluded |
| --- | --- | --- |
| Occurrence expansion/exceptions | Calendar | UI date arithmetic |
| Visibility/availability/conflict/briefing reads | Calendar queries | persistence and writes |
| Calendar rendering and gestures | Planner UI | recurrence expansion |
| Scheduling a task into a free slot | Future workflow | automatic mutation |

## Acceptance criteria

1. Visibility and availability respect calendar status and `includeInAvailability`.
2. Timed busy intervals and conflicts use exact half-open boundaries across
   recurrence and moved occurrences.
3. Free slots are deterministic, chronological, non-overlapping, and never write.
4. Briefings preserve canonical occurrence IDs and explicitly distinguish factual
   conflicts/all-day context from unavailable attendance.
