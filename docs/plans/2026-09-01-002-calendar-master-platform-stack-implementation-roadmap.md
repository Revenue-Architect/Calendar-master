# Calendar Master Platform Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Calendar Master from its current provider-free web domain into a Convex-backed, cross-device, standards-compatible calendar platform without replacing its custom planner UI or canonical domain semantics.

**Architecture:** Calendar Master owns the domain, local repositories, sync contracts, occurrence identities, conflicts, and UI. Convex owns canonical remote convergence; IndexedDB/SQLite own durable client persistence; provider adapters isolate Google/Microsoft/CalDAV; `rrule-temporal` and `ical.js` are hidden behind recurrence and portability adapters and earn authority through equivalence/round-trip gates.

**Tech Stack:** React/Vite web, Expo/React Native mobile, Convex, IndexedDB, Expo SQLite, `rrule-temporal`, `ical.js`, Google Calendar API, Microsoft Graph, later CalDAV, existing node:test/Playwright suites.

**Spec:** `docs/plans/2026-09-01-001-calendar-master-platform-stack-amendment.md`

## Global Constraints

- Do not implement this plan on `feat/physical-planner-motion`; start from freshly fetched `main` only after the motion initiative is merged/reconciled.
- `docs/adr/0001-domain-oriented-modular-monolith.md` remains architecture authority.
- Canonical Event/Action/Note models remain Calendar Master-owned.
- UI must not import Convex, provider SDK payloads, SQLite/IndexedDB implementations, `rrule-temporal`, or `ical.js` directly.
- `Saved` means durable local commit; `Synced` is a separate remote-convergence status.
- Provider payloads stop at provider adapters.
- `rrule-temporal` may replace recurrence math only after current-vs-candidate equivalence gates pass.
- `ical.js` may replace portability parsing/serialization only after semantic round-trip gates pass.
- No PowerSync, ElectricSQL, RxDB, Schedule-X renderer, date-fns convenience dependency, CRDT, or virtualization dependency is introduced without the explicit gates in the platform-stack amendment.
- Every package addition requires an updated package-legitimacy audit, lockfile review, license review, and focused bundle/runtime impact measurement.
- Preserve unrelated user-owned and untracked files; never use `git add -A`.
- TDD and negative controls are required for deterministic contracts. A newly added test must be demonstrated red against the missing/broken behavior before it is trusted.

---

## Current-state checkpoint

At plan authoring time:

- `main`: `0b257baaf9fbd7621f51ae79f87682243bd49352`.
- `feat/physical-planner-motion`: `8f6d87dd287caf0fca2b5ba03de9263a5c958860`.
- Event semantic-source registration, Event Inspector physical morph, visual-continuity refinement, and Inspector-preserving edit work exist on the motion branch.

These SHAs are evidence only, not execution baselines. Every implementation stage records the newly fetched `origin/main` SHA before editing.

---

## File structure locked by this plan

Existing paths retained during the web-only period:

```text
src/domains/calendar/
  model/
  recurrence/
  portability/
  commands/
  queries/

src/platform/
  persistence/
  integrations/

src/app/
  (commands/controllers/workflows as extraction proceeds)
```

After the second client creates a legitimate workspace, the master plan's target package structure applies:

```text
packages/domain/                 pure canonical domain rules
packages/sync-contracts/         sync envelopes, provider-neutral sync vocabulary
packages/quick-add/              deterministic parser boundary
apps/mobile/                     Expo application
convex/                          authenticated schema/mutations/queries/sync log
```

New bounded infrastructure modules should converge toward:

```text
packages/domain/calendar/recurrence/
  recurrenceEngine.js            CalendarRecurrenceEngine port
  currentRecurrenceEngine.js     compatibility/reference engine during migration
  temporalRRuleEngine.js         rrule-temporal adapter

packages/domain/calendar/portability/
  calendarPortability.js         canonical portability contract
  icalAdapter.js                 ical.js adapter

packages/sync-contracts/providers/
  calendarProvider.js            provider-neutral contract and codecs

src/platform/integrations/google/
src/platform/integrations/microsoft/
src/platform/integrations/caldav/    later
```

Do not create `packages/` merely to satisfy this diagram. The master plan's legitimate-workspace trigger still applies: shared-package extraction happens when the real mobile consumer exists.

---

