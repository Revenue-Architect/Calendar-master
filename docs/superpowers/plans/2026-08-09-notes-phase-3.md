# Notes Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Notes into a findable notebook by exposing All/Pinned/Archived,
standalone capture, and event/task contextual notes with derived backlinks.

**Architecture:** The Notes domain remains the sole owner of note metadata and
links. Pure queries project notebook views and resolve entity links; Planner only
creates command inputs and renders sheets. Event occurrence links retain the
series identity plus date, while task links use the canonical task identity.

**Tech Stack:** React 19, JavaScript ES modules, Vite 7, Node built-in test runner.

## Global constraints

- Preserve schema v7 compatibility and the default system notebook.
- Do not add provider integration, notebook CRUD, folders, attachments, or sharing.
- Keep revisions and link relationships intact through pin/archive/delete/undo.
- Write behavior tests before production changes; run the complete test and build
  gates before publishing to `main`.

## File map

- `src/domains/notes/queries/noteQueries.js`: notebook-view and occurrence-aware
  contextual note queries.
- `src/domains/notes/commands/noteCommands.js`: archive/pin operations already
  compose metadata changes; retain their identity/revision guarantees.
- `src/domains/notes/tests/notes.test.js`: domain regression coverage for the new
  view and link semantics.
- `src/domains/notes/tests/shorthand.test.js`: block-identity regression coverage.
- `src/Planner.jsx`: notebook sheet, standalone editor, metadata actions, and
  event/task backlink surfaces.
- `docs/product/planner-foundation.md`: approved product contract.
- `docs/qa/2026-08-09-notes-phase-3-pressure-test.md`: final browser and manual
  evidence.

## Task 1: Define query and identity contracts

- [x] Write failing tests for `getNotebookNotes(notes, view)` over all, pinned,
  and archived notes; `getNotesForEntity` with a recurring-event occurrence date;
  and a task link using the canonical task ID.
- [x] Run `node --test src/domains/notes/tests/notes.test.js` and confirm the new
  tests fail because the APIs are absent or cannot distinguish occurrence links.
- [x] Implement the minimal pure query API, export it from `domains/notes`, and
  preserve existing callers' behavior.
- [x] Run the focused Notes tests.

## Task 2: Repair shorthand identity matching

- [x] Write a failing test that inserts or deletes same-type blocks around an
  extracted checklist without transferring the extracted task reference to new
  content.
- [x] Run `node --test src/domains/notes/tests/shorthand.test.js` and confirm the
  current position-only matching fails the test.
- [x] Match stable block IDs by a conservative type-and-content identity before
  allocating a new ID, while preserving unknown attributes for the matched block.
- [x] Re-run focused shorthand and Notes tests.

## Task 3: Ship the notebook and contextual-note surfaces

- [x] Add the notebook entry point, All/Pinned/Archived tabs, standalone-note
  creation, title editing, pin/archive/restore actions, and contextual metadata.
- [x] Add derived note sections plus `NEW NOTE` actions to event and task detail
  views. For recurring events construct `{ type: "event", targetId: seriesId,
  occurrenceDate }`; for tasks construct `{ type: "task", targetId: seriesId }`.
- [x] Ensure closing/opening sheets cannot leave an interaction behind the modal
  active and keep deletion undo carrying note revisions.
- [x] Run `npm test` and `npm run build`.
  pass.

## Task 4: Pressure-test and publish

- [x] Build production assets and attempt browser interaction for standalone
  capture, pin/archive/restore, event/task creation, backlink opening, reload, and
  mobile sheet behavior. Record real console/page errors separately from expected
  blocked haptic/audio notices.
- [x] Run `npm test && npm run build && git diff --check`, inspect `git status`,
  and document results in the QA report.
- [ ] Commit documentation and QA evidence, then fast-forward `main` to the
  verified commit and push without force.

## Phase boundary

Phase 3 completes the highest-value local Notes workflow. The next Notes work is
intentionally unnumbered until product priority is chosen: inbox processing,
templates/resurfacing, notebook CRUD/folders, attachments, or conflict handling.

## Delivery record

Implemented on 2026-08-09. The Notes query layer now exposes derived notebook
views and occurrence-aware backlinks; the UI adds the notebook sheet, standalone
capture, pin/archive/restore, and event/task contextual note actions. The review
also repaired shorthand identity reuse so inserted content cannot inherit a task
extraction reference. Final automated and build evidence is recorded in
[`../../qa/2026-08-09-notes-phase-3-pressure-test.md`](../../qa/2026-08-09-notes-phase-3-pressure-test.md).
