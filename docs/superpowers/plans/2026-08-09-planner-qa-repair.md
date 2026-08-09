# Planner QA Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed and pressure-tested on 2026-08-09. See the
[QA report](../../qa/2026-08-09-claude-implementation-pressure-test.md) for findings
and verification evidence.

**Goal:** Repair the confirmed persistence, search, note, recurring-task, bulk-action, and undo defects without broadening product scope or deepening the Planner monolith.

**Architecture:** Put version conversion at the persistence boundary, search and note conversion in focused feature adapters, and cross-domain task mutations in a pure planner action module. `Planner.jsx` keeps presentation state and delegates canonical transformations to those modules.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, Vite 7, local Chromium automation.

## Global Constraints

- All persisted state must validate as schema v7 before replacement or save.
- Calendar timing and recurrence remain canonical and unchanged.
- Recurring task occurrences are represented by exceptions, never stored copies unless an occurrence is deliberately detached.
- Undo restores canonical fields and cross-domain references, not reconstructed legacy fields.
- No Google or Outlook integration and no visual redesign.
- Work is executed directly on `main` under the user's standing authorization.

---

### Task 1: Persistence import and blank-state boundary

**Files:**
- Create: `src/platform/persistence/plannerStateImport.js`
- Create: `src/platform/persistence/plannerStateImport.test.js`
- Modify: `src/Planner.jsx`

**Interfaces:**
- Produces: `normalizeImportedPlannerState(input)` returning validated schema-v7 state.
- Produces: `createBlankPlannerState(preferences)` returning validated empty schema-v7 state.

- [ ] **Step 1: Write failing import tests**

Cover literal v7 pass-through, v6/v5/v4 migration to v7, rejection of unknown versions, rejection of invalid v7, and creation of an empty v7 notebook that preserves `themeId`, `sound`, `notifs`, and `clock`.

- [ ] **Step 2: Verify the tests fail for the missing module**

Run: `node --test src/platform/persistence/plannerStateImport.test.js`

Expected: FAIL because `plannerStateImport.js` does not exist.

- [ ] **Step 3: Implement version dispatch and validation**

Use this branch contract:

```js
export function normalizeImportedPlannerState(input) {
  const version = input?.schemaVersion ?? 4;
  if (version === 7) return validatePlannerStateV7(input);
  if (version === 6) return migrateV6ToV7(validatePlannerStateV6(input));
  if (version === 5) return migrateV6ToV7(migrateV5ToV6(validatePlannerStateV5(input)));
  if (version === 4) return migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(input)));
  throw new Error(`unsupported planner schema version ${version}`);
}
```

Build blank state from the legacy empty shape and pass it through the same complete
migration chain.

- [ ] **Step 4: Verify focused tests pass**

Run: `node --test src/platform/persistence/plannerStateImport.test.js`

Expected: PASS.

- [ ] **Step 5: Wire JSON import and blank-notebook creation**

Replace the inline partial migration conditions in `importJson` and `wipeAll` with the
two boundary functions. Keep replacement confirmation and current preference behavior.

- [ ] **Step 6: Run persistence tests**

Run: `node --test src/platform/persistence/*.test.js`

Expected: PASS.

### Task 2: Search and note adapters

**Files:**
- Create: `src/features/search/searchProjection.js`
- Create: `src/features/search/searchProjection.test.js`
- Create: `src/features/notes/noteText.js`
- Create: `src/features/notes/noteText.test.js`
- Modify: `src/Planner.jsx`

**Interfaces:**
- Produces: `projectTaskSearchResult(task)` with canonical `date` and legacy-compatible `repeat` projection.
- Produces: `projectNoteSearchResult(note, title)`.
- Produces: `searchResultDateLabel(result, formatDate)` that never formats a missing date.
- Produces: `textToNoteBlocks(text, existing, createId)` preserving existing block metadata.

- [ ] **Step 1: Write failing search projection tests**

Assert that a planned task projects `planned.date`, an unplanned task receives `INBOX`,
a standalone note receives `NOTE`, a dated item calls the supplied formatter, and a
recurring task exposes recurrence data usable by the existing next-occurrence helper.

- [ ] **Step 2: Write failing note round-trip tests**

Given a paragraph with `extractedTaskId` and an unknown attribute, editing its text must
preserve ID, extraction reference, and unknown attribute. Given a checklist block, its
type and `done` state must survive. A new paragraph must use `createId()`.

- [ ] **Step 3: Verify both files fail for missing modules**

Run: `node --test src/features/search/searchProjection.test.js src/features/notes/noteText.test.js`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement minimal pure adapters**

For existing note blocks, spread the prior block first and then replace only `id`,
`type`, `text`, and `order`. For search labels, return `↻`, formatted date, `INBOX`, or
`NOTE` without calling the formatter for null dates.

- [ ] **Step 5: Verify focused tests pass**

Run: `node --test src/features/search/searchProjection.test.js src/features/notes/noteText.test.js`

Expected: PASS.

