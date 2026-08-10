# Shared Planner Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the non-provider product foundation by composing Calendar, Tasks,
and Notes through pure read models and application workflows, then layering
reminders, search, settings, and review surfaces without giving `Planner.jsx`
ownership of canonical rules.

**Architecture:** Domains continue to own their records and commands. New `domains/planner`,
`domains/reminders`, `domains/search`, and `domains/gamification` modules only produce
projections or command outcomes; they do not persist Calendar, Task, or Note records.
The React shell supplies time, identifiers, storage, and UI state, while feature adapters
translate a deliberate user action into one domain command at a time.

**Tech Stack:** React 19, JavaScript ES modules, Node 24 built-in test runner, Vite 7,
local-first browser persistence. No provider SDKs or remote APIs.

## Global Constraints

- Preserve schema-v7 compatibility until a migration is explicitly tested and committed.
- Keep Google and Microsoft integration, shared calendars, collaboration, and cloud sync out
  of scope; ports may be introduced but must have no provider dependency.
- A projection never becomes a persisted duplicate of a source record.
- Cross-domain writes require an idempotency key and preserve source-domain identity.
- New behavior is introduced test-first, with focused red/green evidence before integration.
- Every completed slice runs `npm test`, `npm run build`, and `git diff --check` before a
  non-forced push to `main`.

## Delivery order

| Slice | Product contract covered | Why it comes here |
| --- | --- | --- |
| 3A. Day composition and review | §1, §1.2, §1.4, §1.5 | Completed 2026-08-10. One authoritative day query removes duplicated UI calculations and gives later modules stable inputs. |
| 3B. Reminder engine | §2 | Completed 2026-08-10. Reminder intent is already modeled by events/tasks; scheduling and delivery state belong outside both. |
| 3C. Unified search and deep links | §3 | Completed 2026-08-10. Search consumes domain projections and source-owned occurrence identities without owning content. |
| 3D. Preferences, motivation, and persistence ports | §4–6, §8 | Completed 2026-08-10. Versioned local aggregates now separate device settings and reward history from the v7 notebook. |
| 3E. Calendar projections | Calendar §1, §8–10 and later Phase 2 | Completed 2026-08-10. Visibility, availability, conflicts, free slots, and factual briefings reuse canonical occurrences. |
| 3F. Notes completion | Notes §6, §8–13 | Inbox processing, templates, tags, portability, and attachments build on the shipped notebook/backlink layer. |
| 3G. Accessibility, diagnostics, and security hardening | §9–11 | Cross-cutting contracts are verified once every core surface has a bounded owner. |

Slices 3A–3E are delivered. Each later slice receives its own detailed plan before
code changes, so its product choices stay reviewable and its test boundary stays small.

## Slice 3A file map

- Create: `src/domains/planner/queries/dayAggregate.js` — compose a date from source-domain
  query results, preserving type and canonical IDs.
- Create: `src/domains/planner/queries/dayAggregate.test.js` — pure projection, identity,
  selected-day, and graceful-unavailable-section coverage.
- Create: `src/domains/planner/queries/review.js` — daily review projection that reports
  factual completion, unfinished work, notes, and an explicit unavailable variance state.
- Create: `src/domains/planner/queries/review.test.js` — deterministic review behavior.
- Create: `src/domains/planner/index.js` — public shared-planner query API.
- Create: `src/features/planner/dayProjection.js` — UI-safe adapter from v7 state and visible
  clock values to the shared query contract.
- Create: `src/features/planner/dayProjection.test.js` — integration seam coverage.
- Modify: `src/Planner.jsx` — consume the adapter for the selected day, current-day next
  event, overdue debt, daily note, and deadline projection; presentation stays in place.
- Modify: `docs/product/planner-foundation.md` — record the delivered boundary and explicit
  schedule-variance limitation until an attendance model exists.

### Task 1: Define the pure day aggregate

**Interfaces:**

- Consumes `state = { events, overrides, tasks, taskExceptions, notes }` and
  `{ selectedDate, todayDate, currentMinute, viewerTimeZone? }`.
- Produces `getDayAggregate(state, context)` with `{ date, isToday, events, tasks,
  dailyNote, notes, overdue, nextEvent, sections }`.
- Each item retains its source ID; `sections.<name>` is `{ status: "available", items }`
  or `{ status: "unavailable", reason }`.

