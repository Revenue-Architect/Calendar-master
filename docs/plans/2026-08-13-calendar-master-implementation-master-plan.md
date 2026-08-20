# Calendar Master implementation master plan

**Status:** Implementation-ready sequencing plan  
**Date:** 2026-08-13  
**Execution baseline:** The latest fetched origin/main at the start of execution  
**Observed local baseline:** origin/main at 9deff6458811674e0b28a372345f9a1722f35afc; the current agent/nav-shell-bootstrap branch is one commit behind that local reference  
**Architecture authority:** docs/adr/0001-domain-oriented-modular-monolith.md  
**Product authority:** the approved cross-platform PRD, promoted by Phase 1 to docs/product/calendar-master-cross-platform.md  
**Visual and motion authority:** DESIGN.md  
**Sequencing authority:** this plan  
**Amended:** 2026-08-16 (Amendment 1) and 2026-08-19 (Amendment 2 — connected product and resequencing; read it first, it controls). The evidence below was measured on 2026-08-13 and has drifted materially since: Planner.jsx is 9,079 lines, not ~8,100. Read Amendment 1 before executing any phase.  

This plan supersedes the sequencing and stale commit-transfer instructions in docs/superpowers/plans/2026-08-11-cross-platform-trust-phase-1.md wherever they conflict. It does not replace that document as historical planning evidence. It does not create or use a competing .planning source of truth.

## Executive decision

Calendar Master will evolve from the existing React/Vite web application into an Android-first, **connected** cross-platform product (see Amendment 2) without replacing the working web client or rewriting its mature domain behavior.

Execution is deliberately ordered:

1. Finish the interaction-regression remediation already specified for the web app.
2. Make documentation authority explicit and turn ADR 0001 dependency rules into an automated, ratcheting build gate.
3. Extract only low-risk web surfaces, and extract each surface with a real app controller/view-model boundary rather than moving JSX alone.
4. Introduce an Expo Android client, shared JavaScript packages, durable local repositories and outboxes, Clerk identity, and Convex sync as one end-to-end trust program before continuing broad web extraction.
5. Prove one complete Day workflow offline, through force-stop recovery, sync, conflict handling, recurrence round trips, and web convergence.
6. Add Chrono behind a deterministic parser contract, then certify a private beta.
7. Continue broader web extraction only after the trust slice is operating. Timeline is the final web surface to move. *(Overtaken — see Amendment 2. Web extraction completed ahead of the trust slice; `WeekGrid` moved 2026-08-19.)*

The architecture remains a domain-oriented modular monolith. The repository becomes a workspace only when the Expo client exists and consumes shared code. The root React/Vite web app remains where it is; there is no apps/web move in this plan.

## Problem and scope

### Problem

The repository contains strong domain logic, mature persistence migrations, and extensive browser coverage, but the product is not yet ready to support a second client safely:

- src/Planner.jsx is approximately 8,100 lines and currently combines app orchestration, persistence lifecycle, derived projections, navigation, inspectors, gestures, and many view components.
- There is no src/ui layer and only a small src/app layer, so ADR 0001 is not yet mechanically enforced.
- The web client persists a versioned notebook blob under nbmp:state:v8. The current test helpers seed and inspect that localStorage shape directly.
- There is no Expo client, durable per-record web repository, mobile SQLite repository, outbox, identity integration, Convex schema, or sync coordinator.
- The approved cross-platform PRD still lives at a draft-oriented path and is not indexed as the living product authority.
- The current branch is not the execution baseline. It is behind the locally known origin/main, and the required regression plan is untracked in this workspace.
- The repository has no checked-in hosted preview configuration, EAS configuration, or mobile distribution setup.

### In scope

- Closing all requirements R1-R19 in docs/plans/2026-08-13-1032-fix-calendar-interaction-regressions-plan.md.
- Documentation promotion, typed authority, indexing, link validation, and supersession labels.
- Automated dependency-rule enforcement with an exact legacy-exception ledger and a decreasing Planner.jsx boundary budget.
- Low-risk extraction of navigation, command/search, shortcuts, and Agenda surfaces through named app queries and commands.
- An Expo Router Android app, introduced before any iOS work.
- A real workspace trigger and shared-package extraction only after the second client exists.
- Shared JavaScript domain and sync-contract packages.
- Per-record IndexedDB storage and outbox for web, normalized SQLite storage and outbox for Android, and compatibility with the existing notebook and keys.
- Clerk plus Google identity validation, Convex data model, push/pull protocol, idempotency, conflict retention, recurrence atomicity, and convergence evidence.
- One native Day vertical slice that works offline, survives force-stop, syncs to web, and supports the launch-critical event and Action interactions.
- Deterministic Chrono integration after basic create/sync trust is proven.
- Production-bundle preview and controlled Android private-beta certification.
- A gated continuation order for remaining extraction, iOS, provider sync, desktop packaging, and documentation archival.

### Out of scope for the trust milestone

- Replacing React/Vite, rewriting in Flutter or Kotlin, or moving the web app under apps/web.
- A general LLM in event or Action creation.
- Direct provider-calendar synchronization or requesting provider calendar scopes.
- Tauri packaging.
- iOS release work.
- Broad notes synchronization, collaborative sharing, widgets, watch surfaces, or provider breadth.
- A big-bang Planner.jsx rewrite.
- Immediate mass movement of historical specs, plans, or QA evidence.

These items are deferred by explicit product and sequencing decisions, not omitted because of implementation difficulty.

## Live repository evidence

| Evidence | Planning consequence |
|---|---|
| origin/main at the locally known 9deff64 contains the current export/import/undo/crash-recovery hardening. | Every phase begins from a freshly fetched latest main, never from the current lagging branch. The exact SHA is recorded in phase evidence. |
| docs/plans/2026-08-13-1032-fix-calendar-interaction-regressions-plan.md is present but untracked in this workspace. | Preserve it, land or otherwise adopt it explicitly, and complete it before architecture or cross-platform changes. Never discard it during baseline preparation. |
| Commit 47982d4 referenced by the older trust plan is not an ancestor of the locally known origin/main. | Do not cherry-pick that stale plan commit. Promote the approved PRD content that is present on the execution baseline and reconcile any newer main changes normally. |
| src/domains contains calendar, tasks, notes, planner, reminders, gamification, and search modules with public indexes and extensive node:test coverage. | Reuse and mechanically relocate mature JavaScript domains; do not reimplement their rules in React Native or Convex. |
| src/domains/planner/queries/dayAggregate.js composes public calendar, task, and note indexes; notes migration validation imports the prior task migration validator. | The boundary checker needs two narrow, documented composition/migration rules rather than a blanket ban or wildcard exemption. |
| src/platform/persistence owns versioned notebook import, read, store, backup, recovery, preferences, reminders, diagnostics, and motivation stores. | New repositories must sit behind app/domain ports and preserve current recovery/export semantics and keys during compatibility migration. |
| src/Planner.jsx still imports domain, feature, platform, and storage seams. **As of 2026-08-19 it declares no React components at all** — NavigationShell, ActionsPanel, WeekGrid, Agenda, sheets, notebook, note editor, command palette, shortcuts and composer are all in `src/features/planner/`. What remains is `Planner()` itself at 4,925 lines with 235 hook calls. | Planner.jsx receives a ratcheting exception, not permanent exemption. The JSX has now gone; the controller state, effects and direct dependencies did **not** go with it, because those extractions were byte-exact moves. That residue is the debt this row now tracks. |
| package.json is a single private React 19/Vite 7 package with node:test and Playwright scripts and no workspaces, Expo, Convex, Clerk, or Chrono dependency. | Workspace and dependency changes are explicit, reviewable units with a package-legitimacy gate and lockfile review. |
| Playwright runs the production bundle, Chromium only, with one worker because tests share localStorage; tests/e2e/helpers.js directly uses nbmp:state:v8. | Existing browser behavior remains a gate. Persistence migration must introduce a repository-aware test bridge while retaining separate compatibility tests for the v8 snapshot. |
| Existing E2E suites cover Actions, timeline gestures/touch/polish, Week drag, Join, navigation, composer, recurrence, accessibility, mobile layouts, backup, and crash recovery. | New tests extend these suites and preserve their current contracts; they do not replace them with broad screenshots or mocks. |
| The repository has no hosted deployment or EAS configuration; package.json provides only Vite preview. | Local production preview is always available. Externally shared preview and Android distribution require explicit account/target setup before the beta gate. |

## Binding decisions

The identifiers below are traceability labels for this plan.

| ID | Decision |
|---|---|
| BD-01 | The approved cross-platform PRD is binding product/platform direction and must be promoted to a living product path. |
| BD-02 | ADR 0001 remains the accepted architectural constitution and is the next architectural step. |
| BD-03 | Retain the root React/Vite web client. Use Expo/React Native for Android first and iOS later. |
| BD-04 | Use Convex as the backend and durable device-local databases plus outboxes on each client. |
| BD-05 | Share JavaScript domains across clients. Do not reproduce canonical domain rules in views, adapters, or backend functions. |
| BD-06 | Put Chrono behind a deterministic parser. No general LLM participates in the critical create path. |
| BD-07 | Tauri begins only after synchronization is trustworthy. |
| BD-08 | Do not introduce .planning as a competing authority, a Flutter/Kotlin rewrite, an immediate workspace without a real second client, or a big-bang Planner.jsx rewrite. |
| BD-09 | The binding order is regression remediation, governance/enforcement, low-risk extraction, cross-platform trust slice, then archive/name alignment after reference updates. |
| BD-10 | Architecture, product behavior, visual principles, approved local contracts, sequencing, QA evidence, and drafts have distinct document authorities. |
| BD-11 | Every extracted UI surface has a prepared controller/view model and named command/query boundary. UI cannot import persistence or mutate canonical records. |
| BD-12 | Timeline is the final web surface extracted because it is the highest-risk interaction seam. **Satisfied 2026-08-19** — `WeekGrid` (578 lines) was the last and largest surface to move, into `src/features/planner/WeekGrid.jsx`. |
| BD-13 | Preserve healthy behavior, regression gates, stable domain semantics, persistence keys, export/recovery paths, and data compatibility unless an explicit migration unit changes them with compatibility evidence. |

## Documentation authority and change protocol

After Phase 1, docs/README.md must state and link this precedence:

| Artifact type | Authority | Change rule |
|---|---|---|
| Accepted ADR | Architecture, dependency direction, ownership, and system constraints | Architecture changes require a new or superseding ADR; implementation plans cannot silently override one. |
| Living product spec | User-visible behavior, platform direction, capability scope, and product quality targets | Behavior changes update the living product spec and any affected approved feature contract. |
| DESIGN.md | Visual language, interaction principles, motion, accessibility geometry, and negative-control expectations | UI work cites the relevant principle and records deliberate negative-control evidence for high-risk behavior. |
| Approved feature spec | The local contract for a bounded feature | Applies within its feature scope and cannot contradict the product spec or ADR. |
| Implementation plan | Order, dependencies, file ownership, gates, rollout, and rollback | Sequencing authority only; completion evidence is recorded elsewhere. |
| QA artifact | Observed evidence from a named build, device, environment, and commit | Evidence, not product or architecture authority. |
| Draft | Exploration only | Non-binding until explicitly approved and promoted. |

Promotion is not a copy that creates two live specifications:

- Move the approved content to docs/product/calendar-master-cross-platform.md and mark it Approved / Living product specification.
- Replace docs/superpowers/specs/2026-08-11-calendar-master-cross-platform-prd.md with a short non-binding relocation notice linking the living product document.
- Mark docs/superpowers/plans/2026-08-11-cross-platform-trust-phase-1.md as superseded for sequencing by this master plan while preserving it as historical evidence.
- Update docs/README.md in the same change so all active links point to the living document and typed authority is visible.
- Do not archive, rename, or mass-move other documents in Phase 1. Later archive work is gated on a zero-active-reference scan.

## Target architecture

The target remains one repository and one modular product, not independent implementations:

    repository root
    ├── src/                         existing React/Vite web client, retained at root
    │   ├── app/                     web composition, controllers, view models, workflows
    │   ├── features/                reusable presentation/application helpers during migration
    │   ├── platform/                IndexedDB, browser, diagnostics, export/import adapters
    │   ├── shared/                  compatibility re-exports while shared code moves
    │   └── ui/                      passive web views consuming app contracts
    ├── apps/
    │   └── mobile/                  Expo Router Android client and native adapters
    ├── packages/
    │   ├── domain/                  pure shared JavaScript domain model, commands, queries
    │   ├── sync-contracts/          envelopes, codecs, coordinator ports, conflict vocabulary
    │   └── quick-add/               deterministic parser and Chrono adapter
    ├── convex/                      authenticated typed schema, mutations, queries, sync log
    ├── scripts/                     dependency and documentation enforcement
    ├── tests/                       web E2E and cross-client deterministic harnesses
    └── docs/                        typed product, architecture, plans, and QA evidence

