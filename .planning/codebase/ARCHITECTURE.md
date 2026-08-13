<!-- refreshed: 2026-08-13 -->
# Architecture

**Analysis Date:** 2026-08-13

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser / host page                                                     │
│  `index.html` → `src/main.jsx`                                           │
├───────────────────────────────┬──────────────────────────────────────────┤
│  Crash shell                  │  Composition root                        │
│  `src/app/ErrorBoundary.jsx`  │  `src/Planner.jsx` (~8318 lines)         │
│  `src/app/notebookRecovery.js`│  React state, sheets, gestures, writes   │
└───────────────┬───────────────┴──────────────────┬───────────────────────┘
                │                                  │
                ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Application / feature use-cases                                         │
│  `src/features/planner/`  `src/features/search/`  `src/features/notes/`  │
│  `src/features/accessibility/`  `src/features/motion/`                   │
│  `src/features/feedback/`                                                │
│  Projections, parsers, undo payloads, gesture arithmetic. No invariants. │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ commands / queries / events
                                   ▼
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ calendar     │ tasks        │ notes        │ reminders    │ gamification │
│ `domains/`   │ `domains/`   │ `domains/`   │ `domains/`   │ `domains/`   │
├──────────────┴──────────────┴──────────────┴──────────────┴──────────────┤
│  Coordination domains (may import other domains' public APIs)            │
│  `src/domains/planner/`  `src/domains/search/`                           │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ validated JSON records
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Platform ports                                                          │
│  `src/platform/persistence/`  `src/platform/preferences/`                │
│  `src/platform/diagnostics/`  `src/platform/resilience/`                 │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ storagePort.get / set / remove
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Host storage adapter                                                    │
│  `src/storage.js` → `window.storage` (embedded) or `localStorage`        │
└──────────────────────────────────────────────────────────────────────────┘
```

Shared primitives (`src/shared/time/`, `src/shared/ids.js`) and design tokens
(`src/design/`) sit beside every layer. They never import a product domain.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| HTML shell | Viewport, theme-color, root mount | `index.html` |
| React bootstrap | StrictMode + crash boundary around Planner | `src/main.jsx` |
| ErrorBoundary | Catch render crashes; export recoverable notebook without going through Planner | `src/app/ErrorBoundary.jsx` |
| notebookRecovery | Read raw `nbmp:state:v*` from host or localStorage for crash export | `src/app/notebookRecovery.js` |
| Planner | Composition root: all React state, sheets, gestures, write orchestration | `src/Planner.jsx` |
| Calendar domain | Canonical events, timing, recurrence, occurrences, ICS, v4→v5 | `src/domains/calendar/` |
| Tasks domain | Task model, hierarchy, dependencies, planning, commands, v5→v6 | `src/domains/tasks/` |
| Notes domain | Blocks, tags, attachments, revisions, templates, portability, v6→v8 | `src/domains/notes/` |
| Planner domain | Cross-domain day aggregate and daily review | `src/domains/planner/` |
| Reminders domain | Intent → scheduled ledger; deliver / snooze / dismiss / missed | `src/domains/reminders/` |
| Gamification domain | Motivation ledger, awards, level summary | `src/domains/gamification/` |
| Search domain | Query parse, unified search, target resolution | `src/domains/search/` |
| Feature projections | Presentation-safe day/week/search views; no invariants | `src/features/planner/`, `src/features/search/` |
| Persistence | Load/save/migrate/import/replace of notebook and side stores | `src/platform/persistence/` |
| Preferences | Device display / feedback / motivation / notification settings | `src/platform/preferences/preferences.js` |
| Diagnostics | Local storage-failure ledger | `src/platform/diagnostics/diagnostics.js` |
| Resilience | Classify canonical vs supporting storage failures | `src/platform/resilience/storageStatus.js` |
| Storage adapter | Only browser/host I/O | `src/storage.js` |
| Shared time | Date keys, local DateTime, intervals, IANA offsets | `src/shared/time/` |
| Shared ids | `createId()` for new records | `src/shared/ids.js` |
| Design | Themes, contrast repair, typography steps | `src/design/` |
| Styles | Tailwind v4 import + page resets | `src/index.css` |

## Pattern Overview

**Overall:** Domain-oriented modular monolith (accepted in `docs/adr/0001-domain-oriented-modular-monolith.md`), mid-migration. Domain rules live in `src/domains/`. `src/Planner.jsx` is still the composition root and owns React state plus most visible surfaces.

**Key Characteristics:**
- Pure command/query functions. Commands take current records plus input and return `{ state | collection, events }` — they never touch the DOM or storage.
- One in-memory notebook (`db` in `src/Planner.jsx`) plus four side stores (reminders, preferences, motivation, diagnostics) and a backup fingerprint.
- Cross-domain links are stable IDs (`event.id`, `task.id`, `note.links`), not nested foreign records.
- Persistence is a port. Domains own migrations and validators; `src/platform/persistence/` sequences them; `src/storage.js` is the only I/O.
- Features wrap domain queries into presentation-safe shapes (`projectPlannerDay`, `projectPlannerWeek`, `projectPlannerSearch`) and must not invent invariants.

## Layers

**Bootstrap:**
- Purpose: Mount the React tree and keep a crash from taking the notebook with it.
- Location: `index.html`, `src/main.jsx`, `src/app/`
- Contains: Root HTML, `createRoot`, `ErrorBoundary`, crash-time notebook recovery.
- Depends on: `src/Planner.jsx`, `src/index.css`, `src/app/notebookRecovery.js`
- Used by: The browser or the single-file artifact from `build-artifact.mjs`

**Composition root:**
- Purpose: Hold React state, wire domain commands to gestures/sheets, debounce persistence, render the day/week/month/actions/notes surfaces.
- Location: `src/Planner.jsx`
- Contains: `export default function Planner` (`src/Planner.jsx:748`), `mutate` (`src/Planner.jsx:1640`), load/save effects, write helpers (`writeTask`, `completeTask`, `runUndo`, `commitSave`), and in-file UI (`Sheet`, `WeekGrid`, `ActionsPanel`, `Composer`, `NoteEditor`, …).
- Depends on: Domain barrels, feature modules, platform stores, `src/storage.js`, `src/shared/`, `src/design/`
- Used by: `src/main.jsx` only

**Application / features:**
- Purpose: Use-cases that are not domain invariants: projections, parsers, undo payloads, gesture math, dialog focus, haptics.
- Location: `src/features/`
- Contains: `quickAdd.js`, `dayProjection.js`, `weekProjection.js`, `taskMutations.js`, `timelineGesture.js`, `searchProjection.js`, `dialogFocus.js`, `TimelineActionCard.jsx`
- Depends on: Domain public APIs and `src/shared/`
- Used by: `src/Planner.jsx`

**Product domains:**
- Purpose: Own models, invariants, commands, queries, domain events, migrations, and tests.
- Location: `src/domains/<bounded-context>/`
- Contains: `model/`, `commands/`, `queries/`, plus domain-specific folders (`recurrence/`, `hierarchy/`, `portability/`, `migrations/`)
- Depends on: `src/shared/` only (except coordination domains `planner` and `search`, which import other domains' `index.js`)
- Used by: Features, platform persistence (migrations/validators), and Planner

**Platform:**
- Purpose: Implement storage ports, device preferences, local diagnostics, and storage-status classification. Domains do not import these files.
- Location: `src/platform/`
- Contains: `persistence/*Store.js`, `plannerStateImport.js`, `plannerNotebookReplace.js`, `preferences/preferences.js`, `diagnostics/diagnostics.js`, `resilience/storageStatus.js`
- Depends on: Domain migrations/validators and domain normalize functions
- Used by: `src/Planner.jsx`, `src/app/` only via recovery (not platform)

**Shared primitives:**
- Purpose: Stable date, time, interval, timezone, and id helpers. Cannot import a product domain.
- Location: `src/shared/`
- Contains: `time/dateKey.js`, `time/localDateTime.js`, `time/interval.js`, `time/timezone.js`, `ids.js`
- Depends on: Nothing in `src/domains/`, `src/features/`, or `src/platform/`
- Used by: Every layer above

**Design:**
- Purpose: Theme tokens, contrast repair, typography scale. Not a `src/ui/` tree yet.
- Location: `src/design/`
- Contains: `themes.js`, `contrast.js`, `typography.js`
- Depends on: Nothing domain-specific
- Used by: `src/Planner.jsx` (`THEMES`, `readable`)

**Storage adapter:**
- Purpose: Probe host vs localStorage once; expose `get` / `set` / `remove` / `writable`.
- Location: `src/storage.js`
- Contains: The only browser storage I/O
- Depends on: `window.storage` or `window.localStorage`
- Used by: Planner load/save effects and platform store functions (passed in as `storagePort`)

## Data Flow

### Primary Request Path

1. `index.html` loads `/src/main.jsx`. `createRoot` wraps `<Planner />` in `<ErrorBoundary>` (`src/main.jsx:9`).
2. `Planner` starts with `db === null` and `ready === false` (`src/Planner.jsx:749`).
3. The boot effect (`src/Planner.jsx:1081`) loads side stores then the notebook, in this order:
   - `loadDiagnostics(storage)` → `src/platform/persistence/diagnosticsStore.js`
   - `loadPlannerState(storage)` → `src/platform/persistence/plannerStateStore.js:71`
   - `loadPreferences(storage, state)` → `src/platform/persistence/preferencesStore.js`
   - `loadMotivationLedger(storage, { openingBalance })` → `src/platform/persistence/gamificationStore.js`
   - `loadBackupRecord(storage)` → `src/platform/persistence/backupStore.js`
4. `loadPlannerState` reads `nbmp:state:v8` first, else migrates v7/v6/v5/v4 in memory, writes v8, validates the confirmation, then removes the older key (`src/platform/persistence/plannerStateStore.js:57`).
5. Empty storage seeds the teaching notebook via `seed()` (`src/Planner.jsx:700`) then the v4→v8 migration chain, and writes it. Unreadable storage opens `createBlankPlannerState()` (`src/platform/persistence/plannerStateImport.js:23`) with autosave off and keeps a raw recovery snapshot.
6. After `setReady(true)`, a 400 ms debounce writes `db` through `savePlannerState` (`src/Planner.jsx:1187` → `src/platform/persistence/plannerStateStore.js:52`), which runs `validatePlannerStateV8` then `storage.set("nbmp:state:v8", JSON)`.
7. Render reads go through feature projections (`projectPlannerDay`, `projectPlannerWeek`, `projectPlannerSearch`) which call domain queries. Writes go through `mutate` (`src/Planner.jsx:1640`) into domain commands, then the save effect.

### User Write Path

1. Pointer, keyboard, composer, or sheet handler in `src/Planner.jsx` (for example `completeTask` at `src/Planner.jsx:2005`).
2. Handler calls `mutate((d) => command(...).state)` or a feature wrapper such as `deleteTaskFromPlannerState` (`src/features/planner/taskMutations.js:36`).
3. Domain command normalizes input, enforces invariants, returns new records plus domain events. Calendar commands take the whole planner state (`createEvent` at `src/domains/calendar/commands/calendarCommands.js:92`). Task and note commands take their collection (`createTask` at `src/domains/tasks/commands/taskCommands.js:38`, `createNote` at `src/domains/notes/commands/noteCommands.js:26`).
4. Planner applies side effects that are *not* in the notebook: `awardTaskCompletion` on `motivationLedger`, `flash(...)` undo toast, haptics via `src/features/feedback/haptics.js`.
5. `setDb` triggers the planner autosave. Separate effects persist reminders, preferences, motivation, diagnostics, and the backup record.

### Recurring Task Write Path

1. `writeTask` (`src/Planner.jsx:1962`) parses `series@date` with `parseTaskOccurrenceId`.
2. `scope === "all"` edits the series definition.
3. Completion / reopen records or removes a typed exception via `upsertTaskException` / `removeTaskException` (`src/domains/tasks/recurrence/taskRecurrence.js`).
4. Any other single-occurrence edit detaches a one-off task and cancels that date on the series, then runs the command against the detached id.

### Search Path

1. Search sheet state (`search`, `searchQuery`) lives in Planner.
2. `projectPlannerSearch` (`src/features/search/searchProjection.js:3`) calls `searchPlanner` (`src/domains/search/queries/searchPlanner.js:138`).
3. Search reads `state.events`, `state.tasks`, `state.notes`, and `state.noteTags` and returns ranked public results.
4. A pick goes through `resolvePlannerSearchPick` → `resolveSearchTarget` (`src/domains/search/queries/resolveSearchTarget.js`), which returns a navigation target or `unavailable`.

### Reminder Path

1. Calendar alerts and task reminder intents stay on source records.
2. After reminders load, Planner calls `getReminderIntents(db)` and `reconcileReminders` (`src/Planner.jsx:1644`) to maintain a separate ledger in `reminderRecords`.
3. Due / missed / expired queries (`src/domains/reminders/queries/`) drive toasts and the missed-reminder sheet. Delivery never rewrites event or task records.
4. Ledger persists at `nbmp:reminders:v1` via `src/platform/persistence/reminderStore.js`.

### Import / Replace / Wipe Path

1. Settings file picker → `readPlannerImportText` (`src/platform/persistence/plannerStateRead.js:38`) (2 MB cap, JSON + schema 4–8).
2. Confirm → `replacePlannerNotebook` or `wipePlannerNotebook` (`src/platform/persistence/plannerNotebookReplace.js`).
3. `applyReplacedNotebook` (`src/Planner.jsx:2726`) swaps notebook, reminder ledger, motivation ledger, and backup fingerprint in one React update. Preferences and diagnostics stay on the device.

### Crash Recovery Path

1. A render throw is caught by `ErrorBoundary` (`src/app/ErrorBoundary.jsx:51`), which is *outside* Planner (`src/main.jsx:11`).
2. Fallback reads raw notebook bytes via `readRecoverableNotebook` (`src/app/notebookRecovery.js:75`) from `window.storage` or `localStorage`, never from crashed React state.
3. First control downloads that snapshot. Clearing site data is the destructive action this path exists to avoid.

**State Management:**
- Canonical notebook: `const [db, setDb] = useState(null)` in `src/Planner.jsx:749`. All calendar / task / note / exception / revision / attachment collections live here.
- Device preferences: `preferences` React state, schema v2, key `nbmp:preferences:v1`.
- Motivation: `motivationLedger`, key `nbmp:motivation:v1`.
- Reminders: `reminderRecords`, key `nbmp:reminders:v1`.
- Diagnostics: `diagnostics`, key `nbmp:diagnostics:v1`.
- Backup fingerprint: `backupRecord` (feature-owned shape in `src/features/planner/backupReminder.js`), persisted beside the notebook so writing it cannot change the fingerprint it compares.
- UI-only state (zoom, sheets, gestures, undo toast, ribbon window) stays in Planner hooks and refs. There is no Redux, Context provider tree, or URL router.

## Key Abstractions

**Planner state (`db`):**
- Purpose: The validated v8 notebook. Collections include `events`, `calendars`, `exceptions`, `tasks`, `taskExceptions`, `lists`, `notes`, `noteTags`, `noteAttachments`, `noteRevisions`, plus leftover v4 fields the migrations tolerate.
- Examples: `src/platform/persistence/plannerStateImport.js`, `src/domains/notes/migrations/validatePlannerStateV8.js`
- Pattern: Single JSON document. Mutations replace collections immutably. Schema cutover is always to current (`v8`) in one confirmed write.

**Domain command:**
- Purpose: The only legal way to change canonical records.
- Examples: `src/domains/calendar/commands/calendarCommands.js`, `src/domains/tasks/commands/taskCommands.js`, `src/domains/notes/commands/noteCommands.js`, `src/domains/reminders/commands/reminderCommands.js`
- Pattern: Pure function. Caller supplies ids (`createEvent` rejects missing / `@`-containing ids). Return `{ state|notes|tasks, events, removed? }`. Throw `*ValidationError` or `TypeError` on illegal input. Planner currently ignores most returned events and applies side effects itself.

**Domain query:**
- Purpose: Read models derived from canonical records.
- Examples: `src/domains/calendar/queries/planningQueries.js`, `src/domains/tasks/queries/dayView.js`, `src/domains/notes/queries/noteQueries.js`, `src/domains/planner/queries/dayAggregate.js`
- Pattern: Pure. Accept state or a collection plus a date window. Never write. Cross-domain reads belong in `src/domains/planner/` or `src/domains/search/`, not inside calendar/tasks/notes.

**Domain event:**
- Purpose: Named notice a command emits so other domains can react without importing each other.
- Examples: `src/domains/tasks/events/taskEvents.js` (`TaskCompleted`, `TaskCreated`, …), `eventNotice("EventCreated", …)` in `src/domains/calendar/commands/calendarCommands.js`, `noteEvent("NoteChanged", …)` in `src/domains/notes/commands/noteCommands.js`
- Pattern: `{ type, entityId, ...payload }`. Tasks document this as the reason reward rules stay out of the task model. Planner still awards XP by calling `awardTaskCompletion` directly rather than consuming the event bus.

**Feature projection:**
- Purpose: Convert a domain aggregate into something the current UI can render, including display-only mapping.
- Examples: `src/features/planner/dayProjection.js`, `src/features/planner/weekProjection.js`, `src/features/search/searchProjection.js`, `src/features/planner/eventPresentation.js`
- Pattern: Thin wrapper. `projectPlannerDay` calls `getDayAggregate` then `mapEvent`. Do not compute new domain rules here.

**Occurrence identity:**
- Purpose: Address one expansion of a series without copying the series record.
- Examples: `src/domains/calendar/recurrence/occurrenceIdentity.js` (`seriesId@date`), `parseTaskOccurrenceId` in `src/domains/tasks/recurrence/taskRecurrence.js`
- Pattern: String id with `@`. Series edits use the bare id. Single-occurrence edits use typed exception commands or detach-and-cancel.

**Storage port:**
- Purpose: Keep domains and stores free of `localStorage` / host SDK details.
- Examples: `src/storage.js` (`get`, `set`, `remove`, `writable`), every `load*` / `save*` in `src/platform/persistence/`
- Pattern: Async `get(key)` returns `{ value }` or `null` and never rejects on miss. `set` / `remove` reject so the UI can flag NOT SAVING.

**Migration + validator pair:**
- Purpose: Each schema bump is owned by the domain that introduced it; persistence only sequences them.
- Examples: `src/domains/calendar/migrations/migrateV4ToV5.js` + `validatePlannerStateV5.js`; `src/domains/tasks/migrations/migrateV5ToV6.js`; `src/domains/notes/migrations/migrateV6ToV7.js`, `migrateV7ToV8.js`, `validatePlannerStateV8.js`
- Pattern: Migrate in memory → `savePlannerState` (validates v8) → read back → validate → `remove` previous key. No dual-write window.

## Entry Points

**Dev / production web app:**
- Location: `index.html` → `src/main.jsx`
- Triggers: `npm run dev` (Vite on `0.0.0.0:5000`) or `npm run build` / `npm run preview`
- Responsibilities: Mount React, import `src/index.css`, keep ErrorBoundary outside Planner

**Single-file artifact:**
- Location: `build-artifact.mjs` writes `artifact/planner.html`
- Triggers: `npm run build:artifact`
- Responsibilities: Inline the Vite JS/CSS so a host CSP that blocks external requests still boots. Injects a viewport meta the host `<head>` would otherwise omit.

**Unit tests:**
- Location: colocated `*.test.js` under `src/`
- Triggers: `npm test` (`node --test`)
- Responsibilities: Domain / feature / platform behavior without a browser

**Browser suite:**
- Location: `tests/e2e/*.spec.js`, config `playwright.config.js`
- Triggers: `npm run test:e2e` against `vite preview` of the production bundle
- Responsibilities: Gestures, sheets, focus, persistence, typography — anything unit tests cannot see

**Host embed:**
- Location: `src/storage.js` (probes `window.storage` at module load)
- Triggers: Parent page injects `window.storage` before the module evaluates
- Responsibilities: Same `get`/`set`/`remove` contract as localStorage; crash recovery also understands a host store (`src/app/notebookRecovery.js`)

## Architectural Constraints

- **Threading:** Single-threaded browser event loop. No Web Workers, no SharedArrayBuffer. Autosave, reminder reconcile, and diagnostics writes are debounced `setTimeout`s on the main thread. Gesture math (`src/features/planner/timelineGesture.js`, `src/features/planner/timelineInteractionState.js`) must stay synchronous and cheap.
- **Global state:** `src/storage.js` probes host/localStorage once at import and exports module-level `writable`. `src/Planner.jsx` is a singleton composition root with module-level helpers (`seed`, `repeatFor`, `CAT_COLOR`) and many refs that outlive a single render (`completeTaskRef`, `applyRef`, `interactionRef`). There is no React Context for the notebook.
- **Circular imports:** Keep domain internals from importing `src/Planner.jsx`. ICS export injects `eventForUi` for this reason (`src/Planner.jsx` comment at the `exportIcs` path; adapter is `src/domains/calendar/portability/eventToIcs.js`). `src/domains/planner/` and `src/domains/search/` may import other domains' public barrels; calendar / tasks / notes / reminders / gamification must not import each other.
- **Planner is not a dump:** `docs/spec/structure.md` freezes ownership. New rules, queries, migrations, and surfaces extract beside their owner. Do not append helpers to `src/Planner.jsx`.
- **IDs are caller-supplied for calendar creates:** `createEvent` requires `options.id` without `@`. Use `createId()` from `src/shared/ids.js` in the composition root, then pass it in.
- **Task/note commands are collection-scoped:** They receive `tasks` or `notes`, not the whole `db`. Planner (or `src/features/planner/taskMutations.js`) is responsible for writing the returned collection back onto state.
- **No provider SDKs in domains:** Google / Microsoft adapters are deferred (`docs/adr/0001-domain-oriented-modular-monolith.md`). Canonical timing is all-day, floating, or IANA-zoned — never a vendor payload.
- **Target tree vs current tree:** ADR 0001 still owns the destination (`src/ui/`, `src/platform/notifications|integrations|telemetry`, `src/shared/recurrence|validation|types`). Those folders do not exist yet. Do not invent a fourth layout.

## Anti-Patterns

### Growing Planner.jsx

**What happens:** New helpers, markup, or invariants are appended to `src/Planner.jsx` (already ~8318 lines, 268 functions).
**Why it's wrong:** Domain rules become untestable except through the full React tree; ownership collapses; the file is already the migration debt ADR 0001 exists to retire.
**Do this instead:** Put the rule in `src/domains/<context>/` and export it from that domain's `index.js`. Put a use-case or projection in `src/features/<area>/`. Put a new visible surface in `src/features/*/Foo.jsx`. Wire it from Planner; do not implement it there.

### Bypassing a domain barrel

**What happens:** A caller imports `src/domains/calendar/migrations/migrateV4ToV5.js` (Planner still does this) or another domain's internal file.
**Why it's wrong:** Internals can move during the incremental extraction. Public contracts live on `index.js`.
**Do this instead:** Import from `src/domains/<context>/index.js`. Add the symbol to that barrel if it is part of the domain's API. Persistence may import a migration/validator file directly because those files *are* the persistence port the domain owns.

### Mutating canonical records in UI or features

**What happens:** A feature or JSX handler does `task.done = true` or writes `d.tasks = d.tasks.map(...)` with ad-hoc fields (Planner still has a leftover `patchItem` path for tasks at `src/Planner.jsx:1908` that spreads a raw patch).
**Why it's wrong:** Invariants (`normalizeTaskInput`, status transitions, occurrence identity) are skipped; later commands see illegal records; v8 validation then refuses to save.
**Do this instead:** Call the typed command (`updateTask`, `completeTask`, `modifyOccurrence`, …). If a write spans collections, put the orchestration in `src/features/planner/taskMutations.js` (see `deleteTaskFromPlannerState`) and still call domain commands underneath.

### Dual-write or intermediate schema keys

**What happens:** A migration writes `nbmp:state:v7` on the way to v8, or writes old and new keys together.
**Why it's wrong:** An interrupted upgrade strands a half-migrated notebook. `loadPlannerState` is built so that never happens.
**Do this instead:** Chain migrations in memory, `savePlannerState` (v8 only), read back, `validatePlannerStateV8`, then `remove` the previous key (`src/platform/persistence/plannerStateStore.js:60`).

### Seeding over an unreadable notebook

**What happens:** Load failure falls through to `seed()` and later a successful save overwrites the damaged record with the sample week.
**Why it's wrong:** The user's bytes disappear and the demo week is presented as theirs. The current boot path exists specifically to prevent this (`src/Planner.jsx` catch around `loadPlannerState`).
**Do this instead:** `createBlankPlannerState()`, `setSaveBlocked(true)`, `readPlannerRecoverySnapshot(storage)`, keep export pointed at the raw snapshot.

### Domain importing platform or Planner

**What happens:** A domain file imports `src/storage.js`, a `*Store.js`, or anything from `src/Planner.jsx`.
**Why it's wrong:** Breaks the port rule in ADR 0001 and makes the domain unloadable in `node --test` without a DOM.
**Do this instead:** Accept plain data. Let platform stores call domain `normalize*` / `validate*` / `migrate*`. Let Planner pass `storage` into platform functions.

### Cross-domain record nesting

**What happens:** A task stores a full event object, or a note stores a live task.
**Why it's wrong:** Two sources of truth; migrations and search diverge.
**Do this instead:** Store ids. Notes use `linkNote` / `eventNoteLink` / `taskNoteLink` (`src/features/notes/contextLink.js`). Reminders key off source intent (`src/domains/reminders/model/reminder.js`). Gamification awards key `{ domain, entityId, occurrenceId }`.

## Error Handling

**Strategy:** Fail closed on writes; fail open on reads of supporting stores; never destroy the last authored notebook bytes.

**Patterns:**
- Domain validation throws typed errors: `CalendarValidationError` (`src/domains/calendar/model/event.js`), `TaskValidationError` (`src/domains/tasks/model/taskStatus.js`), `NoteValidationError` (`src/domains/notes/model/block.js`). Commands throw `TypeError` for programmer errors (missing id, unknown event type).
- Persistence `parseStored` wraps `JSON.parse` with a keyed `Error` (`src/platform/persistence/plannerStateStore.js:21`). Import turns those into `{ ok: false, error }` via `describeImportError` (`src/platform/persistence/plannerStateRead.js:21`) so Settings does not crash.
- `storage.get` never rejects — miss is `null`. `storage.set` / `remove` reject. Planner's `reportStorage` (`src/Planner.jsx:987`) records the scope and `classifyStorageFailures` (`src/platform/resilience/storageStatus.js:7`) decides whether the banner is canonical (`planner` / `device`) or supporting.
- Unreadable notebook: blank in-memory state, autosave off, recovery snapshot retained. Unreadable diagnostics / preferences / motivation: that store's save stays blocked; the notebook still opens.
- Render errors: `ErrorBoundary.componentDidCatch` (`src/app/ErrorBoundary.jsx:61`) plus a download path that bypasses Planner.
- Undo payloads must always have a `type`. `runUndo` (`src/Planner.jsx:2407`) no-ops when `undo.payload` is missing so a confirmation toast cannot throw out of `setDb` and blank the page.

## Cross-Cutting Concerns

**Logging:** No remote telemetry. Local diagnostics ledger (`src/platform/diagnostics/diagnostics.js`) records storage failures via `recordDiagnostic`. `shouldRecordStorageDiagnostic` / `storageDiagnosticOperation` decide which scopes are worth an entry. Export is a user-triggered JSON download, not a beacon.

**Validation:** Happens twice — on every command (`normalizeEventInput`, `normalizeTaskInput`, `normalizeNote`, …) and on every persist (`validatePlannerStateV8` before `set`). Import uses the same migration+validate chain as load (`normalizeImportedPlannerState` in `src/platform/persistence/plannerStateImport.js:10`).

**Authentication:** Not applicable. Personal-first, local-only notebook. No user accounts, no auth provider, no server.

**Theming / a11y / motion:** Theme tokens live in `src/design/themes.js`; `readable()` in `src/design/contrast.js` derives glyph-safe `dimText` / `accentText` at render (`src/Planner.jsx:1263`). Dialog focus/trap lives in `src/features/accessibility/dialogFocus.js`. Reduced-motion and fluid geometry live in `src/features/motion/`. These are presentation concerns — they must not change canonical records.

**Time:** All planner dates are `YYYY-MM-DD` keys from `src/shared/time/dateKey.js`. Timed values are local DateTime strings from `src/shared/time/localDateTime.js`. Zoned events resolve offsets through `src/shared/time/timezone.js`. Do not use `Date#toISOString().slice(0, 10)` for a planner date — that is UTC and will shift.

---

*Architecture analysis: 2026-08-13*
