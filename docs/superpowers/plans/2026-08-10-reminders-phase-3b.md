# Reminders Phase 3B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace session-only reminder firing with a local-first reminder ledger
that derives schedules from existing Calendar and Task intent, delivers in-app
notifications safely, and supports snooze, dismissal, restart recovery, and audit
state without changing source-domain ownership.

**Architecture:** Calendar `alerts` and Task `reminders` remain intent fields. The
Reminders domain derives deterministic intent keys from visible occurrences and stores
only delivery records in its own persistence key. Reconciliation supersedes changed
schedules, cancels removed near-term sources, and never mutates events or tasks.
The UI consumes due records and maps delivery outcomes back through reminder commands.

**Tech Stack:** React 19, JavaScript ES modules, Node built-in test runner, Vite 7,
existing browser storage port. No provider integration or system background scheduler.

## Global constraints

- Preserve planner state schema v7; reminder records are a separate platform aggregate.
- Event `alerts` and task `reminders` are source intent, never delivery state.
- Each schedule is idempotent by source identity, occurrence identity, intent identity,
  and resolved local delivery time.
- In-app delivery is the baseline. A browser-notification failure cannot mutate its
  source record or erase a successful in-app delivery.
- Reconciliation may schedule future work and mark changed/deleted near-term work,
  but must not flood stale reminders after restart.
- Add failing behavior tests before production code; publish only after complete test,
  build, source-hygiene, and browser-attempt evidence.

## File map

- Create: `src/domains/reminders/model/reminder.js` — statuses, normalization,
  deterministic identities, and lifecycle validation.
- Create: `src/domains/reminders/queries/reminderIntents.js` — derive event/task
  intents from Calendar/Tasks query APIs and resolve local delivery times.
- Create: `src/domains/reminders/commands/reminderCommands.js` — reconcile,
  deliver, snooze, dismiss, and mark a channel failure.
- Create: `src/domains/reminders/queries/reminderQueries.js` — due, active, and
  audit projections.
- Create: `src/domains/reminders/index.js` and behavior tests under
  `src/domains/reminders/tests/`.
- Create: `src/platform/persistence/reminderStore.js` and tests — independent
  local storage load/save with malformed-data protection.
- Modify: `src/Planner.jsx` — load/save separate ledger, replace `firedRef` logic,
  render baseline toast controls, and clear delivery state when replacing all data.
- Modify: `docs/product/planner-foundation.md`, `docs/README.md`, and a QA report.

### Task 1: Model a deterministic reminder ledger

- [x] Write failing tests for status normalization, deterministic schedule identity,
  duplicate-source idempotency, and rejection of invalid local date-times.
- [x] Run `node --test src/domains/reminders/tests/reminder.test.js` and confirm it
  fails because the module is absent.
- [x] Implement reminder records with status in `scheduled`, `delivered`, `snoozed`,
  `dismissed`, `cancelled`, `failed`, or `superseded`; retain attempt count, last error,
  source identity, source label, scheduled time, and audit timestamps.
- [x] Run the focused model test.

### Task 2: Derive Calendar and Task intent and reconcile schedules

- [x] Write failing tests for a timed event alert, a recurring event occurrence, a
  planned task reminder, a deadline-anchored unplanned task, a moved schedule that
  supersedes the active prior record, and a removed near-term record that cancels.
- [x] Run `node --test src/domains/reminders/tests/reminderIntents.test.js` and
  confirm the missing-module failure.
- [x] Derive intent from public Calendar and Task query APIs, resolve anchors with
  shared local-time primitives, and reconcile a bounded 14-day horizon. Keep all-day
  events out of baseline delivery because they have no user-selected minute.
- [x] Re-run the focused intent and command tests.

### Task 3: Deliver and control reminders safely

- [x] Write failing tests for due-window delivery, a three-item delivery cap, snooze,
  dismissal, and stale schedules that remain non-deliverable after restart.
- [x] Run `node --test src/domains/reminders/tests/reminderCommands.test.js` and
  confirm the missing behavior.
- [x] Implement pure delivery commands. A snooze changes only the reminder record;
  dismissing an occurrence never rewrites recurrence or source intent.
- [x] Re-run focused Reminder tests.

### Task 4: Persist and adopt the ledger

- [x] Write failing persistence tests for missing state, round-trip state, malformed
  state rejection, and an unwritable port.
- [x] Run `node --test src/platform/persistence/reminderStore.test.js` and confirm
  the missing-module failure.
- [x] Implement independent `nbmp:reminders:v1` load/save functions. Wire Planner
  to reconcile after canonical state/time changes, deliver due records in-app, expose
  SNOOZE and DISMISS on the reminder toast, and leave source data unchanged.
- [x] Re-run focused Reminder and persistence tests.

### Task 5: Verify, document, and publish

- [x] Run `npm test && npm run build && git diff --check`.
- [x] Attempt today event reminder, task reminder, snooze, dismissal, restart, and
  browser-notification permission flows in a browser; record any environment block.
- [x] Update the foundation and QA evidence, commit, and fast-forward `main` without force.

## Product decision

Phase 3B does not falsely promise background delivery while the browser is closed.
It provides durable in-app scheduling and reconciliation, with system notifications
as a permission-gated best effort while the application is running. A service-worker
or native scheduler remains a future platform adapter, not a hidden requirement of
the Calendar or Tasks domains.
