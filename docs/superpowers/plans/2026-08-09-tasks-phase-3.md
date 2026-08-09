# Tasks Phase 3 Implementation Plan

**Goal:** Close the gaps left by Phase 2 — make dependencies authorable, expose smart views, lists, tags, waiting state and task reminders, and wire the scheduling warning.

## Status

Complete. This closes the Tasks domain against the approved specification.

| Gap from Phase 2 | Resolution | State |
| --- | --- | --- |
| Dependencies could only be set programmatically | Picker in the task inspector, with add and remove | Done |
| `getEarliestResponsibleStart` unwired (§15.6) | Advisory warning when a plan precedes its blockers | Done |
| Lists and tags had no interface (§4.1, §4.2) | List manager, tag listing, list commands | Done |
| Smart views not navigable (§4.3) | View switcher over ten named queries | Done |
| Waiting and follow-up not exposed (§2.4) | State control and follow-up row in the inspector | Done |
| Task reminders missing (§12) | Anchored reminders firing beside event alerts | Done |

## Decisions worth keeping visible

- **Inbox now requires status `open` (§2.2).** A waiting task with no dates was
  appearing as raw capture. Starting a task or moving it to waiting is triage, so
  those have left the inbox regardless of whether they carry dates.
- **Task reminders anchor to a date the task already has (§12.1).** Storing an
  absolute time means a rescheduled task fires at the moment it used to occupy.
- **System and default lists cannot be deleted (§4.1).** Removing the Inbox would
  leave captured work with nowhere to land. Deleting any other list moves its tasks
  to the default list rather than destroying them.
- **Rejected dependency edges are validated eagerly.** A throw raised inside a React
  state updater runs during render and escapes the caller's `try`, so an invalid
  edge would have crashed the screen instead of explaining itself.

## Reachable from the interface

Every Tasks capability now has a control behind it.

- [x] `moveTaskToList` — list row in the task detail opens a picker.
- [x] `setTaskTags` — tag chips in the task detail; typing adds, tapping removes.
- [x] `renameTaskList` — the list name is the field, edited in place.
- [x] `setTaskReminders` — offset chips on the reminder row.

## Not in the Tasks domain

- [x] Bulk selection and partial-failure reporting (§11.3). Selection reuses each
      row's completion control, and every bulk action runs through the single-task
      command so a blocked task is still blocked in a run of twenty. Results name
      what refused: "3 of 4 — 1 blocked".
- [ ] Collaboration fields (§3.4) remain modelled and unused until sharing exists.
- [ ] Provider integration stays out of scope per the standing decision.

## Next domain

Notes is the remaining unimplemented domain in the specification. Notes are still
stored as `{ id, date, text }` and orchestrated directly by `Planner.jsx`, against a
specification that calls for versioned block content, daily notes, entity links and
backlinks, inbox processing, task extraction, revisions, and attachments.
