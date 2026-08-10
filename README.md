# Planner

A single-page day planner: a 24-hour timeline, an actions list with hold-to-complete
and swipe gestures, recurring events and tasks, reminders, XP/levels/streaks, and fifteen
themes. All state is local to the device.

## Running it

```bash
npm install
npm run dev       # dev server
npm test          # domain, feature, and platform unit tests (node --test)
npm run test:e2e  # browser regression suite (Playwright, against the built bundle)
npm run test:all  # both
npm run build     # production bundle into dist/
npm run preview   # serve the built bundle
npm run build:artifact  # one self-contained HTML file of the whole app
```

The browser suite needs Chromium once: `npx playwright install chromium`. Where an
image already ships one that this Playwright did not install, point at it with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`.

## Layout

| Path | What it is |
| --- | --- |
| `src/Planner.jsx` | Presentation tree |
| `src/domains/calendar/` | Calendar timing, recurrence, commands, queries, migrations, layout, and tests |
| `src/domains/notes/` | Note documents, blocks, links, system views, search, and tests |
| `src/domains/tasks/` | Task model, hierarchy, dependencies, planning semantics, commands, queries, and tests |
| `src/shared/time/` | Date, local date-time, interval, and IANA timezone primitives |
| `src/platform/persistence/` | Validated planner-state loading, saving, and the v7 cutover |
| `src/storage.js` | Browser/host storage adapter and the only browser storage I/O |
| `src/features/planner/` | Presentation-safe projections: day, week, slots, quick add, palette, carry-forward |
| `src/main.jsx` | Entry point: mounts `Planner` |
| `src/index.css` | Tailwind import plus page-level resets |
| `tests/e2e/` | Browser regression suite for the flows unit tests cannot reach |
| `build-artifact.mjs` | Inlines the built bundle into a single shareable HTML file |

Calendar event reads and writes pass through `src/domains/calendar/index.js`.
Canonical events use all-day, floating-time, or IANA-zoned timing; recurrence and
typed exceptions remain provider-neutral.

## Storage

`src/storage.js` prefers a host-provided `window.storage` when embedded and falls
back to `localStorage`. Planner state is schema version 8 under `nbmp:state:v8`.
On first load an older notebook is validated and migrated in memory, written,
read back and validated, and only then is the older key removed. Whatever
version is on the device upgrades straight to v8 in a single confirmed write, so an
interrupted upgrade never strands an intermediate version. There is
no dual-write period, and a failed write or confirmation leaves the previous version
untouched.

Missing storage seeds a new validated v8 notebook. Malformed or failed migration
does not seed over existing data. Writes reject on storage failure so Settings can
warn the user and preserve export as a recovery path.

Display preferences, the motivation ledger, and local diagnostics live in their own
stores beside the notebook, so changing a theme or a clock never rewrites records.

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
is recorded on the task. Dependencies are authored from the task inspector, and
planning work before its blockers are expected to land raises a warning without
preventing it.

Work is organised by one list per task plus tags that cut across lists, and read
through ten named smart views — Today, Inbox, Upcoming, Deadlines, Overdue, Waiting,
Someday, Unscheduled, Completed, All — which are queries rather than containers.
Task reminders anchor to the planned time, deadline, or follow-up date and move with
the task when it is rescheduled.

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

## Day view

Hour labels sit in a fixed gutter, centred on the rule they name and without
`:00` — a rail mark is not a timestamp. Depth comes from alternating hour bands
rather than a hairline per hour, and the events lane is inset so no card touches a
rule. The clock is a display preference in 12-hour or 24-hour form; it changes
labels only, since minutes since midnight remain the stored representation.

Opening an event or action shows its title, time and day centred, two figures drawn
from the item itself, and one pill per attribute. Attributes with no value are
omitted rather than shown empty, and the view never displays a figure the app has no
source for.

## Notes

A note is a document of identified blocks, not a string: task extraction and links
reference a block id, which a text offset could not survive. Notes are daily, tied to
an event or task, or standalone, and a day has exactly one daily note — writing on a
day that already has one edits it. Checklist blocks can become real actions, and a
line that has been extracted records which task it produced so it cannot spawn a
second. Saving something unchanged does not bump the revision.

## Week

Seven day columns against one shared time axis, so a week is read as one shape
rather than seven days in sequence. Reads go through the calendar domain's
visible-occurrence projection, and free/busy — find-a-slot, the month heatmap —
through the availability projection, so a hidden calendar is absent and a
non-availability calendar shows its events without ever blocking a slot.

A card is moved by pressing and holding it, then dragging: the column under the
pointer decides the day and the pointer's height decides the time, so a move can
change both at once. A press without a hold still scrolls, and a tap still opens.
Dragging one day of a repeating event detaches that day as an exception and leaves
the series where it is.

Week starts on Sunday or Monday — a display preference under Settings that moves
the month grid, the week's first column, and the weekday chips together.

## Agenda

The timeline answers "when, and for how long"; the agenda answers "what is coming".
Both read the same days through the same domain queries, so an occurrence, an
exception or a missed habit behaves identically in either. Days stack down one rail
with today outlined, empty days included — the gap is what shows the shape of a
week. Each entry carries its category dot, its title, and one trailing value: a start
time, `ALL DAY`, or `ACTION` for unscheduled work. Opening an entry moves to its day
first, so the detail is always read in context.

## Capture

The composer is thorough; quick add is fast. `⌘K` (or `/`) opens one input over
both the things you have and the things you can do:

- **A whole line becomes a record.** `Lunch w/ Sara Tue 1pm 45m` is an event on
  Tuesday at 13:00 for 45 minutes. Whatever the parser does not recognise stays in
  the title, so nothing is silently dropped, and the palette shows what it read
  before you commit it. A time makes it an event; without one it is an action.
  `todo:` and `event:` force the kind either way.
- **Days**: `today`, `tonight`, `tomorrow`, `tue`, `next fri`, `in 3 days`,
  `jan 15`, `15 jan`, `3/14`, `2026-03-14`.
  **Times**: `1pm`, `13:00`, `9:30am`, `noon`, `1-2pm`, `9:00-10:30`.
  **Durations**: `45m`, `90min`, `1h`, `1.5h`.
  **Actions also take**: `by friday` / `due jan 9`, `#list`, `@tag`.
- **Anything it cannot finish opens the composer prefilled** with what did parse,
  so an unusual line costs a click rather than the typing.
- **Commands** live in the same list: new event, new action, jump to today, the
  four views, switch theme, 12/24-hour clock, week start, settings, shortcuts.

## Actions without a day

An action with no planned date is not an action for no day — it is work still
owed. It stands on today and on every day ahead until it is completed, cancelled,
given a planned date, or given a deadline; it never appears in the past, and one
with a deadline is left to Deadlines and Overdue rather than shown twice. Dropping
one on the timeline plans it for the day in view and the minute it landed on.

## Keyboard

Press `?` in the app for this list.

| Key       | Action                                            |
| --------- | ------------------------------------------------- |
| `←` `→`   | Previous / next day                               |
| `T`       | Jump to today                                     |
| `[` `]`   | Zoom out / in — day, week, month                  |
| `N`       | New event                                         |
| `A`       | New action                                        |
| `⌘K` `/`  | Search, run a command, or type to create          |
| `C`       | Complete the first open action                    |
| `D`       | Defer the first open action by a day              |
| `⌘Z`      | Undo the last change                              |
| `?`       | Shortcut cheat sheet                              |
| `Esc`     | Close whatever is open                            |

Shortcuts are ignored while a field has focus, and while any sheet is open.
