# Requirements: Calendar-master

**Defined:** 2026-08-13
**Core Value:** The day's Events, Actions, and Notes stay independently correct and immediately usable.

## v1 Requirements

### Architecture

- [x] **ARCH-01**: Domain-oriented modular monolith; domains own model, commands, queries, events, ports, and tests
- [x] **ARCH-02**: React consumes application-facing interfaces and does not own domain rules
- [ ] **ARCH-03**: New behavior extracts beside the owner; do not grow `Planner.jsx`
- [x] **ARCH-04**: Host storage adapter stays in `src/storage.js`

### Product

- [x] **PROD-01**: Personal-first ownership now; collaboration roles reserved, not required
- [x] **PROD-02**: Canonical internal model; provider payloads never become domain records
- [ ] **PROD-03**: Provider APIs and sync remain deferred

### Calendar

- [x] **CAL-01**: Calendar owns time-bound commitments and time navigation
- [x] **CAL-02**: Shared time primitives own date arithmetic; React must not implement it
- [x] **CAL-03**: Gestures produce domain commands rather than rewriting stored objects

### Tasks

- [x] **TASK-01**: Inbox capture stays title-only and fast
- [x] **TASK-02**: Planned date and deadline are independent; overdue derives from deadlines only
- [x] **TASK-03**: Subtasks are full tasks; checklist items are lightweight

### Notes

- [x] **NOTE-01**: Daily, entity-linked, and inbox notes with durable identity
- [ ] **NOTE-02**: At most one primary daily note per user/date; default editor resolves or creates it
- [ ] **NOTE-03**: Additional day-linked notes require explicit creation; designate-primary is explicit
- [x] **NOTE-04**: Notes remain extensible toward a notebook system

### Interactions

- [x] **INT-01**: Day/Week JOIN opens the meeting and does not open Event inspect
- [x] **INT-02**: Add a Step is visible first whenever an existing open Action is editable
- [x] **INT-03**: Cancel is never commit
- [x] **INT-04**: Week Action move, resize, and swipe remain deferred

### Persistence

- [x] **PERS-01**: Versioned JSON backup with preview before replace
- [x] **PERS-02**: Never replace valid state with an invalid import
- [x] **PERS-03**: Crash recovery can export the notebook without using app state

## v2 Requirements

### Integrations

- **INTG-01**: Calendar and task provider adapters behind domain-owned ports
- **INTG-02**: ICS export with timezone, all-day, recurrence, and exceptions

### Collaboration

- **COLL-01**: Owner, editor, contributor, and viewer roles

## Out of Scope

| Feature | Reason |
|---------|--------|
| Google / Graph / CalDAV / Todoist sync | Deferred by ADR 0001 and living PRD |
| Immediate multi-package monorepo | Rejected in ADR 0001 |
| `git mv` Planner or Phase 1 folder move | Frozen by structure spec |
| `.planning/` as folder-layout source of truth | Forbidden by structure spec |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 1 | Complete |
| ARCH-03 | Phase 2 | Pending |
| ARCH-04 | Phase 1 | Complete |
| PROD-01 | Phase 1 | Complete |
| PROD-02 | Phase 1 | Complete |
| PROD-03 | Phase 2 | Pending |
| CAL-01 | Phase 1 | Complete |
| CAL-02 | Phase 1 | Complete |
| CAL-03 | Phase 1 | Complete |
| TASK-01 | Phase 1 | Complete |
| TASK-02 | Phase 1 | Complete |
| TASK-03 | Phase 1 | Complete |
| NOTE-01 | Phase 1 | Complete |
| NOTE-02 | Phase 2 | Pending |
| NOTE-03 | Phase 2 | Pending |
| NOTE-04 | Phase 1 | Complete |
| INT-01 | Phase 1 | Complete |
| INT-02 | Phase 1 | Complete |
| INT-03 | Phase 1 | Complete |
| INT-04 | Phase 1 | Complete |
| PERS-01 | Phase 1 | Complete |
| PERS-02 | Phase 1 | Complete |
| PERS-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-08-13*
*Last updated: 2026-08-13 after ingest-docs living contracts*