The root web package is also the repository root. Workspaces include apps/* and packages/* only after apps/mobile exists. The plan does not relocate root web files.

### Runtime flow

User input crosses UI into a named app command. The command invokes a pure shared domain operation and writes the resulting canonical records plus one mutation envelope in a single local transaction. The UI reports Saved only after that local transaction commits. A sync coordinator retries envelopes idempotently through Convex. Accepted server changes receive a per-user monotonic syncVersion and are pulled into each local repository. UI projections are rebuilt through named app queries and view models. Synced is a separate status from Saved.

### First synchronization scope

The synchronized entity set is:

- calendars
- events
- event exceptions
- task lists
- Actions
- subtasks
- task completion occurrences
- preference keys that affect the Day experience

Notes, reminders, diagnostics, motivation, templates, and unsupported preferences remain explicitly device-local until their own contract and migration units. The clients must label limitations honestly; they must not imply that local-only data is synchronized.

## Dependency rules and automated enforcement

### Allowed dependency matrix

| From | May import | Must not import |
|---|---|---|
| packages/domain | Same package modules and platform-neutral external utilities approved by audit | React, DOM, Expo, React Native, Convex, Clerk, storage, network, process-wide mutable state, hidden wall-clock reads |
| packages/sync-contracts | Same package modules and pure shared domain identifiers/types | UI, platform storage implementations, provider SDKs |
| packages/quick-add | packages/domain public exports and deterministic parser dependencies | UI, persistence, network, general LLM clients |
| src/shared compatibility paths | packages/domain public exports or other src/shared modules | src/domains, src/features, src/app, src/platform, src/ui |
| src/domains during migration | Same domain, src/shared, and documented public composition seams | UI, persistence, provider payloads, another domain's internals |
| src/features | Domain public indexes and shared pure helpers | Direct canonical persistence writes; provider SDK payloads |
| src/app | Domain/package public APIs, feature helpers, platform ports, and UI contracts | Provider-specific payloads outside an adapter; direct view DOM logic |
| src/platform | Domain-owned repository contracts, shared codecs, browser APIs | UI modules; canonical business decisions; new feature imports |
| src/ui | App view models, named command callbacks, design tokens, passive presentation helpers | src/platform, src/storage.js, Convex, Clerk, SQLite, IndexedDB, domain command internals, canonical record mutation |
| apps/mobile/src/ui | Mobile app view models and named command callbacks | SQLite, SecureStore, Convex client internals, domain mutation outside app commands |
| apps/mobile/src/app | Shared packages and mobile platform ports | Raw provider payloads outside adapters |
| convex | packages/domain and packages/sync-contracts public APIs where runtime-compatible | Client UI, browser/native storage, untyped generic entity mutation |

### Narrow existing rules

- src/domains/planner/queries may compose only public index exports from calendar, tasks, and notes because planner day aggregation is an accepted cross-domain query.
- Versioned migration validators may call the immediately preceding version validator. The current notes-v7 to tasks-v6 edge is recorded exactly.
- Existing platform-to-feature imports used by backupStore.js and plannerNotebookReplace.js are exact debt entries. New platform-to-feature edges fail. These entries are removed when the backup record factory is moved to an owned contract.
- src/Planner.jsx is a temporary composition-root exception. The checker snapshots each currently violating import edge; any new edge fails. Each extraction removes entries. A wildcard Planner exception is forbidden.
- Production checks ignore test-only imports but test the checker itself against forbidden production fixtures.

### Enforcement design

scripts/check-architecture-boundaries.mjs scans static import, export-from, and dynamic-import specifiers in production JavaScript/JSX/TypeScript/TSX. scripts/architecture-boundaries.mjs owns the matrix and path classification. scripts/architecture-boundary-baseline.json contains exact importer/imported/reason/remove-by records, never directory wildcards. scripts/architecture-boundaries.test.mjs creates isolated allowed and forbidden fixture trees and proves each rule.

The root check:architecture script runs the scanner. check:docs validates relative Markdown links and verifies that the authoritative product link resolves. Both checks run before unit/build/E2E in test:all and in CI. A deliberate forbidden UI-to-persistence import must make the checker fail before the fixture is removed.

## Change classification and execution discipline

Every implementation unit is labeled as one of these types and lands separately:

| Type | Meaning | Required proof |
|---|---|---|
| Behavior-changing | Intentionally alters user-observable behavior or sync semantics | Failing behavioral test first; deliberate negative control; focused tests; full applicable regression suite |
| Extraction-only | Relocates responsibilities without changing behavior | Characterization before move; before/after parity for DOM semantics, geometry, focus, motion, and persisted outcome; no changed product assertion in the same unit |
| Compatibility migration | Changes package, import, storage, schema, or data representation | Old/new fixture corpus, restart/interruption tests, digest parity, rollback path, and no destructive cleanup |
| Governance/enforcement | Changes authority, validation, or build gates | Link/checker self-tests and a deliberate failing fixture |
| Release/evidence | Changes rollout configuration or records evidence | Reproducible build identifier, device/environment record, and explicit pass/fail gate |

Rules for every unit:

1. Begin from a clean branch created from freshly fetched origin/main. Record the baseline SHA.
2. Preserve unrelated work and untracked evidence. Do not reset or clean the workspace to obtain a baseline.
3. Add or update the narrow test before production behavior where a deterministic input/output contract exists.
4. Prove a new regression test can fail for the intended reason. Record the temporary inversion or pre-fix failure in the PR evidence, then restore the intended implementation.
5. Do not mix extraction-only and behavior-changing edits. If characterization reveals a bug, stop the extraction and open a separate behavior unit.
6. Run the unit's focused check, then the phase gate. A later phase cannot waive an earlier failed gate.
7. One integrator owns shared choke points: package.json/package-lock.json, src/Planner.jsx, docs/README.md, and generated Convex API files. Same-wave units do not edit the same file.

## Dependency graph and review waves

    P0 Interaction regressions
      ↓
    P1 Documentation governance + ADR enforcement
      ↓
    P2 Low-risk web controller/view extraction
      ↓
    P3 Expo client + legitimate workspace + shared packages
      ↓
    P4 One-event trust tracer, then local repositories + transactional outboxes
      ↓
    P5 Clerk identity + Convex sync + convergence
      ↓
    P6 Native first Day vertical slice
      ↓
    P7 Deterministic Chrono integration
      ↓
    P8 Preview and private-beta certification
      ↓
    P9 Continued extraction and separately gated platform expansion

Within P4, web IndexedDB and Android SQLite can execute in parallel after sync contracts freeze because their file ownership does not overlap. Within P5, Convex schema/auth and the client-neutral convergence harness can begin in parallel, but push/pull integration waits for both. All src/Planner.jsx edits remain sequential.

### Shared-package admission criteria

A module enters packages/domain, packages/sync-contracts, or packages/quick-add only when all of these are true:

1. At least two real runtime consumers need the same behavior; a speculative consumer is insufficient.
2. The API is platform-neutral and has an explicit public export.
3. Inputs, outputs, errors, time, IDs, locale, and timezone dependencies are explicit and deterministic.
4. The module has no React, DOM, Expo, React Native, Convex, Clerk, storage, network, process-global mutation, or provider-payload dependency.
5. Existing behavior has a fixture corpus, and old/new import paths pass parity before the move.
6. Ownership belongs to domain rules, sync protocol, or parsing rather than visual presentation or platform gesture recognition.
7. Both consumers import the package in the same review before compatibility paths begin retirement.

Code that fails these criteria stays in its current app/platform/feature layer. A desire to reduce Planner.jsx line count is not sufficient reason to make code shared.

## Phased roadmap and atomic implementation units

### Phase 0 — Finish interaction-regression remediation

**Purpose:** Restore known interaction contracts before moving boundaries.  
**Dependencies:** None beyond the baseline preflight.  
**Decision coverage:** BD-09, BD-13.  
**Gate:** G0 and G1.

#### P0.0 — Establish the execution baseline

- **Type:** Release/evidence.
- **Owned files:** No product files. Record evidence in the regression plan's execution PR.
- **Action:** Fetch origin, create the execution branch from the fetched origin/main SHA, preserve the untracked regression plan, compare the fetched delta with the plan's observed 9deff64 baseline, and update test expectations only if main intentionally changed the same contract. Do not cherry-pick 47982d4. Confirm npm install with the lockfile, npm test, npm run build, and the current full E2E suite before changing behavior.
- **Acceptance:** The exact baseline SHA, clean baseline results, existing failures, browser version, and environment are recorded. Any baseline failure is classified before P0.1.
- **Stop:** Main has changed a targeted interaction seam without a reconciled contract, the regression plan is missing, or the baseline destroys unrelated work.

#### P0.1 through P0.9 — Execute the approved regression units

The authoritative actions and complete test matrices are the U1-U9 sections of docs/plans/2026-08-13-1032-fix-calendar-interaction-regressions-plan.md. Execute them in that document's dependency order, not numeric display order:

| Unit | Type | Dependencies | File ownership summary | Required result |
|---|---|---|---|---|
| P0.1 / U1 | Governance/enforcement | P0.0 | DESIGN.md; docs/interaction-contracts/planner-interactions.md; tests/e2e/helpers.js | Interaction ownership, cancel semantics, field-scoped editing, Add a Step order, and reusable geometry/storage oracles are explicit. |
| P0.2 / U2 | Behavior-changing | P0.1 | src/features/planner/timelineInteractionState.js and test; timelineGesture.js and test; src/Planner.jsx; timeline gesture/touch E2E | Shared activation/proposal/commit/cancel lifecycle passes pure and browser tests; cancel cannot mutate. |
| P0.3 / U3 | Behavior-changing | P0.1 | src/Planner.jsx; actions, shell, navigation-shell E2E; helpers | Actions has no calendar ribbon; Timeline/Agenda restores the selected date in the first rendered frame. |
| P0.4 / U4 | Behavior-changing | P0.2 | TimelineActionCard.jsx; src/Planner.jsx; timelineGesture.js/test; optional index.css; actions/touch E2E | Action check, body, and resize regions have exclusive ownership and correct persistence outcomes. |
| P0.5 / U8 | Behavior-changing | P0.1 | src/Planner.jsx; actions E2E; optional composer E2E | Add a Step is immediately visible and precedes checklist rows for editable existing Actions. |
| P0.6 / U9 | Behavior-changing | P0.5 | src/Planner.jsx; composer, motion, actions E2E | Only the selected inspector field enters edit mode; sheet lifecycle and unrelated fields remain stable. |
| P0.7 / U5 | Behavior-changing | P0.2 | src/Planner.jsx; timelineGesture test; timeline gesture/touch/Join E2E | Every valid Event exposes both logical resize edges independent of rendered height without stealing body/JOIN/scroll. |
| P0.8 / U6 | Behavior-changing | P0.2, P0.3 | src/Planner.jsx; timelineInteractionState.js/test; Week drag, Join, timeline polish, actions E2E | Week scroll/move/create/cancel/JOIN and focus-source intent use the shared lifecycle. |
| P0.9 / U7 | Behavior-changing | P0.3-P0.8 | src/Planner.jsx; optional TimelineActionCard.jsx; index.css; accessibility, mobile, shell, actions E2E | Keyboard semantics, 44-pixel coarse targets, breakpoint geometry, and readable widths pass. |

For every repaired scenario, preserve the source plan's negative-control requirement: the old behavior or a deliberate owner/geometry/lifecycle inversion must make the new assertion fail and name the intended visible or persisted contract.

#### Gate G1 — Interaction baseline

- All R1-R19 and AE1-AE8 from the regression plan pass.
- npm test, npm run build, focused E2E suites, and npm run test:e2e pass against the production bundle.
- Desktop and 390-pixel touch-emulation contact sheets show no new clipping, overlap, width, or focus regression.
- Real-device checks pass on the target Samsung Android browser plus one desktop browser.
- No flaky retry is accepted as a fix; the first run and a repeat run pass.
- The gate evidence includes each negative control.

### Phase 1 — Promote product authority and enforce ADR 0001

**Purpose:** Make the approved direction discoverable and make dependency violations fail automatically before extraction or platform work.  
**Dependencies:** G1.  
**Decision coverage:** BD-01, BD-02, BD-08, BD-09, BD-10, BD-11, BD-13.  
**Gate:** G2.

#### P1.1 — Promote and index the approved cross-platform product spec

- **Type:** Governance/enforcement.
- **Owned files:** docs/product/calendar-master-cross-platform.md; docs/superpowers/specs/2026-08-11-calendar-master-cross-platform-prd.md; docs/superpowers/plans/2026-08-11-cross-platform-trust-phase-1.md; docs/README.md.
- **Action:** Move the approved PRD content to the living product location, change its status/authority language without changing approved behavior, leave only a relocation notice at the prior path, mark the older trust plan as superseded for sequencing, and add the typed authority table and active links to docs/README.md. State that this master plan controls order and that QA remains evidence. Do not move any other document.
- **Automated verification:** Run the existing tests; run a repository-relative Markdown link scan introduced in P1.3; use rg to prove docs/README.md has one active living-product link and that the old path contains no duplicated product requirements.
- **Acceptance:** A new engineer can identify the sole living cross-platform product spec, architecture ADR, visual authority, active sequencing plan, and historical plan from docs/README.md.
- **Rollback:** Revert the promotion as one documentation-only unit. No source or data change is coupled to it.

#### P1.2 — Add the architecture-boundary checker and exact debt ledger

- **Type:** Governance/enforcement.
- **Owned files:** scripts/architecture-boundaries.mjs; scripts/check-architecture-boundaries.mjs; scripts/architecture-boundaries.test.mjs; scripts/architecture-boundary-baseline.json.
- **Action:** Implement the dependency matrix above with Node built-ins. Scan production import/export/dynamic-import edges. Seed the baseline with exact currently violating edges and rationale/remove-by phase, including Planner.jsx, the versioned migration edge, and platform backup factory edges. Exclude test files from production rules but test the scanner with generated temporary fixture trees. Reject wildcard exception entries and reject any import edge not present in the matrix or exact baseline.
- **Automated verification:** node --test scripts/architecture-boundaries.test.mjs; node scripts/check-architecture-boundaries.mjs.
- **Negative control:** Add a temporary src/ui fixture importing src/platform/persistence, observe a failing path-specific diagnostic, then remove it and observe green.
- **Acceptance:** Existing main passes through exact debt entries; a new UI-to-persistence, domain-to-React, domain-to-provider, cross-domain-internal, or platform-to-feature edge fails.
- **Stop:** The checker can only pass by exempting a directory, ignoring dynamic imports, or weakening ADR 0001.

#### P1.3 — Wire architecture and documentation checks into the root gate

- **Type:** Governance/enforcement.
- **Owned files:** scripts/check-doc-links.mjs; scripts/check-doc-links.test.mjs; package.json.
- **Action:** Add check:architecture, check:docs, and check scripts. Make test:all run checks before unit/build/E2E. The documentation check validates repository-relative Markdown targets, ignores external URLs, and detects duplicate live-authority markers. Keep dependency installation unchanged.
- **Automated verification:** node --test scripts/check-doc-links.test.mjs scripts/architecture-boundaries.test.mjs; npm run check; npm run test:all.
- **Negative control:** Temporarily point the product index at a nonexistent relative file and confirm check:docs fails with the source document and target.
- **Acceptance:** The same root command used by CI rejects broken authority links and architecture violations before expensive browser tests.

#### Gate G2 — Governed architecture

- The living product document, ADR, DESIGN.md, this plan, QA, and drafts have explicit non-overlapping authority.
- Both deliberate checker violations fail and clean production passes.
- The baseline ledger has exact edges, owner, rationale, and removal phase; it has no wildcard.
- npm run test:all remains green.

### Phase 2 — Extract low-risk web surfaces through app boundaries *(half landed — read the status note)*

**Purpose:** Prove the controller/view-model pattern and reduce Planner.jsx responsibilities without delaying the trust slice for complete web cleanup.  
**Dependencies:** G2.  
**Decision coverage:** BD-08, BD-09, BD-11, BD-12, BD-13.  
**Gate:** G3.

> **Status, 2026-08-19 — the extraction half of this phase has landed; the app boundary has not.**
>
> All four surfaces are out of `src/Planner.jsx`. They were moved by the UI-extraction
> programme (see `docs/plans/2026-08-18-001-refactor-planner-ui-extraction-plan.md`), which
> was a **different programme with a different method**, and that difference is the whole
> point of this note:
>
> - **They landed in `src/features/planner/`, not `src/ui/`.** `docs/spec/structure.md` puts
>   visible React surfaces there "for now; later `src/ui/...` once that tree exists", and ADR
>   0001's `ui/` tree still does not exist. Every `src/ui/...` path named below is superseded.
> - **They moved byte-exact, not through a controller/view-model.** Each extraction was a
>   relocation proven by sha256, with only imports and an export line differing. The
>   components still receive props from Planner; no `getNavigationViewModel`,
>   `usePlannerCommandController` or `getAgendaViewModel` exists.
>
> So this phase's stated purpose — *prove the controller/view-model pattern* — is **unmet**,
> and its per-unit "Owned files" now name the wrong module. What each unit still owes is the
> boundary, not the move. Unit entries below are annotated accordingly.

All units in this phase are extraction-only. Freeze the current production-bundle traces before each move: route, selected date, focus owner, accessible names/roles, relevant bounding boxes, motion under normal and reduced-motion settings, and persisted notebook digest. A parity failure stops the unit; it is not normalized by updating the expectation.

#### P2.1 — Extract navigation shell with a navigation controller/view model

- **Type:** Extraction-only.
- **Owned files:** `src/features/planner/navigation.jsx` **(exists — supersedes the planned `src/ui/navigation/NavigationShell.jsx`)**; `src/app/navigation/useNavigationController.js` *(to create)*; `src/app/navigation/useNavigationController.test.js` *(to create)*; `src/Planner.jsx`; `tests/e2e/navigation-shell.spec.js`.
- **Landed 2026-08-19:** the whole navigation cluster — `NavigationContext`, `NavigationFrame`, `NavigationToggle`, `NavigationShell`, 223 lines — moved byte-exact as one concept. The context has one provider and one consumer, both inside that module; Planner imports only the frame and the toggle. **Remaining:** the controller/view-model boundary below.
- **Named boundary:** Query getNavigationViewModel; commands selectPlannerRoute, selectPlannerZoom, selectPlannerDate, stepPlannerDate, openPlannerSearch, openPlannerShortcuts.
- **Action:** Move route/date/zoom/ribbon presentation derivation and event-to-command translation into the app controller. Make NavigationShell passive: it renders the view model and invokes named commands. It receives no notebook setter, persistence adapter, or canonical database object. Remove the corresponding local component and controller responsibilities from Planner.jsx.
- **Automated verification:** node --test src/app/navigation/useNavigationController.test.js; npm run test:e2e -- tests/e2e/navigation-shell.spec.js tests/e2e/shell.spec.js tests/e2e/actions.spec.js; npm run check:architecture.
- **Parity proof:** Identical route/ribbon mounting, selected-date first frame, keyboard/focus behavior, reduced motion, and persisted state before and after extraction.
- **Acceptance:** UI has zero platform/persistence imports; Planner.jsx loses the inline NavigationShell and associated view derivation; no behavior assertion changes.

#### P2.2 — Extract command palette and shortcuts with a search/command controller

- **Type:** Extraction-only.
- **Owned files:** `src/features/planner/commandSurfaces.jsx` **(exists — supersedes the planned `src/ui/search/CommandPalette.jsx`; shared with P2.3)**; `src/app/search/usePlannerCommandController.js` *(to create)*; `src/app/search/usePlannerCommandController.test.js` *(to create)*; `src/Planner.jsx`; `tests/e2e/search-control.spec.js`.
- **Landed 2026-08-19:** `CommandPalette` moved byte-exact. Note it shares a module with P2.3's `ShortcutSheet` — the two sit next to each other in Planner, share a sheet and a `surface` prop, and were extracted as one concept. This plan assumed two separate files; there is one. **Remaining:** the controller boundary below.
- **Named boundary:** Query searchPlannerCommands; commands executePlannerCommand, openSearchResult, closeCommandPalette.
- **Action:** Preserve the existing feature search projection and command matching. The app controller owns query text, result projection, target resolution, and command dispatch. The passive palette receives serializable rows and callbacks only. Quick-add remains an app command and is not reimplemented in the view.
- **Automated verification:** node --test src/app/search/usePlannerCommandController.test.js src/features/planner/commandPalette.test.js src/features/search/searchProjection.test.js; npm run test:e2e -- tests/e2e/search-control.spec.js tests/e2e/navigation-shell.spec.js; npm run check:architecture.
- **Parity proof:** Same ranking, labels, keyboard navigation, focus return, route/date result, and created-record persistence.
- **Acceptance:** The palette cannot import domain commands or persistence, and Planner.jsx no longer owns result mapping or the inline palette.

#### P2.3 — Extract the shortcut sheet

- **Type:** Extraction-only.
- **Owned files:** `src/features/planner/commandSurfaces.jsx` **(exists — supersedes the planned `src/ui/navigation/ShortcutSheet.jsx`; shared with P2.2)**; `src/app/navigation/getShortcutViewModel.js` *(to create)*; `src/app/navigation/getShortcutViewModel.test.js` *(to create)*; `src/Planner.jsx`; `tests/e2e/accessibility-quality.spec.js`.
- **Landed 2026-08-19:** `ShortcutSheet` moved byte-exact, in the same module as P2.2. It renders from the `SHORTCUTS` constant in `src/features/planner/constants.js`, so the sheet still cannot claim a key the handler does not answer to. **Remaining:** the pure view model below.
- **Named boundary:** Query getShortcutViewModel; command closeShortcutSheet.
- **Action:** Move shortcut rows and platform-aware labels into a pure app view model. Keep dialog lifecycle/focus handling in the established app accessibility boundary and pass only rendered data and close intent into the view.
- **Automated verification:** node --test src/app/navigation/getShortcutViewModel.test.js src/features/accessibility/dialogFocus.test.js; npm run test:e2e -- tests/e2e/accessibility-quality.spec.js tests/e2e/navigation-shell.spec.js.
- **Parity proof:** Same accessible dialog semantics, key labels, Escape behavior, focus return, and reduced-motion behavior.
- **Acceptance:** The shortcut view is passive and Planner.jsx loses its inline declaration and mapping logic.

#### P2.4 — Extract Agenda with an Agenda view model

- **Type:** Extraction-only.
- **Owned files:** `src/features/planner/Agenda.jsx` **(exists — supersedes the planned `src/ui/agenda/AgendaView.jsx`)**; `src/app/agenda/getAgendaViewModel.js` *(to create)*; `src/app/agenda/getAgendaViewModel.test.js` *(to create)*; `src/Planner.jsx`; `tests/e2e/planning.spec.js`.
- **Landed 2026-08-19:** `Agenda` moved byte-exact (59 lines). It still builds its own rows inline from `RowWithJoin`, `catColor` and the clock helpers rather than from a view model, so JOIN eligibility is still decided in the view — which is exactly what the Action below forbids. **Remaining:** the view model below.
- **Named boundary:** Query getAgendaViewModel; commands openAgendaItem, selectAgendaDate, joinAgendaMeeting.
- **Action:** Reuse existing calendar/task queries and event presentation helpers to build serializable section/row data in app code. The view must not inspect canonical record variants or decide JOIN eligibility. Preserve route transitions and inspector opening exactly.
- **Automated verification:** node --test src/app/agenda/getAgendaViewModel.test.js src/features/planner/dayProjection.test.js src/features/planner/eventPresentation.test.js src/features/planner/meetingLink.test.js; npm run test:e2e -- tests/e2e/planning.spec.js tests/e2e/join.spec.js tests/e2e/navigation-shell.spec.js.
- **Parity proof:** Same rows, ordering, date grouping, labels, JOIN visibility, click/keyboard target, selected date, and persisted outcome.
- **Acceptance:** AgendaView imports only app/UI presentation contracts; Planner.jsx loses Agenda JSX and projection mapping.

#### Gate G3 — Controller/view extraction pattern

- Four surfaces use named query/command boundaries and passive views. **Not met** — the
  surfaces moved, the boundaries did not. This is the only G3 criterion still open, and it
  is the one the phase exists for.
- The architecture ledger shrinks for each removed Planner/UI edge; it never grows.
- Planner.jsx has measurably fewer inline component declarations, effects/state owners, and direct dependencies. A line-count reduction alone is insufficient. **Partly met** —
  `Planner.jsx` declares **zero** React components (9,616 → 5,570 lines). But this criterion
  explicitly refuses to count lines, and the effects/state owners did not move: 235 hook
  calls remain in `Planner()`. Relocation is not the boundary.
- No persistence key, canonical schema, product assertion, gesture contract, or visual/motion behavior changed. **Met** — proven per move by sha256 plus a browser check.
- npm run test:all passes twice without retries.
- No Actions, inspector, notebook, composer, Week/Month, or Timeline extraction begins before G3. **Overtaken, deliberately.** All of them were extracted before G3 by the
  UI-extraction programme. That programme claimed no boundary and changed no behaviour, so
  it did not consume this gate — but the sequencing constraint written here no longer
  describes the repository, and must not be read as still blocking.

### Phase 3 — Start the Expo client and activate shared packages

**Purpose:** Create the real second client, then introduce workspaces and shared JavaScript ownership because there is now a consumer.  
**Dependencies:** G3.  
**Decision coverage:** BD-03, BD-05, BD-08, BD-09, BD-13.  
**Gate:** G4.

#### Package legitimacy audit

No scaffold or package-manager mutation proceeds until the executor rechecks these identities on the official registry, follows the official documentation link, records the selected version and integrity from the resulting lockfile, and obtains human review for any renamed, deprecated, unmaintained, or unexpected transitive package.

| Package | Status | Official provenance | Intended use |
|---|---|---|---|
| expo | VERIFIED identity | Expo documentation | Android application runtime/tooling |
| expo-router | VERIFIED identity | Expo Router documentation | File-based mobile navigation |
| expo-sqlite | VERIFIED identity | Expo SQLite documentation | Durable Android database |
| expo-secure-store | VERIFIED identity | Expo documentation | Device token/secret storage |
| react-native-gesture-handler | VERIFIED identity | Expo/Software Mansion documentation | Native gesture ownership |
| react-native-reanimated | VERIFIED identity | Expo/Software Mansion documentation | UI-thread transient motion |
| convex | VERIFIED identity | Convex React Native documentation | Backend client and generated API |
| @clerk/clerk-expo | VERIFIED identity | Clerk Expo documentation | Mobile identity |
| @clerk/clerk-react | VERIFIED identity | Clerk React documentation | Web identity |
| chrono-node | VERIFIED identity | Chrono official repository | Deterministic natural-language date parsing |

P3.0 records this audit at docs/qa/cross-platform/package-legitimacy-audit.md. A package not in the table is treated as unverified and blocks installation until added with evidence.

#### P3.1 — Bootstrap the Expo Android shell without moving web

- **Type:** Compatibility migration.
- **Owned files:** apps/mobile/package.json; apps/mobile/app.json; apps/mobile/tsconfig.json; apps/mobile/app/_layout.tsx; apps/mobile/app/index.tsx.
- **Action:** Scaffold an Expo Router TypeScript client under apps/mobile. Configure Android application identity, deep-link scheme, safe-area root, error boundary, and a local-only landing route. Keep the root web app untouched. Use Expo Go while all selected libraries are supported; add an Expo development build only when native requirements prove it necessary.
- **Automated verification:** Run the Expo TypeScript/export checks from apps/mobile and launch the route in an Android emulator. Root npm test and npm run build remain green.
- **Acceptance:** Android displays the mobile shell, the web app still builds from repository root, and no workspace or domain duplication has been introduced.
- **Stop:** The scaffold rewrites root web configuration, requires an unexplained package, or cannot run on the supported Android API/device.

#### P3.2 — Trigger workspaces with a real cross-client contract consumer

- **Type:** Compatibility migration.
- **Owned files:** package.json; package-lock.json; packages/sync-contracts/package.json; packages/sync-contracts/src/index.ts; packages/sync-contracts/src/index.test.ts.
- **Action:** Add npm workspaces for apps/* and packages/* while retaining the root web package. Define the initial sync-contract vocabulary: schema version, supported entity kinds, mutation identity, device identity, operation kind, changed-field set, atomic-group identity, cursor, and validation result. Keep the contract transport-neutral.
- **Automated verification:** npm install from the audited package set; npm test; package-level contract tests; npm run build; mobile TypeScript/export check.
- **Acceptance:** Root web and mobile resolve the workspace lock consistently. There is still no apps/web directory. The contract package has at least one root-web test consumer and one mobile compile-time/runtime probe before this unit merges.
- **Stop:** Workspaces require moving root web, duplicate React runtimes, or produce different domain behavior between clients.

#### P3.3 — Create the shared domain package by mechanical relocation

- **Type:** Compatibility migration.
- **Owned paths:** packages/domain/package.json; packages/domain/src/**; src/domains/** compatibility exports; src/shared/** compatibility exports; affected unit-test import paths.
- **Action:** Move existing pure JavaScript modules; do not translate or redesign them. Execute in import-connected batches: shared ids/time primitives; calendar model/queries/commands/recurrence; task model/queries/commands/recurrence; notes and versioned migrations; planner aggregate; reminders/search/gamification. In each batch, preserve public export names, module behavior, fixture corpus, and error semantics. Leave thin old-path re-exports while root imports migrate, then remove a re-export only after rg reports zero active imports. Do not move browser persistence, React components, web gesture recognizers, haptics, diagnostics adapters, or view projections that depend on platform state.
- **Batch limit:** Each implementation commit owns one import-connected leaf group and its tests. The package manifest/export map is edited by the phase integrator only. The migration PR may contain multiple such atomic commits; no commit combines semantic changes.
- **Automated verification:** Run the moved module's original tests from the package, its old-path compatibility tests, npm test, npm run build, and npm run check:architecture after every batch.
- **Parity proof:** Run a shared fixture corpus through old and new public import paths and deep-compare values, errors, recurrence occurrence identities, date/time results, ordering, and serialization.
- **Acceptance:** Web and mobile consume the same public domain package for the first Day entity set. No shared module imports React, DOM, Expo, Convex, storage, network, or hidden current time.
- **Stop:** A batch changes canonical output, IDs, timezone/recurrence behavior, or requires platform globals. Split the impure adapter from the pure module before continuing.

#### P3.4 — Add platform-neutral app ports for local repositories and time

- **Type:** Extraction-only.
- **Owned files:** packages/domain/src/ports/plannerRepository.js; packages/domain/src/ports/clock.js; packages/domain/src/ports/idFactory.js; packages/domain/src/ports/ports.test.js; packages/domain/src/index.js.
- **Action:** Define callable contracts for repository transactions, record queries, clock, and ID generation without binding to IndexedDB, SQLite, or Convex. Preserve current explicit date-key/timezone conventions. Commands receive clock/ID dependencies where needed; they do not read global time or generate provider IDs.
- **Automated verification:** Package tests with fake repository/clock/ID adapters; npm test; npm run check:architecture.
- **Acceptance:** Both clients can implement the ports without importing each other's platform code, and existing web behavior remains unchanged through its adapter.

#### Gate G4 — Real second client and shared ownership

- Android shell launches and root web production build passes.
- Workspaces exist because apps/mobile is present and consumes packages/domain and packages/sync-contracts.
- Shared package parity corpus is green; no domain semantics were rewritten.
- All dependency identities and lockfile changes have recorded legitimacy evidence.
- The ADR checker covers packages and mobile layers.
- There is still no apps/web move and no Timeline extraction.

### Phase 4 — Prove one trust path, then expand durable local repositories and atomic outboxes

**Purpose:** First prove the architecture end to end with one production event path, then make each client independently trustworthy offline across the launch entity set.  
**Dependencies:** G4.  
**Decision coverage:** BD-04, BD-05, BD-13.  
**Gate:** G5.

#### P4.T — End-to-end one-event trust tracer

- **Type:** Tracer / behavior-changing.
- **Preconditions:** Clerk and Convex development projects, Google OAuth credentials, allowed redirect/deep-link origins, and developer access are available.
- **Owned final paths:** packages/sync-contracts/src/envelope.ts; apps/mobile/src/platform/auth/ClerkProvider.tsx; apps/mobile/src/platform/sqlite/plannerRepository.ts; apps/mobile/src/app/day/createDayController.ts; convex/auth.config.ts; convex/schema.ts; convex/sync/push.ts; convex/sync/pull.ts; src/platform/auth/ClerkProvider.jsx; src/platform/persistence/indexedDb/plannerRepository.js; src/app/planner/usePlannerRepository.js; src/app/sync/createSyncController.js; src/main.jsx; src/Planner.jsx; tests/sync/firstEventTracer.test.ts.
- **Action:** Validate Clerk's Expo browser auth and web flow with identity scopes only, storing mobile session material through SecureStore, then wire one signed-in, non-recurring timed Event through the final architecture: Android app command, shared calendar command, exclusive SQLite record-plus-outbox transaction, idempotent authenticated Convex push, indexed bounded pull, web IndexedDB application, app query, and existing web Day rendering. Use final repository/contract/table/controller locations and real error handling; do not create tracer-only stores, generic payload tables, bypass endpoints, or duplicate Event rules. The tracer may support only this one Event path, but every boundary must be the production boundary that later units expand.
- **Execution shape:** Keep the tracer reviewable as three sequential commits: contract plus Android local commit; Clerk/Convex push-pull plus web local application; cross-client E2E and recovery evidence. The integrator owns shared manifests/generated files. Do not merge a partial tracer as a released capability.
- **Automated verification:** Start with a failing cross-client test. Create the Event offline, force-stop/reopen Android, sign in/reconnect, retry one deliberately lost push response, pull on web, and assert the same stable Event ID/timing/title appears once in Day. Reject a second user, malformed envelope, and unbounded pull request.
- **Negative control:** Temporarily disable mutation-receipt deduplication and prove the lost-response scenario creates a detectable duplicate or receipt failure; restore and rerun green.
- **Acceptance:** One real user action crosses every final layer and becomes visible on the other client without duplicate or lost data. The code remains the skeleton expanded by P4.1-P6.4.
- **Stop:** Any layer is mocked out of the end-to-end assertion, the path needs a generic any-valued record, Event behavior is reimplemented outside packages/domain, or credentials are unavailable.

#### P4.1 — Expand and freeze sync codecs and local transaction behavior

- **Type:** Behavior-changing.
- **Owned files:** packages/sync-contracts/src/envelope.ts; packages/sync-contracts/src/codecs.ts; packages/sync-contracts/src/coordinatorPort.ts; packages/sync-contracts/src/envelope.test.ts; packages/sync-contracts/src/index.ts.
- **Behavior first:** Reject unknown entity/operation kinds, missing IDs, duplicate changed fields, malformed base revisions, invalid atomic groups, or oversized batches. Preserve unknown server fields only when the contract explicitly marks forward-compatible metadata; never pass them into canonical domain records.
- **Action:** Expand the tracer's Event envelope to every launch-scope entity and freeze stable mutation and pull-change codecs, idempotency identity, retry classification, and coordinator port. Make a mutation ID unique per device and immutable across retries. Make series plus exception edits share an atomicGroupId.
- **Automated verification:** Package tests cover valid round trips and every rejection class; a deliberate decoder relaxation makes a rejection test fail.
- **Acceptance:** Web, mobile, and Convex can share one transport-neutral contract and version negotiation rule.

#### P4.2 — Expand the repository-aware web application boundary

- **Type:** Extraction-only.
- **Owned files:** src/app/planner/plannerRepositoryContext.js; src/app/planner/usePlannerRepository.js; src/app/planner/usePlannerRepository.test.js; src/main.jsx; src/Planner.jsx.
- **Action:** Extend the repository port introduced by P4.T from its Event path to all bootstrap, query, command transaction, export/import, and recovery intent. Adapt existing v8 stores for records not yet migrated so behavior does not change. Remove direct persistence lifecycle ownership from UI-facing code. Keep window.storage/localStorage quirks inside the current platform adapter.
- **Automated verification:** Repository contract tests; existing persistence/recovery tests; backup/error-boundary E2E; architecture check.
- **Parity proof:** Same bootstrap result, save debounce semantics, recovery notice, import/export, undo, preference behavior, and nbmp keys.
- **Acceptance:** Subsequent IndexedDB work can replace the adapter without changing Planner or passive views.

#### P4.3 — Migrate web canonical storage to per-record IndexedDB

- **Type:** Compatibility migration.
- **Owned files:** src/platform/persistence/indexedDb/schema.js; src/platform/persistence/indexedDb/plannerRepository.js; src/platform/persistence/indexedDb/migrateV8Notebook.js; src/platform/persistence/indexedDb/plannerRepository.test.js; src/platform/persistence/indexedDb/migrateV8Notebook.test.js.
- **Action:** Create typed object stores for the synchronized entities plus local-only records, outbox, conflicts, and meta. On first eligible open, read and validate the v8 notebook through existing migration code, map records without changing IDs, write all records plus a migration marker in one IndexedDB transaction, read them back, and compare a deterministic canonical digest before selecting IndexedDB as primary. The migration is restartable and safe if interrupted at every boundary.
- **Automated verification:** Tests cover empty install, v4-v8 source fixtures, corrupt source, interrupted transaction, duplicate retry, count/digest mismatch, IndexedDB unavailable, and successful restart.
- **Acceptance:** A valid notebook opens with identical visible/canonical state. No v4-v8 key is deleted. Failure returns to the existing recovery path and never replaces good data with blank state.
- **Stop:** Any fixture changes IDs, recurrence exceptions, completion history, notes, preferences, or export output without an approved compatibility change.

#### P4.4 — Make web record plus outbox writes atomic

- **Type:** Behavior-changing.
- **Owned files:** src/platform/persistence/indexedDb/outbox.js; src/platform/persistence/indexedDb/transaction.js; src/platform/persistence/indexedDb/outbox.test.js; src/app/planner/executePlannerCommand.js; src/app/planner/executePlannerCommand.test.js.
- **Behavior first:** A successful local command persists canonical records and exactly one immutable outbox envelope in the same transaction; a failed transaction changes neither; retrying the same local command cannot create duplicate mutation IDs.
- **Action:** Route launch-scope commands through the transaction boundary. Report Saved after commit. Continue writing a recoverable v8-shaped backup snapshot for one full private-beta release, but do not treat backup-write failure as canonical data loss; surface a storage warning and retain recovery diagnostics.
- **Automated verification:** Crash injection before/after record and outbox writes; duplicate command/retry tests; existing task undo/import/recovery tests; production E2E persistence checks.
- **Acceptance:** There is no observable state in which a launch-scope authored change exists without its outbox record or vice versa.

#### P4.5 — Replace direct-v8 E2E setup with a test repository bridge

- **Type:** Compatibility migration.
- **Owned files:** tests/e2e/helpers.js; src/platform/persistence/testing/plannerTestBridge.js; src/platform/persistence/testing/plannerTestBridge.test.js; tests/e2e/backup.spec.js; tests/e2e/error-boundary.spec.js.
- **Action:** Keep the helper names used across existing suites but seed/read canonical state through a test-only app repository bridge in test builds. Keep explicit helpers for legacy v8 migration and backup tests. The bridge must call repository/import APIs and cannot mutate IndexedDB object stores behind their invariants.
- **Automated verification:** Run all E2E suites serially as configured; prove one temporary helper bypass is rejected by a bridge invariant test.
- **Acceptance:** Existing tests remain readable and deterministic while ordinary feature tests no longer assume localStorage is canonical.

#### P4.6 — Implement the Android SQLite repository

- **Type:** Behavior-changing.
- **Owned paths:** apps/mobile/src/platform/sqlite/schema.ts; apps/mobile/src/platform/sqlite/migrations/**; apps/mobile/src/platform/sqlite/plannerRepository.ts; apps/mobile/src/platform/sqlite/outbox.ts; apps/mobile/src/platform/sqlite/**/*.test.ts.
- **Behavior first:** Record plus outbox commit is exclusive and atomic; rollback leaves neither; schema migrations are monotonic/restartable; force-stop after any injected boundary restores the last committed state.
- **Action:** Use normalized tables for calendars, events, event exceptions, task lists, Actions, subtasks, completion occurrences, and preferences, plus outbox, conflict archive, and sync meta. Use expo-sqlite exclusive transactions for command writes so unrelated asynchronous queries cannot join the transaction. Apply foreign keys and indexes needed by Day/date/user/entity queries. Store auth tokens only through SecureStore, never SQLite.
- **Automated verification:** Repository contract suite shared with web; migration fixtures; transaction/crash tests; Android emulator force-stop/relaunch test.
- **Acceptance:** Android creates and reloads launch-scope records offline with stable IDs and an intact outbox.

