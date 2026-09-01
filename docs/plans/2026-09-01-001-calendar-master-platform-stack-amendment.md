---
title: Calendar Master Platform Stack Amendment — Convex, Temporal Recurrence, Portability & Provider Sync
type: architecture-amendment
status: accepted-planning-amendment
date: 2026-09-01
amends:
  - docs/plans/2026-08-13-calendar-master-implementation-master-plan.md
  - docs/plans/2026-08-20-001-feat-hybrid-sync-and-cross-pane-drag-plan.md
architecture_authority: docs/adr/0001-domain-oriented-modular-monolith.md
product_authority: docs/product/planner-foundation.md
---

# Calendar Master Platform Stack Amendment

## 1. Purpose and authority

This amendment reconciles the existing cross-platform master plan and hybrid-sync plan with the approved platform-stack decisions made after reviewing Calendar Master's current calendar domain, recurrence engine, portability seams, persistence strategy, and provider roadmap.

It is **binding for backend, local persistence, recurrence-engine, portability, provider-sync, virtualization, collaboration, and calendar-renderer dependency choices** wherever the older plans conflict with it. It does **not** supersede the interaction, direct-manipulation, drag-to-plan, drag-to-create, physical-motion, or product-behavior portions of those plans.

The existing architecture remains a domain-oriented modular monolith. External packages implement bounded infrastructure behind Calendar Master-owned ports; they do not become the application's domain model.

### Current repository snapshot used for this amendment

As of 2026-09-01:

- `main` is `0b257baaf9fbd7621f51ae79f87682243bd49352`.
- `feat/physical-planner-motion` is `8f6d87dd287caf0fca2b5ba03de9263a5c958860` (`feat(motion): preserve Event Inspector during edit`).
- The motion branch has already delivered Event semantic-source registration and Event Inspector physical morph work and has progressed into edit-in-place continuity.
- The motion branch and `main` are currently divergent by ancestry because the Rev D documentation landed independently on both lines.

**Sequencing rule:** no Convex, provider, recurrence-library, portability-library, local-first, or virtualization implementation is to be mixed into `feat/physical-planner-motion`. Finish, validate, reconcile, and merge the physical-planner initiative first. Platform-stack implementation begins on its own branch from the then-current `main`.

---

## 2. Binding stack decisions

| ID | Decision | Status |
|---|---|---|
| PS-01 | **Convex is the canonical remote backend and realtime convergence layer.** | Adopt |
| PS-02 | Preserve the master plan's **client-owned durable repositories and outboxes**: IndexedDB on web and SQLite on native. Convex optimistic UI is not a substitute for durable offline persistence. | Adopt |
| PS-03 | **Do not introduce PowerSync now.** Re-evaluate only after the first Convex trust slice is stable and measured offline requirements prove that a dedicated sync layer is worth its complexity. | Defer |
| PS-04 | **`rrule-temporal` is the preferred future RFC recurrence calculation engine**, hidden behind Calendar Master's recurrence adapter. It must not replace the Event, timing, occurrence, exception, or series models. | Adopt after equivalence gate |
| PS-05 | Preserve Calendar Master's recurrence semantics, including occurrence IDs, `recurrenceAnchor`, edited/cancelled/added exceptions, series splitting, floating/zoned timing, and `missingDatePolicy`. Any semantic difference is an explicit migration decision, never an incidental library side effect. | Binding |
| PS-06 | **`ical.js` is the preferred RFC 5545 parser/serializer** behind `src/domains/calendar/portability/` or its future shared-package equivalent. ICAL objects never become canonical Calendar Master records. | Adopt after adapter gate |
| PS-07 | Provider sync uses a Calendar Master-owned provider port. **Google Calendar API and Microsoft Graph are first-party provider implementations. CalDAV follows later through the same port.** | Adopt |
| PS-08 | **Nylas is no longer a required architecture dependency.** The older hybrid-sync plan's Nylas-specific Phase 4 is superseded. A middleware provider may be reconsidered later only if direct-provider operational cost is proven to outweigh abstraction/control benefits. | Superseded |
| PS-09 | **Schedule-X does not replace Calendar Master's planner renderer.** The custom Day/Week/Month/Agenda/Actions interaction and physical-motion system remains product infrastructure. | Reject as renderer |
| PS-10 | **Do not add `date-fns` by default.** Calendar Master keeps its DateKey/localDateTime/timezone boundaries and moves standards-heavy recurrence work toward Temporal rather than creating parallel date models. | Reject unless gap proven |
| PS-11 | **TanStack Virtual is profiling-gated.** It may be introduced only on a measured hot surface and only after morph/gesture/focus/source-lifecycle tests prove virtualization does not break semantic object continuity. | Conditional |
| PS-12 | **Automerge/Yjs are collaboration-gated.** They may be used for truly concurrent document-like editing (for example collaborative Notes), not ordinary Event/Action transactional mutations. | Conditional |
| PS-13 | **ElectricSQL and RxDB are not part of the Convex architecture.** Adding either requires a new architecture decision showing why Convex + existing repository/outbox ports are insufficient. | Reject under current architecture |
| PS-14 | **shadcn/Base UI-style primitives remain bounded implementation aids, not core planner architecture.** They may help with neutral dialogs, standard form controls, menus, and accessibility primitives where they preserve the design/motion contracts; they must not replace Event/Action/Note/Composer physical surfaces or gesture ownership. | Conditional |
| PS-15 | `chrono-node` remains a deterministic Quick Add parser candidate behind its existing parser contract; it is independent from recurrence calculation. | Preserve existing decision |

