# Planner

A single-page day planner: a 24-hour timeline, an actions list with hold-to-complete
and swipe gestures, recurring events and tasks, reminders, XP/levels/streaks, and ten
themes. All state is local to the device.

## Running it

```bash
npm install
npm run dev      # dev server
npm test         # Calendar, Tasks, and shared time domain tests
npm run build    # production bundle into dist/
npm run preview  # serve the built bundle
```

## Layout

| Path | What it is |
| --- | --- |
| `src/Planner.jsx` | Presentation tree and temporary Note orchestration |
| `src/domains/calendar/` | Calendar timing, recurrence, commands, queries, migrations, layout, and tests |
| `src/domains/tasks/` | Task model, hierarchy, dependencies, planning semantics, commands, queries, and tests |
| `src/shared/time/` | Date, local date-time, interval, and IANA timezone primitives |
| `src/platform/persistence/` | Validated planner-state loading, saving, and the v6 cutover |
| `src/storage.js` | Browser/host storage adapter and the only browser storage I/O |
| `src/main.jsx` | Entry point: mounts `Planner` |
| `src/index.css` | Tailwind import plus page-level resets |

Calendar event reads and writes pass through `src/domains/calendar/index.js`.
Canonical events use all-day, floating-time, or IANA-zoned timing; recurrence and
typed exceptions remain provider-neutral.

## Storage

`src/storage.js` prefers a host-provided `window.storage` when embedded and falls
back to `localStorage`. Planner state is schema version 6 under `nbmp:state:v6`.
On first load an older notebook is validated and migrated in memory, written to v6,
read back and validated, and only then is the older key removed. A v4 notebook
upgrades straight to v6 in a single confirmed write rather than stopping at v5, so
an interrupted upgrade never strands an intermediate version on the device. There is
no dual-write period, and a failed write or confirmation leaves the previous version
untouched.

Missing storage seeds a new validated v6 notebook. Malformed or failed migration
does not seed over existing data. Writes reject on storage failure so Settings can
warn the user and preserve export as a recovery path.

## Calendar foundations

- Half-open intervals and exclusive all-day end dates.
- Cross-midnight and multi-day event segmentation.
- Floating and IANA-zoned local times with explicit DST ambiguity selection and
  rejection of skipped wall times.
- Daily, weekly, monthly, and yearly recurrence with interval, count, until,
  weekdays, month days, ordinal weekdays, leap-day policy, and bounded expansion.
- Reversible occurrence identities, typed modified/moved/cancelled/added
  exceptions, exact undo snapshots, atomic this-and-following splits, aliases, and
  orphan detection.
- Existing editor controls for end date, time basis, timezone, ambiguity offsets,
  recurrence termination, missing-date policy, next-five preview, and all three
  recurring edit scopes.

Settings can export the calendar as `.ics` or the full state as `.json`, and import a
previously exported `.json` (which replaces everything, behind a confirmation).

## Task foundations

Reads and writes for the Tasks domain pass through `src/domains/tasks/index.js`.
Planned work and deadlines are independent: planned answers when you intend to work
on something, the deadline answers when it must be finished, and only the deadline
drives overdue. Hierarchy is one subtask level over flat `parentTaskId` records, with
checklist items kept deliberately lighter than subtasks and promotable when a step
needs its own planning.

Dependencies are directed "is blocked by" edges stored once on the dependent task;
the inverse is always derived. Cycles, self-edges, and edges that duplicate the
parent/child relationship are rejected. A blocker counts as satisfied once it is
completed, cancelled, or archived, so abandoned work cannot deadlock what follows it.
Blocking is advisory: completing past an unmet blocker takes an explicit override and
is recorded on the task.

Recurring tasks are expanded on read rather than stored. Completing or reopening a
single occurrence records a typed exception so the series and its earlier history
stay intact; any other edit to one occurrence detaches it into a real one-off task.
A missed occurrence follows the series' policy — `skip` by default, so habits never
accumulate overdue debt.

## Overdue

Overdue is a fact about a deadline, not about a plan. A one-off task becomes overdue
once its deadline has passed; a task with no deadline never does, because moving
planned work is ordinary replanning rather than failure. A recurring task defers to
its missed-occurrence policy, which defaults to `skip`, so a daily habit never turns
into a column of overdue rows.

Because overdue is a deadline fact, planning overdue work for today makes it
actionable but cannot un-miss the deadline — which is why that action reads
`PLAN TODAY` and the flag persists until the task is completed or the deadline
moves.

## Keyboard

| Key   | Action              |
| ----- | ------------------- |
| `←` `→` | Previous / next day |
| `T`   | Jump to today       |
| `N`   | New event           |
| `/`   | Search              |
