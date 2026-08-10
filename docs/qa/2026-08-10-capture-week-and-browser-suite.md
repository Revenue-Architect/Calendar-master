# QA — fast capture, week interaction, and the first browser suite

- **Date:** 2026-08-10
- **Scope:** natural-language quick add, the command palette, the shortcut cheat
  sheet, the week-start preference, week-view dragging, carried undated actions,
  and the Playwright regression suite that covers them.

## Why a browser suite now

The unit suites are strong on domain rules and blind to layout, gesture, and
persistence-across-reload. The behaviour added recently is mostly the second kind:
sheets that resize as their content changes, fields that must stay in view while
being typed into, a column that collapses and has to come back after a reload, and
a press-and-hold that must not turn every scroll into a drag. None of that can be
asserted without a real layout, so none of it was covered.

`tests/e2e/` runs against the **production bundle** rather than the dev server. A
regression that only survives Vite's dev transform is not one anybody would meet.

## Automated evidence

| Suite | Result |
| --- | --- |
| `npm test` (unit) | 393 passed, 0 failed |
| `npm run test:e2e` (browser) | 33 passed, 0 failed |
| `npm run test:e2e`, second consecutive run | 33 passed, 0 failed — no flakiness |
| `npm run build` | clean |

Unit coverage added: 37 quick-add parser cases, 17 carry-forward cases, 14 palette
ranking cases, 1 week-start preference case.

## Defects found and fixed

1. **Quick add threw on commit.** `quickAddToEntry` was called from `Planner.jsx`
   without being imported. Every unit test passed and the bundle built, because
   nothing outside the browser ever executed that line. The palette's create row
   was a no-op that left the sheet open. *Found by the browser suite on its first
   real run.*

2. **A carried action could not be dropped on the timeline.** `scheduleTask`
   rejects a time on a task with no planned day — correctly, since a minute with
   no date is not a plan. But undated actions now appear on the day, so the most
   natural gesture on one was the one that threw. Dropping now plans the action
   onto the day in view and sets the minute in a single write.

3. **`[` and `]` would have stepped from a stale zoom.** The keydown handler closes
   over `zoomIn`/`zoomOut`, which read `zoom`; the effect's dependency list did not
   include it. Fixed by adding `zoom` before the shortcut shipped.

Three parser papercuts were found by adversarial input and fixed before the parser
was wired up: `#42` in "review PR #42" was read as a list name rather than an issue
number; `3pm-3pm` was read as a 24-hour event rather than a typo; and `noon-2pm`
consumed only `noon`, stranding `-2pm` in the title.

## Test-harness defects found and fixed

Worth recording, because each was a test that would have passed for the wrong
reason or failed for no reason:

- `addInitScript` cleared `localStorage` on **every** navigation, including the
  reload a test performs to prove something was persisted. Cleared once before the
  observed run instead.
- Assertions read `localStorage` immediately after a write, racing the 200 ms
  autosave debounce. Replaced with polling on the stored notebook.
- A week column is the full 24-hour height, so its centre is usually off-screen,
  where `elementFromPoint` returns nothing and a drop hits no day. Drag targets are
  now clamped to the visible strip, and sources are scrolled in before measuring.
- Playwright's `getByTestId` defaults to `data-testid`; this app's hooks are
  `data-test`. Set `testIdAttribute` rather than renaming the app's attributes.

## Pressure checks

- **Recurring occurrence drag.** A daily series seeded 30 days back, then one day
  dragged two columns over. Asserted: an exception is recorded, the series' own
  timing and rule are untouched, and the week still shows seven cards. This is the
  branch that separates "moved one day" from "moved the whole series".
- **Invalid drag gestures.** Press-hold-move on an action in the full-screen
  Actions view, where there is no timeline to drop onto: nothing is scheduled, the
  task is unchanged, and the app is still usable afterwards.
- **Press without hold.** The same movement across the week grid with a 60 ms press
  leaves every event where it was — the week stays readable by dragging across it.
- **Drop where you started.** No write, no undo entry.
- **Detail-field visibility.** Every visible field in the detail editor is focused
  in turn and asserted to be inside the sheet's own scroll viewport.
- **Parser purity.** The same line and the same `todayDate` always give the same
  draft; `todayDate` is required and validated, so a parse can never depend on the
  host clock.
- **Quick-add fuzzing.** 48 adversarial lines (empty sigils, `24:00`, `12:60`,
  `13/13`, `1441m`, a 500-character title, repeated tokens) produce no exception and
  no out-of-range field.

## Known limitations

- One browser engine. The suite runs Chromium only; the touch paths
  (`touchstart`/`touchmove` on week cards, the delegated stream listeners) are
  exercised by code review and the existing mouse-path tests, not by a real touch
  device. WebKit and a device lab remain the gap.
- The suite asserts geometry and persisted state, not appearance. It can prove the
  pill indicator has a real width inside its row; it cannot prove it looks right.

## Carried over, not addressed

`Planner.jsx:838` (the agenda) reads events through the raw
`getOccurrencesForRange` rather than `getVisibleOccurrencesForRange`, which
`.agents/memory/calendar-read-projections.md` names as the rule for any surface a
user sees. `domains/planner/queries/dayAggregate.js` composes from the raw query
too. Neither has a visible effect today, because a notebook holds exactly one
always-visible calendar and there is no calendar-management surface. Both become
real the moment multiple calendars or a provider sync exist: the day view and the
agenda would show events from hidden, archived and disconnected calendars that the
week grid and month peek correctly leave out. Left alone deliberately — it is
outside this change and changing it alters behaviour nobody asked to change.