---

## 3. Target architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Clients                                                              │
│ React/Vite web                 Expo / React Native                   │
│                                                                     │
│ UI → app commands/queries → Calendar Master domain                  │
│                 │                                                    │
│                 ├── durable local repository                         │
│                 │     Web: IndexedDB                                 │
│                 │     Native: SQLite                                 │
│                 │                                                    │
│                 └── transactional mutation outbox                    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ idempotent sync envelopes
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Convex                                                               │
│ auth-scoped canonical remote records                                 │
│ monotonic sync/version log                                            │
│ mutations / queries / conflict retention                             │
│ provider-sync orchestration state                                    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ provider port
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
        Google Calendar   Microsoft Graph    CalDAV
           first              first           later
```

The key distinction is intentional:

- **Local repository = durable device truth for responsive/offline UX.**
- **Convex = canonical remote truth and cross-device convergence.**
- **Provider adapters = external-system translations and sync cursors.**
- **Calendar domain = canonical product semantics.**

No provider SDK, RFC library, Convex generated type, SQLite row, or IndexedDB record shape may leak into presentation components or become the Calendar Event model.

---

## 4. Calendar standards boundary

### 4.1 Recurrence adapter

Calendar Master currently owns a mature recurrence domain with:

- `src/domains/calendar/model/recurrenceRule.js`
- `src/domains/calendar/recurrence/expandRecurrence.js`
- `src/domains/calendar/recurrence/occurrenceIdentity.js`
- `src/domains/calendar/recurrence/splitSeries.js`

That public/domain behavior remains authoritative.

The migration boundary is conceptually:

```text
Calendar recurrence model
        │
        ▼
CalendarRecurrenceEngine port
        │
        ├── CurrentRecurrenceEngine   (authoritative during migration)
        └── TemporalRRuleEngine       (`rrule-temporal`, shadow candidate)
        │
        ▼
canonical recurrence anchors
        │
        ▼
