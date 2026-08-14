# Phase 2: Incremental hardening - Research

**Researched:** 2026-08-14  
**Domain:** Notes Domain, Domain-Oriented Modular Monolith (ADR 0001), State Migration & Verification, Master Implementation Plan  
**Confidence:** HIGH  

<user_constraints>
## User Constraints & Ingested Living Authority

### Authority Precedence (per Master Implementation Plan § Documentation Authority)
1. **Architecture authority:** [`docs/adr/0001-domain-oriented-modular-monolith.md`](file:///C:/Users/Kamran/Calendar-master/docs/adr/0001-domain-oriented-modular-monolith.md)
2. **Product authority:** [`docs/product/planner-foundation.md`](file:///C:/Users/Kamran/Calendar-master/docs/product/planner-foundation.md) (with resolved § 2.2 Daily notes) & [`docs/product/calendar-master-cross-platform.md`](file:///C:/Users/Kamran/Calendar-master/docs/product/calendar-master-cross-platform.md)
3. **Visual & motion authority:** [`DESIGN.md`](file:///C:/Users/Kamran/Calendar-master/DESIGN.md)
4. **Interaction contracts:** [`docs/interaction-contracts/planner-interactions.md`](file:///C:/Users/Kamran/Calendar-master/docs/interaction-contracts/planner-interactions.md)
5. **Sequencing authority:** [`docs/plans/2026-08-13-calendar-master-implementation-master-plan.md`](file:///C:/Users/Kamran/Calendar-master/docs/plans/2026-08-13-calendar-master-implementation-master-plan.md)

### Locked Decisions & Invariants
- **Daily note cardinality (NOTE-02, NOTE-03):**
  - Each user/date has zero or one primary daily note, plus zero or more additional day-linked notes.
  - Opening the default daily-note editor resolves the primary note; if none exists, the first saved note becomes primary.
  - A date may have additional day-linked notes created through an explicit "Add note" or contextual creation action.
  - Users may designate another day-linked note as primary through an explicit action (`designatePrimaryDailyNote`).
  - A daily note links to a date-only value (`YYYY-MM-DD`) in the user's planning timezone. Changing timezone MUST NOT silently move a date-only daily note.
  - Do not create empty daily records merely because a date was viewed.
- **Composition root freeze & extract-beside-owner (ARCH-03, BD-02, BD-08, BD-11):**
  - `src/Planner.jsx` remains the composition root for existing state wiring and MUST NOT grow.
  - New behavior extracts beside the owner (`src/domains/notes/`, `src/features/notes/`).
  - Extracted UI surfaces use prepared controllers/view models and named command/query boundaries; UI cannot import persistence or mutate canonical records directly.
- **Deferred integrations (PROD-03, BD-08):**
  - External provider APIs (Google Calendar, Microsoft Graph, CalDAV, Todoist) and sync remain strictly deferred for the trust milestone.

### Agent Discretion
- Exact naming and signatures of pure domain helpers in `src/domains/notes/` (`getPrimaryDailyNote`, `createAdditionalDailyNote`, `designatePrimaryDailyNote`).
- Internal representation of primary status (`isPrimary: true`, `kind: "daily"` with explicit primary tracking, preserving backward compatibility with schema v8).
- Colocated feature extraction helpers in `src/features/notes/`.

### Deferred Ideas (OUT OF SCOPE)
- External provider synchronization (Google Calendar, MS 365, Todoist).
- Immediate structural directory renames or moving `Planner.jsx`.
- Big-bang monorepo refactoring or moving web under `apps/web`.
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
3. **Alignment with Master Implementation Plan:** Grounding execution in the sequencing authority of `docs/plans/2026-08-13-calendar-master-implementation-master-plan.md` and ADR 0001.

**Primary recommendation:** Implement pure domain operations (`getPrimaryDailyNote`, `createAdditionalDailyNote`, `designatePrimaryDailyNote`) in `src/domains/notes/`, update `getNotesForDate` and `dayAggregate.js` projections, and colocate feature helpers in `src/features/notes/` accompanied by comprehensive unit test coverage.
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
- `getNotesForDate(notes, dateKey)`: Returns all active notes associated with `dateKey` (primary + additional), sorted with primary note first, then by `updatedAt`.
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
2. **Feature & Planner Day Projection Tests (`src/features/notes/dailyNoteResolution.test.js` / `dayAggregate.js`):**
   - Verification that `getDayAggregate` returns `dailyNote` (primary) and `notes` (collection).
   - Verification that `resolveDailyNoteDraft` returns draft without mutating state for unnoted dates.
3. **Full Regression Suite:**
   - Run `npm test` ensuring all 550+ tests pass with 0 regressions.
</validation_architecture>
