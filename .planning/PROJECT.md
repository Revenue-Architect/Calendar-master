# Calendar-master

## What This Is

A personal-first, collaboration-ready planner that combines time-bound Events, finishable Actions, and contextual Notes into a daily operating system. The day is the primary surface. The app is connected and offline-capable: Google and Outlook calendars are assembled into one day and mail is read to propose events, while the device keeps a working copy (schema v8, host `window.storage` or `localStorage`) so the day still reads with no signal. Authority for this is PRODUCT.md and the cross-platform PRD, not this file.

## Core Value

The day's Events, Actions, and Notes stay independently correct and immediately usable, even when the rest of the product is unfinished.

## Requirements

### Validated

- ✓ Domain-oriented modular monolith decision — ADR 0001 Accepted
- ✓ Calendar domain commands/queries behind `src/domains/calendar/` — PRD Phase 1–2 complete
- ✓ Tasks, notes, and persistence modules exist beside Planner
- ✓ JOIN opens the meeting; Add a Step is first on an editable Action — interaction contracts
- ✓ Local notebook recovery and crash export — ErrorBoundary / notebookRecovery

### Active

- [ ] Keep JOIN and Add a Step contracts green without growing `Planner.jsx`
- [ ] Enforce at most one primary daily note per user/date, plus explicit additional day-linked notes
- [ ] Continue incremental extraction beside owners in `src/features/` and `src/domains/`
- [ ] Preserve cancel-never-commit timeline ownership and Week Action gesture deferral
- [ ] Keep import/replace from wiping a valid notebook

### Out of Scope

- Provider sync (Google Calendar, Microsoft Graph, CalDAV, Apple Reminders, Google Tasks, Todoist) — deferred by ADR 0001 and living PRD
- Immediate multi-package monorepo — rejected in ADR 0001
- Technical-layer split (`components` / `hooks` / `services` / `utils`) — rejected in ADR 0001
- Phase 1 folder move / `git mv` of `src/Planner.jsx` — frozen by `docs/spec/structure.md`
- Using `.planning/` as a source of truth for folder layout — forbidden by structure spec
- Collaborative editing in the first release — personal-first only

## Context

Brownfield Vite + React 19 planner at `C:\\Users\\Kamran\\Calendar-master`. Codebase map is in `.planning/codebase/`. Living contracts ingested 2026-08-13: ADR 0001, `docs/spec/structure.md`, interaction contracts, and `docs/product/planner-foundation.md`. Codex tandem clone must not be touched. Planner remains the composition root (~8k lines).

## Constraints

- **Architecture**: Domain-oriented modular monolith — ADR 0001
- **Placement**: Current ownership map is frozen; do not grow `Planner.jsx` — `docs/spec/structure.md`
- **Interactions**: Cancel is never commit; JOIN does not open Event inspect; Add a Step visibility is editability — interaction contracts
- **Data**: Local-only notebook; recovery must stay independent of the live storage module
- **Docs precedence**: Accepted ADR > approved SPEC > living PRD > DESIGN.md > interaction contracts > QA/plans > agent memory

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Domain-oriented modular monolith | Testable domain rules without a multi-package split | ✓ Good |
| Defer provider integrations | Keep canonical models provider-neutral | ✓ Good |
| Freeze current folder map | Incremental migration; do not invent a fourth docs plane | ✓ Good |
| Week Action gestures deferred | Interaction contract is more specific than PRD 6.3 | ✓ Good |
| Primary + additional daily notes | Resolves one-vs-many contradiction without shrinking Notes | — Pending |

---
*Last updated: 2026-08-13 after ingest-docs living contracts*