#### Gate G5 — Local-first durability

- Web migration passes every v4-v8 fixture, interruption point, recovery path, and canonical digest comparison.
- Existing keys nbmp:state:v4 through nbmp:state:v8, nbmp:backup:v1, nbmp:diagnostics:v1, nbmp:motivation:v1, nbmp:preferences:v1, and nbmp:reminders:v1 are retained.
- Web and Android pass the same repository contract suite.
- Every local launch-scope mutation is atomic with one outbox record.
- Android data survives force-stop/relaunch offline.
- The UI distinguishes Saved from any later network state.
- npm run test:all and mobile checks pass.

### Phase 5 — Identity, Convex synchronization, conflict retention, and convergence

**Purpose:** Synchronize trusted local replicas without losing authored changes or weakening typed domain boundaries.  
**Dependencies:** G5.  
**Decision coverage:** BD-04, BD-05, BD-13.  
**Gate:** G6.

#### P5.1 — Harden the tracer's Clerk plus Google identity boundary

- **Type:** Behavior-changing.
- **Preconditions:** P4.T proved the narrow Clerk/Google path and the development projects remain available.
- **Owned files:** convex/auth.config.ts; convex/users.ts; apps/mobile/src/platform/auth/ClerkProvider.tsx; src/platform/auth/ClerkProvider.jsx; docs/qa/cross-platform/auth-tracer.md.
- **Behavior first:** Signed-out clients remain usable locally; successful sign-in maps the same Google identity to one internal user across web and Android; sign-out stops sync but does not delete local data; one account cannot read another account's records.
- **Action:** Expand the tracer's Clerk integration to full signed-out/local, sign-in, refresh, expiry, sign-out, account switch, and cross-client behavior. Keep Clerk's Expo browser flow unless the selected Clerk/native flow proves a development build necessary. Store mobile session material through SecureStore. Request identity scopes only; do not request Google Calendar scopes. Record the exact redirect, token audience, issuer, and Convex auth mapping.
- **Automated verification:** Auth mapping tests with valid, expired, wrong-audience, and wrong-issuer tokens; Convex authorization tests for cross-user denial; web/mobile build checks.
- **Human verification:** Complete one Google sign-in on the target Samsung and web preview, then sign out and confirm local records remain.
- **Acceptance:** Identity is proven on both clients and all Convex functions derive user identity server-side.
- **Stop:** The integration needs provider calendar scopes, exposes tokens in logs/storage, requires a package absent from the audit, or cannot isolate users.