- [ ] **Step 6: Wire search selection and note editing**

Use the projections in `SearchPanel`. Selecting a note sets `noteEdit` and changes day
only when the note has a date. Use `textToNoteBlocks` in `saveNote`.

### Task 3: Canonical task recovery and bulk mutations

**Files:**
- Create: `src/features/planner/taskMutations.js`
- Create: `src/features/planner/taskMutations.test.js`
- Modify: `src/Planner.jsx`

**Interfaces:**
- Produces: `restoreTaskPlannedDates(tasks, entries)`.
- Produces: `deleteTaskFromPlannerState(state, taskId)` returning `{ state, removed }`.
- Produces: `restoreDeletedTaskInPlannerState(state, removed)`.
- Produces: `applyBulkTaskAction(state, ids, action, options)` returning `{ state, completedIds, failures }`.

- [ ] **Step 1: Write failing recovery tests**

Assert restoring one and many dates writes `planned.date` and leaves no top-level
`date`. Assert deleting an extracted recurring task removes its children, dependency
edges, occurrence exceptions, and note extraction references; restoring it restores
all of them and passes `validatePlannerStateV7` both before deletion and after restore.

- [ ] **Step 2: Write failing recurring bulk tests**

Assert completing `series@date` writes one completed exception without completing the
series row; deferring it creates a one-off task on the next day and cancels only that
occurrence; deleting it cancels only that occurrence. Assert deleting a selected series
cascades its exceptions and note references. Assert partial failures are reported.

- [ ] **Step 3: Verify tests fail for the missing module**

Run: `node --test src/features/planner/taskMutations.test.js`

Expected: FAIL because `taskMutations.js` does not exist.

- [ ] **Step 4: Implement pure cross-domain mutations**

Use existing Tasks commands for one-off rows and existing task-exception helpers for
occurrences. Accept deterministic `now` and `createId` options. Never mutate the input
state. For destructive bulk actions, let the UI retain a structured-clone snapshot for
exact undo.

- [ ] **Step 5: Verify focused tests pass**

Run: `node --test src/features/planner/taskMutations.test.js`

Expected: PASS.

- [ ] **Step 6: Wire individual delete/undo, bulk actions, drag-day undo, and pull-in undo**

Replace legacy top-level date writes with `restoreTaskPlannedDates`. Delegate task
deletion and restoration to the new module. Delegate bulk actions and use a planner
snapshot undo payload for bulk delete. Remove the duplicate `task-restore-dates` undo
branch.

### Task 4: Automated integration gate

**Files:**
- Modify only files implicated by failures from Tasks 1-3.

- [ ] **Step 1: Run focused regression tests together**

Run: `node --test src/platform/persistence/plannerStateImport.test.js src/features/search/searchProjection.test.js src/features/notes/noteText.test.js src/features/planner/taskMutations.test.js`

Expected: PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Build production assets**

Run: `npm run build`

Expected: Vite exits 0.

- [ ] **Step 4: Check source hygiene**

Run: `git diff --check && git status -sb`

Expected: no whitespace errors and only intended files changed.

### Task 5: Local browser pressure test

**Files:**
- Create only temporary screenshots and browser scripts under `/tmp`; do not commit them.

- [ ] **Step 1: Start the production preview**

Run the built `dist` directory on an available local port and launch local Chromium at
desktop and mobile viewport sizes.

- [ ] **Step 2: Exercise primary flows**

Create and edit an event; create and edit a recurring event through each scope choice;
create, complete, reopen, defer, move, delete, and undo a task; run recurring bulk
complete/defer/delete; create and edit a note after task extraction; search and open an
event, task, daily note, and undated result; switch agenda/timeline, day/week/month,
theme and clock settings; and navigate by keyboard.

- [ ] **Step 3: Exercise persistence and recovery flows**

Export JSON, import the same v7 data, confirm replacement, reload and verify retained
content. Start a blank notebook, create new content, reload, and verify it saves.
Inject an invalid import and verify current state remains unchanged.

- [ ] **Step 4: Record browser evidence**

Capture numbered screenshots for the day view, recurring scope question, task bulk
state, note/search state, import confirmation, and mobile layout. Check console logs for
errors after every flow and record any remaining UX or accessibility risks.

### Task 6: Final review and publication

**Files:**
- Modify: `docs/product/planner-foundation.md` only if a newly confirmed invariant is not already documented.

- [ ] **Step 1: Re-run the full verification gate fresh**

Run: `npm test && npm run build && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 2: Review the complete diff and repository status**

Run: `git diff --stat HEAD~1.. && git diff -- src docs && git status -sb`

Confirm every production edit maps to this plan and no temporary browser artifact is
staged.

- [ ] **Step 3: Commit reviewed repairs**

```bash
git add src docs
git commit -m "fix: repair planner recovery and portability flows"
```

- [ ] **Step 4: Push authorized main**

Run: `git push origin main`

Expected: remote `main` advances to the reviewed commit without force.