### Task 0: Close Physical Planner Motion and establish a clean platform baseline

**Files:**
- Read: `docs/plans/2026-08-25-001-physical-planner-motion-prd.md`
- Read: `docs/plans/2026-08-25-002-physical-planner-motion-ard.md`
- Read: `docs/plans/2026-08-27-008-physical-planner-motion-rev-d-amendment.md`
- Read: `docs/plans/2026-09-01-001-calendar-master-platform-stack-amendment.md`
- Modify: none unless motion merge/reconciliation itself requires its own approved unit

**Interfaces:**
- Consumes: completed Physical Planner Motion branch and its verification evidence.
- Produces: one clean latest-main SHA from which platform work branches.

- [ ] **Step 1: Fetch all refs and record topology**

Run:

```bash
git fetch origin --prune
git rev-parse origin/main
git rev-parse origin/feat/physical-planner-motion
git rev-list --left-right --count origin/main...origin/feat/physical-planner-motion
```

Expected: exact topology recorded in the implementation PR/QA artifact; no assumption that the 2026-09-01 planning SHAs are still current.

- [ ] **Step 2: Complete the motion initiative under its own gates**

Use the physical-motion implementation plan and Rev D amendment. Do not add any platform dependencies as part of that completion.

- [ ] **Step 3: Reconcile/merge motion before platform implementation**

Expected: the new platform branch starts from a `main` containing the accepted motion implementation and documentation authority.

- [ ] **Step 4: Prove baseline**

Run:

```bash
npm test
npm run build
npm run test:e2e
```

Expected: baseline results recorded. Existing independently reproduced flakes/residuals are classified against exact main rather than silently relaxed.

- [ ] **Step 5: Create a dedicated platform branch**

Example:

```bash
git switch -c feat/cross-platform-trust-slice origin/main
```

Do not reuse the motion branch.

---

### Task 1: Update dependency legitimacy and architecture enforcement

**Files:**
- Modify: the package-legitimacy QA/audit path established by the master plan
- Modify: `src/architecture.test.js` or its future shared/workspace architecture checker
- Create/Modify: provider/standards dependency rules in the appropriate architecture documentation
- Test: architecture/import-boundary tests

**Interfaces:**
- Consumes: PS-01 through PS-15 from the platform-stack amendment.
- Produces: machine-enforced dependency ownership and a reviewed candidate-package ledger.

- [ ] **Step 1: Write failing architecture tests for forbidden imports**

Add negative controls proving:

```text
UI -> convex                  FAIL
UI -> rrule-temporal          FAIL
UI -> ical.js                 FAIL
domain model -> provider SDK  FAIL
provider adapter -> UI        FAIL
```

Expected: tests fail against deliberately introduced fixture edges or an equivalent test fixture mechanism.

- [ ] **Step 2: Add package candidates to the legitimacy audit**

Verify at implementation time:

```text
rrule-temporal
ical.js
Google Calendar API client strategy (SDK vs direct HTTP)
Microsoft Graph client strategy (SDK vs direct HTTP)
```

Record exact version, source repository, license, maintenance status, browser/native compatibility, ESM/runtime requirements, bundle impact, and known caveats.

Do not add PowerSync to the implementation dependency list; record it as deferred/experimental-review only.

- [ ] **Step 3: Encode dependency rules**

Ensure allowed direction remains:

```text
UI -> app contract -> domain / platform ports
platform adapters -> domain/sync contracts
convex -> domain/sync contracts where runtime-compatible
```

and not the reverse.

- [ ] **Step 4: Run architecture gate**

Run the repository's architecture tests plus full Node suite.

- [ ] **Step 5: Commit the governance unit separately**

Example:

```bash
git add <audit-files> <architecture-tests>
git commit -m "test(architecture): gate platform stack dependencies"
```

---

### Task 2: Implement the Convex trust slice without provider sync

**Files:**
- Follow existing master plan P3-P5 file ownership for:
  - `apps/mobile/`
  - `packages/domain/`
  - `packages/sync-contracts/`
  - `convex/`
  - web IndexedDB repository implementation
  - native SQLite repository implementation
  - sync coordinator/outbox
- Test: shared deterministic repository/sync harnesses