- [x] **Step 1: Write failing aggregate tests**

  Add a state fixture containing a timed event, a planned task, an overdue task, a daily
  note, and a standalone dated note. Assert selected-day events/tasks/notes are returned,
  only the actual current day exposes `nextEvent`, and every returned item retains its
  canonical identity. Assert omitted source collections yield an unavailable section rather
  than throwing away available sections.

- [x] **Step 2: Verify the focused test fails**

  Run: `node --test src/domains/planner/queries/dayAggregate.test.js`

  Expected: FAIL because the shared Planner query module does not exist.

- [x] **Step 3: Implement the minimal aggregate**

  Use `getEventsForDay`, `getDayTasks`, `getOverdueForToday`, `getDailyNote`, and
  `getNotesForDate`. Wrap each source read independently, preserving successful sections;
  only call `getNextEvent` when `selectedDate === todayDate`.

- [x] **Step 4: Verify aggregate tests pass**

  Run: `node --test src/domains/planner/queries/dayAggregate.test.js`

  Expected: PASS.

### Task 2: Define daily review without inventing attendance data

**Interfaces:**

- Consumes the aggregate plus `{ todayDate }`.
- Produces `getDailyReview(state, dateKey, { todayDate })` with completed work, unfinished
  planned work, notes, event count, and `scheduleVariance: { status: "unavailable" }`.

- [x] **Step 1: Write failing review tests**

  Cover completed one-off and recurring tasks, unfinished scheduled work, the day note, and
  the explicit unavailable variance state. Confirm an empty day returns empty arrays rather
  than synthetic accomplishments.

- [x] **Step 2: Verify the focused test fails**

  Run: `node --test src/domains/planner/queries/review.test.js`

  Expected: FAIL because the review query does not exist.

- [x] **Step 3: Implement the factual review projection**

  Reuse domain queries and task completion history. Do not infer event attendance or claim
  schedule variance from a calendar entry merely existing.

- [x] **Step 4: Verify review tests pass**

  Run: `node --test src/domains/planner/queries/review.test.js`

  Expected: PASS.

### Task 3: Adopt the shared read model at the UI seam

**Interfaces:**

- `projectPlannerDay(state, context)` delegates to `getDayAggregate` and returns only
  display-safe derived values; it never changes state.
- `Planner.jsx` consumes one memoized day projection instead of independently recomputing
  events, tasks, daily note, overdue debt, deadlines, and next event.

- [x] **Step 1: Write failing adapter tests**

  Assert the adapter projects a v7 state for a selected past day without a `nextEvent`, and
  for today with the next timed event. Assert malformed/missing optional source arrays are
  surfaced as unavailable sections rather than exceptions.

- [x] **Step 2: Verify the focused test fails**

  Run: `node --test src/features/planner/dayProjection.test.js`

  Expected: FAIL because the adapter does not exist.

- [x] **Step 3: Implement the adapter and wire `Planner.jsx`**

  Keep event layout and interaction handlers untouched. Replace duplicated read calculations
  only; source mutations remain with existing calendar/task/note command calls.

- [x] **Step 4: Verify focused tests pass**

  Run: `node --test src/domains/planner/queries/dayAggregate.test.js src/domains/planner/queries/review.test.js src/features/planner/dayProjection.test.js`

  Expected: PASS.

### Task 4: Complete the Slice 3A contract and publish

- [x] **Step 1: Run complete automated verification**

  Run: `npm test && npm run build && git diff --check`

  Expected: all tests pass, Vite exits 0, and no whitespace errors are reported.

- [x] **Step 2: Inspect the UI in a browser**

  Verify selected past day, today with next event, no-event day, daily note, overdue work,
  task completion, and event inspector flows. Record any environment limitation separately
  from product defects.

- [x] **Step 3: Update the foundation delivery record**

  Record that the aggregate and review are query projections, that no duplicate source data
  is persisted, and that schedule variance awaits an explicit attendance model.

- [x] **Step 4: Commit and fast-forward `main`**

  Commit only the listed Slice 3A files and publish using a non-forced fast-forward.

## Self-review

- Coverage: Slice 3A covers the first approved shared-platform capability and its daily
  review boundary. Subsequent independent systems remain explicitly sequenced above.
- No placeholders: every production file, public function, test target, and verification
  command is named.
- Consistency: the aggregate consumes existing public Calendar, Tasks, and Notes query APIs;
  no domain imports persistence from another domain.
