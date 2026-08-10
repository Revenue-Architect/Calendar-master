# Preferences, Motivation, and Persistence — Phase 3D Plan

> **For agentic workers:** Use `superpowers:executing-plans` task-by-task. Every
> behavior starts with a focused Node test and the whole repository is verified
> before publication.

**Goal:** Establish independent local preferences and an auditable motivation
ledger, then adopt both in the existing planner without altering schema-v7
Calendar, Task, or Note records.

## Constraints

- No provider, account, sync, analytics, or collaboration work.
- Do not migrate or rewrite the v7 notebook merely to move display settings.
- Task commands stay the only owner of task completion state.
- A reward is never the only evidence of completion, and never creates overdue
  debt or changes a task.
- A local store failure must not cause any other persisted aggregate to be
  replaced.

## Task 1 — Preferences model and local port

**Files:**
- Create `src/platform/preferences/preferences.js` and its test.
- Create `src/platform/persistence/preferencesStore.js` and its test.

- [x] Write failing tests for legacy fallback, normalization, independent
  versioned validation, reset groups, round-trip, and malformed JSON rejection.
- [x] Implement an immutable v1 preferences model with display, notification,
  and motivation controls, plus a separate store key and safe load/save contract.
- [x] Run the two focused tests green.

## Task 2 — Motivation ledger and read model

**Files:**
- Create `src/domains/gamification/model/ledger.js` and test.
- Create `src/domains/gamification/queries/motivationSummary.js` and test.
- Create `src/domains/gamification/index.js`.

- [x] Write failing tests for legacy balance initialization, idempotent awards,
  reversals, later re-completion, policy-versioned levels, neutral streaks, and
  disabled controls.
- [x] Implement normalized immutable entries and pure summary queries. Preserve
  source/action identity and do not import Tasks commands.
- [x] Run the focused domain tests green.

## Task 3 — Motivation persistence

**Files:**
- Create `src/platform/persistence/gamificationStore.js` and test.

- [x] Write failing tests for missing-store bootstrap, round-trip, and malformed
  data rejection.
- [x] Implement the separate `nbmp:motivation:v1` persistence contract.
- [x] Run the focused store test green.

## Task 4 — Adopt the ports at application seams

**Files:**
- Modify `src/Planner.jsx`.
- Modify the Phase 3 foundation documentation index and delivery record.

- [x] Load preferences after the notebook and persist changes independently.
- [x] Load/bootstrap the ledger after the notebook; derive the header level and
  streak from it rather than from mutable `db.xp`.
- [x] Route single and bulk completion, reopen, relevant undo/delete paths,
  import, and wipe through ledger operations. Preserve existing task command
  outcomes and UI confirmation behavior.
- [x] Add clear controls in the existing Settings sheet for motivation and
  reduced motion; settings changes must not edit planner content.
- [x] Run focused tests and build.

## Task 5 — Pressure test and publish

- [x] Run `npm test`, `npm run build`, `git diff --check`, and
  `npm audit --omit=dev --audit-level=high`.
- [x] Start the app and attempt the critical completion, reopen, disabled-control,
  settings persistence, import, and wipe flows in the available browser. Record a
  browser-policy block separately from a product pass.
- [x] Add QA evidence and a Phase 3D delivery record; commit and non-force push
  directly to `main`.