#### P5.2 — Expand the typed Convex schema and bounded indexes

- **Type:** Behavior-changing.
- **Owned files:** convex/schema.ts; convex/model/records.ts; convex/model/syncVersion.ts; convex/model/authorization.ts; convex/model/model.test.ts.
- **Action:** Expand the tracer's typed users/devices/events/receipts/sync-head/change-log schema to calendars, event exceptions, task lists, Actions, subtasks, completion occurrences, preferences, and conflict archive. Add user/entity, user/syncVersion, user/mutationId, and bounded range indexes. Use field validators; do not introduce a generic any-valued record table or unbounded collect query.
- **Automated verification:** Schema/model tests reject malformed and cross-user records, enforce unique mutation receipt behavior, and prove every pull/read path uses an index and bound.
- **Acceptance:** Every synchronized entity has a typed owner, validator, index, tombstone representation, record revision, and field-revision map.

#### P5.3 — Implement idempotent push with explicit conflict semantics

- **Type:** Behavior-changing.
- **Owned files:** convex/sync/push.ts; convex/sync/applyMutation.ts; convex/sync/conflicts.ts; convex/sync/push.test.ts; convex/sync/conflicts.test.ts.
- **Behavior first:** Duplicate mutation IDs return the original receipt; disjoint fields merge; same-field edits choose the latest server acceptance while preserving the losing value; completion occurrence beats a stale task edit; tombstone wins but losing authored content is recoverable; series and exception groups apply entirely or not at all.
- **Action:** Authenticate each batch, enforce a strict maximum, validate every envelope, partition atomic groups, apply domain invariants, allocate monotonic per-user syncVersion values, append ordered changes, retain conflict details, and return accepted/rejected/conflicted receipts. Device timestamps are diagnostic only and never determine global order.
- **Automated verification:** Unit tests for retry after lost response, duplicate/reordered batches, stale base revisions, disjoint/same-field changes, completion precedence, stable subtask IDs, tombstones, recurrence atomic groups, and cross-user injection.
- **Acceptance:** No accepted mutation can be applied twice, partially apply an atomic group, or erase the losing authored value without recovery evidence.

