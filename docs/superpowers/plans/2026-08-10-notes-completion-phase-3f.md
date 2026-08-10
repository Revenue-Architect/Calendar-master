# Notes Completion — Phase 3F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Complete the provider-free Notes foundation with processing, catalog
tags, templates, attachment metadata, portability, and a safe schema-v8 cutover.

**Architecture:** Keep each concern inside a small Notes module. The canonical
planner aggregate gets only normalized values and reference integrity; browser
download/upload and binary storage stay adapters outside the domain. Persistence
migrates atomically from v7 to v8 and Planner only adopts the new state version.

**Tech Stack:** React 19, JavaScript ES modules, Vite 7, Node built-in test
runner, local-first storage.

## Global constraints

- No provider SDK, account, remote sync, binary upload, or automatic task action.
- Preserve every existing note, block, link, revision, Calendar, and Task ID.
- All public domain writes are immutable and each new behavior starts red in a
  focused Node test.
- `archived` remains lifecycle state; processing never makes archival ambiguous.
- Publish only a fast-forward-equivalent, non-force update to `main` after full
  verification.

## File map

- `src/domains/notes/model/{note,noteTag,noteAttachment}.js`: normalized canonical
  note, tag, and attachment contracts.
- `src/domains/notes/commands/{noteCommands,noteOrganization}.js`: metadata,
  processing, tag-reference, and attachment operations.
- `src/domains/notes/queries/noteQueries.js`: inbox/process/tag reads.
- `src/domains/notes/templates/builtInTemplates.js`: versioned template catalog
  and fresh-block instantiation.
- `src/domains/notes/portability/notePortability.js`: JSON/Markdown/plain-text
  export and validate-first import transforms.
- `src/domains/notes/migrations/{migrateV7ToV8,validatePlannerStateV8}.js`: v8
  derivation and aggregate validation.
- `src/platform/persistence/{plannerStateImport,plannerStateStore}.js`: v8 import
  normalization and confirmed local-storage cutover.
- `src/Planner.jsx`: use the v8 migrator when seeding and retain attachment
  metadata in note delete/undo paths.
- `docs/*`: documentation index, foundation delivery record, QA evidence.

## Task 1 — Note processing and tag catalog

**Files:** create `model/noteTag.js` and `commands/noteOrganization.js`; modify
`model/note.js`, `commands/noteCommands.js`, `queries/noteQueries.js`,
`index.js`, and Notes tests.

- [x] Write failing tests proving standalone captures can be marked inbox,
  in-progress, processed, or snoozed; an early snooze is hidden and a due snooze
  returns without mutation; tag rename preserves IDs; merge and delete only
  alter references.
- [x] Run `node --test src/domains/notes/tests/notes.test.js` and verify each new
  assertion fails because processing/tag APIs are absent.
- [x] Implement `normalizeNoteProcessing`, `normalizeNoteTag`,
  `setNoteProcessing`, `setNoteTagIds`, `createNoteTag`, `renameNoteTag`,
  `mergeNoteTags`, `deleteNoteTag`, `getInboxNotes(notes, { todayDate })`, and
  tag-name resolution. Make invalid IDs/names fail before changing a collection.
- [x] Re-run the focused Notes tests green.

## Task 2 — Built-in templates

**Files:** create `templates/builtInTemplates.js` and
`tests/templates.test.js`; modify `index.js`.

- [x] Write failing tests that list all seven template IDs, instantiate a template
  twice with a supplied ID factory, prove title/blocks are independent, and prove
  provenance has the template's current ID/version.
- [x] Run `node --test src/domains/notes/tests/templates.test.js` and verify the
  module is missing.
- [x] Implement `listBuiltInNoteTemplates`, `getBuiltInNoteTemplate`, and
  `instantiateBuiltInNoteTemplate(templateId, { createBlockId })`; normalize the
  resulting blocks before returning a note-ready draft.
- [x] Re-run the focused template tests green.

## Task 3 — Attachment metadata and deletion integrity

**Files:** create `model/noteAttachment.js` and
`commands/noteAttachments.js`; modify `model/note.js`,
`migrations/validatePlannerStateV8.js`, `index.js`, `Planner.jsx`, and add tests.

- [x] Write failing tests for sanitized metadata, reciprocal note ownership,
  rejected duplicate/orphan attachment IDs, delete returning removed metadata,
  and undo restoring that same metadata.
- [x] Run focused attachment and planner-mutation tests; confirm failures are due
  to missing attachment validation/cleanup.
- [x] Implement metadata-only attachment commands and pure drop/restore helpers.
  Include `attachmentIds` in note change detection. Extend Planner's existing
  note deletion undo payload with metadata; do not add a file picker or bytes.
- [x] Re-run focused tests green.

## Task 4 — Versioned portability

**Files:** create `portability/notePortability.js` and
`tests/notePortability.test.js`; modify `index.js`.

- [x] Write failing tests for plain-text and Markdown export, native selected-note
  export with a binary-excluded warning, malformed native rejection, and each
  duplicate policy: copy gets fresh note/block/attachment IDs, skip changes
  nothing, merge only unions metadata/links/tags without overwriting text.
- [x] Run `node --test src/domains/notes/tests/notePortability.test.js` and verify
  the missing API failures.
- [x] Implement versioned native export/import plus text/Markdown transformations.
  Normalize every input before building a result and mark imported attachment
  metadata `missing` with no storage reference.
- [x] Re-run the focused portability tests green.

## Task 5 — Schema-v8 migration, persistence, and search adoption

**Files:** create `migrations/{migrateV7ToV8,validatePlannerStateV8}.js`; modify
`migrations` exports, `plannerStateImport.js`, `plannerStateStore.js`, their
tests, `domains/search/queries/searchPlanner.js`, `Planner.jsx`, and affected
fixture schema versions.

- [x] Write failing tests for deterministic v7 tag/processing conversion, v8
  reciprocal validation, v7-to-v8 confirmed persistence cutover, older imports
  ending at v8, and search finding renamed catalog tag text.
- [x] Run each focused migration, persistence, and search test; verify the failure
  is missing v8 behavior rather than a fixture typo.
- [x] Implement `migrateV7ToV8`, validate v8 after the existing v7 invariants,
  change storage to `V8_KEY`, and chain all legacy imports directly to v8. Pass
  `state.noteTags` into Notes search projection. Seed Planner through v8.
- [x] Re-run focused test groups green and repair all v7 test fixtures to valid v8
  records only where they are exercising current-state validation.

## Task 6 — Documentation, QA, and publication

- [x] Add the approved design, this implementation plan, a documentation-index
  entry, product delivery record, shared-plan status, and a QA report that
  separates executable evidence from unavailable browser interaction.
- [x] Run `npm test`, `npm run build`, `git diff --check`, and
  `npm audit --omit=dev --audit-level=high`; attempt the critical browser flows
  available in this runtime and record exact evidence.
- [x] Inspect staged scope, commit `feat: complete notes foundation`, publish
  non-force to `main`, fetch/rebase the local clone, and verify local/remote SHA
  and tree equality.

## Phase boundary

Phase 3F supplies canonical, portable Notes behavior. The following experience
slice may adopt processing/tag/template/attachment surfaces in a focused editor
flow; it does not need a second Notes migration or a binary storage rewrite.
