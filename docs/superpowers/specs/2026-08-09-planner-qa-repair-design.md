# Planner QA Repair Design

**Status:** Approved

## Purpose

Repair the state-corruption and broken-flow defects found while reviewing the
post-calendar implementation. The work is intentionally narrow: it makes the
implemented calendar, task, note, search, portability, and recovery flows reliable
without redesigning the interface or expanding provider integrations.

## Confirmed failures

1. JSON import routes schema v7 through the v4 migrator and stops v4-v6 imports
   before v7. Importing an export can therefore fail or create unsaveable state.
2. Starting a blank notebook produces schema-v5 state, which the v7 store rejects.
3. Search renders task dates from a removed top-level field and can throw while
   displaying a task result. Search also closes without opening a selected note.
4. Undo for task day moves and pull-in planning restores a removed top-level field,
   leaving the canonical `planned.date` unchanged.
5. Bulk task actions bypass occurrence-aware behavior. Completing a recurring
   occurrence changes the series row rather than recording an occurrence exception;
   deleting a series can leave task exceptions and note extraction references
   behind, causing v7 validation and future saves to fail.
6. Editing note text reconstructs blocks without preserving extraction metadata or
   unknown block attributes, allowing an extracted line to create another task.
7. Undoing a task deletion restores the task but not the note block reference that
   identified the extracted task.

## Design

### Persistence normalization

Add a persistence-boundary module that accepts supported planner states and returns
validated schema-v7 state. It owns version dispatch for v4, v5, v6, and v7. Unknown
versions and malformed notebooks fail before the replacement confirmation is shown.
Blank-notebook creation uses the same boundary, preserving theme, sound, notification,
and clock preferences while producing valid empty v7 collections.

### Search projection

Add a search projection module that converts canonical events, tasks, and notes into
display-safe results. Every result has an explicit optional date, display label, and
deep-link target. Unplanned tasks and standalone notes use a stable non-date label
instead of entering date formatting. Selecting a daily note opens that note; selecting
an undated note opens it without changing the current day.

### Note text round-trip

Add a note text adapter that converts blank-line-separated text back to blocks while
preserving the existing block identity, type, checklist state, extraction reference,
and unknown attributes at the same position. New paragraphs receive supplied IDs.

### Task mutations and recovery

Add a planner-state task action module for UI-level transactions that span Tasks and
Notes. It will:

- restore one or many canonical `planned.date` values;
- complete recurring occurrences by writing typed completion exceptions;
- detach and defer a recurring occurrence using the same semantics as the single-item
  path;
- cascade bulk series deletion through children, dependencies, task exceptions, and
  note extraction references;
- return a full recovery snapshot for destructive bulk actions and note-reference
  metadata for single-task undo.

The UI remains responsible for feedback, confirmation, selection, sounds, and XP.
Domain and cross-domain mutation logic stays pure and testable outside React.

## Error handling

- Import rejects unsupported or invalid data without changing current state.
- Bulk actions report partial failures and commit only successful item mutations.
- A deletion cannot return state that fails schema-v7 validation.
- Undo restores the exact canonical fields and cross-domain references removed by the
  original operation.

## Verification

Each defect receives a regression test that fails against the current behavior before
production code is added. The final gate is:

1. focused regression tests;
2. complete `npm test` suite;
3. `npm run build`;
4. `git diff --check`;
5. local-browser flows covering event creation/editing, recurring scope selection,
   task creation/completion/defer/delete/undo, bulk recurring actions, note editing and
   extraction, search deep links, JSON export/import, blank notebook creation, reload
   persistence, agenda navigation, settings, keyboard operation, and console errors.

## Non-goals

- Google or Outlook integration.
- A broad `Planner.jsx` rewrite.
- New product capabilities or visual redesign.
- Claiming full WCAG compliance; browser checks cover obvious keyboard, label, focus,
  contrast, and reflow risks only.
