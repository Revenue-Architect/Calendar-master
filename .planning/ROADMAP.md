# Roadmap: Calendar-master

## Overview

Brownfield ingest of living contracts. Phase 1 records already-shipped domain extraction and interaction contracts. Phase 2 continues incremental extraction and the resolved daily-note cardinality without moving Planner or starting provider sync.

## Phases

- [x] **Phase 1: Living foundation** - Domain modules, local notebook, and interaction contracts already on main
- [ ] **Phase 2: Incremental hardening** - Primary/additional daily notes and extract-beside-owner without growing Planner

## Phase Details

### Phase 1: Living foundation
**Goal**: Keep the shipped personal-first planner correct: Events, Actions, Notes, local persistence, JOIN, and Add a Step
**Depends on**: Nothing (already on main)
**Requirements**: ARCH-01, ARCH-02, ARCH-04, PROD-01, PROD-02, CAL-01, CAL-02, CAL-03, TASK-01, TASK-02, TASK-03, NOTE-01, NOTE-04, INT-01, INT-02, INT-03, INT-04, PERS-01, PERS-02, PERS-03
**Success Criteria** (what must be TRUE):
  1. Day/Week JOIN opens the meeting and does not open Event inspect
  2. Add a Step is visible first on an editable Action, including an empty checklist
  3. A crash screen can export the on-device notebook
**Plans**: ingested, not re-planned

Plans:
- [x] 01-01: Calendar/tasks/notes domain extraction already landed
- [x] 01-02: Interaction contracts and recovery already landed

### Phase 2: Incremental hardening
**Goal**: Enforce primary vs additional daily notes and keep extracting beside owners
**Depends on**: Phase 1
**Requirements**: ARCH-03, PROD-03, NOTE-02, NOTE-03
**Success Criteria** (what must be TRUE):
  1. Opening the default daily editor resolves or creates the one primary note for that user/date
  2. Additional day-linked notes require an explicit add action
  3. New behavior is added beside the owner, not appended to Planner
**Plans**: TBD

Plans:
- [ ] 02-01: Domain uniqueness for primary daily note plus explicit additional notes
- [ ] 02-02: Continue extract-beside-owner without a folder move

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Living foundation | 2/2 | Complete | 2026-08-13 |
| 2. Incremental hardening | 0/2 | Not started | - |