**Interfaces:**
- Consumes: canonical domain commands/queries and versioned local persistence behavior.
- Produces: durable local writes, idempotent envelopes, Convex convergence, and two-client sync independent of Google/Microsoft.

- [ ] **Step 1: Execute the existing master plan's legitimate workspace trigger**

Do not create workspaces until the Expo client is a real second runtime consumer.

- [ ] **Step 2: Freeze repository and sync-envelope contracts with tests**

Minimum contract behavior:

```js
repository.transact(command)
outbox.enqueue(envelope)
sync.push(envelopes)
sync.pull(afterVersion)
repository.applyRemote(batch)
```

Exact APIs may follow the master plan's already-defined contracts; do not introduce a second competing sync vocabulary.

- [ ] **Step 3: Prove durable offline semantics**

Test web reload and native force-stop cases:

```text
mutation locally commits
network unavailable
app process dies/reloads
mutation and outbox survive
network returns
same mutation converges exactly once
```

- [ ] **Step 4: Implement Convex schema/mutations/queries behind sync contracts**

Convex records server truth; domain rules remain in shared domain code rather than being copied into generic backend CRUD functions.

- [ ] **Step 5: Prove two-client convergence**

Use deterministic client A/client B tests covering concurrent edits, stale retries, duplicate envelopes, delete/update races, and recurrence atomicity.

- [ ] **Step 6: Run complete trust-slice gate and commit**

No provider API scopes are introduced in this task.

---

### Task 3: Define and prove the CalendarProvider contract

**Files:**
- Create: `packages/sync-contracts/providers/calendarProvider.js` once workspace admission is legitimate
- Create: provider fixture/contract test module next to sync-contract tests
- Modify: integration architecture documentation

**Interfaces:**
- Consumes: canonical calendar records and sync-conflict vocabulary.
- Produces: a provider-neutral API used by Google, Microsoft, and later CalDAV.

- [ ] **Step 1: Write provider-contract tests before any provider implementation**

Contract fixtures must cover:

```text
list calendars
initial pull
incremental pull
create
update with remote precondition/version
remote delete
local delete
pagination
cursor invalidation/full-resync signal
rate-limit classification
retryable vs terminal auth failure
webhook/subscription renewal signal
recurring series + exception normalization
```

- [ ] **Step 2: Define canonical provider DTOs**

Provider DTOs contain only provider-neutral external-sync data. Raw Google/Microsoft fields stay adapter-local.

- [ ] **Step 3: Add a fake provider implementation**

The fake must pass the same contract suite and support deterministic conflict/incremental-sync scenarios.

- [ ] **Step 4: Wire fake provider through Convex/provider-sync orchestration**

Prove provider candidate changes can flow to canonical conflict records without any real external credentials.

- [ ] **Step 5: Commit provider contract independently**

This is the gate before Google/Microsoft work.

---

### Task 4: Implement Google Calendar API adapter

**Files:**
- Create: `src/platform/integrations/google/` or future shared server/provider adapter location selected by Task 3 ownership
- Test: Google adapter contract fixtures
- Modify: auth/scope configuration only in provider-owned platform code

**Interfaces:**
- Consumes: `CalendarProvider` contract.
- Produces: Google implementation with canonical conversions and incremental sync.

- [ ] **Step 1: Choose SDK vs direct HTTP from measured package audit**

Prefer the smallest strategy that cleanly supports OAuth, incremental sync, event CRUD, recurring instances/exceptions, and push notifications without leaking SDK types.

- [ ] **Step 2: Write Google payload conversion fixtures**

Include timed, all-day, floating-equivalent/provider-zoned, recurrence, exception, attendee, meeting-link, delete/cancel, and timezone cases.

- [ ] **Step 3: Implement read conversion minimally**

Provider payload → provider-neutral DTO → canonical import candidate.

- [ ] **Step 4: Implement write conversion minimally**

Canonical Event/exception → Google request payload.

- [ ] **Step 5: Implement incremental sync and version/precondition handling**

Persist sync tokens/provider IDs only in provider-sync metadata, never canonical Event identity.

- [ ] **Step 6: Pass the provider contract suite**

The Google adapter must pass the Task 3 suite without provider-specific skips except capabilities explicitly documented by the contract.

- [ ] **Step 7: Add credentialed sandbox tests as optional CI/manual gate**

Do not make local development depend on a live Google account; fixture tests remain deterministic.