#### P5.4 — Implement bounded pull and transactional local application

- **Type:** Behavior-changing.
- **Owned files:** convex/sync/pull.ts; convex/sync/head.ts; convex/sync/pull.test.ts; packages/sync-contracts/src/applyPull.ts; packages/sync-contracts/src/applyPull.test.ts.
- **Behavior first:** Pull after cursor returns a bounded, strictly ordered page and next cursor; duplicate pages are harmless; gaps or non-monotonic versions stop application; local records and cursor commit together.
- **Action:** Query by authenticated user and syncVersion index with explicit page limits. Return tombstones and conflict metadata needed by clients. Define client-neutral pull application so each repository commits records, conflict archive, and cursor atomically.
- **Automated verification:** Pagination boundary, empty page, duplicate page, cursor gap, reorder, tombstone, conflict, and interrupted local-apply tests.
- **Acceptance:** Pull cost is bounded and no client advances its cursor without committing all changes in the page.

#### P5.5 — Wire the client-neutral sync coordinator

- **Type:** Behavior-changing.
- **Owned files:** packages/sync-contracts/src/coordinator.ts; packages/sync-contracts/src/coordinator.test.ts; src/app/sync/createSyncController.js; apps/mobile/src/app/sync/createSyncController.ts; src/ui/sync/SyncStatus.jsx.
- **Behavior first:** Coordinator resumes after app start/foreground/manual retry, pushes pending mutations, pulls until caught up within bounds, backs off retryable failures, halts on contract/auth failures, and never blocks local commands. Status distinguishes local-only, saved/pending, syncing, synced, conflict, auth-required, and blocked.
- **Action:** Keep transport and repository behind ports. Coalesce triggers without dropping work. Never delete an outbox row until its exact server receipt is durably applied. Expose counts/status through app view models, not direct Convex state in UI.
- **Automated verification:** Fake-clock/transport/repository tests for offline start, disconnect at each step, response loss, duplicate trigger, app restart, auth expiry, poison envelope, and conflict.
- **Acceptance:** Both clients use the same coordinator behavior and can recover without manual data repair.

#### P5.6 — Build the deterministic convergence and recurrence harness

- **Type:** Behavior-changing.
- **Owned files:** tests/sync/replicaHarness.test.ts; tests/sync/conflictScenarios.test.ts; tests/sync/recurrenceScenarios.test.ts; tests/sync/randomizedConvergence.test.ts; tests/sync/fixtures.ts.
- **Action:** Model two local replicas and the Convex acceptance order with controllable disconnection, retry, duplicate, reorder, force-stop, and opposite reconnect sequences. Assert canonical state, outboxes, cursors, conflict archive, and authored-value recoverability. Include recurrence create/edit/split/exception/delete round trips even where mobile editing is disabled.
- **Automated verification:** Curated scenarios pass 100 percent. A fixed-seed randomized suite of at least 10,000 interleavings reaches at least 99.9 percent convergence, has zero lost authored mutations, and emits replayable seeds for every failure. Any known semantic divergence remains release-blocking even if the numerical target is met.
- **Negative control:** Disable mutation receipt deduplication and prove duplicate/retry scenarios fail; restore and rerun.
- **Acceptance:** Every failure is reproducible, classified, and resolved before G6.

#### P5.7 — Implement first-sign-in notebook choice

- **Type:** Behavior-changing.
- **Owned files:** src/app/sync/firstSignInController.js; src/app/sync/firstSignInController.test.js; src/ui/sync/FirstSignInChoice.jsx; apps/mobile/src/app/sync/firstSignInController.ts; apps/mobile/src/ui/sync/FirstSignInChoice.tsx.
- **Behavior first:** Empty cloud offers upload; non-empty cloud plus local content requires an explicit review/merge choice; destructive replacement requires an export first; repeating the chosen operation is idempotent.
- **Action:** Compare local/cloud summaries without exposing content in logs. Offer clear local and cloud counts/dates, export, upload, review merge, and cancel. Never silently choose a winner. Route the selected operation through idempotent sync envelopes and retain conflict recovery.
- **Automated verification:** Empty/empty, local-only, cloud-only, both-same, both-divergent, retry, cancel, and export-failure tests on both app controllers.
- **Acceptance:** First sign-in cannot silently overwrite either notebook.

#### Gate G6 — Synchronization trust

- Clerk plus Google maps the same person across web and Android and denies cross-user access.
- Every Convex query/mutation is authenticated, validated, indexed, and bounded.
- Push/pull is idempotent through response loss, duplicate delivery, restart, and opposite reconnect order.
- Curated convergence is 100 percent; the fixed-seed randomized rate is at least 99.9 percent; there are zero known lost authored mutations.
- Same-field losers and tombstoned content are recoverable.
- Recurring series and exceptions round-trip atomically without identity drift.
- Local commands remain available while signed out or offline.

### Phase 6 — Deliver the native first Day vertical slice

**Purpose:** Let an Android user complete one useful planner day offline and see it converge on web.  
**Dependencies:** G6.  
**Decision coverage:** BD-03, BD-04, BD-05, BD-09, BD-11, BD-13.  
**Gate:** G7.

#### P6.1 — Build the mobile Day controller and view model

- **Type:** Behavior-changing.
- **Owned files:** apps/mobile/src/app/day/createDayController.ts; apps/mobile/src/app/day/getDayViewModel.ts; apps/mobile/src/app/day/dayController.test.ts; apps/mobile/app/day/[date].tsx; apps/mobile/src/ui/day/DayScreen.tsx.
- **Behavior first:** Selected date loads events and planned Actions in deterministic order; offline query uses SQLite; empty/error/loading states are distinguishable; view receives serializable rows and named commands only.
- **Named boundary:** Query getDayViewModel; commands selectDay, createDayEvent, createDayAction, openDayItem, completeDayAction, joinDayMeeting, beginMove, commitMove, cancelInteraction.
- **Action:** Use shared domain queries and mobile repository ports. Do not copy web JSX or put domain conditionals in the view. Render recurring records and exceptions read-only even while native recurrence editing remains unavailable.
- **Automated verification:** Controller/view-model tests plus Android component tests; architecture check; shared fixture comparison with the web Day projection.
- **Acceptance:** One date renders the same canonical event/Action identity and ordering on web and Android.

#### P6.2 — Add offline create/edit/complete/JOIN workflows

- **Type:** Behavior-changing.
- **Owned files:** apps/mobile/src/app/day/dayCommands.ts; apps/mobile/src/app/day/dayCommands.test.ts; apps/mobile/src/ui/day/DayComposer.tsx; apps/mobile/src/ui/day/DayItemSheet.tsx; apps/mobile/src/ui/day/JoinAction.tsx.
- **Behavior first:** Create/edit Event, create/plan/complete/reopen Action, and valid JOIN each call named commands; cancel leaves canonical records/outbox unchanged; invalid/missing meeting links are not launched; every committed edit is visible immediately offline.
- **Action:** Reuse shared domain commands, current meeting-link normalization, and repository transactions. Keep form drafts local until explicit save. Show Saved independently from sync status.
- **Automated verification:** Domain/controller tests; Android component tests; repository/outbox assertions; invalid-link security cases.
- **Acceptance:** Launch-critical work is usable without network and survives force-stop.

#### P6.3 — Add native direct manipulation with shared commit semantics

- **Type:** Behavior-changing.
- **Owned files:** apps/mobile/src/ui/day/DayTimeline.tsx; apps/mobile/src/ui/day/TimelineItem.tsx; apps/mobile/src/app/day/useDayGestureController.ts; apps/mobile/src/app/day/useDayGestureController.test.ts; apps/mobile/src/ui/day/dayTimeline.test.tsx.
- **Behavior first:** Event/Action body, completion, JOIN, start edge, and end edge have exclusive ownership; transient movement stays on the UI thread; one shared-domain command commits at end; cancel/interrupt commits nothing; accessible buttons/forms provide every gesture outcome.
- **Action:** Use React Native Gesture Handler and Reanimated only for recognition and transient visual state. Reuse shared domain interval/move/resize commands and Phase 0 lifecycle semantics, while keeping web pointer recognition and native gesture recognition in their platform feature layers. Preserve 44-by-44 coarse targets, reduced-motion behavior, and screen-reader alternatives.
- **Automated verification:** Gesture-controller tests for activation threshold, scroll arbitration, short items, cancellation, and single commit; Android instrumentation/component tests for hit regions and accessibility actions.
- **Acceptance:** Native gestures cannot bypass domain/app commands or mutate SQLite directly.

#### P6.4 — Prove the end-to-end first Day tracer

- **Type:** Release/evidence.
- **Owned files:** tests/sync/firstDayE2E.test.ts; docs/qa/cross-platform/first-day-tracer.md; apps/mobile/e2e/firstDay.e2e.ts; tests/e2e/cross-platform-day.spec.js.
- **Action:** On the target Samsung, start offline, create one event and one planned Action, force-stop, reopen, edit/complete, reconnect, sync, open web, verify both records and completion, edit the event on web, and verify the Android pull. Repeat with opposite reconnect order and a same-field conflict. Record commit, builds, device/OS, network transitions, IDs, mutation receipts, sync versions, and screenshots without sensitive content.
- **Automated verification:** Run deterministic cross-client harness plus production web E2E and mobile device test where infrastructure supports it.
- **Acceptance:** A complete Day survives offline/force-stop and converges both directions with recoverable conflict evidence.

#### Gate G7 — First Day outcome

- A user can open one day, create/edit an Event, create/plan/complete/reopen an Action, use valid JOIN, and use accessible alternatives offline on Android.
- Force-stop/reopen loses no committed local change.
- Reconnect syncs to web and a web edit returns to Android.
- Recurring records display and round-trip without mutation even though recurrence editing is clearly unavailable on Android.
- Gesture ownership and cancellation match Phase 0 contracts.
- The first Day QA artifact is reproducible from a named commit/build/device.

### Phase 7 — Introduce Chrono through a deterministic parser contract

**Purpose:** Improve natural-language creation only after local and sync trust exists.  
**Dependencies:** G7.  
**Decision coverage:** BD-06, BD-13.  
**Gate:** G8.

#### P7.1 — Extract the current deterministic quick-add parser and corpus

- **Type:** Compatibility migration.
- **Owned paths:** packages/quick-add/package.json; packages/quick-add/src/currentParser.js; packages/quick-add/src/contracts.js; packages/quick-add/src/corpus.test.js; src/features/planner/quickAdd.js compatibility export.
- **Action:** Mechanically move the existing parser, its describe/convert behavior, and all current test cases. Add owner-approved phrases covering explicit dates, relative dates, times, durations, recurrence, Action/Event intent, ambiguous text, DST boundaries, and locale/timezone assumptions. Preserve exact existing outputs before Chrono participates.
- **Automated verification:** Old/new import parity and corpus tests; web quick-add E2E; mobile command tests.
- **Acceptance:** Both clients use one deterministic parser entry point and existing phrases are unchanged.

