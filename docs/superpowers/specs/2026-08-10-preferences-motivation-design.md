# Preferences, Motivation, and Persistence — Phase 3D Design

**Status:** Approved implementation design

## Outcome

Settings and motivation are application aggregates, not fields that Calendar,
Tasks, or Notes own. This slice moves their future-facing state behind separate,
versioned local ports while retaining schema-v7 planner compatibility.

## Product decisions

### Preferences

- Preferences are stored under their own v1 key. They cover theme, clock format,
  sound, notification permission intent, reduced motion, and motivation controls.
- A first load derives a safe v1 preference record from legacy v7 display fields
  (`themeId`, `clock`, `sound`, and `notifs`) without rewriting the planner
  notebook. Thereafter the preference store is canonical; legacy fields are only
  a compatibility fallback for older backups.
- A malformed preferences record is a visible storage failure, never a reason to
  overwrite a valid planner notebook. A missing record is initialized from the
  fallback once, then persisted independently.
- Changes to a preference affect future presentation or delivery only. They never
  edit existing events, tasks, notes, reminders, or imports.

### Humane motivation

- Rewards react only to successful task completion. Calendar attendance, note
  writing, and checklist toggles do not earn points.
- The motivation ledger is a separate v1 aggregate. Each immutable award has an
  explicit task source, completion key, amount, policy version, planning date,
  and timestamp. A reversal is a separate immutable entry.
- An award id is supplied by the application action. Retrying the same action is
  idempotent; reopening a task reverses its latest active award. A later new
  completion receives a new id and can earn a new award.
- Existing `xp` is imported once as an auditable `legacy-opening-balance` entry.
  It is not guessed back onto old completed tasks, so reopening an old task does
  not silently alter an untraceable balance.
- Points, levels, streaks, and celebrations can be disabled independently. Core
  task completion remains complete. Disabled points create no new award; the
  ledger remains intact for audit and for a later re-enable.
- The v1 level policy remains the established 300-point cadence. It is named and
  versioned in every new award. A streak is the count of contiguous planning days
  with at least one unreversed task-completion award; it creates no task debt.

### Persistence and recovery

- The notebook remains v7. No calendar/task/note migration is needed for this
  slice: settings and reward history have their own validated envelopes.
- Planner, reminders, preferences, and motivation save independently. A failure
  in one exposes the existing local-storage warning but cannot overwrite another.
- Import or wipe replaces planner content and starts a new motivation ledger from
  that notebook's legacy `xp` balance. Preferences remain device preferences.
- Native planner JSON continues to export the canonical notebook only. It does
  not expose device preferences or reward history; a complete-portability format
  can be specified later without conflating device and content data.

## Boundaries

| Concern | Owner | Does not own |
| --- | --- | --- |
| Theme, clock, notification intent, controls | `platform/preferences` | Planner records, browser permission APIs |
| Award and reversal history, levels, streaks | `domains/gamification` | Task status or completion mutation |
| Reading/writing local records | `platform/persistence` | Reward policy or UI state |
| Completion action orchestration | `Planner.jsx` feature seam | Canonical task rules or ledger internals |

## Explicit non-goals

- Accounts, remote sync, cross-device preference merge, analytics, social
  comparison, badges, pressure notifications, haptics, and browser-permission
  policy changes.
- A full settings redesign. The current Settings sheet adopts the new contract;
  additional preference controls are introduced only where the existing surface
  can state their effect clearly.

## Acceptance criteria

1. Preferences and motivation records validate, round-trip, and fail closed on
   malformed stored data.
2. A completion earns exactly one active award for an explicit action id; reopen
   creates an auditable reversal and a later completion can earn again.
3. The level and streak summary derives exclusively from unreversed ledger
   entries, respects controls, and never changes task status or overdue policy.
4. The existing Settings sheet reads/writes separate preferences and the header
   reads a separate motivation summary, without changing v7 canonical records.
5. Full test, production build, diff hygiene, dependency audit, and browser-flow
   attempts are recorded before publication.