---

### Task 5: Implement Microsoft Graph adapter

**Files:**
- Create: `src/platform/integrations/microsoft/` or Task 3's selected provider location
- Test: Microsoft adapter contract fixtures

**Interfaces:**
- Consumes: exactly the same `CalendarProvider` contract as Google.
- Produces: Graph implementation without changing canonical domain schemas for Microsoft-specific behavior.

- [ ] **Step 1: Write Graph conversion fixtures**

Cover Graph IDs/change keys, all-day/timed semantics, recurrence patterns/ranges, exceptions, online meetings, cancellations, and timezone mapping.

- [ ] **Step 2: Implement read/write conversion**

No Graph object crosses the adapter boundary.

- [ ] **Step 3: Implement delta/incremental sync and subscriptions**

Map Graph-specific cursor/subscription behavior to provider-neutral signals.

- [ ] **Step 4: Run the same Task 3 contract suite**

A contract change required only by Microsoft must be justified as a provider-neutral capability and rerun against Fake + Google.

- [ ] **Step 5: Run cross-provider convergence cases**

Import/export equivalent canonical fixtures through Google and Microsoft adapters and compare Calendar Master semantics.

---

### Task 6: Introduce `rrule-temporal` as a shadow recurrence engine

**Files:**
- Existing reference: `src/domains/calendar/model/recurrenceRule.js`
- Existing reference: `src/domains/calendar/recurrence/expandRecurrence.js`
- Existing reference: `src/domains/calendar/recurrence/occurrenceIdentity.js`
- Existing reference: `src/domains/calendar/recurrence/splitSeries.js`
- Create: recurrence-engine port/adapter files in the domain/shared package location valid at execution time
- Test: recurrence equivalence corpus and randomized range comparison

**Interfaces:**
- Consumes: Calendar Master's normalized recurrence rule + canonical timing + bounded query range.
- Produces: canonical recurrence anchors only.

- [ ] **Step 1: Freeze current-engine fixtures**

Build a fixture corpus before importing the candidate package. Include all 15 families in the amendment's recurrence gate.

- [ ] **Step 2: Add a deliberately incomplete candidate adapter and prove equivalence tests fail**

This is the negative-control proof that the comparison harness can detect real anchor drift.

- [ ] **Step 3: Implement Calendar rule → `rrule-temporal` mapping**

Keep Temporal/package objects inside the adapter.

- [ ] **Step 4: Map generated occurrences back to canonical anchors**

Do not modify `makeOccurrenceId`, exception application, or series-split semantics in this step.

- [ ] **Step 5: Resolve `missingDatePolicy` explicitly**

`skip` and `clamp` fixtures must retain accepted Calendar Master behavior. If the candidate cannot express `clamp` directly, implement compatibility at the adapter/domain boundary rather than silently changing semantics.

- [ ] **Step 6: Run deterministic and randomized equivalence**

Compare current and candidate engines across thousands of rules/ranges, including DST boundaries and long-running series.

- [ ] **Step 7: Benchmark bounded-range expansion**

Candidate must not create an unacceptable Month/Week rendering regression relative to the optimized current engine.

- [ ] **Step 8: Switch authority behind the port only after parity acceptance**

Keep a rollback path for at least the migration release window.

- [ ] **Step 9: Run full recurrence + E2E suite**

No UI changes belong in this task except user-visible recurrence options explicitly enabled by a separately approved product change.

---

### Task 7: Introduce `ical.js` behind portability

**Files:**
- Existing: `src/domains/calendar/portability/`
- Create/Modify: portability adapter files in the valid domain/shared package location
- Test: RFC fixture corpus + semantic round-trip tests + malformed-input bounds

**Interfaces:**
- Consumes: bytes/text RFC 5545 documents or canonical Calendar Master records.
- Produces: validated canonical import candidates or serialized RFC documents.

- [ ] **Step 1: Characterize existing ICS import/export behavior**

Freeze current supported fields and recurrence/exception behavior with fixtures.

- [ ] **Step 2: Write failing round-trip tests for the new adapter contract**

Required:

```text
canonical → ICS → canonical
ICS → canonical → ICS → canonical
```

Compare semantics, not byte-for-byte formatting.

- [ ] **Step 3: Add bounded `ical.js` parser adapter**

