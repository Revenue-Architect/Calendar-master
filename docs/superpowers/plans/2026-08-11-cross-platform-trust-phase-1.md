# Cross-Platform Trust Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that one day of Calendar Master events and actions can be edited offline on Android, survive process termination, and converge through Convex with the existing web app without losing authored changes.

**Architecture:** Preserve the root React/Vite web application while adding an Expo app and workspace packages. Both clients commit immediately to a local per-record database and an ordered outbox, then exchange idempotent, versioned mutations with typed Convex tables. Existing calendar/task/time behavior is extracted unchanged and remains the authority for validation, recurrence, occurrence identity, and day projection.

**Tech Stack:** React 19, Vite 7, Expo / React Native, Expo Router, Expo SQLite, SecureStore, React Native Gesture Handler, Reanimated, Convex, Clerk OIDC, TypeScript for new contracts/backend/mobile code, existing ES modules for extracted domain code, Node test runner, `convex-test`, Playwright, and Maestro/manual Samsung QA.

## Global Constraints

- Start from the latest `origin/main`, preserving the approved PRD commit `47982d4` by rebasing or cherry-picking it onto the implementation branch.
- Do not rewrite domain behavior while extracting it. Mechanical moves and import updates must be isolated from feature changes.
- Do not move the root web app into `apps/web` in this phase. That adds churn without proving the vertical slice.
- Do not convert all existing JavaScript to TypeScript. New contracts, Convex code, and mobile code are TypeScript; existing domain modules migrate only when a separate task justifies it.
- The UI must never wait for Convex to accept a normal user write. A local record update and its outbox entry commit in one local transaction.
- Convex's optimistic/reactive cache is a freshness mechanism, not the durable offline database.
- Use typed Convex tables and indexed, bounded queries. Do not add a generic `records` table with `v.any()`, an unbounded `.collect()`, a custom WebSocket service, or client-held provider refresh tokens.
- Keep identity authorization separate from future calendar-provider authorization.
- Phase 1 mobile supports non-recurring create/edit/move/resize. Existing recurring records must round-trip safely, but mobile series editing remains disabled until Phase 2.
- Sync scope in this phase is calendars, event series, event exceptions, task lists, actions, subtasks, task completion events, and the preferences needed to render the day. Notes, revisions, attachments, reminders, search indexes, and gamification remain local and are labeled as not yet cloud-backed in the private beta.
- Raw titles, note bodies, links, descriptions, and quick-add text must not enter logs, analytics, traces, or error metadata.
- Every task ends with the listed focused tests, then the relevant broader suite. Do not claim completion from a passing build alone.
- Use the actual Samsung phone for the final gate. Emulator and mouse-driven browser tests are necessary but insufficient.

---

## Scope map

### Existing files that define the behavior to preserve

- `package.json`
- `src/Planner.jsx`
- `src/storage.js`
- `src/domains/**`
- `src/shared/time/**`
- `src/features/planner/dayProjection.js`
- `src/features/planner/quickAdd.js`
- `src/features/planner/timelineGesture.js`
- `src/platform/persistence/plannerStateStore.js`
- `src/platform/persistence/plannerStateImport.js`
- `tests/e2e/mobile.spec.js`
- `tests/e2e/join.spec.js`
- `tests/e2e/timeline-touch.spec.js`
- `tests/e2e/timeline-gestures.spec.js`

### New top-level areas

- `apps/mobile/` — Expo application.
- `packages/domain/` — mechanically extracted deterministic domain and shared-time modules.
- `packages/sync-contracts/` — typed mutation, cursor, conflict, and record-codec contracts.
- `packages/quick-add/` — existing deterministic parser plus a Chrono adapter and evaluation corpus.
- `convex/` — schema, auth configuration, sync queries/mutations, and typed entity adapters.
- `src/platform/persistence/indexedDb/` — web per-record storage, migration, and outbox.
- `src/platform/sync/` — web sync coordinator and Convex transport adapter.
- `tests/sync/` — cross-client protocol and convergence tests.
- `.maestro/` — Android smoke flows used after the Expo screen is functional.

---

## Task 1: Establish a clean baseline and workspace test commands

**Files:**

- Modify: `package.json`
- Create: `scripts/check-domain-boundaries.mjs`
- Create: `scripts/check-domain-boundaries.test.js`
- Create: `docs/qa/cross-platform-phase-1-baseline.md`

- [ ] **Step 1: Rebase the implementation branch onto the latest upstream baseline**

Run:

```powershell
git fetch origin
git rebase origin/main
git log --oneline -8
git status --short
```

Expected: the branch contains the latest navigation-shell commits and the PRD commit, with no unresolved changes.

- [ ] **Step 2: Capture the pre-change verification results**

Run:

```powershell
npm test
npm run build
npm run test:e2e
```

Record the commit, Node/npm versions, unit count, browser count, and any explicitly quarantined failure in `docs/qa/cross-platform-phase-1-baseline.md`. Do not proceed with unexplained red tests.

- [ ] **Step 3: Write a failing package-boundary test**

The test creates a temporary fixture under the OS temp directory with a forbidden import and invokes the checker:

```js
test("rejects platform dependencies from the domain package", async () => {
  const result = await checkSource('import React from "react";');
  assert.equal(result.ok, false);
  assert.match(result.reason, /react/);
});
```

The checker must reject imports of `react`, `react-native`, `expo-*`, `convex/*`, DOM adapter modules, and platform persistence modules from `packages/domain/src/**`.

- [ ] **Step 4: Run the focused test and verify it fails**

Run:

```powershell
node --test scripts/check-domain-boundaries.test.js
```

Expected: FAIL because the checker is not implemented.

- [ ] **Step 5: Implement the boundary checker and workspace scripts**

Export `checkSource(source)` for the test and add a CLI mode that walks `packages/domain/src`. Add these root scripts without removing existing commands:

```json
{
  "scripts": {
    "test:domain-boundaries": "node --test scripts/check-domain-boundaries.test.js && node scripts/check-domain-boundaries.mjs",
    "test:unit": "node --test",
    "test:all": "npm run test:domain-boundaries && npm run test:unit && npm run test:e2e"
  },
  "workspaces": ["apps/*", "packages/*"]
}
```