existing occurrence identity + timing + exceptions + series logic
```

`rrule-temporal` is allowed to answer **when recurrence anchors occur**. It does not own:

- Event IDs or series IDs;
- `recurrenceAnchor` encoding;
- occurrence ID construction;
- edited/cancelled/added exceptions;
- split-series behavior;
- Calendar Master timing records;
- provider metadata;
- persistence records;
- UI labels.

### 4.2 Shadow-engine migration gate

The current engine remains authoritative until the candidate engine proves equivalence over the supported contract.

Required fixture families:

1. daily / interval daily;
2. weekly / multi-weekday / custom week start;
3. monthly date rules including 29/30/31;
4. ordinal weekdays including last weekday;
5. yearly month/month-day combinations;
6. `COUNT` and `UNTIL`;
7. leap years;
8. floating timed events;
9. zoned timed events;
10. DST spring-forward and fall-back boundaries;
11. edited, cancelled, and added exceptions;
12. split series;
13. long-running series and bounded range queries;
14. `missingDatePolicy: skip`;
15. `missingDatePolicy: clamp`.

For every fixture, compare canonical recurrence anchors and resulting occurrences. Any mismatch must be classified as:

- candidate bug;
- current-engine bug with independent evidence;
- intentional standards migration requiring a product/domain decision.

No mismatch is silently normalized away.

### 4.3 `missingDatePolicy` compatibility

Calendar Master's `skip|clamp` behavior is a product/domain contract. RFC `SKIP` behavior exposed by a recurrence package is not assumed to be equivalent to Calendar Master's existing clamp semantics.

The adapter must either reproduce current behavior exactly or introduce a separately approved migration with:

- before/after fixtures;
- persistence compatibility;
- import/export mapping;
- user-visible description changes;
- provider round-trip evidence.

---

## 5. iCalendar portability boundary

`ical.js` belongs behind the existing calendar portability seam.

```text
.ics / jCal input
      │
      ▼
ical.js parser
      │
      ▼
Calendar Master portability adapter
      │
      ▼
canonical Calendar Event / recurrence / exception records
```

and in reverse:

```text
canonical Calendar Master records
      │
      ▼
portability adapter
      │
      ▼
ical.js serializer
      │
      ▼
RFC 5545 output
```

Rules:

1. `ICAL.Component`, `ICAL.Event`, recurrence objects, or timezone objects are adapter-local values.
2. Import validation remains Calendar Master-owned.
3. Export/re-import must preserve canonical supported semantics.
4. Unknown but preservable RFC properties should have an explicit extension/metadata strategy rather than being discarded accidentally.
5. Timezone definitions are an explicit implementation concern; do not assume the library bundles every timezone definition needed by imported feeds.
6. ICS parsing must be bounded against malformed or adversarial input using the existing untrusted-import philosophy.

---

## 6. External provider architecture

### 6.1 Provider-neutral port

Provider implementations must conform to a stable application/platform contract rather than teaching the domain Google or Microsoft payloads.

Conceptual contract:

```js
CalendarProvider = {
  listCalendars(account, cursor),
  pullChanges(account, syncCursor),
  createEvent(account, canonicalEvent),
  updateEvent(account, externalId, canonicalEvent, precondition),
  deleteEvent(account, externalId, precondition),
  getEvent(account, externalId),
  renewSubscriptions(account),
}
```

Provider adapters own:

- OAuth/provider tokens and scopes;
- provider event IDs and etags/change keys;
- incremental-sync cursors/tokens;
- webhook/subscription renewal;
- provider payload conversion;
- provider-specific rate-limit and retry classification.

Calendar Master owns:

- canonical Events and exceptions;
- local mutations;
- sync envelopes/idempotency;
- conflict vocabulary;
- user-facing conflict decisions;
- recurrence/portability semantics;
- cross-device convergence through Convex.

### 6.2 Provider order

1. **Google Calendar API** — first provider implementation.
2. **Microsoft Graph** — second provider implementation using the same port and contract tests.
3. **CalDAV** — third provider family, after provider-neutral conflict/cursor semantics are stable.

CalDAV is deliberately later because it introduces protocol/server variability. The architecture must make adding it an adapter project, not a domain rewrite.

### 6.3 Provider conflict model

The existing visual conflict resolver concept is retained, but the source of remote state changes:

```text
provider webhook/poll
   → provider adapter
   → normalized remote candidate
   → Convex/provider-sync record
   → sync coordinator
   → local repository conflict record
   → UI conflict resolver