Keep ICAL objects private to adapter functions.

- [ ] **Step 4: Add canonical serializer adapter**

Cover VEVENT recurrence, EXDATE/RDATE where supported, all-day/timed values, timezone references, descriptions/locations, attendees/meeting metadata within product scope.

- [ ] **Step 5: Define timezone-data strategy explicitly**

Document how imported TZID definitions are resolved on web/native/server. Do not assume the library ships all zone definitions.

- [ ] **Step 6: Pressure test malicious/oversized input**

Reuse existing untrusted-import limits/philosophy; add depth/count/size/time bounds where required.

- [ ] **Step 7: Run portability, recurrence, migration, backup/recovery, and full browser gates**

Switch authority only after semantic parity.

---

### Task 8: Unify provider conflict and recurrence/portability behavior

**Files:**
- Modify: sync coordinator/conflict modules established in Tasks 2-5
- Modify: existing conflict resolver UI only through app/view-model contracts
- Test: cross-provider recurrence and conflict integration fixtures

**Interfaces:**
- Consumes: canonical local records, normalized remote provider candidates, sync metadata.
- Produces: deterministic conflict records and accepted canonical mutations.

- [ ] **Step 1: Write field-level conflict fixtures**

Include title/time/location/notes/recurrence/attendees/delete-vs-edit cases.

- [ ] **Step 2: Prove recurrence exceptions remain atomic**

A provider update to one occurrence must not accidentally rewrite the series; a series update must not orphan local exceptions.

- [ ] **Step 3: Prove retry/idempotency under provider webhook duplication**

Duplicate notifications must not duplicate Events or exceptions.

- [ ] **Step 4: Wire visual conflict resolver to canonical conflict records**

The UI chooses `accept remote`, `keep local`, or `split`; it does not contain provider-specific merge logic.

- [ ] **Step 5: Run two-client + provider convergence stress corpus**

Include offline local edit → remote provider edit → reconnect → conflict resolution → both clients converge.

---

### Task 9: Add CalDAV through the established provider port

**Files:**
- Create: `src/platform/integrations/caldav/` or Task 3's selected server/provider location
- Test: CalDAV contract fixtures and server-variation corpus

**Interfaces:**
- Consumes: existing `CalendarProvider` contract and `ical.js` portability utilities where ownership permits.
- Produces: CalDAV provider implementation without domain changes.

- [ ] **Step 1: Select the CalDAV protocol/client strategy through package audit**

Do not adopt a library merely because it exists; verify WebDAV auth, sync-collection/report support, ETags, calendar discovery, and target runtime compatibility.

- [ ] **Step 2: Build deterministic server fixtures**

Cover collection discovery, ETag update conflicts, deleted resources, sync-token support/fallback, recurring ICS objects, and auth failures.

- [ ] **Step 3: Implement discovery/read/write/delete**

Use `ical.js` only through the portability boundary; CalDAV wire data does not enter the domain.

- [ ] **Step 4: Pass the same provider contract suite**

Any capability gap is explicitly represented rather than hidden with adapter-specific UI branching.

- [ ] **Step 5: Test against at least two materially different CalDAV servers before product release**

Examples may include Fastmail/Nextcloud/another supported server at execution time; record exact environments and results.

---

### Task 10: Offline architecture re-evaluation — PowerSync decision gate

**Files:**
- Create: a new ADR only if the result changes the accepted architecture
- Create: QA benchmark/spike artifact if PowerSync is evaluated
- Production files: none unless the ADR is accepted

**Interfaces:**
- Consumes: measured Convex + IndexedDB/SQLite production behavior.
- Produces: explicit `keep current repositories` or `adopt PowerSync behind ports` decision.

- [ ] **Step 1: Collect real offline metrics**

Measure:

```text
cold-start local read latency
offline mutation latency
outbox recovery time
reconnect convergence latency
conflict frequency
sync implementation maintenance burden
storage/bundle footprint
```

- [ ] **Step 2: Re-verify PowerSync Convex production maturity**

Do not reuse the 2026-09-01 experimental-status assumption. Check current official support, limitations, pricing/runtime footprint, and migration requirements.

- [ ] **Step 3: Spike behind the repository/sync ports only if evidence justifies it**

The spike is rejected if it requires domain/UI consumers to depend directly on PowerSync or forces a second canonical backend model.

