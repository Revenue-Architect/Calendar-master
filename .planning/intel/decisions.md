# Ingested Decisions

## ADR 0001: Domain-Oriented Modular Monolith
- source: docs/adr/0001-domain-oriented-modular-monolith.md
- status: locked
- decision: The application will evolve into a domain-oriented modular monolith. Each product domain owns its model, invariants, commands, queries, domain events, repository interfaces, and tests. React components consume application-facing interfaces and do not own domain rules. Calendar and task provider integrations are planned, but provider implementation is explicitly deferred.
- scope: modular monolith, domains, platform, shared, ui, Planner.jsx, provider integrations

## PRD decision log (not ADR-locked)
- source: docs/product/planner-foundation.md
- status: proposed
- decision: Living product decision log dated 2026-08-09 and 2026-08-10. Includes personal-first ownership, deferred providers, Calendar-first extraction, v5/v6 persistence cutovers, deadline-only overdue, checklist-not-subtask migration, and local-first presentation rules. These are product decisions, not Accepted ADRs.
- scope: product decisions, persistence, overdue, notes, presentation