The CLI must exit successfully when `packages/domain/src` does not exist yet, so this task can land before extraction.

- [ ] **Step 6: Run focused and baseline tests**

Run:

```powershell
npm run test:domain-boundaries
npm test
npm run build
```

Expected: PASS with behavior unchanged.

- [ ] **Step 7: Commit**

```powershell
git add package.json scripts/check-domain-boundaries.mjs scripts/check-domain-boundaries.test.js docs/qa/cross-platform-phase-1-baseline.md
git commit -m "chore: establish cross-platform phase baseline"
```

---

## Task 2: Extract the existing domain package without semantic changes

**Files:**

- Create: `packages/domain/package.json`
- Create: `packages/domain/src/index.js`
- Move: `src/domains/**` → `packages/domain/src/domains/**`
- Move: `src/shared/**` → `packages/domain/src/shared/**`
- Move: `src/features/planner/timelineGesture.js` → `packages/domain/src/planner/timelineGesture.js`
- Move: `src/features/planner/timelineGesture.test.js` → `packages/domain/src/planner/timelineGesture.test.js`
- Modify: all imports in `src/**` and moved tests that reference the old paths
- Modify: `vite.config.js`

- [ ] **Step 1: Add a package-consumer characterization test before moving files**

Create `packages/domain/src/index.test.js` that imports the planned public package entry and checks one representative path through each launch-critical domain:

```js
test("exports the cross-platform launch domain", () => {
  assert.equal(typeof calendar.expandSeries, "function");
  assert.equal(typeof tasks.scheduleTask, "function");
  assert.equal(typeof planner.getDayAggregate, "function");
  assert.equal(typeof time.addDaysToKey, "function");
  assert.equal(typeof gestures.proposeGesture, "function");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --test packages/domain/src/index.test.js
```

Expected: FAIL because the package entry does not exist.

- [ ] **Step 3: Create the package manifest and export map**

Use package name `@calendar-master/domain`, `type: module`, and explicit exports:

```json
{
  "name": "@calendar-master/domain",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./calendar": "./src/domains/calendar/index.js",
    "./tasks": "./src/domains/tasks/index.js",
    "./notes": "./src/domains/notes/index.js",
    "./planner": "./src/domains/planner/index.js",
    "./reminders": "./src/domains/reminders/index.js",
    "./search": "./src/domains/search/index.js",
    "./gamification": "./src/domains/gamification/index.js",
    "./time/*": "./src/shared/time/*.js",
    "./timeline-gesture": "./src/planner/timelineGesture.js"
  }
}
```

The root entry exports namespaces to avoid collisions between existing names.

- [ ] **Step 4: Move files mechanically and update internal relative imports**

Use `git mv` for history. Do not change algorithms, defaults, validation text, fixture values, or test expectations in this step.

- [ ] **Step 5: Update the web application imports to package exports**

Use public package paths for web consumers. Platform migrations may import explicit migration exports, but no web file may reach into `packages/domain/src` by relative path.

- [ ] **Step 6: Run the extraction checks**

Run:

```powershell
npm install
npm run test:domain-boundaries
npm test
npm run build
npm run test:e2e
```