#### P7.2 — Add the Chrono adapter in shadow mode

- **Type:** Behavior-changing.
- **Owned files:** packages/quick-add/src/chronoAdapter.js; packages/quick-add/src/chronoAdapter.test.js; packages/quick-add/src/parseQuickAdd.js; packages/quick-add/src/parseQuickAdd.test.js; packages/quick-add/src/telemetry.js.
- **Behavior first:** Parsing receives explicit reference instant, timezone, locale, and selected date; results retain source spans and certainty; ambiguous/forward-inferred fields are surfaced for confirmation; unsupported text remains title text; parser exceptions never block manual creation.
- **Action:** Run the current parser as authority and Chrono as a non-authoritative comparison. Record only local aggregate expression-class outcomes unless the user explicitly opts into diagnostics; never record raw phrase text. No network or LLM call is present.
- **Automated verification:** Corpus, DST, ambiguous phrase, certainty, span, fallback, privacy, and exception tests.
- **Acceptance:** Shadow mode cannot alter created records and produces enough class-level evidence for graduation.

#### P7.3 — Graduate expression classes independently

- **Type:** Behavior-changing.
- **Owned files:** packages/quick-add/src/graduationPolicy.js; packages/quick-add/src/graduationPolicy.test.js; src/app/quick-add/createQuickAddController.js; apps/mobile/src/app/quick-add/createQuickAddController.ts; docs/qa/cross-platform/chrono-graduation.md.
- **Behavior first:** Only an explicitly enabled expression class can use the Chrono result; uncertain fields appear in preview; confirmation commits exactly the previewed canonical command; disabling the class restores prior behavior.
- **Action:** Evaluate each class against the approved corpus and negative controls. Require the PRD quality threshold for that class and zero high-severity date/time mistakes. Keep per-class kill switches. Integrate through app controllers on web and Android, never directly from a view.
- **Automated verification:** Class-specific corpus and negative-control tests; web/mobile preview-to-command parity; no-network test.
- **Acceptance:** Graduated classes are deterministic, reversible, previewed, and share identical outputs across clients.

#### Gate G8 — Deterministic quick add

- Existing parser behavior remains covered.
- Every Chrono call has explicit reference/timezone/locale context.
- Ambiguity and uncertainty are visible before commit.
- Each active expression class independently meets its corpus gate and has a kill switch.
- No general LLM/network path can participate in creation.
- No raw quick-add text is emitted in telemetry by default.

### Phase 8 — Preview and private-beta certification

**Purpose:** Validate the trust milestone in production-like builds and controlled real use.  
**Dependencies:** G8.  
**Decision coverage:** BD-03, BD-04, BD-07, BD-13.  
**Gate:** G9.

#### P8.1 — Separate deterministic UI, sync integration, and live-environment suites

- **Type:** Governance/enforcement.
- **Owned files:** playwright.config.js; tests/e2e/fixtures/plannerRepository.js; tests/sync/liveConvex.test.ts; package.json; docs/qa/cross-platform/test-environments.md.
- **Action:** Keep ordinary Playwright tests on production web bundles with deterministic local/fake transport and serial isolation where required. Put live Convex/auth tests in an explicit opt-in command with dedicated test users and cleanup. Record which suite proves UI, local repository, protocol simulation, and live service behavior.
- **Automated verification:** npm run test:all passes without service credentials; the live command refuses to run without a named test environment; no production user data is addressed.
- **Acceptance:** Ordinary regression tests are stable/offline and service integration remains separately reproducible.

#### P8.2 — Produce production-like web and Android preview builds

- **Type:** Release/evidence.
- **Preconditions:** A selected hosted preview target if external web sharing is required; Expo/EAS project access and signing credentials for Android distribution.
- **Owned files:** Deployment configuration selected at execution; apps/mobile/eas.json if EAS is selected; docs/qa/cross-platform/preview-builds.md.
- **Action:** Build the root Vite production bundle and serve it with its production preview path. Create an internal Android build from the same commit and environment contract. Keep secrets in provider settings, not repository files. Record immutable URLs/build IDs, source SHA, environment, schema version, and rollback build.
- **Automated verification:** npm run build; production preview smoke E2E; Expo export/type checks; Android internal-build smoke.
- **Acceptance:** Reviewers can access named web and Android builds backed by the intended non-production Convex environment.
- **Stop:** Deployment target or credentials are unresolved, build provenance is unclear, or preview points at production data.

#### P8.3 — Run the private-beta acceptance matrix

- **Type:** Release/evidence.
- **Owned files:** docs/qa/cross-platform/private-beta-matrix.md; docs/qa/cross-platform/private-beta-results.md; docs/qa/cross-platform/known-limitations.md.
- **Action:** Run clean install, existing-web upgrade, v4-v8 migration, offline Day, force-stop/reopen, retry after response loss, two-client opposite reconnect, same/disjoint conflict, tombstone recovery, recurrence round trip, Action completion precedence, JOIN validation, dense timeline, reduced motion, screen reader, large text, coarse targets, storage failure, auth expiry, sign-out, export, and first-sign-in merge. State local-only capabilities and disabled recurrence editing clearly.
- **Automated verification:** Attach command results for checks, units, build, full web E2E, sync harness, live Convex suite, and mobile tests. Link each manual scenario to its build/device/environment.
- **Acceptance:** No critical/high open defect; no known lost authored mutation; no unresolved convergence/recurrence/auth isolation failure; limitations are visible before enrollment.

#### P8.4 — Enroll a controlled beta with stop telemetry

- **Type:** Release/evidence.
- **Owned files:** docs/qa/cross-platform/beta-enrollment.md; docs/qa/cross-platform/beta-observations.md; docs/qa/cross-platform/incident-runbook.md.
- **Action:** Enroll a small named cohort, stage schema/client rollout, monitor only privacy-safe aggregate sync health, and define support/export/recovery instructions. Keep rollback builds and server compatibility for the prior client throughout the observation window.
- **Acceptance:** The observation window completes with zero known authored-mutation loss and no unresolved critical/high issue. Expansion is a separate decision.
- **Stop:** Any data-loss suspicion, cross-user access, unrecoverable conflict, recurrence corruption, crash loop, or inability to export immediately halts enrollment and invokes the incident runbook.

#### Gate G9 — Trust milestone complete

- All G1-G8 evidence is linked to one release candidate SHA.
- Production web and Android internal builds are reproducible.
- Private-beta matrix passes on the target Samsung and supported desktop web environment.
- Zero known authored mutations are lost; convergence and recurrence targets hold.
- Recovery/export and rollback are proven.
- Known limitations are accurate and visible.

### Phase 9 — Continue extraction and separately gated expansion

**Purpose:** Continue the approved sequence without conflating trust completion with every later product surface.  
**Dependencies:** G7 for continued web extraction; G9 for iOS/provider/desktop decisions.  
**Decision coverage:** BD-03, BD-07, BD-09, BD-11, BD-12, BD-13.

#### Web extraction order after the trust slice has started

Each surface repeats the Phase 2 controller/view-model/parity protocol. The order is:

1. Actions full-page surface.
2. Notebook panel and note editor.
3. Composer and item-detail inspectors.
4. Settings, diagnostics, backup/import/export surfaces.
5. Month surfaces.
6. Week surfaces.
7. Timeline last.

Timeline cannot start until Phase 0 interaction contracts remain green, the native gesture controller has proven shared commit/cancel semantics, and all lower-risk surfaces have established the app boundary. Its extraction is split into projection/view model, passive lane/item rendering, interaction controller, and final composition removal; no unit combines these.

#### Separately gated expansion

- iOS begins only after Android G9 and a platform-gap review; it reuses the same domain, sync, and repository contracts.
- Google Calendar provider sync begins only after G9, in a provider adapter with explicit scopes, mapping, replay, and conflict contract. Additional providers wait behind Google evidence.
- Broad notes/context synchronization waits for note revision/conflict/tombstone contracts and privacy review.
- Tauri begins only after web per-record storage, outbox, Convex sync, convergence, and beta evidence are trustworthy. It packages the existing web application and adds desktop adapters; it does not fork domain behavior.
- Documentation archives and naming alignment begin only after active references are updated and check:docs reports zero active links to the old locations. Moves are small and reviewable, not a mass archive operation.

## Repository-relative file ownership

