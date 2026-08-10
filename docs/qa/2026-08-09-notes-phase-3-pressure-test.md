# Notes Phase 3 pressure test

**Date:** 2026-08-09  
**Scope:** Notebook views, standalone capture, contextual event/task notes,
backlinks, revisions, and recurrence identity.

## Automated evidence

- The final full Node test suite exercised Calendar, Tasks, Notes, persistence, search,
  and shared time. The Phase 3 additions cover notebook membership, archive/pin
  behavior, recurring-event occurrence matching, canonical recurring-task links,
  distinct series/occurrence relationships, and shorthand extraction safety:
  **210 passing, 0 failing**.
- The final production Vite build completed successfully, and `git diff --check`
  reported no whitespace errors.

## Pressure-test matrix

| Flow | Evidence | Result |
| --- | --- | --- |
| Standalone note identity and default notebook | `createNote` + v7 validation and `getNotebookNotes` tests | Covered |
| All / pinned / archived views | Pure query and archive/pin command tests | Covered |
| New line beside extracted checklist | Regression test proves it cannot inherit another line's task link | Covered |
| Event series versus occurrence note | Occurrence-aware query plus canonical `recurrenceAnchor` adapter tests | Covered |
| Recurring task note | UI adapter test proves `task@date` resolves to the canonical series ID | Covered |
| Series and occurrence link coexistence | `linkNote` regression test | Covered |
| Revisions, restore, deletion undo | Existing Notes Phase 2 suite plus review of Phase 3 metadata paths | Covered |
| Production bundle | Final build gate | Covered in final verification |

## Browser-run limitation

The available cloud browser rejects private local preview URLs. A separate local
Chromium runner was then attempted against the production bundle, but its child
browser process is isolated from the local HTTP server in this execution
environment and terminates on navigation. This is an infrastructure limitation,
not evidence of an application error; it is recorded rather than treated as a
passing visual interaction test.

The flows still requiring a real browser/device pass are: create a standalone
note, pin/archive/restore it, create an event note and a task note, reopen both
through backlinks, reload, and repeat on a narrow mobile viewport. The automated
domain and production-build gates remain the release evidence available here.
