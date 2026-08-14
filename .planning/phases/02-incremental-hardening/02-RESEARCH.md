# Phase 2: Incremental hardening - Research

**Researched:** 2026-08-14
**Domain:** Notes Domain, Domain-Oriented Modular Monolith, State Migration & Verification
**Confidence:** HIGH

<user_constraints>
## User Constraints (from Ingested Living Contracts & Reconciliation)

### Locked Decisions
- **Daily note cardinality:** Each user/date has zero or one primary daily note, plus zero or more additional day-linked notes.
- **Default editor resolution:** Opening the default daily-note editor resolves the primary note; if none exists, the first saved note becomes primary.
- **Additional daily notes:** A date may have additional day-linked notes created through an explicit "Add note" or contextual creation action.
- **Designate primary:** Users may designate another day-linked note as primary through an explicit action (`designatePrimaryDailyNote`).
- **Date-only stability:** A daily note links to a date-only value (`YYYY-MM-DD`) in the user's planning timezone. Changing timezone MUST NOT silently move a date-only daily note.
- **No phantom records:** Do not create empty daily records merely because a date was viewed.
- **Composition root freeze (ADR 0001 & `docs/spec/structure.md`):** `Planner.jsx` remains the composition root for existing state wiring. New behavior extracts beside the owner (`src/domains/notes/`, `src/features/notes/`) and MUST NOT append complexity to `Planner.jsx`.
- **Deferred integrations (PROD-03):** External provider APIs (Google, Microsoft Graph, CalDAV, Todoist) and sync remain strictly deferred.

### Agent Discretion
- Exact naming and signature of domain helper functions in `src/domains/notes/` (`getPrimaryDailyNote`, `createAdditionalDailyNote`, `designatePrimaryDailyNote`).
- Internal representation of primary status (e.g., `isPrimary: true`, or `kind: "daily"` designated primary with explicit primary tracking, while preserving backward compatibility with schema v8).
- Feature-level extraction helpers in `src/features/notes/`.

### Deferred Ideas (OUT OF SCOPE)
- External provider synchronization (Google Calendar, MS 365, Todoist).
- Immediate folder reorganization or `git mv Planner.jsx`.
- Multi-package monorepo refactoring.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Primary daily note uniqueness & invariants | Domain Layer (`src/domains/notes/`) | Platform Persistence (`src/platform/persistence/`) | Enforces business rules in pure domain functions independently of UI. |
| Daily note queries (`getPrimaryDailyNote`, `getNotesForDate`) | Domain Layer (`src/domains/notes/queries/`) | Planner Projection (`src/domains/planner/queries/`) | Provides deterministic queries for day aggregations. |
| Daily note commands (`createAdditionalDailyNote`, `designatePrimaryDailyNote`) | Domain Layer (`src/domains/notes/commands/`) | Feature Handlers (`src/features/notes/`) | Generates pure domain events and immutable state transitions. |
| Feature-level editor drafting & resolution | Feature Layer (`src/features/notes/`) | Presentation (`src/features/planner/`, `src/Planner.jsx`) | Keeps application use-cases and draft state outside the composition root. |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 2 focuses on hardening the domain boundaries established in Phase 1 without performing risky structural folder moves or growing the composition root `Planner.jsx`. Specifically, this phase addresses:
1. **Reconciliation of Daily Note Cardinality (NOTE-02, NOTE-03):** Moving from a rigid "single daily note" constraint to a flexible model: at most one primary daily note per user/date + zero or more additional day-linked notes created explicitly.
2. **Extraction Discipline (ARCH-03, PROD-03):** Ensuring all new logic extracts beside existing owners in `src/domains/notes/` and `src/features/notes/`, preserving provider deferral and keeping `Planner.jsx` clean.

**Primary recommendation:** Implement pure domain operations (`getPrimaryDailyNote`, `createAdditionalDailyNote`, `designatePrimaryDailyNote`) in `src/domains/notes/`, update `getNotesForDate` and `dayAggregate.js` projections, and colocate feature helpers in `src/features/notes/` accompanied by thorough unit test coverage.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library / Engine | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Node.js Test Runner (`node:test`) | Built-in (Node 20+) | Unit and domain testing | Zero-dependency, ultra-fast (<1s for domain test suite). |
| React | 19.x | UI Rendering | Current app framework. |
| DateKey & Time Primitives | Internal (`src/shared/time/`) | Date arithmetic and formatting | Guaranteed DST-safe, pure timezone-isolated operations. |

### Test Commands
- Single domain suite: `node --test src/domains/notes/tests/notes.test.js`
- Full test suite: `npm test`
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Domain Model & Invariants
```text
Daily Note Model:
- Primary Note: note.kind === "daily" (or isPrimary: true on date-linked notes), exactly 0 or 1 per dateKey.
- Additional Daily Notes: note.kind === "daily" with isPrimary: false (or date-linked notes), 0 or more per dateKey.
- Invariant: A dateKey cannot have >1 primary note. Designating a note as primary clears primary flag on any prior primary note for that date.
```

### Domain Operations
- `getPrimaryDailyNote(notes, dateKey)`: Returns the single primary daily note for `dateKey`, or `null`.
- `getDailyNote(notes, dateKey)`: Alias to `getPrimaryDailyNote` preserving backward compatibility.
- `getNotesForDate(notes, dateKey)`: Returns all active notes associated with `dateKey` (primary + additional), sorted by update time.
- `createAdditionalDailyNote(notes, input, { now })`: Explicitly creates a non-primary day-linked note for `dateKey`.
- `designatePrimaryDailyNote(notes, noteId, dateKey, { now })`: Marks the specified note as the primary note for `dateKey`, demoting any existing primary note.

### Anti-Patterns to Avoid
- **Mutating Planner.jsx directly for business logic:** Keep logic in `src/domains/notes/` and `src/features/notes/`.
- **Silent creation of empty notes:** Opening/viewing a date must not write empty notes to state.
- **Timezone-driven date shift:** Daily notes are date-only (`YYYY-MM-DD`) and must never shift when the user's viewer timezone changes.
</architecture_patterns>

<validation_architecture>
## Validation Architecture

### Automated Verification
1. **Domain Unit Tests (`src/domains/notes/tests/notes.test.js`):**
   - Uniqueness of primary daily note per dateKey.
   - Creation of explicit additional day-linked notes.
   - Designating a note as primary updates primary slot and demotes prior primary note.
   - Default daily editor resolution logic (primary resolved if present; first note becomes primary on creation).
   - Timezone resilience: DateKey stability across DST / timezone changes.
2. **Planner Day Projection Tests (`src/domains/planner/tests/dayAggregate.test.js` / `dayProjection.test.js`):**
   - Verification that `getDayAggregate` returns `dailyNote` (primary) and `notes` (collection).
3. **Full Regression Suite:**
   - Run `npm test` ensuring all 550+ tests remain green.
</validation_architecture>