| Area | Owner layer | Primary paths | Rule |
|---|---|---|---|
| Product authority | Product docs | docs/product/calendar-master-cross-platform.md; docs/product/planner-foundation.md | Owns behavior/platform direction, not sequencing. |
| Architecture authority | ADR | docs/adr/0001-domain-oriented-modular-monolith.md | Owns dependency and responsibility direction. |
| Interaction/visual contract | Design and approved focused contract | DESIGN.md; docs/interaction-contracts/planner-interactions.md | Owns visual/motion and interaction invariants. |
| Web composition | App | src/app/**; src/main.jsx; shrinking src/Planner.jsx | Owns controllers, workflows, view models, port injection. |
| Web views | UI | src/ui/** | Passive rendering and event intent only. |
| Shared domains | Domain package | packages/domain/** | Canonical models, invariants, commands, queries, occurrence identity. |
| Sync protocol | Contract package | packages/sync-contracts/** | Transport-neutral envelope, cursor, conflict, coordinator contracts. |
| Quick add | Parser package | packages/quick-add/** | Deterministic parsing and Chrono adapter. |
| Web persistence | Platform | src/platform/persistence/** | Existing compatibility plus IndexedDB/outbox/recovery. |
| Mobile composition/views | Mobile app/UI | apps/mobile/src/app/**; apps/mobile/src/ui/**; apps/mobile/app/** | Native controller/view boundary. |
| Mobile persistence/auth | Mobile platform | apps/mobile/src/platform/** | SQLite, SecureStore, device/runtime adapters. |
| Backend | Convex | convex/** | Authenticated typed records, receipts, change log, push/pull. |
| Enforcement | Scripts | scripts/check-architecture-boundaries.mjs; scripts/architecture-*; scripts/check-doc-links* | Mechanical ADR/docs gates. |
| Web behavior QA | Playwright | tests/e2e/**; playwright.config.js | Production-bundle visible/persisted behavior. |
| Sync QA | Deterministic/live harness | tests/sync/** | Protocol interleavings and optional live service checks. |
| Release evidence | QA docs | docs/qa/cross-platform/** | Named-build evidence, not authority. |

Shared choke-point ownership:

- Only the phase integrator edits package.json and package-lock.json.
- Only one unit at a time edits src/Planner.jsx.
- Only P1.1 edits docs/README.md until its gate is merged.
- Convex generated files are regenerated by the Convex owner and never hand-edited.
- Same-wave units must have zero file overlap; if overlap appears, the later unit moves to the next wave.

## Migration and compatibility contract

### Source/package migration

- Existing public domain exports and old import paths remain available through thin compatibility re-exports while consumers move.
- Every moved module has old/new fixture parity before an old path is removed.
- No semantic refactor shares a commit with a move.
- package.json exports expose only public indexes; client code cannot import another domain's internals.
- Stable IDs, date keys, local date-time strings, occurrence IDs, recurrence rules, error types, and ordering remain unchanged unless a separately approved product migration says otherwise.

### Web persistence

- nbmp:state:v4, v5, v6, v7, and v8 remain readable.
- nbmp:state:v8 remains a recoverable compatibility snapshot for at least one complete private-beta release after IndexedDB becomes canonical.
- Existing backup, diagnostics, motivation, preferences, and reminder keys remain unchanged during the trust milestone.
- Migration writes a durable marker only in the same transaction as all mapped records.
- IndexedDB primary selection requires read-back and canonical digest parity.
- Export/import/recovery operate through the repository boundary and preserve the current external notebook format until a separately versioned export format is approved.
- No cleanup of old keys occurs in this plan.

### Mobile SQLite

- Schema versions increase monotonically.
- Migrations are idempotent or transactionally one-shot and are tested at every interruption boundary.
- Canonical records and outbox envelopes commit in one exclusive transaction.
- SecureStore contains session secrets; SQLite contains no bearer token.
- Database corruption/error paths offer export/recovery guidance and never initialize over an unreadable database silently.

### Convex and protocol compatibility

- Schema evolution is additive while any prior beta client remains supported.
- Client/server negotiate a sync contract version and stop with an actionable update state on incompatibility.
- Pull cursors are opaque, monotonic for one user, and committed with their page.
- Mutation IDs remain stable forever across retries.
- Tombstones and conflict archives are retained through the beta observation window.
- Server rejects unknown required fields/operations instead of guessing.
- Rolling back a client does not require rolling back or deleting server data.

### First sign-in and destructive choices

- A local notebook is never silently replaced by cloud state.
- A non-empty local/cloud pair requires explicit review/merge.
- An export must succeed before a destructive replacement option becomes available.
- Upload/merge operations are idempotent and can resume.

## Test scenario matrix

| Scenario family | Required assertions | Environment |
|---|---|---|
| Interaction regressions | Visible geometry, first-frame date, one owner, cancel non-mutation, short resize, Add a Step, field-scoped editor, Week scroll/JOIN/focus, keyboard and breakpoints | Production web bundle; desktop and 390-pixel touch emulation; target Samsung |
| Extraction parity | Same roles/names, DOM order, geometry, focus, motion, route/date, query output, command called, persisted digest | Before/after production web bundle |
| Boundary enforcement | Allowed edge passes; each forbidden layer edge fails with importer/imported diagnostic; exact debt cannot widen | Node checker fixtures and production scan |
| Domain package parity | Old/new exports produce deep-equal values/errors/ordering/IDs across recurrence/timezone fixtures | Node package tests |
| Web migration | Empty, v4-v8, corrupt, interrupted, duplicate retry, digest mismatch, IndexedDB unavailable, export/recovery | Node/browser repository tests and E2E |
| Local outbox | Record+envelope atomicity, rollback, force-stop, restart, duplicate command identity | Web repository tests; Android emulator/device |
| Auth isolation | Local signed-out mode, valid identity, expiry, wrong issuer/audience, sign-out, cross-user denial | Unit/integration plus target devices |
| Push/pull | Retry after lost response, duplicate/reorder, bounded pages, cursor gaps, poison envelope, auth expiry | Deterministic harness and opt-in Convex environment |
| Conflicts | Disjoint merge, same-field loser retention, completion precedence, stable subtask IDs, tombstone recovery | Deterministic harness and cross-client E2E |
| Recurrence | Create, edit occurrence, edit series, split, exception, delete, offline conflict, round-trip identity | Shared domain tests, sync harness, web/Android read |
| First Day | Offline create/edit/complete/JOIN, force-stop, reconnect, web convergence, reverse edit | Target Samsung plus production web preview |
| Chrono | Explicit/relative date, time, duration, recurrence, ambiguity, DST, timezone, locale, spans, certainty, fallback, privacy | Shared corpus on web/mobile |
| Accessibility/motion | 44-by-44 coarse targets, screen reader labels/actions, keyboard alternatives, large text, contrast, reduced motion | Existing web suites plus Android device |
| Recovery/release | Export, corrupt storage, server unavailable, rollback client, prior client compatibility, known-limit display | Preview/private-beta builds |

## Verification commands and gates

Commands are run from repository root unless a unit says otherwise:

- Architecture/docs: npm run check
- Unit: npm test
- Web production build: npm run build
- Focused browser: npm run test:e2e -- followed by the named spec paths
- Full browser: npm run test:e2e
- Complete root gate: npm run test:all
- Mobile: the checked-in apps/mobile typecheck/test/export scripts
- Sync simulation: the checked-in tests/sync script
- Live Convex/auth: an explicit opt-in script requiring a named test environment

Gate policy:

1. A focused test is necessary but never substitutes for the phase gate.
2. Browser tests run against the production Vite bundle, preserving the current Playwright contract.
3. Ordinary UI tests do not require live cloud services.
4. Negative controls are evidence, not permanent disabled tests.
5. Screenshots supplement geometry/accessibility/persistence assertions; they do not replace them.
6. A retry-only pass is a failure until the race or environmental cause is resolved.
7. Generated test data uses isolated users/devices and cannot address production accounts.

## Security and privacy threat model

### Trust boundaries

| Boundary | Risk |
|---|---|
| UI to app command | Untrusted text, links, gesture intent, and route parameters enter canonical workflows. |
| App command to local repository | A crash or bypass could separate visible state from durable records/outbox. |
| Local outbox to Convex | Envelopes can be replayed, duplicated, reordered, forged, or oversized. |
| Clerk token to Convex identity | A bad issuer/audience or client-provided user ID could cross account boundaries. |
| Convex change log to client | Unbounded or malformed pages could deny service or corrupt a replica. |
| Import/export to repository | Malformed or hostile notebook content can enter migrations. |
| Provider adapters, later | OAuth scope and payload differences can leak or corrupt data. |
| Package manager to build | Typosquatted or compromised packages can execute during install/build. |

### STRIDE register

| ID | Category | Severity | Disposition | Mitigation |
|---|---|---|---|---|
| TM-01 | Spoofing | Critical | Mitigate | Convex derives user from validated Clerk token; issuer/audience tests; internal device enrollment; never trust client userId. |
| TM-02 | Tampering | High | Mitigate | Shared codecs, domain validation, typed Convex schema, atomic local transactions, mutation receipts, atomic recurrence groups. |
| TM-03 | Repudiation | High | Mitigate | Immutable mutation ID, device ID, server acceptance receipt, syncVersion, conflict archive, privacy-safe diagnostics. |
| TM-04 | Information disclosure | Critical | Mitigate | Per-user indexes/authorization, cross-user denial tests, SecureStore for mobile tokens, no token/raw quick-add logging, no provider scopes. |
| TM-05 | Denial of service | High | Mitigate | Strict batch/page limits, indexed bounded pull, retry backoff, poison-envelope blocked state, offline local operation. |
| TM-06 | Elevation of privilege | Critical | Mitigate | Server-side authorization on every function, no generic mutation endpoint, least identity scopes, test-user isolation. |
| TM-07 | Supply-chain tampering | High | Mitigate | Package legitimacy audit, exact lockfile/integrity review, no unaudited package, human block on suspicious identity/transitives. |
| TM-08 | Import payload tampering | High | Mitigate | Existing version validators, bounded parsing, pre-replacement export, recovery snapshot, never initialize over unreadable data. |
| TM-09 | Malicious meeting link | Medium | Mitigate | Reuse normalized http/https meeting-link validation; UI cannot launch arbitrary schemes. |

No critical or high threat may be accepted for the private beta. A new trust boundary requires a register update before implementation.

## Rollback and stop conditions

### Universal stop conditions

Stop the current unit and preserve evidence when:

- Latest main changes a binding contract or owned seam and the unit has not been rebased/recharacterized.
- A new regression assertion cannot be made to fail under the old or deliberately inverted behavior.
- An extraction-only unit changes a product assertion, persisted digest, geometry, focus, motion, or accessible semantics.
- The architecture checker requires a wildcard exception or a new debt entry without an ADR-governed rationale.
- A package identity, maintainer provenance, or lockfile change is suspicious or unverified.
- A migration changes an ID, recurrence exception, completion occurrence, note, preference, or export without exact compatibility evidence.
- A local command can commit a record without its outbox or an outbox without its record.
- Any authored mutation appears lost, cross-user data is readable, a recurrence atomic group partially applies, or a conflict loser is unrecoverable.
- Tests pass only with retries, arbitrary sleeps, broad mocks that bypass the contract, or disabled assertions.
- Preview/mobile builds cannot be tied to a source SHA and non-production environment.

### Rollback strategy

- Interaction fixes: revert the individual behavior unit; retain characterization tests that express the settled contract.
- UI extraction: revert the individual extraction commit; app contracts can remain only if unused and tested, otherwise revert with the view.
- Package relocation: restore old import paths through compatibility re-exports; never revert by duplicating divergent logic.
- IndexedDB: switch repository selection back to the validated v8 adapter; retain IndexedDB and v8 data for recovery and diagnosis.
- SQLite: ship the prior internal build; do not downgrade/destructively rewrite the database. Newer schema remains readable by the recovery/export tool.
- Sync: stop push/pull with a server/client compatibility flag while local writes/outboxes continue; do not delete outboxes or server records.
- Convex: keep additive schema compatibility and deploy a forward fix; do not roll back by deleting accepted changes.
- Chrono: disable the affected expression-class switch and return to the existing deterministic parser.
- Beta: halt enrollment, preserve exports/log IDs/conflict records, notify the cohort, and use the incident runbook.

## Deferred work and rationale

| Deferred item | Earliest gate | Rationale |
|---|---|---|
| Remaining broad Planner.jsx extraction | G7 for restart; Timeline after all lower-risk surfaces | The trust slice must begin before web cleanup is perfected; Timeline carries the highest interaction risk. |
| iOS client/release | G9 | Android-first is binding and provides the initial native durability/gesture evidence. |
| Google Calendar provider sync | G9 plus provider-specific ADR/spec | Sync trust, idempotency, conflict retention, and OAuth scope discipline must be proven first. |
| Additional calendar providers | Successful Google provider gate | Provider payloads and semantics require separate boundary adapters and evidence. |
| Broad notes/context sync | Dedicated note revision/conflict/privacy gate | Notes have richer revision, attachment, privacy, and tombstone requirements than the first Day scope. |
| Tauri desktop packaging | G9 and explicit desktop plan | Desktop packaging must reuse a trustworthy synced web client, not become a parallel persistence implementation. |
| Widgets/watch surfaces | Post-mobile product specification | They add background/runtime constraints outside the approved trust slice. |
| General LLM creation | Not scheduled | The critical create path must remain deterministic; Chrono plus explicit preview owns parsing. |
| Mass documentation archive/name cleanup | check:docs zero-active-reference gate after active links move | Archival must not break active authority or historical traceability. |
| Removal of v8 compatibility snapshot and old keys | One complete stable beta release plus explicit migration plan | Recovery and rollback take precedence over cleanup. |

## Definition of Done

### Per-unit

- The unit owns only its listed files/paths and has no hidden cross-phase dependency.
- Its classification is accurate; extraction and behavior changes are not mixed.
- Automated tests were added or characterized before the implementation where applicable.
- The required negative control or parity proof is recorded.
- Focused checks and all prior phase gates pass.
- Architecture/docs checks pass and exact debt never grows silently.
- Rollback is possible without deleting user data.
- Review evidence names the source SHA and environment.

### Calendar Master trust milestone

The milestone is done only when:

1. All interaction regression requirements R1-R19 pass with negative-control evidence.
2. The approved PRD is the indexed living product spec and typed documentation authority is enforced.
3. ADR 0001 dependency direction is an automated build gate with a shrinking exact-debt ledger.
4. Navigation, command/search, shortcuts, and Agenda are passive views behind named app controllers/view models with parity evidence.
5. The existing root React/Vite web client remains healthy and production-build E2E remains green.
6. Android uses Expo, consumes the same shared JavaScript domain and sync contracts as web, and stores data durably in SQLite.
7. Web uses per-record IndexedDB behind a repository boundary while preserving validated v4-v8 recovery and the v8 compatibility snapshot.
8. Both clients atomically commit canonical launch-scope records with immutable outbox envelopes.
9. Clerk plus Google identity and Convex enforce authenticated, typed, bounded, per-user sync.
10. Push/pull is idempotent, conflict losers are recoverable, and recurring series/exceptions remain atomic and identity-stable.
11. Curated convergence passes completely, fixed-seed randomized convergence is at least 99.9 percent, and there are zero known lost authored mutations.
12. A real Samsung completes the first Day offline, survives force-stop, syncs to web, and receives a web edit back.
13. Native direct manipulation has exclusive ownership, single-command commit, cancel non-mutation, and accessible alternatives.
14. Chrono is deterministic, class-gated, previewed, timezone-explicit, network-free, and absent from unsupported expression classes.
15. Production-like web and Android builds pass the private-beta matrix with export, recovery, rollback, security, accessibility, and known-limit evidence.
16. Tauri, provider sync, iOS, broad notes sync, and archive cleanup have not started before their gates.

## Multi-source coverage audit

### Goal coverage

| Goal item | Coverage |
|---|---|
| Trustworthy cross-platform Calendar Master while preserving web | Executive decision; P0-P8; Definition of Done 1-15 |
| Android-first offline Day that syncs to web | P3-P6; G4-G7 |
| Architecture evolves without a rewrite | P1-P3; dependency matrix; compatibility contract |

### Required-input coverage

| Source | Material incorporated |
|---|---|
| Interaction regression plan | P0.0-P0.9, G1, negative-control and device gates |
| ADR 0001 | Target architecture, dependency matrix, P1.2/P1.3 |
| planner-foundation product spec | Canonical model reuse, domain commands/queries, occurrence IDs, local-first migration, UI presentation constraints |
| Approved cross-platform PRD | BD-01 through BD-07, P3-P9, sync/conflict/recurrence/quality gates |
| Older cross-platform trust plan | Useful technical sequence retained where compatible; stale commit and immediate-workspace assumptions explicitly superseded |
| DESIGN.md | P0 contracts, parity, motion, coarse targets, negative controls |
| docs/README.md | Typed authority and promotion/indexing in P1.1 |
| package.json | Root web retention, workspace trigger, package gate, commands |
| src tree | Exact boundary rules, extraction order, package/persistence ownership |
| Tests and Playwright | Production-bundle, serial state, repository bridge, focused/full gates |

### Binding-decision coverage

| Decision | Implemented by |
|---|---|
| BD-01 | P1.1 |
| BD-02 | P1.2-P1.3 |
| BD-03 | P3.1, P6, P9 |
| BD-04 | P4-P6 |
| BD-05 | P3.3-P3.4, P4-P6 |
| BD-06 | P7 |
| BD-07 | P9 deferred gate |
| BD-08 | Executive decision, P2-P3, deferred work |
| BD-09 | Dependency graph and P0-P9 order |
| BD-10 | Documentation authority and P1.1 |
| BD-11 | Dependency rules, P2, P4.2, P6 |
| BD-12 | P9 extraction order |
| BD-13 | P0 gates, migration contract, all phase gates |

### Research/stack constraint coverage

| Constraint | Plan response |
|---|---|
| Expo workspaces add complexity and are justified by multiple clients/shared code | Workspace waits until apps/mobile exists; root web is not moved. |
| Expo SQLite transaction APIs differ in concurrency guarantees | Android command writes require exclusive transactions and crash tests. |
| Clerk Expo browser auth can be tested before native UI requirements force a development build | P4.T validates the browser flow first; P5.1 keeps that path unless native requirements prove a development build necessary. |
| Convex indexed and paginated queries are needed for bounded sync | P5.2 and P5.4 require user/syncVersion indexes and explicit page limits. |
| Chrono exposes source spans, reference instants/timezones, and certainty | P7 preserves spans/certainty and supplies explicit parser context. |

No required goal, source requirement, research constraint, or binding decision is unplanned. Deferred items are explicitly outside the trust milestone and have prerequisite gates.

## Goal-backward self-review

### Observable truths required for the goal

1. Existing web users experience all repaired interactions and no regression from extraction or storage migration.
2. An engineer can identify the authoritative architecture, product behavior, design rules, local feature contracts, sequencing, evidence, and drafts.
3. A forbidden dependency cannot enter the repository unnoticed.
4. Extracted web views cannot reach persistence or canonical mutation and Planner.jsx loses their controller responsibilities.
5. Android can create useful Day data offline and recover it after force-stop.
6. Every launch-scope local change has a durable, retryable identity and cannot be separated from its canonical record.
7. Web and Android converge through authenticated, bounded, idempotent sync while preserving conflicts and recurrence identity.
8. Natural-language creation is deterministic, previewed, and independent of a general LLM.
9. A private-beta build can be stopped or rolled back without deleting local or cloud-authored data.

### Required artifacts

- Living product spec and typed docs index.
- Architecture/link checkers and exact debt ledger.
- App controllers/view models and passive web/mobile views.
- Shared domain, sync-contract, and quick-add packages.
- Web IndexedDB and Android SQLite repositories/outboxes.
- Typed Convex schema, auth, push, pull, conflict archive, and change log.
- Deterministic convergence, recurrence, regression, migration, and first-Day tests.
- Named preview/private-beta evidence and incident/rollback instructions.

### Critical links most likely to fail

| Link | Proof |
|---|---|
| UI intent → named app command | Architecture checker plus controller tests and passive-view imports |
| App command → domain result → record/outbox transaction | Shared repository contract and crash injection |
| v8 notebook → per-record IndexedDB → identical UI/export | Version fixture corpus and canonical digest parity |
| SQLite record/outbox → force-stop recovery | Exclusive transaction tests and target-device evidence |
| Outbox mutation ID → Convex receipt → local deletion | Response-loss/idempotency tests |
| Convex syncVersion → bounded pull cursor → local atomic apply | Pagination/gap/interruption tests |
| Recurrence series/exceptions → atomic group → both replicas | Recurrence harness and cross-client read |
| Controller view model → web/native view parity | Shared fixtures and production/device tests |
| Chrono result → preview → exact canonical command | Span/certainty corpus and preview-to-command tests |
| Release build → environment → rollback/export | Build provenance and private-beta runbook |

### Self-review result

- Every BD decision maps to at least one implementation unit or explicit gated deferral.
- The binding sequence is preserved.
- No deferred idea is smuggled into an earlier phase.
- Behavior-changing work is separated from extraction-only work.
- Every high-risk regression requires a negative control; every extraction requires parity.
- Stable domains and persistence keys move only inside explicit compatibility units.
- Every phase ends in an observable gate and every critical artifact has an entry point and consumer.
- Timeline, Tauri, provider sync, iOS, broad notes sync, and archive cleanup remain behind their required gates.

Result: ready for phased execution once the blockers below are resolved at their named preconditions.

## Genuine unresolved blockers

1. **Fresh remote baseline:** This workspace only proves that the current branch is one commit behind the locally cached origin/main at 9deff64. Execution must fetch origin and revalidate the regression plan against the then-current main before any source change.
2. **Untracked regression plan:** The required remediation plan is untracked here. It must be preserved and intentionally landed/adopted; baseline cleanup must not remove it.
3. **Identity environment:** P4.T requires Clerk, Convex, and Google OAuth development projects, redirect/deep-link configuration, and authorized credentials. This does not block P0-P3, but it blocks the first cross-client trust tracer and all later synchronized work.
4. **Hosted preview target:** No deployment configuration is present. Local Vite production preview is available, but an externally shared web preview requires a provider/account decision before P8.2.
5. **Android distribution and hardware:** P8.2-P8.4 require Expo/EAS or another approved internal-distribution account, signing access, and continued access to the target Samsung device. Emulator evidence does not satisfy the private-beta hardware gate.

## Reference links used for stack verification

- Expo monorepos: https://docs.expo.dev/guides/monorepos/
- Expo Router: https://docs.expo.dev/versions/latest/sdk/router/
- Expo SQLite: https://docs.expo.dev/versions/v55.0.0/sdk/sqlite/
- Convex React Native quickstart: https://docs.convex.dev/quickstart/react-native
- Convex indexes: https://docs.convex.dev/database/reading-data/indexes/
- Convex pagination: https://docs.convex.dev/database/pagination
- Convex validation: https://docs.convex.dev/functions/validation
- Convex Clerk authentication: https://docs.convex.dev/auth/clerk
- Clerk Expo quickstart: https://clerk.com/docs/expo/getting-started/quickstart
- Clerk and Convex integration: https://clerk.com/docs/guides/development/integrations/databases/convex
- Chrono: https://github.com/wanasit/chrono

---

## Amendment 1 — 2026-08-16: re-baseline and continuous budget

**Status:** Binding amendment. Where this section conflicts with the body above, this section controls.
**Reason:** Forty-one commits landed in the three days after this plan was written. Its evidence has drifted, and the drift is in the direction the plan exists to prevent.

### A1.1 — Measured re-baseline

Every figure below was measured on 2026-08-16, not estimated.

| Claim in the body | Measured today | Consequence |
|---|---|---|
| `src/Planner.jsx` is approximately 8,100 lines | **9,079 lines** | The file grew **+1,014 lines (+12.6%)** from the 8,065-line baseline at 9deff64. The plan's central premise is not merely unmet; it is moving backwards. |
| Baseline is origin/main at 9deff64 | Still a valid ancestor of HEAD, but **41 commits behind** | The baseline is sound and does not need replacing. It needs re-measuring, which is a different act. |
| The regression plan is untracked | **Now tracked** | Unresolved blocker 2 is closed. No other blocker has changed. |
| There is no `src/ui` layer and only a small `src/app` layer | Unchanged — no `src/ui`; `src/app` still holds 3 files | Phase 2 has not started. |
| No architecture enforcement in `scripts/` | Unchanged — `scripts/` holds only contact-sheet, post-merge, sites-worker | **P1.2 has not started.** |
| `docs/README.md` has no typed authority table | Unchanged | **P1.1 has not started.** |

Commit mix over those 41 commits: 23 `fix`, 10 `docs`, 7 `feat`, 1 `test`.

**The finding that matters:** real work has continued at pace, but none of it was Phase 1 or Phase 2, and the gate meant to precede it — G2, governed architecture — never closed. BD-09's binding order is being violated in practice, not by decision.

### A1.2 — The ratchet is aspirational; make it mechanical

Gate G3 requires that the debt ledger "never grows" and that Planner.jsx has "measurably fewer" inline declarations. Both are **phase gates**, evaluated at the end of a phase that has not begun. Between gates there is nothing stopping the file growing, and it grew 12.6%.

A ratchet that is only checked at a gate is not a ratchet.

**Amendment:** Introduce the boundary budget as a per-commit check, ahead of and independent of Phase 1's full checker.

- **New unit P0.10 — Planner.jsx growth ratchet.** Type: governance/enforcement. Owned files: `scripts/check-planner-budget.mjs`, `scripts/planner-budget.json`, `package.json`.
- Record today's 9,079 lines and the current count of inline component declarations as the ceiling. The check fails if either rises.
- Wire into `npm run check` so it runs before unit tests, as P1.3 already specifies for the architecture checker.
- **Dependency:** none. This is deliberately placed before G1, not after G2, because the cost of waiting is measured at ~340 lines per day.
- **Negative control:** add ten lines to Planner.jsx, observe failure naming the ceiling and the delta; remove, observe green.
- **Acceptance:** the ceiling can only move down, and only inside an extraction unit that removes a boundary edge.

### A1.3 — Gates must re-validate their own evidence

Nothing in the Definition of Done requires re-measuring the claims in "Live repository evidence" before a phase begins. That is how a 12.6% drift went unrecorded for three days.

**Amendment:** Add to **Per-unit Definition of Done**:

> - The unit's preconditions were re-measured against the current HEAD at the moment execution began, and any figure in "Live repository evidence" that has moved by more than 5 percent is corrected in the same PR.

### A1.4 — The motion and stylesheet layer has no home in this plan

The plan names DESIGN.md as visual and motion authority and correctly puts Timeline last as the highest-risk seam. But it has no unit for the motion system itself, and that system is not in Timeline — it is a **439-line CSS template literal inside Planner.jsx**, rebuilt as a string on every render and re-parsed by the browser on every theme change.

This is load-bearing for three separate goals the plan already holds:

- It is a meaningful share of the Planner.jsx line count Phase 2 must reduce.
- It is where the layout-property animations live that violate the no-layout-animation rule recorded in `docs/superpowers/specs/2026-08-15-shared-layout-motion-prd.md` §7.2.
- Phase 6 ports "launch-critical event and Action interactions" to a second client. Those interaction contracts are still being rewritten — 23 of the last 41 commits were `fix`. Porting an unsettled contract doubles the surface that has to settle.

Evidence: `docs/superpowers/plans/2026-08-16-responsive-tiers-and-motion.md` and `docs/superpowers/plans/2026-08-16-motion-regression-repair.md`.

**Amendment:** Insert **Phase 2.5 — Lift the stylesheet and settle the motion contract**, between G3 and Phase 3.

- **P2.5.1** Extract the template-literal stylesheet from `Planner.jsx` into a real CSS file; theme values become custom properties on the root element, the pattern `--nb-line` already uses. Extraction-only; no visual change; parity proof is a computed-style diff across all fifteen themes.
- **P2.5.2** Close the remaining layout-property animations recorded in the responsive-tiers plan, and add the guard that rejects new ones. Behavior-changing; each needs a negative control.
- **P2.5.3** Declare the interaction contract frozen for the surfaces Phase 6 will port. Any later change to those contracts is a behavior-changing unit with its own gate, not incidental polish.
- **Gate G3.5:** the stylesheet is out of the render path; zero elements transition layout properties; the frozen contract list is written down and links to its e2e assertions.

**Rationale for the position:** before Phase 3, because Phase 3 creates the second consumer. Every day the contract stays unsettled after that, it has to settle twice.

### A1.5 — State the resourcing assumption

The plan specifies roughly fifty units across nine phases and requires Clerk, Convex, Google OAuth, an EAS or equivalent distribution account, and continued access to a specific Samsung device. It carries no effort estimate, no statement of who executes it, and no calendar horizon.

That is defensible for a sequencing document — order is its stated authority, not scheduling. But it becomes a risk when read as a commitment, because Phases 4 through 6 are a single stretch with no shippable user value until the trust slice completes.

**Amendment:** Add to the header block, above Executive decision:

> **Resourcing assumption:** This plan states order, not schedule. Phases 4-6 form one indivisible trust program with no intermediate user-visible value; do not begin P4.T without confirming continuous access to the identity, backend, and device prerequisites listed under Genuine unresolved blockers. If that access is uncertain, stop after G3.5 — the web client is healthy, governed, and shippable at that point.

### A1.6 — Blockers, restated

1. Fresh remote baseline — **still open**, and now 41 commits wide.
2. Untracked regression plan — **closed.** The file is tracked.
3. Identity environment — **still open.** Blocks P4.T onward.
4. Hosted preview target — **still open.** Blocks P8.2.
5. Android distribution and hardware — **still open.** Blocks P8.2-P8.4.
6. **New:** Interaction contracts for the Phase 6 port surfaces are unsettled. Closed by G3.5.

---

## Amendment 2 — 2026-08-19: connected product, and the resequencing that follows

**Status:** Binding amendment. Where this section conflicts with the body above or with Amendment 1, this section controls.
**Reason:** The product moved from local-first to connected. Two things in the body are now wrong — its positioning, and its execution order — and one of its central complaints has been resolved.

### A2.1 — The positioning changed

The Executive decision above describes "an Android-first, **local-first** cross-platform product". That is superseded.

Calendar Master is a **connected** day planner: Google and Outlook calendars assembled into one day, and mail read to propose events the user confirms. Isolation was never the value; a correct, legible day was, and a planner that cannot see the calendars where commitments actually live asks the user to maintain their day twice.

**Offline is unchanged and non-negotiable.** Durable local storage, immediate local writes and a durable outbox all survive verbatim. Every "offline" requirement in the body below still binds. What is retired is *isolation as a product promise*, not offline capability as an engineering property. Do not read this amendment as permission to build an online-only client.

Authority for the new positioning is `PRODUCT.md` and the cross-platform PRD, both revised the same day.

### A2.2 — Measured re-baseline

Measured 2026-08-19, not estimated.

| Claim in the body or Amendment 1 | Measured today | Consequence |
|---|---|---|
| `src/Planner.jsx` is 9,079 lines and "moving backwards" | **5,570 lines** | Down 3,509 (−38.7%) from Amendment 1's measurement, and 4,046 below the 9,616 peak. The complaint that motivated Amendment 1 is closed. |
| Broad web extraction is deferred behind the trust slice | **Complete** | Zero React components remain in `Planner.jsx`; 18 modules under `src/features/planner/`. Item 7 of the execution order ("continue broader web extraction only after the trust slice is operating") has been overtaken by events and no longer gates anything. |
| Timeline is the final web surface to move | **Moved** | `WeekGrid` (578 lines) left on 2026-08-19. |
| The app makes no network calls | **Still true** | `src/` has zero `fetch`/XHR/WebSocket. Everything connected is committed and unbuilt. |

### A2.3 — The sequencing changed

The body orders Expo/Android and the Convex trust slice **before** any provider work; the PRD reached Google Calendar at Phase 4. Both are superseded by the PRD's revised §13, and the reason is risk, not preference:

- **The riskiest untested assumption moved.** It is no longer "can two clients converge offline" — it is "can this assemble a correct day out of accounts we do not control", including recurrence and exception equivalence against two foreign engines. Untested risk is retired early.
- **Mobile is no longer the gate to value.** The existing web client can prove connected calendars alone. Building a second client before provider mapping and token handling are known to hold up is building for an unproven product.

**New order:** server + auth + Google read-only → two-way sync + Microsoft → mail proposals → *then* the Expo/Android trust slice → mobile parity → notes. The Convex sync infrastructure this plan specifies is still the prerequisite for all of it; it simply lands with a web client first.

### A2.4 — What survives unchanged

Everything about durability and correctness. Specifically: durable local repositories and outboxes, idempotent push, indexed pull, conflict retention, force-stop recovery, recurrence round trips, the shared domain package, ADR 0001's dependency rules and the ratcheting build gate, and Chrono behind a deterministic parser contract.

One rule is added by the new direction and binds everywhere: **provider payloads are mapped, never stored raw, and mail proposes rather than writes.** See PRD §7.6 and §7.7.
