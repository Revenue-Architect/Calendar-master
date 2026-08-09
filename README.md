# Planner

A single-page day planner: a 24-hour timeline, an actions list with hold-to-complete
and swipe gestures, recurring events and tasks, reminders, XP/levels/streaks, and ten
themes. All state is local to the device.

## Running it

```bash
npm install
npm run dev      # dev server
npm test         # Calendar domain and shared time tests
npm run build    # production bundle into dist/
npm run preview  # serve the built bundle
```

## Layout

| Path | What it is |
| --- | --- |
| `src/Planner.jsx` | Current presentation tree and temporary Task/Note orchestration |
| `src/domains/calendar/` | Calendar timing, recurrence, commands, queries, migrations, layout, and tests |
| `src/domains/tasks/` | Task model, hierarchy, dependencies, planning semantics, commands, queries, and tests |
| `src/shared/time/` | Date, local date-time, interval, and IANA timezone primitives |
| `src/platform/persistence/` | Validated planner-state loading, saving, and v4-to-v5 cutover |
| `src/storage.js` | Browser/host storage adapter and the only browser storage I/O |
| `src/main.jsx` | Entry point: mounts `Planner` |
| `src/index.css` | Tailwind import plus page-level resets |

Calendar event reads and writes pass through `src/domains/calendar/index.js`.
Canonical events use all-day, floating-time, or IANA-zoned timing; recurrence and
typed exceptions remain provider-neutral. Task recurrence temporarily retains its
legacy representation until the Tasks domain is extracted.

## Storage

`src/storage.js` prefers a host-provided `window.storage` when embedded and falls
back to `localStorage`. Planner state is schema version 5 under `nbmp:state:v5`.
On first load, a complete v4 state is validated and migrated in memory, written to
v5, read back and validated, and only then is `nbmp:state:v4` removed. There is no
dual-write period. A failed v5 write or confirmation leaves v4 untouched.

Missing storage seeds a new validated v5 notebook. Malformed or failed migration
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

`Planner.jsx` still reads the legacy task fields; the persistence cutover and
interface adoption are Tasks Phase 2.

## Overdue vs. recurring

Overdue means unfinished work that still carries a debt, so it counts one-off tasks
only. A missed day of a recurring task is not a debt — you don't owe yesterday's walk
on top of today's, and today's instance is already on the page — so recurring
instances are excluded, matching how deadlines already treat them. The streak carries
the "did you keep it up" signal instead. This also keeps the OVERDUE count and the
PULL IN button in agreement: everything counted is something the button can move.

## Keyboard

| Key   | Action              |
| ----- | ------------------- |
| `←` `→` | Previous / next day |
| `T`   | Jump to today       |
| `N`   | New event           |
| `/`   | Search              |
