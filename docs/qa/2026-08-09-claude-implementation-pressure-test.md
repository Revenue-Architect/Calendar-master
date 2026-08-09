# Claude Implementation Pressure Test

**Date:** 2026-08-09

**Status:** Passed after repairs

**Scope:** Calendar, Tasks, Notes, Search, persistence, recovery, desktop, and mobile.
Provider integrations were intentionally excluded.

## Outcome

The domain implementations were broadly sound and already had strong unit coverage,
but several `Planner.jsx` handlers still wrote legacy state shapes or bypassed the
new domain rules. Those boundary defects could make search fail, apply a recurring
action to an entire series, lose note-to-task references, or leave schema-v7 state
that could no longer be saved.

All confirmed defects below are repaired. Cross-domain mutations now live in focused,
pure feature modules rather than growing the planner component further.

## Confirmed defects and disposition

| Severity | Area | Confirmed failure | Disposition |
| --- | --- | --- | --- |
| Critical | JSON portability | v7 imports entered the v4 migration path; v4-v6 imports stopped before v7. An app export could not reliably round-trip. | Fixed with one version-aware, validating import boundary. |
| Critical | Blank notebook | Reset produced an intermediate schema that v7 autosave rejected. | Fixed with validated v7 blank-state creation that preserves device preferences. |
| Critical | Task deletion | Bulk and individual series deletion could leave task exceptions or note extraction references pointing at removed tasks, invalidating future saves. | Fixed with a cross-domain deletion transaction and exact undo metadata. |
| High | Recurring tasks | Bulk completion, defer, today, and delete acted on the series row instead of the selected occurrence. | Fixed with typed exceptions and deliberate occurrence detachment. |
| High | Recurring task delete | Deleting one occurrence wrote a legacy override that the Tasks domain did not read. | Fixed with a typed cancelled task exception and exact undo. |
| High | Search | Canonical tasks expose `planned.date`, but search formatted removed `task.date`; unplanned results could crash rendering. | Fixed with display-safe search projections and stable `INBOX`/`NOTE` labels. |
| High | Search deep links | Selecting a note closed search without opening it. Selecting an unplanned task set inspector state, but the inspector only resolved visible-day tasks. | Fixed note routing and task inspection fallback, each with regression coverage. |
| High | Notes | Text editing rebuilt blocks and dropped extraction references and unknown block attributes, allowing duplicate extraction. | Fixed with a metadata-preserving text adapter. |
| Medium | Task move undo | Day-move and pull-overdue undo wrote removed top-level `date` fields instead of `planned.date`. | Fixed with canonical planned-date restoration. |
| Medium | Recurring defer undo | Deferring one occurrence detached it correctly, but Undo shifted the series and left the detached row and cancellation behind. | Fixed by snapshot undo for occurrence mutations; one-offs retain targeted undo. |

## Browser pressure test

The production build was served locally and exercised in headless Chromium at
1440×1000 and 390×844. The browser run covered:

- first-run empty notebook creation and schema-v7 persistence;
- keyboard action capture and event creation;
- recurring calendar occurrence editing through the “this day only” scope;
- timeline/agenda switching and reload persistence;
- planned, recurring, and unplanned task search and deep links;
- daily-note search, editing, and preservation of extraction metadata;
- recurring task occurrence delete, defer, bulk completion, and Undo;
- own-export JSON round-trip, blank reset, replacement confirmation, and rejection
  of an unsupported import without changing current state;
- mobile actions sheet, action composer, and note-search flow.

The final browser run reported zero page exceptions and zero application console
errors. The browser's expected autoplay/vibration permission notices were filtered
as platform policy messages, not application failures.

## Automated evidence

- Focused regression tests cover import normalization, search projection, task
  inspection, note round-tripping, canonical undo, deletion cascades, and recurring
  bulk actions.
- The complete Node test suite passes.
- The Vite production build passes.
- Every state captured after destructive or portability flows passes schema-v7
  validation.
- `git diff --check` passes.

## Residual manual checks

Pointer drag distance, resize precision, native notification permission prompts, and
real-device haptics remain best verified manually on physical touch hardware. Their
domain transformations and canonical state invariants are covered by automated tests.
This report does not assess Google or Outlook integration.
