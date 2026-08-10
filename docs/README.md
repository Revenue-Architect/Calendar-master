# Planner Documentation

This directory is the source of truth for product and architecture decisions that
are too detailed for the repository README.

## Product specifications

- [`product/planner-foundation.md`](product/planner-foundation.md) is the living,
  three-level capability specification for Calendar, Tasks, Notes, and the shared
  planner platform. Approved domains are appended incrementally.

## Feature designs

- [`superpowers/specs/2026-08-09-calendar-phase-2-design.md`](superpowers/specs/2026-08-09-calendar-phase-2-design.md)
  defines the approved Phase 2A canonical-time and Phase 2B advanced-recurrence
  design, migration policy, boundaries, and completion criteria.
- [`superpowers/specs/2026-08-09-planner-qa-repair-design.md`](superpowers/specs/2026-08-09-planner-qa-repair-design.md)
  defines the persistence, search, notes, recurring-task, and recovery repairs found
  during the post-implementation pressure test.
- [`superpowers/specs/2026-08-10-unified-search-design.md`](superpowers/specs/2026-08-10-unified-search-design.md)
  defines the Phase 3C pure search, deterministic ranking, and canonical deep-link
  boundary.

## Quality reports

- [`qa/2026-08-09-claude-implementation-pressure-test.md`](qa/2026-08-09-claude-implementation-pressure-test.md)
  records confirmed defects, repairs, browser flows, automated evidence, and the
  remaining physical-device checks.
- [`qa/2026-08-09-notes-phase-3-pressure-test.md`](qa/2026-08-09-notes-phase-3-pressure-test.md)
  records Phase 3 regression coverage and the environment-limited browser-run
  evidence.
- [`qa/2026-08-10-shared-planner-foundation-phase-3a.md`](qa/2026-08-10-shared-planner-foundation-phase-3a.md)
  records the shared day aggregate and daily-review automated evidence plus the
  local-browser access limitation.
- [`qa/2026-08-10-reminders-phase-3b.md`](qa/2026-08-10-reminders-phase-3b.md)
  records the durable reminder ledger, scheduling, delivery, and persistence gates.
- [`qa/2026-08-10-phase-3b-follow-up-pressure-test.md`](qa/2026-08-10-phase-3b-follow-up-pressure-test.md)
  records fresh full-suite, dependency, and reminder-edge evidence, plus the
  cloud-browser limitation that still blocks visual flow verification.

## Implementation plans

- [`superpowers/plans/2026-08-09-calendar-phase-1.md`](superpowers/plans/2026-08-09-calendar-phase-1.md)
  records the completed Calendar Phase 1 extraction plan.
- [`superpowers/plans/2026-08-09-calendar-phase-2a-time.md`](superpowers/plans/2026-08-09-calendar-phase-2a-time.md)
  implements canonical v5 timing, migration, timezone behavior, and segmentation.
- [`superpowers/plans/2026-08-09-calendar-phase-2b-recurrence.md`](superpowers/plans/2026-08-09-calendar-phase-2b-recurrence.md)
  implements advanced recurrence, typed exceptions, and series splitting.
- [`superpowers/plans/2026-08-09-tasks-phase-1.md`](superpowers/plans/2026-08-09-tasks-phase-1.md)
  establishes the Tasks domain: model, hierarchy, dependencies, planning semantics,
  commands, queries, and events, and records what carries into Tasks Phase 2.
- [`superpowers/plans/2026-08-09-tasks-phase-2.md`](superpowers/plans/2026-08-09-tasks-phase-2.md)
  cuts persistence over to schema v6, expands recurring tasks through the domain,
  adopts the Tasks API in the interface, and surfaces dependencies.
- [`superpowers/plans/2026-08-09-tasks-phase-3.md`](superpowers/plans/2026-08-09-tasks-phase-3.md)
  closes the Tasks domain: dependency authoring, smart views, lists and tags,
  waiting state, task reminders, and the scheduling warning.

- [`superpowers/plans/2026-08-09-notes-phase-1.md`](superpowers/plans/2026-08-09-notes-phase-1.md)
  replaces the legacy text note with a block document domain, links and backlinks,
  system views, search, revisions, and the v7 migration.
- [`superpowers/plans/2026-08-09-notes-phase-2.md`](superpowers/plans/2026-08-09-notes-phase-2.md)
  makes every block type reachable through line shorthand and adds note revisions.
- [`superpowers/plans/2026-08-09-notes-phase-3.md`](superpowers/plans/2026-08-09-notes-phase-3.md)
  delivers the notebook surface, standalone capture, contextual event/task notes,
  and derived backlinks.
- [`superpowers/plans/2026-08-09-planner-qa-repair.md`](superpowers/plans/2026-08-09-planner-qa-repair.md)
  implements the post-implementation persistence, search, notes, task-mutation,
  browser-pressure-test, and publication gates.
- [`superpowers/plans/2026-08-10-shared-planner-foundation.md`](superpowers/plans/2026-08-10-shared-planner-foundation.md)
  sequences the remaining non-provider foundation and records the completed day
  aggregate/daily-review Slice 3A.
- [`superpowers/plans/2026-08-10-reminders-phase-3b.md`](superpowers/plans/2026-08-10-reminders-phase-3b.md)
  defines the delivery ledger, reconciliation, controls, and local persistence
  boundary for Reminders Phase 3B.
- [`superpowers/plans/2026-08-10-unified-search-phase-3c.md`](superpowers/plans/2026-08-10-unified-search-phase-3c.md)
  implements the next approved Planner foundation slice: offline unified search
  and source-owned deep links.

## Architecture decisions

- [`adr/0001-domain-oriented-modular-monolith.md`](adr/0001-domain-oriented-modular-monolith.md)
  records the decision to replace the single-component architecture with a
  domain-oriented modular monolith.

## Documentation rules

- Product behavior is specified independently from frontend presentation.
- Level 1 describes a product capability, Level 2 a sub-capability, and Level 3
  the required behavior and important edge cases.
- `MUST`, `SHOULD`, and `MAY` use their normal requirements meanings.
- Approved behavior is changed by editing the specification and recording the
  reason in its decision log.
- Provider-specific Google and Microsoft behavior belongs in future integration
  specifications, not in the canonical product domains.