```

The older Nylas-specific payload path is superseded.

---

## 7. Offline and sync policy

### 7.1 What stays from the existing master plan

Keep the planned durable local repositories and outboxes:

- web: per-record IndexedDB repository + transactional outbox;
- native: normalized SQLite repository + transactional outbox;
- shared idempotent mutation envelopes;
- Convex push/pull convergence;
- `Saved` means durable local transaction committed;
- `Synced` is separate status and means accepted remote convergence.

### 7.2 PowerSync decision gate

PowerSync is not installed in the initial Convex architecture.

Re-evaluate only when all of these are true:

1. Convex trust slice is production-stable.
2. Offline requirements are measured on real web/native clients.
3. Existing repository/outbox implementation shows a concrete maintenance, latency, or convergence cost.
4. Convex integration support in PowerSync is no longer an experimental risk for the required production targets.
5. A spike proves it can sit behind existing repository/sync ports without leaking PowerSync types into domain/UI code.
6. Migration and rollback from the existing local repositories are defined.
7. Bundle/storage/runtime impact is measured.

Until that gate passes, the existing repository/outbox architecture is the intended offline implementation.

---

## 8. Dependency admission policy

Every new package must pass the master plan's package-legitimacy gate before installation. Add these candidates to the next package audit; do not pin versions in this planning amendment because implementation must verify the latest compatible release and its licensing/security posture at that time.

| Package / family | Intended job | Admission rule |
|---|---|---|
| `convex` | canonical remote backend/realtime sync | Existing approved direction; implement only in trust-slice branch |
| `rrule-temporal` | RFC recurrence calculations using Temporal | recurrence adapter + shadow equivalence first |
| `ical.js` | RFC 5545 parsing/serialization | portability adapter + round-trip/security fixtures first |
| Google Calendar API client or direct HTTP adapter | provider sync | provider port first; minimal scopes |
| Microsoft Graph client or direct HTTP adapter | provider sync | provider port first; minimal scopes |
| CalDAV client implementation | standards provider sync | only after Google/Graph contract stabilizes |
| shadcn/Base UI primitives | bounded generic UI primitives | only where physical-planner and design contracts remain intact |
| TanStack Virtual | targeted rendering optimization | profiling + morph/gesture lifecycle proof required |
| PowerSync | possible future sync helper | deferred decision gate above |
| Automerge / Yjs | collaborative document state | only after a collaborative-domain ADR |
| date-fns | date utility | only if Temporal/custom time abstractions cannot cover a concrete measured gap |
| ElectricSQL / RxDB | alternate local/sync architecture | prohibited while Convex architecture is active without superseding ADR |
| Schedule-X | calendar renderer | not admitted as planner renderer |

---

## 9. Explicit non-goals

This amendment does **not** authorize:

- replacing the custom Day/Week/Month/Agenda/Actions UI;
- replacing Calendar Master Event/Task/Note schemas with third-party objects;
- introducing backend code onto the physical-motion branch;
- removing IndexedDB/SQLite plans because Convex has optimistic updates;
- using CRDTs as a general conflict-resolution mechanism;
- adding a second sync database beside Convex without an ADR;
- adding date libraries for convenience;
- virtualizing planner surfaces before profiling;
- changing recurrence semantics merely to match a library default;
- requesting Google/Microsoft provider scopes before the provider trust model is specified and tested.

---

## 10. Sequencing amendment

The existing cross-platform master sequencing remains authoritative, with these insertions/refinements:

1. **Finish Physical Planner Motion** and merge/reconcile it first.
2. Resume the cross-platform trust program: repository ports, Expo/workspace trigger, durable local repositories/outboxes, identity, Convex schema and convergence.
3. Establish the provider-neutral CalendarProvider port before writing Google or Microsoft adapters.
4. Implement Google Calendar API, then Microsoft Graph, with shared contract tests.
5. Migrate recurrence math to `rrule-temporal` through a shadow/equivalence program; do not combine this with provider sync behavior changes.
6. Add `ical.js` behind portability with import/export round-trip gates.
7. Harden provider conflict/convergence behavior using the now-shared recurrence and portability semantics.
8. Add CalDAV through the same provider port.
9. Re-evaluate PowerSync only at the explicit offline decision gate.
10. Consider TanStack Virtual or CRDTs only from measured product requirements, never as speculative infrastructure.

Recurrence and portability stages may be moved earlier than provider adapters if a provider implementation proves blocked on standards fidelity, but each remains an isolated migration branch with its own equivalence/round-trip gate.

---

## 11. Verification matrix

| Concern | Required evidence |
|---|---|
| Domain isolation | architecture tests reject provider/Convex/RFC-library imports from UI and canonical domain records |
| Convex convergence | deterministic two-client push/pull/idempotency/conflict tests |
| Durable offline | force-stop/reload/offline mutation recovery on web and native |
| Recurrence | current-vs-Temporal shadow equivalence over supported fixtures and randomized ranges |
| DST/timezone | spring/fall transitions and floating/zoned fixtures |
| Exceptions | edited/cancelled/added occurrence and split-series parity |
| ICS | export → parse → canonical round trip; parse → export semantic preservation |
| Provider contract | same provider-port fixture suite passes Google and Microsoft adapters |
| CalDAV | same provider contract plus server-variation fixtures |
| Security | token storage/scopes, untrusted ICS bounds, auth ownership, redacted diagnostics |
| Virtualization | only if adopted: source remount, focus, drag, resize, scroll, and morph continuity tests |
| Collaboration | only if adopted: deterministic concurrent-edit merge corpus and product-level conflict semantics |

---

## 12. Rollback and change-control rules

1. New standards engines begin behind adapters and feature/migration gates.
2. Current recurrence remains available until candidate equivalence is accepted.
3. Existing ICS behavior remains available until `ical.js` round-trip parity is accepted.
4. Provider adapters are independently disableable; one provider cannot corrupt canonical records for another.
5. Local repository/outbox data formats receive explicit versioned migrations.
6. Convex schema changes preserve compatibility with at least the immediately previous supported client version during rollout.
7. No dependency is considered architecture authority. If a package becomes unsuitable, replace the adapter implementation rather than rewriting domain/UI consumers.

---

## 13. Supersession map

### `docs/plans/2026-08-13-calendar-master-implementation-master-plan.md`

Preserve:

- Convex as backend;
- Expo/React Native direction;
- IndexedDB/SQLite durable repositories;
- outboxes and idempotent envelopes;
- shared domain packages;
- Chrono parser boundary;
- trust-slice sequencing and convergence gates.

Amend:

- add `rrule-temporal` and `ical.js` to the next package-legitimacy audit;
- add provider-neutral Google/Graph/CalDAV architecture;
- add explicit deferred PowerSync decision gate;
- add conditional/rejected dependency policy in PS-09 through PS-14.

### `docs/plans/2026-08-20-001-feat-hybrid-sync-and-cross-pane-drag-plan.md`

Preserve:

- native-pointer cross-pane drag architecture;
- edge auto-scroll;
- action single-identity planning semantics;
- drag-to-create;
- visual conflict resolver product concept;
- zero-latency local mutation requirement.

Supersede:

- `rrule` dependency recommendation → `rrule-temporal` behind adapter/equivalence gate;
- Nylas-specific gateway → Convex + CalendarProvider port + direct Google/Microsoft adapters;
- localStorage-only outbox as target → durable per-record IndexedDB/SQLite repositories/outboxes from the master plan;
- provider payload assumptions → provider-neutral canonical translation;
- date-fns remains rejected unless an explicit future gap is proven.

---

## 14. Definition of accepted architecture

This amendment is satisfied when future implementation can answer all of the following without ambiguity:

- Which layer owns durable local data? **Client repository.**
- Which layer owns remote convergence? **Convex.**
- Which layer owns recurrence product semantics? **Calendar Master domain.**
- Which layer may calculate RFC recurrence anchors? **The recurrence-engine adapter, eventually backed by `rrule-temporal`.**
- Which layer parses/serializes ICS? **The portability adapter, eventually backed by `ical.js`.**
- Which layer owns Google/Microsoft/CalDAV payloads? **Provider adapters.**
- Does Schedule-X own planner rendering? **No.**
- Does date-fns become another canonical time model? **No.**
- Is PowerSync required for V1? **No.**
- Are CRDTs the default conflict engine? **No.**
- Can a package decision change physical-planner gesture/motion contracts? **No.**
