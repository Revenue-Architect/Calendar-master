# Calendar Availability, Conflict, and Briefing — Phase 3E Plan

> **For agentic workers:** Use `superpowers:executing-plans` task-by-task. Start
> every behavior with a focused Node test and publish only after the whole suite.

**Goal:** Add pure calendar visibility, busy-interval, conflict, free-slot, and
briefing projections atop canonical event occurrence queries.

## Constraints

- No provider, account, remote free/busy, travel time, attendance, or automatic
  scheduling features.
- Preserve canonical IDs, recurrence exceptions, and half-open interval semantics.
- Derived projections never become persisted event/task copies.
- Hidden/inactive calendars cannot influence availability unless an explicit future
  policy changes that contract.

## Task 1 — Visibility and busy intervals

**Files:** create `src/domains/calendar/queries/planningQueries.js` and its test;
modify `src/domains/calendar/index.js`.

- [x] Write failing tests for visible filtering, inactive/hidden exclusion,
  include-in-availability policy, recurring and moved occurrences, and all-day
  context.
- [x] Implement source-owned visible occurrence and timed busy interval queries.
- [x] Run the focused test green.

## Task 2 — Conflicts, free slots, and briefings

**Files:** modify the planning query and its test.

- [x] Write failing tests for half-open conflict boundaries, overlapping recurring
  occurrences, deterministic free slots, and factual briefing output.
- [x] Implement pure conflict, free-slot, and briefing queries using Task 1 reads.
- [x] Run the focused test green.

## Task 3 — Contract, QA, and publish

- [x] Add design, product delivery record, documentation index, and QA evidence.
- [x] Run `npm test`, `npm run build`, `git diff --check`, and
  `npm audit --omit=dev --audit-level=high`.
- [x] Attempt calendar visibility, conflict, and free-slot flows in the available
  browser; record an environment limitation separately from a product pass.
- [x] Commit and non-force publish directly to `main`.
