# Ingested Context

## Product purpose
- source: docs/product/planner-foundation.md
- Planner combines time-bound commitments, finishable actions, and contextual notes into a daily operating system. The day is the primary planning surface. Domain objects are Event, Task, Note, and Day.

## Architecture target
- source: docs/adr/0001-domain-oriented-modular-monolith.md
- Target tree includes src/app, src/domains/{calendar,tasks,notes,planner,reminders,gamification,search}, src/platform/{persistence,notifications,integrations,telemetry}, src/shared/{time,recurrence,validation,types}, src/ui/{primitives,patterns,themes}.
- Rejected: immediate multi-package monorepo; technical-layer split into components/hooks/services/utils.

## Delivery already recorded
- source: docs/product/planner-foundation.md
- Phase 1 Calendar domain foundation completed 2026-08-09 behind src/domains/calendar/index.js.
- Phase 2A and 2B completed 2026-08-09. Provider sync, multiple calendar container UI, and several advanced recurrence cases remain deferred.

## Persistence notes
- source: docs/product/planner-foundation.md
- Cut planner persistence directly to validated v5 after a confirmed migration write; do not dual-write. Upgrade a v4 notebook straight to v6 in one confirmed write. Current codebase map records schema v8 under nbmp:state:v8.

## Structure vs GSD planning
- source: docs/spec/structure.md
- Do not add .planning/ as a source of truth for folder structure. This ingest writes GSD process intel only; it does not change the in-force ownership map.