Expected: all baseline behavior remains green. If a test expectation must change, stop: that is evidence of a semantic change, not an extraction.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json packages/domain src vite.config.js
git commit -m "refactor: extract shared planner domain package"
```

---

## Task 3: Define versioned sync contracts and state codecs

**Files:**

- Create: `packages/sync-contracts/package.json`
- Create: `packages/sync-contracts/tsconfig.json`
- Create: `packages/sync-contracts/src/types.ts`
- Create: `packages/sync-contracts/src/validate.ts`
- Create: `packages/sync-contracts/src/recordCodec.ts`
- Create: `packages/sync-contracts/src/index.ts`
- Create: `packages/sync-contracts/src/validate.test.ts`
- Create: `packages/sync-contracts/src/recordCodec.test.ts`
- Modify: root `package.json`

- [ ] **Step 1: Add TypeScript test tooling for new packages**

Run:

```powershell
npm install --save-dev typescript tsx
```

Add `test:contracts` as `node --import tsx --test packages/sync-contracts/src/*.test.ts`.

- [ ] **Step 2: Write failing mutation-envelope tests**

Cover:

- Stable `clientMutationId`, `deviceId`, `entityType`, `entityId`, and `baseRevision`.
- Optional `atomicGroupId` for related records changed by one domain operation.
- Allowed operations only.
- Unknown entity type rejection.
- Empty patch rejection.
- Payload-size rejection at a conservative client limit.
- The same valid fixture parsing to an equivalent typed object.

Use the launch union:

```ts
export type SyncEntityType =
  | "calendar"
  | "event"
  | "eventException"
  | "taskList"
  | "action"
  | "subtask"
  | "taskCompletion"
  | "preference";

export type MutationOperation = "upsert" | "delete" | "complete" | "reopen";
```

- [ ] **Step 3: Write failing notebook codec tests**

`explodeSyncableState(v8State)` must produce stable per-record entries only for the Phase 1 sync scope. `hydrateSyncableState(baseState, records)` must replace those collections while preserving notes, reminders, diagnostics, gamification, and other unsynced local fields.

Test round-trip invariants:

```ts
const records = explodeSyncableState(fixture);
const hydrated = hydrateSyncableState(fixture, records);
assert.deepEqual(selectPhase1SyncScope(hydrated), selectPhase1SyncScope(fixture));
assert.deepEqual(hydrated.notes, fixture.notes);
```

- [ ] **Step 4: Run the tests and verify they fail**

Run:

```powershell
npm run test:contracts
```

Expected: FAIL because implementations do not exist.

- [ ] **Step 5: Implement strict parsers and codecs**

Do not rely on TypeScript types at runtime. `parseMutationEnvelope` must validate every boundary field and return a new normalized object. Record codecs must have an exhaustive entity-type switch so adding a syncable collection requires a code and test change.

Define protocol constants:

```ts
export const SYNC_PROTOCOL_VERSION = 1;
export const MAX_PUSH_BATCH = 100;
export const MAX_PULL_PAGE = 500;
```

- [ ] **Step 6: Run focused and domain suites**

Run:

```powershell
npm run test:contracts
npm test
npm run build
```

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json packages/sync-contracts
git commit -m "feat: define durable sync contracts"
```

---

## Task 4: Build the Expo walking skeleton in Expo Go

**Files:**

- Create: `apps/mobile/**` from Expo Router template
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/src/components/DomainProof.tsx`
- Create: `apps/mobile/src/components/DomainProof.test.tsx`
- Create: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/jest.config.js`
- Modify: root `package.json`

- [ ] **Step 1: Scaffold the workspace app**

Run from the repository root:

```powershell
npx create-expo-app@latest apps/mobile --no-install
```

Keep Expo Router. Remove template demo routes and assets that are not part of the app shell. Change the generated package name to `@calendar-master/mobile`, add workspace dependencies `"@calendar-master/domain": "*"` and `"@calendar-master/sync-contracts": "*"`, then run `npm install` from the repository root.

- [ ] **Step 2: Install only walking-skeleton dependencies**

Run from `apps/mobile`:

```powershell
npx expo install react-native-gesture-handler react-native-reanimated expo-sqlite expo-secure-store
```

Then run from the repository root:

```powershell
npm install --workspace @calendar-master/mobile --save-dev jest-expo @testing-library/react-native @types/jest
```

Add a Jest preset file and a package `test` script. Do not create a development build yet. Record any Expo Go incompatibility as evidence for the explicit switch gate.

- [ ] **Step 3: Write a failing component test that imports the shared domain**

Render a known date calculation and gesture proposal through `@calendar-master/domain`:

```tsx
expect(screen.getByText("2026-08-12")).toBeTruthy();
expect(screen.getByText("09:15–10:15")).toBeTruthy();
```

- [ ] **Step 4: Run the mobile test and verify it fails**

Run:

```powershell
npm --workspace @calendar-master/mobile test -- --runInBand
```

- [ ] **Step 5: Implement the smallest native route**

`app/index.tsx` renders a native `SafeAreaView`, a title, and `DomainProof`. No WebView, DOM component, or copied `Planner.jsx` markup is allowed.

- [ ] **Step 6: Verify Metro and Android manually**

Run:

```powershell
npm --workspace @calendar-master/mobile run start
```

Open the project in Expo Go on the Samsung phone. Verify the package import resolves, text respects system font scaling, and no red-screen/Metro fallback appears.

- [ ] **Step 7: Run repository checks and commit**

Run:

```powershell
npm --workspace @calendar-master/mobile test -- --runInBand
npm run test:domain-boundaries
npm test
npm run build
```

Commit:

```powershell
git add apps/mobile package.json package-lock.json
git commit -m "feat: add Expo domain walking skeleton"
```

---

## Task 5: Prove Clerk identity with Convex before migrating data

**Files:**

- Create: `convex/tsconfig.json`
- Create: `convex/auth.config.ts`
- Create: `convex/schema.ts`
- Create: `convex/users.ts`
- Create: `convex/devices.ts`
- Create: `convex/lib/auth.ts`
- Create: `convex/lib/auth.test.ts`
- Create: `src/platform/auth/AuthProvider.jsx`
- Create: `apps/mobile/src/auth/AuthProvider.tsx`
- Modify: `src/main.jsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Create: `.env.example`
- Create: `apps/mobile/.env.example`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Add Convex and Clerk dependencies**

Run:

```powershell
npm install convex @clerk/clerk-react
npm install --workspace @calendar-master/mobile convex @clerk/clerk-expo expo-auth-session expo-web-browser
npm install --save-dev convex-test vitest @edge-runtime/vm
npx convex dev --once
```

Use a development Convex deployment. Never commit generated secrets or actual Clerk keys.

- [ ] **Step 2: Write failing authorization tests**

Using `convex-test`, prove:

- An unauthenticated call to a protected function is rejected.
- A signed-in user can create/read only their own device row.
- A second identity cannot read or revoke the first identity's device.
- Calling `ensureUser` twice is idempotent by OIDC subject.

- [ ] **Step 3: Run the focused test and verify it fails**

Add the root script `"test:convex": "vitest run convex"`, then run:

```powershell
npm run test:convex
```

- [ ] **Step 4: Implement the minimal authenticated schema**

Initial tables:

```ts
users: defineTable({
  subject: v.string(),
  email: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_subject", ["subject"]),

devices: defineTable({
  ownerId: v.id("users"),
  deviceId: v.string(),
  label: v.string(),
  platform: v.union(v.literal("web"), v.literal("android"), v.literal("ios")),
  lastSeenAt: v.number(),
  revokedAt: v.optional(v.number()),
}).index("by_owner_device", ["ownerId", "deviceId"]),
```

`requireUser(ctx)` is the only public-function auth path. It maps the verified Convex identity subject to an internal user id and never accepts an owner id from a client as authority.

- [ ] **Step 5: Wire local mode and signed-in mode on both clients**

- Signed out: app starts immediately and uses local data.
- Sign in: Clerk token is supplied to Convex; `ensureUser` and device registration run.
- Sign out: local data is retained unless the user explicitly chooses to remove it from that device.
- Calendar provider scopes are not requested.

- [ ] **Step 6: Execute the authentication decision gate**

Verify on web and the Samsung phone:

- Google sign-in returns to the correct app.
- A refreshed app restores the session.
- Local mode still works with no account.
- Revoking the device denies protected access after token refresh.
- No custom native module is required.

If any item fails because of Clerk architecture rather than setup, stop and write an ADR comparing the failing requirement against the next Convex-supported OIDC provider. Do not silently introduce a custom sessions table.

- [ ] **Step 7: Run tests and commit**

```powershell
npm run test:convex
npm --workspace @calendar-master/mobile test -- --runInBand
npm test
npm run build
git add convex src/platform/auth src/main.jsx apps/mobile/src/auth apps/mobile/app/_layout.tsx .env.example apps/mobile/.env.example .gitignore package.json package-lock.json
git commit -m "feat: prove cross-platform Convex identity"
```

---

## Task 6: Add the web IndexedDB record store and durable outbox

**Files:**

- Create: `src/platform/persistence/indexedDb/database.js`
- Create: `src/platform/persistence/indexedDb/recordRepository.js`
- Create: `src/platform/persistence/indexedDb/migrateV8ToRecords.js`
- Create: `src/platform/persistence/indexedDb/recordRepository.test.js`
- Create: `src/platform/persistence/indexedDb/migrateV8ToRecords.test.js`
- Modify: `src/platform/persistence/plannerStateStore.js`
- Modify: `src/platform/persistence/plannerStateStore.test.js`
- Modify: `src/storage.js`
- Modify: `src/Planner.jsx`
- Modify: `package.json`

- [ ] **Step 1: Install the test adapter**

Run:

```powershell
npm install --save-dev fake-indexeddb
```

Use native IndexedDB in production; the dependency exists only to run deterministic Node tests.

- [ ] **Step 2: Write failing atomic-write tests**

Test `applyLocalChanges(changes)` against fake IndexedDB:

- Record and outbox row both appear after commit.
- A thrown write aborts both.
- Outbox insertion order is preserved.
- Concurrent save calls are serialized and cannot overwrite a newer local record or reorder their outbox groups.
- Re-saving an unchanged state emits no mutation.
- A delete creates a local tombstone and one delete envelope.
- Unsupported/local-only collections remain available but do not enqueue Phase 1 sync mutations.

- [ ] **Step 3: Write failing v8 migration tests**

Given the existing v8 fixture:

- All Phase 1 records retain stable ids and payload values.
- Unsynced fields remain in a local snapshot record.
- Migration can restart after interruption without duplicates.
- Original v8 storage remains present as rollback data.
- Hydrating records reconstructs the same Phase 1 domain scope.

- [ ] **Step 4: Run focused tests and verify they fail**

```powershell
node --test src/platform/persistence/indexedDb/*.test.js
```

- [ ] **Step 5: Implement the database contract**

Use database `calendar-master`, schema version 9, and stores:

```text
records   keyPath [entityType, entityId]
outbox    keyPath localSequence, autoIncrement
meta      keyPath key
snapshots keyPath key
```

Each record contains `entityType`, `entityId`, `serverRevision`, `syncVersion`, `fieldRevisions`, `deletedAt`, `payload`, and `localUpdatedAt`.

`applyLocalChanges` must open one read-write transaction over `records` and `outbox`. It computes field patches against the previous record, creates one UUID mutation id per changed entity, and gives related changes from the same state save one atomic group id. Serialize save transactions through one repository queue so rapid React effects cannot commit out of order.

- [ ] **Step 6: Keep the existing Planner persistence API compatible**

Introduce the repository behind `loadPlannerState`/`savePlannerState` rather than changing every UI mutation. `savePlannerState` diffs the prior hydrated record set against the new validated state, commits changed records plus outbox entries, and writes the rollback v8 snapshot.

Do not remove old localStorage data in Phase 1.

- [ ] **Step 7: Add migration UI safeguards**

While migration runs, show a blocking local migration state with retry/export options. Do not display an empty planner as if migration succeeded.

- [ ] **Step 8: Run persistence, domain, and browser suites**

```powershell
node --test src/platform/persistence/indexedDb/*.test.js src/platform/persistence/plannerStateStore.test.js
npm test
npm run build
npm run test:e2e
```

- [ ] **Step 9: Commit**

```powershell
git add src/platform/persistence src/storage.js src/Planner.jsx package.json package-lock.json tests/e2e
git commit -m "feat: persist web records with a durable outbox"
```

---

## Task 7: Add the Expo SQLite repository with the same semantics

**Files:**

- Create: `apps/mobile/src/storage/schema.ts`
- Create: `apps/mobile/src/storage/migrations.ts`
- Create: `apps/mobile/src/storage/recordRepository.ts`
- Create: `apps/mobile/src/storage/recordRepository.test.ts`
- Create: `apps/mobile/src/storage/PlannerRepositoryProvider.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Write failing repository contract tests**

Run the same behavioral contract as the web repository:

- Atomic record plus outbox write.
- Ordered drain.
- Transaction rollback.
- Tombstones.
- Authoritative record replacement after server acknowledgement.
- Cursor update in the same transaction as pulled records.
- Restart opens the same pending outbox.

Share fixtures from `packages/sync-contracts`, not storage implementation code.

- [ ] **Step 2: Run the focused tests and verify they fail**

```powershell
npm --workspace @calendar-master/mobile test -- recordRepository --runInBand
```

- [ ] **Step 3: Implement schema version 1**

Use SQL tables with explicit columns for routing metadata and JSON payload only for validated entity fields:

```sql
CREATE TABLE records (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  server_revision INTEGER NOT NULL DEFAULT 0,
  sync_version INTEGER NOT NULL DEFAULT 0,
  field_revisions_json TEXT NOT NULL DEFAULT '{}',
  deleted_at INTEGER,
  local_updated_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
```

Add `outbox` and `metadata` tables plus an index on outbox insertion sequence. Enable WAL where Expo SQLite supports it.

- [ ] **Step 4: Make migration and initialization crash-safe**

Wrap each schema migration in a transaction and update `PRAGMA user_version` only after success. The provider renders a recovery state if initialization fails.

- [ ] **Step 5: Run focused and mobile tests**

```powershell
npm --workspace @calendar-master/mobile test -- --runInBand
npm run test:contracts
```

- [ ] **Step 6: Verify process persistence on Samsung**

Create a local fixture item, force-stop Expo Go, reopen it, and verify both record and pending outbox remain. Record the device/OS result in `docs/qa/cross-platform-phase-1-baseline.md`.

- [ ] **Step 7: Commit**

```powershell
git add apps/mobile/src/storage apps/mobile/app/_layout.tsx docs/qa/cross-platform-phase-1-baseline.md
git commit -m "feat: add durable Expo SQLite repository"
```

---

## Task 8: Implement typed Convex sync storage and idempotent push/pull

**Files:**

- Modify: `convex/schema.ts`
- Create: `convex/sync.ts`
- Create: `convex/model/entityValidators.ts`
- Create: `convex/model/entityStore.ts`
- Create: `convex/model/conflictPolicy.ts`
- Create: `convex/model/conflictPolicy.test.ts`
- Create: `convex/sync.test.ts`
- Create: `convex/lib/limits.ts`

- [ ] **Step 1: Write failing schema/index tests**

Assert the schema exposes these Phase 1 tables and indexes:

```text
syncHeads         by_owner
syncChanges       by_owner_version
appliedMutations  by_owner_mutation
conflicts         by_owner_resolved
calendars         by_owner_entity
events            by_owner_entity
eventExceptions   by_owner_entity
taskLists         by_owner_entity
actions           by_owner_entity
subtasks          by_owner_entity
taskCompletions   by_owner_entity
preferences       by_owner_entity
```

Each entity table must use a table-specific payload validator imported from `entityValidators.ts`; `v.any()` is forbidden.

- [ ] **Step 2: Write failing sync behavior tests**

Using two authenticated test identities and two devices, cover:

- Push applies a valid mutation and assigns revision 1 and sync version 1.
- Replaying the same mutation id returns the original result without another change.
- Mutations for another user's entity are rejected.
- A batch over 100 is rejected before writes.
- Pull after version 0 returns bounded ordered changes and a continuation cursor.
- A page boundary never skips a committed version.
- Every change row for one user receives a unique version, including related records committed in one atomic group.
- Device revocation blocks push and pull.
- Unknown fields and invalid domain payloads are rejected.

- [ ] **Step 3: Write failing conflict tests**

Cover launch policies:

- Disjoint event/action fields merge by comparing server-maintained field revisions with the client's base revision.
- For same-field edits, the later server-accepted mutation wins and a conflict preserves the previous value; device timestamps never decide.
- Completion cannot be reversed by an older generic patch; an explicit later `reopen` command can reopen it.
- Subtask additions union by id.
- Delete creates a tombstone; a concurrent edit is recoverable in conflicts.
- A recurrence series plus exception batch commits entirely or not at all.

- [ ] **Step 4: Run tests and verify they fail**

```powershell
npm run test:convex
```

- [ ] **Step 5: Implement typed entity storage**

Keep one adapter per entity type with:

```ts
type EntityAdapter<T> = {
  loadByEntityId(ctx: MutationCtx, ownerId: Id<"users">, entityId: string): Promise<T | null>;
  validatePayload(payload: unknown): T;
  write(ctx: MutationCtx, authoritative: AuthoritativeRecord<T>): Promise<void>;
};
```

The dispatcher is exhaustive over `SyncEntityType`. A client cannot name a Convex table directly.

- [ ] **Step 6: Implement server ordering and idempotency**

Within one Convex mutation transaction:

1. Query `appliedMutations.by_owner_mutation`.
2. Return stored result if present.
3. Load and resolve the entity.
4. Read/increment the single `syncHeads` row for the owner once per emitted change, assigning consecutive unique versions inside an atomic group.
5. Update the entity revision and changed fields' revision map, then write `syncChanges`, any conflict, and the applied result.

Store protocol version and conflict-policy version on the applied result.

- [ ] **Step 7: Expose only three launch sync functions**

- `getHead` query: returns current user sync version.
- `pull` query: accepts `afterVersion` and bounded `limit`, uses `by_owner_version`.
- `push` mutation: accepts at most 100 parsed envelopes and returns one result per input in order.

All use object-form Convex functions with `args` and `returns` validators. Helpers that do not need clients are internal or plain server modules.

- [ ] **Step 8: Run tests and static checks**

```powershell
npm run test:convex
npx convex codegen
npx tsc --noEmit -p convex/tsconfig.json
rg -n "\.collect\(|v\.any\(" convex
```

Expected: tests and type-check pass; the grep has no result in production Convex code.

- [ ] **Step 9: Commit**

```powershell
git add convex
git commit -m "feat: add typed idempotent Convex sync"
```

---

## Task 9: Connect both local repositories to Convex with one sync coordinator

**Files:**

- Create: `packages/sync-contracts/src/coordinator.ts`
- Create: `packages/sync-contracts/src/coordinator.test.ts`
- Create: `src/platform/sync/convexTransport.js`
- Create: `src/platform/sync/syncLifecycle.js`
- Create: `src/platform/sync/SyncStatus.jsx`
- Modify: `src/main.jsx`
- Create: `apps/mobile/src/sync/convexTransport.ts`
- Create: `apps/mobile/src/sync/useSyncLifecycle.ts`
- Create: `apps/mobile/src/sync/SyncStatus.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Define ports and write failing coordinator tests**

The shared coordinator depends on interfaces, not browser or Expo globals:

```ts
export interface LocalSyncStore {
  peekOutbox(limit: number): Promise<SyncMutation[]>;
  acknowledge(results: PushResult[]): Promise<void>;
  applyPulled(page: PullPage): Promise<void>;
  getCursor(): Promise<number>;
}

export interface SyncTransport {
  push(batch: SyncMutation[]): Promise<PushResult[]>;
  pull(afterVersion: number, limit: number): Promise<PullPage>;
  watchHead(onChange: (version: number) => void): () => void;
}
```

Test ordered drain, same-id retry, pull pagination, no concurrent drains, reconnect, backoff with jitter injected as a dependency, and a pulled authoritative result replacing an optimistic local record without emitting a second outbox mutation.

- [ ] **Step 2: Run the focused tests and verify they fail**

```powershell
npm run test:contracts
```

- [ ] **Step 3: Implement deterministic coordinator state**

Expose state:

```ts
type SyncState =
  | { status: "local-only" }
  | { status: "idle"; lastSyncedAt: number | null }
  | { status: "syncing"; pending: number }
  | { status: "offline"; pending: number }
  | { status: "error"; pending: number; code: string };
```

Do not include authored content in error objects.

- [ ] **Step 4: Add thin platform transports and lifecycle triggers**

- Web: foreground/visibility, online event, sign-in, and Convex `watchQuery(getHead)`.
- Mobile: AppState foreground, network reconnect, sign-in, and the same bounded head watch.
- Both: periodic visible pull no more frequently than the documented interval, exponential retry capped at five minutes, and immediate retry on explicit user action.

- [ ] **Step 5: Add quiet sync status UI**

Show local-only, pending, offline, conflict, and actionable error states. Do not flash a spinner for every normal local save.

- [ ] **Step 6: Run focused and app suites**

```powershell
npm run test:contracts
npm run test:convex
npm --workspace @calendar-master/mobile test -- --runInBand
npm test
npm run build
```

- [ ] **Step 7: Commit**

```powershell
git add packages/sync-contracts src/platform/sync src/main.jsx apps/mobile/src/sync apps/mobile/app/_layout.tsx
git commit -m "feat: synchronize durable client outboxes"
```

---

## Task 10: Prove two-client convergence before building the full mobile day

**Files:**

- Create: `tests/sync/harness/testClient.ts`
- Create: `tests/sync/twoClientConvergence.test.ts`
- Create: `tests/sync/partitionChaos.test.ts`
- Create: `tests/sync/recurrenceRoundTrip.test.ts`
- Create: `tests/sync/fixtures.ts`
- Modify: `package.json`

Add the root script `"test:sync": "node --import tsx --test tests/sync/*.test.ts"` before running this task's focused tests.

- [ ] **Step 1: Build a headless test client from production ports**

The harness must use the real record codec, coordinator, and Convex functions. It may use an in-memory local-store implementation only to make partitions deterministic; it must not reimplement merge or sync logic.

- [ ] **Step 2: Write convergence tests for every Phase 1 conflict rule**

For clients A and B:

1. Pull the same base.
2. Partition both.
3. Apply divergent local commands.
4. Reconnect in both orderings.
5. Pull until both reach the same head.
6. Assert equal records and that every authored value exists in current state, a tombstone, or a conflict.

- [ ] **Step 3: Add a seeded partition/chaos test**

Generate creates, field edits, completions, reopens, subtask additions, deletes, partitions, retries, and reconnects with a committed CI seed. Run more seeds nightly, not on every local edit.

- [ ] **Step 4: Add recurrence round-trip vectors**

Reuse existing recurrence fixtures for:

- DST spring gap.
- DST fall fold.
- Floating local time.
- Explicit IANA timezone.
- Moved/cancelled exception.
- Series split.

Push on web-shaped client A, pull into mobile-shaped client B, expand using `@calendar-master/domain`, and assert occurrence ids and timing sets are identical.

- [ ] **Step 5: Prove tests can fail**

Temporarily invert completion precedence and run:

```powershell
npm run test:sync
```

Expected: the completion convergence test fails. Restore the correct rule and rerun.

- [ ] **Step 6: Run all protocol suites**

```powershell
npm run test:contracts
npm run test:convex
npm run test:sync
npm test
```

- [ ] **Step 7: Commit**

```powershell
git add tests/sync package.json package-lock.json
git commit -m "test: prove cross-device convergence"
```

---

## Task 11: Build the Android one-day timeline and local editing flow

**Files:**

- Modify: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/app/event/[id].tsx`
- Create: `apps/mobile/app/action/[id].tsx`
- Create: `apps/mobile/app/create.tsx`
- Create: `apps/mobile/src/day/useDayProjection.ts`
- Create: `apps/mobile/src/day/DayScreen.tsx`
- Create: `apps/mobile/src/day/Timeline.tsx`
- Create: `apps/mobile/src/day/TimelineCard.tsx`
- Create: `apps/mobile/src/day/UnscheduledActions.tsx`
- Create: `apps/mobile/src/day/JoinButton.tsx`
- Create: `apps/mobile/src/day/dayViewModel.ts`
- Create: `apps/mobile/src/day/dayViewModel.test.ts`
- Create: `apps/mobile/src/editor/EventForm.tsx`
- Create: `apps/mobile/src/editor/ActionForm.tsx`
- Create: `apps/mobile/src/editor/editorCommands.ts`
- Create: `apps/mobile/src/editor/editorCommands.test.ts`

- [ ] **Step 1: Write failing day-view-model tests**

Given shared domain fixtures, assert:

- Timed events and scheduled actions are sorted into one timeline.
- All-day events and unscheduled actions remain separate.
- Event and action identity is retained.
- Meeting links normalize into a dedicated Join action.
- Hidden/deleted records do not render.
- Unsupported recurring edit actions are disabled without hiding the occurrence.

- [ ] **Step 2: Write failing editor command tests**

Prove create/edit/complete operations call domain normalization and produce one local repository transaction. Invalid timing never reaches storage.

- [ ] **Step 3: Run focused tests and verify they fail**

```powershell
npm --workspace @calendar-master/mobile test -- dayViewModel editorCommands --runInBand
```

- [ ] **Step 4: Implement the native day screen**

- Use native `View`, `Text`, `Pressable`, and scroll primitives.
- Render from `getDayAggregate`/shared projections, not ad hoc filtering.
- Keep cards accessible as buttons with entity type, title, start/end, and completion state.
- Use a bottom sheet or route presentation supported by Expo Router for create/edit.
- Keep text input at a native-accessible size; never scale the root view when a sheet opens.

- [ ] **Step 5: Implement Join as an independent action**

`JoinButton` validates and opens the URL through the platform linking API. Its press must not navigate to the event route. Add both component and Maestro assertions for this behavior.

- [ ] **Step 6: Keep recurrence scope honest**

Tapping a recurring occurrence may show details, but edit controls that imply this/following/series remain disabled with a concise explanation until Phase 2. Do not convert it to a standalone item silently.

- [ ] **Step 7: Run tests and manual render check**

```powershell
npm --workspace @calendar-master/mobile test -- --runInBand
npm run test:domain-boundaries
npm test
```

On Samsung, verify dense/empty days, long titles, dark/light mode, font scaling, keyboard-open create flow, and external Join handoff.

- [ ] **Step 8: Commit**

```powershell
git add apps/mobile/app apps/mobile/src/day apps/mobile/src/editor
git commit -m "feat: add native one-day planning slice"
```

---

## Task 12: Add native hold, move, and edge-resize interactions

**Files:**

- Create: `apps/mobile/src/day/gestures/useTimelineGesture.ts`
- Create: `apps/mobile/src/day/gestures/gestureState.ts`
- Create: `apps/mobile/src/day/gestures/gestureState.test.ts`
- Create: `apps/mobile/src/day/gestures/DragPreview.tsx`
- Create: `apps/mobile/src/day/gestures/ResizeHandle.tsx`
- Modify: `apps/mobile/src/day/Timeline.tsx`
- Modify: `apps/mobile/src/day/TimelineCard.tsx`
- Modify: `packages/domain/src/planner/timelineGesture.js`
- Modify: `packages/domain/src/planner/timelineGesture.test.js`
- Create: `.maestro/timeline-gesture.yaml`

- [ ] **Step 1: Write failing gesture-ownership tests**

Model explicit states:

```ts
type GestureOwner = "none" | "press" | "scroll" | "move" | "resize-start" | "resize-end";
```

Test:

- Movement beyond slop before hold gives ownership to scroll.
- Hold without disqualifying movement transitions to move.
- Resize handle transitions only to its edge mode.
- Cancel emits no domain command.
- Drop at the original time emits no mutation.
- Cross-midnight or below-minimum proposals are clamped by shared domain rules.

- [ ] **Step 2: Run focused tests and verify they fail**

```powershell
npm --workspace @calendar-master/mobile test -- gestureState --runInBand
node --test packages/domain/src/planner/timelineGesture.test.js
```

- [ ] **Step 3: Preserve and expose the existing snap policy explicitly**

The current shared code uses a five-minute snap, 10-minute event minimum, and 15-minute action minimum. Preserve those launch defaults and imported exact times while making the policy explicit and injectable:

```js
export const DEFAULT_GESTURE_POLICY = {
  snapMinutes: 5,
  minimumEventMinutes: 10,
  minimumTaskMinutes: 15,
};
```

Update tests first. Mobile and web must use the same default policy; a later preference may override it without changing stored timing precision.

- [ ] **Step 4: Implement UI-thread preview and JS commit boundary**

- Reanimated owns only transient translation/height/scale/opacity.
- Shared domain functions calculate the final snapped proposal on release.
- The card lifts with a small shadow and scale no greater than 1.02; no spring overshoot.
- The original slot remains as a low-emphasis placeholder.
- Start/end and duration labels update during the preview.
- Releasing sends one editor command; cancelling sends none.

- [ ] **Step 5: Add edge auto-scroll and accessibility alternatives**

Auto-scroll speed is bounded by edge distance and stops immediately on exit/drop/cancel. Add menu and screen-reader actions for move earlier/later and increase/decrease duration in the same snap increment.

- [ ] **Step 6: Add Maestro and Samsung checks**

The Maestro flow covers long-press move and bottom-edge resize on a seeded non-recurring event. Manual Samsung QA additionally covers scroll competition, top-edge resize, action resize, cancel, overlapping cards, and edge auto-scroll.

- [ ] **Step 7: Run all interaction tests**

```powershell
npm --workspace @calendar-master/mobile test -- --runInBand
node --test packages/domain/src/planner/timelineGesture.test.js
npm test
npm run test:e2e -- tests/e2e/timeline-touch.spec.js tests/e2e/timeline-gestures.spec.js
maestro test .maestro/timeline-gesture.yaml
```

- [ ] **Step 8: Commit**

```powershell
git add apps/mobile/src/day/gestures apps/mobile/src/day/Timeline.tsx apps/mobile/src/day/TimelineCard.tsx packages/domain/src/planner .maestro/timeline-gesture.yaml
git commit -m "feat: add native timeline move and resize gestures"
```

---

## Task 13: Extract quick add and evaluate Chrono in shadow mode

**Files:**

- Create: `packages/quick-add/package.json`
- Move: `src/features/planner/quickAdd.js` → `packages/quick-add/src/quickAdd.js`
- Move: `src/features/planner/quickAdd.test.js` → `packages/quick-add/src/quickAdd.test.js`
- Create: `packages/quick-add/src/chronoAdapter.js`
- Create: `packages/quick-add/src/chronoAdapter.test.js`
- Create: `packages/quick-add/src/interpret.js`
- Create: `packages/quick-add/src/interpret.test.js`
- Create: `packages/quick-add/src/corpus.json`
- Create: `packages/quick-add/scripts/evaluate.mjs`
- Modify: `src/Planner.jsx`
- Create: `apps/mobile/src/quickAdd/QuickAdd.tsx`
- Create: `apps/mobile/src/quickAdd/interpretationChips.ts`
- Create: `apps/mobile/src/quickAdd/interpretationChips.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Move the current parser with no behavior change**

Create `@calendar-master/quick-add`, move its existing tests, and update the web import. Its package scripts are `"test": "node --test src/*.test.js"` and `"evaluate": "node scripts/evaluate.mjs"`. Run the complete existing quick-add test file before adding Chrono.

- [ ] **Step 2: Install Chrono and write failing adapter tests**

Run:

```powershell
npm install --workspace @calendar-master/quick-add chrono-node
```

The adapter must return candidate source spans, parsed local components, whether the year/timezone was implied, and a confidence reason. Test relative dates, explicit dates, 12/24-hour times, date ranges, and ambiguous numeric dates under the configured locale.

- [ ] **Step 3: Keep responsibilities separated**

Chrono parses date/time candidates only. Existing deterministic code remains responsible for:

- `task:`/`event:` kind prefixes.
- Lists/calendars and tags.
- Duration syntax.
- Due dates versus scheduled start.
- Recurrence.
- Alerts/reminders.
- Link extraction.
- Final domain validation.

- [ ] **Step 4: Add a versioned evaluation corpus**

Each corpus row contains input, reference date/timezone/locale, expected entity kind, exact expected fields, and allowed ambiguity. Include all current quick-add tests plus at least 50 realistic owner-approved phrases before changing default behavior.

- [ ] **Step 5: Implement shadow interpretation**

`interpretQuickAdd` returns current-parser output as authoritative plus Chrono candidates and a structured difference object. Do not store raw input in analytics or send it to Convex.

- [ ] **Step 6: Add mobile interpretation chips**

Show recognized kind, date, time, duration, target, and uncertainty. Medium-confidence input opens/prefills the editor; high-confidence input may create locally with undo. Phase 1 does not graduate any expression class solely because Chrono parsed it.

- [ ] **Step 7: Run parser and application suites**

```powershell
npm --workspace @calendar-master/quick-add test
npm --workspace @calendar-master/quick-add run evaluate
npm --workspace @calendar-master/mobile test -- --runInBand
npm test
npm run build
```

- [ ] **Step 8: Commit**

```powershell
git add packages/quick-add src/Planner.jsx apps/mobile/src/quickAdd package.json package-lock.json
git commit -m "feat: add Chrono quick-add shadow parser"
```

---

## Task 14: Complete the vertical-slice QA gate and beta handoff

**Files:**

- Create: `tests/e2e/sync-status.spec.js`
- Create: `.maestro/offline-sync.yaml`
- Create: `.maestro/join-link.yaml`
- Create: `docs/qa/cross-platform-phase-1-results.md`
- Create: `docs/product/private-beta-sync-limitations.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Add browser sync-status coverage**

Test local-only, pending, offline, synced, conflict, retry, sign-out-with-local-data, and migration-failure states. Use seeded transport fixtures; do not make normal UI tests depend on a live Convex deployment.

- [ ] **Step 2: Add Android end-to-end smoke flows**

`offline-sync.yaml`:

1. Seed/sign into the test notebook.
2. Disable connectivity.
3. Create an event and schedule/complete an action.
4. Force-stop and relaunch.
5. Assert both are still visible and pending.
6. Restore connectivity.
7. Assert pending clears.

`join-link.yaml` asserts tapping Join leaves Calendar Master for the expected link and does not open the details route.

- [ ] **Step 3: Run the automated release suite**

```powershell
npm run test:domain-boundaries
npm run test:contracts
npm run test:convex
npm run test:sync
npm --workspace @calendar-master/quick-add test
npm --workspace @calendar-master/mobile test -- --runInBand
npm test
npm run build
npm run test:e2e
maestro test .maestro/offline-sync.yaml
maestro test .maestro/join-link.yaml
```

Record exact counts, duration, commit, Convex dev deployment, device model, Android version, and any quarantine in `docs/qa/cross-platform-phase-1-results.md`.

- [ ] **Step 4: Perform the real two-device acceptance scenario**

On the Samsung phone and desktop web app:

1. Start from a synchronized day.
2. Put both offline.
3. On Android, create an event, move it, resize it, and complete an action.
4. Force-stop Android and reopen; verify all changes remain.
5. On web, rename a different event field and add a subtask.
6. Reconnect in each order.
7. Verify both render the same day and the expected disjoint edits merge.
8. Create one same-field conflict and verify both authored values remain reachable.
9. Tap Join on both surfaces and verify direct external navigation.
10. Export the web notebook and verify the Phase 1 synchronized scope matches both clients.

- [ ] **Step 5: Publish honest private-beta limitations**

Document that notes, reminders, attachments, search indexes, and gamification remain device-local during this phase; recurring records sync but recurring edits are web-only; and external calendar providers are not connected yet.

- [ ] **Step 6: Verify failure recovery manually**

- Invalid/expired auth.
- Convex unavailable during local edits.
- Retry after duplicate submission.
- Migration interruption.
- Device revocation.
- Conflict dismissal/recovery.
- Reduced motion and large text.
- Dense timeline performance on Samsung.

- [ ] **Step 7: Commit the gate evidence**

```powershell
git add tests/e2e/sync-status.spec.js .maestro docs/qa/cross-platform-phase-1-results.md docs/product/private-beta-sync-limitations.md docs/README.md
git commit -m "test: certify cross-platform trust vertical slice"
```

---

## PRD traceability check

| Phase 1 requirement | Plan coverage |
|---|---|
| Preserve current domain behavior | Tasks 1–3 |
| Expo/Android native walking skeleton | Task 4 |
| Separate identity from provider access | Task 5 |
| Web IndexedDB durability | Task 6 |
| Mobile SQLite durability | Task 7 |
| Typed, indexed, idempotent Convex sync | Tasks 8–9 |
| Conflict recovery and recurrence equivalence | Tasks 8–10 |
| Unified native day with direct Join | Task 11 |
| Hold/move/resize with accessible alternatives | Task 12 |
| Deterministic quick add plus Chrono shadow mode | Task 13 |
| Two-device, process-death, and Samsung QA gate | Task 14 |
| Honest handling of deferred notes/providers | Global constraints and Task 14 |

No Phase 1 task introduces Google Calendar scopes, external-provider writes, Tauri, widgets, collaboration, scheduling links, or model inference.

---

## Final verification and release criteria

Before opening a pull request:

- [ ] Re-run every command from Task 14 from a clean checkout.
- [ ] Run `git diff --check` and review the complete diff against the PRD.
- [ ] Confirm no `.env*` secrets, provider tokens, authored fixture content, or deployment credentials are tracked.
- [ ] Confirm production Convex code contains no unbounded `.collect()` and no generic `v.any()` payloads.
- [ ] Confirm the existing web day, agenda, recurrence, notes, search, reminder, mobile-navigation, motion, and timeline tests still pass.
- [ ] Confirm the Samsung force-stop/offline/reconnect scenario passes twice, reconnecting the two devices in opposite orders.
- [ ] Confirm every accepted mutation appears as current state, tombstone, revision, or conflict.
- [ ] Confirm the private-beta limitations are visible before sign-in.
- [ ] Request code review using `superpowers:requesting-code-review`.
- [ ] Address review findings and rerun affected suites.
- [ ] Use `superpowers:verification-before-completion` before reporting the phase complete.

Phase 1 is complete only when the product outcome is true: a real day edited offline on Android survives process death and later converges with the web app without an unexplained or unrecoverable authored change.
