# ADR 0001: Domain-Oriented Modular Monolith

- **Status:** Accepted
- **Date:** 2026-08-09
- **Decision owners:** Product and Engineering

## Context

The prototype implements calendar rules, recurrence, tasks, notes, persistence,
gestures, reminders, gamification, search, and most UI state in a single
`Planner.jsx` component. The arrangement enabled rapid prototyping but makes
domain rules difficult to test, replace, or reuse without affecting unrelated
features.

The product is personal-first and collaboration-ready. Calendar and task provider
integrations are planned, but provider implementation is explicitly deferred.
Notes initially support daily notes, entity-linked notes, and inbox capture while
remaining extensible toward a full notebook system.

## Decision

The application will evolve into a domain-oriented modular monolith. Each product
domain owns its model, invariants, commands, queries, domain events, repository
interfaces, and tests. React components consume application-facing interfaces and
do not own domain rules.

The target organization is:

```text
src/
  app/
  domains/
    calendar/
    tasks/
    notes/
    planner/
    reminders/
    gamification/
    search/
  platform/
    persistence/
    notifications/
    integrations/
    telemetry/
  shared/
    time/
    recurrence/
    validation/
    types/
  ui/
    primitives/
    patterns/
    themes/
```

Domains communicate through explicit commands, queries, and domain events. They
reference related entities by stable IDs rather than nesting another domain's
records. Persistence and external providers implement domain-owned ports.

## Dependency rules

1. `shared` contains stable primitives and cannot import a product domain.
2. A domain cannot import another domain's persistence or UI implementation.
3. Cross-domain workflows are coordinated in `app` or through domain events.
4. `platform` implements interfaces owned by domains; domains do not depend on
   provider SDKs or browser storage details.
5. `ui` may invoke application commands and queries but cannot mutate canonical
   records directly.
6. Provider payloads are translated at integration boundaries and are never used
   as canonical domain models.

## Consequences

### Positive

- Business rules become independently testable.
- Calendar, task, and note models can evolve without coordinated UI rewrites.
- Google and Microsoft adapters can be added without contaminating canonical
  models.
- Domains can later move into workspace packages without redesigning their public
  interfaces.
- Web and future native clients can share domain behavior.

### Costs

- Commands, queries, repository ports, and mapping code add structure that the
  current prototype does not need at runtime.
- Cross-domain workflows require explicit coordination.
- Migration must be incremental so the working prototype remains usable.

## Rejected alternatives

### Immediate multi-package monorepo

This provides harder boundaries but adds package tooling and release overhead
before multiple clients or independently deployed units require it.

### Technical-layer split

Folders such as `components`, `hooks`, `services`, and `utils` would shorten files
without creating clear ownership for calendar, task, and note behavior.