- [ ] **Step 4: Write an ADR before production adoption**

If benefits are insufficient, record the decision to remain on client repositories + Convex and delete the spike.

---

### Task 11: Evidence-gated optional infrastructure

**Files:**
- New ADR/plan required per adopted item
- No production files changed by default

**Interfaces:**
- Consumes: measured product need.
- Produces: explicit adopt/reject decision for optional infrastructure.

- [ ] **Step 1: TanStack Virtual gate**

Adopt only if profiling identifies a real rendering bottleneck. Before acceptance, prove Event/Action source registration, source remount, morph return target, drag/resize geometry, scroll ownership, focus restoration, and accessibility remain correct under virtualization.

- [ ] **Step 2: Automerge/Yjs gate**

Adopt only for a collaborative document-like domain with concurrent offline authors. Ordinary calendar/task conflict handling remains transactional.

- [ ] **Step 3: date-fns gate**

Adopt only if a concrete operation cannot be expressed cleanly by Calendar Master's time abstraction + Temporal direction. A convenience import is insufficient justification.

- [ ] **Step 4: shadcn/Base UI gate**

Use bounded primitives only where they preserve `DESIGN.md`, physical morph, focus, inertness, and gesture contracts. Event/Action/Note/Composer physical surfaces remain custom.

- [ ] **Step 5: Schedule-X/ElectricSQL/RxDB rejection check**

No implementation task exists for these under the current architecture. Introducing one requires a superseding architecture decision with measured evidence.

---

## Cross-stage release gates

No platform milestone is considered complete solely because its focused tests are green.

### Gate A — architecture

```text
no forbidden imports
no provider payload leakage
no duplicate domain models
no direct UI persistence/backend writes
```

### Gate B — persistence/offline

```text
web reload recovery
native force-stop recovery
offline CRUD
retry/idempotency
no duplicate entities
```

### Gate C — recurrence

```text
current-vs-candidate equivalence
DST/floating/zoned fixtures
exception/split parity
range performance
```

### Gate D — portability

```text
ICS semantic round trip
malformed-input bounds
timezone fidelity
recurrence/exception fidelity
```

### Gate E — provider

```text
Fake + Google + Microsoft same contract
incremental sync
webhook duplication
version/precondition conflict
provider recurrence exceptions
```

### Gate F — full product regression

At every behavior-changing migration boundary:

```bash
npm test
npm run build
npm run test:e2e
```

plus mobile/shared-package tests once those runtimes exist. Any red is reproduced on the exact pre-change baseline before being classified as unrelated.

---

## Recommended execution/review ownership

- **Codex / strongest coding agent:** implementation, TDD, repo edits, local verification, package spikes.
- **GPT-5.6 Sol:** independent architecture pressure test, upstream/downstream review, phase gates, regression attribution.
- **Claude strongest coding/reasoning model:** optional second-opinion review for large provider adapters, mobile UI, and interaction-heavy diffs.
- **Human/browser/device:** final UX, physical-motion, offline/device, auth-consent, and provider-account validation.

Checkpoint after each independently risky boundary rather than after every commit:

1. Convex/local repository trust slice.
2. Provider contract + Google/Microsoft.
3. Recurrence engine switch.
4. ICS portability switch.
5. Provider conflict/convergence.
6. CalDAV.
7. Any PowerSync/virtualization/CRDT architecture decision.

---

## Definition of done

This roadmap is complete when:

1. Physical Planner Motion is merged and unaffected by platform work.
2. Web and native clients have durable local repositories/outboxes and converge through Convex.
3. Google Calendar and Microsoft Graph pass one provider-neutral contract.
4. `rrule-temporal` is either accepted behind the recurrence port after equivalence or explicitly rejected with evidence while the current engine remains authoritative.
5. `ical.js` is either accepted behind portability after round-trip/security gates or explicitly rejected with evidence.
6. Provider conflicts converge deterministically across clients.
7. CalDAV, if in release scope, is an adapter rather than a domain fork.
8. PowerSync remains deferred unless a later ADR passes the measured decision gate.
9. No Schedule-X renderer, extra date model, speculative CRDT, alternate Convex database/sync architecture, or profiling-free virtualization has entered the core stack.
10. Full regression, offline, provider, standards, and device evidence is recorded against exact commits.
