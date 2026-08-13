# Coding Conventions

**Analysis Date:** 2026-08-13

## Naming Patterns

**Files:**
- Use camelCase `.js` for logic modules that match the primary export: `calendarCommands.js`, `dateKey.js`, `quickAdd.js`, `plannerStateStore.js`.
- Use PascalCase `.jsx` for React components: `Planner.jsx`, `ErrorBoundary.jsx`, `TimelineActionCard.jsx`.
- Colocate unit tests as `<module>.test.js` next to the source, except domain suites which live in `src/domains/<domain>/tests/`.
- Name Playwright specs after the user-visible surface: `tests/e2e/actions.spec.js`, `tests/e2e/typography.spec.js`.
- Name domain role folders by responsibility: `commands/`, `queries/`, `model/`, `migrations/`, `recurrence/`, `portability/`.
- Prefix CSS classes with `nb-` (`nb-label`, `nb-lead`, `nb-data`, `nb-tap`, `nb-timeline-lane`). Type steps use `nb-${step}` from `src/design/typography.js`.

**Functions:**
- Use camelCase verbs for commands and queries: `createEvent`, `updateTask`, `getOverdueTasks`, `loadPlannerState`.
- Prefix predicates with `is` / `can` / `should`: `isDateKey`, `isOverdue`, `isTaskActive`, `canTransition`, `shouldPromptBackup`.
- Prefix throwing guards with `assert`: `assertDateKey`, `assertTaskStatus`, `assertTransition`, `assertParentAssignment`.
- Prefix input sanitizers with `normalize`: `normalizeEventInput`, `normalizeTaskInput`, `normalizeNote`, `normalizeTiming`.
- Keep private helpers unexported and camelCase: `commandState`, `requireTask`, `issue`, `validDate`.

**Variables:**
- Use camelCase nouns: `seriesId`, `recurrenceDate`, `startMinute`, `fallbackDate`.
- Name collections after the record they hold: `events`, `tasks`, `notes`, `overrides`.
- Name date keys `todayDate`, `dateKey`, or a role (`fallbackDate`, `until`). Never invent a second date format.
- Name option bags after their role and destructure at the signature: `{ now = null } = {}`, `{ todayDate, lists = [] } = {}`.

**Types:**
- There is no TypeScript. Encode catalogs as frozen arrays/objects: `TASK_STATUSES`, `BLOCK_TYPES`, `REMINDER_ANCHORS`, `TYPE_SCALE`.
- Name domain events PascalCase nouns: `EventCreated`, `TaskCompleted`, `NoteLinked`.
- Name error classes `<Domain>ValidationError`: `CalendarValidationError`, `TaskValidationError`, `NoteValidationError`.
- Name persisted ids with `createId()` from `src/shared/ids.js`. Ephemeral UI keys may stay short-random; stored records may not.

## Code Style

**Formatting:**
- No Prettier, ESLint, Biome, or EditorConfig file is present. Match the surrounding file by hand.
- Double quotes, semicolons, 2-space indent, ESM (`"type": "module"` in `package.json`).
- Always include the `.js` extension on relative imports.
- Keep lines readable rather than wrapping to a fixed column. Small fixtures stay on one line; long signatures break after the opening `{`.
- Prefer `const`. Use `let` only when a command walks a collection (`let nextTasks = tasks`).
- Use `Object.freeze` on public catalogs so a caller cannot mutate the contract.

**Linting:**
- Not detected as a project tool. `src/app/ErrorBoundary.jsx` still uses `// eslint-disable-next-line no-console` as a comment convention: console is allowed only for a crash the app cannot report anywhere else.
- Do not add a linter that rewrites existing style. Follow the file you are in.

## Import Organization

**Order:**
1. Node builtins (`node:test`, `node:assert/strict`) in test files.
2. Blank line.
3. Relative application imports, deepest owner first when a file spans layers.
4. In React files, React hooks first (`src/Planner.jsx`), then domain barrels, then platform, then features.

**Path Aliases:**
- Not detected. Always use relative paths: `../../../shared/time/dateKey.js`, `../../domains/tasks/index.js`.
- Features, platform, and UI import a domain through its barrel (`src/domains/<domain>/index.js`), not through a nested file, unless they are implementing that domain.
- `src/shared/` must not import a product domain (`docs/adr/0001-domain-oriented-modular-monolith.md`).
- Persistence may import domain migrations and validators. Domains must not import `src/storage.js` or browser APIs.

**Example — feature test importing owners:**

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import { busyFractionForDay } from "./weekProjection.js";
import { createBlankPlannerState } from "../../platform/persistence/plannerStateImport.js";
import { createEvent } from "../../domains/calendar/index.js";
import { createTask, planTask } from "../../domains/tasks/index.js";
```

## Error Handling

**Patterns:**
- Collect field issues, then throw once. Do not throw on the first bad field when normalizing a record.

```javascript
function issue(issues, field, message) {
  issues.push({ field, message });
}

export function normalizeTaskInput(input) {
  const issues = [];
  // ...push issues...
  if (issues.length) throw new TaskValidationError(issues);
  return { /* canonical record */ };
}
```

- Use `<Domain>ValidationError` for user/input invariants. The message is `"${field}: ${message}"` joined by `"; "`. Tests assert either the class, a `/regex/` on the message, or `error.issues.some(...)`.
- Use `TypeError` for programmer contracts: missing `todayDate`, bad `createEvent` id, unknown domain event type (`src/shared/time/dateKey.js`, `src/features/planner/quickAdd.js`, `src/domains/tasks/events/taskEvents.js`).
- Use `RangeError` for out-of-range values (`requiredRatio`, `resetPreferenceGroup`, positive duration).
- Wrap persistence failures with `{ cause }` so the previous notebook version is named: `` throw new Error(`could not persist migrated v8 planner state; ${previousLabel} was preserved`, { cause: error }) `` in `src/platform/persistence/plannerStateStore.js`.
- Storage reads never reject (`src/storage.js` `get` returns `null`). Storage writes do reject so Settings can warn and export remains the recovery path.
- Optional platform APIs swallow and return a boolean: `triggerDeviceHaptic` in `src/features/feedback/haptics.js` never throws into the interaction.
- Render failures stop at `src/app/ErrorBoundary.jsx`. Do not write a crash report into the same storage that may have caused the crash.

## Logging

**Framework:** `console` only. There is no logger package and no telemetry backend.

**Patterns:**
- Do not log from domain commands, queries, or feature projections. They are pure.
- `ErrorBoundary.componentDidCatch` is the one allowed `console.error`. It exists so a phone user still has a stack under "WHAT HAPPENED".
- Diagnostics are a redacted ledger (`src/platform/diagnostics/diagnostics.js`), not log lines. Never put notebook text, titles, or stacks into a diagnostic record.

## Comments

**When to Comment:**
- Put a file-level block at the top of any module that encodes a product rule. Explain *why*, not what the next line does. See `src/features/planner/quickAdd.js`, `src/shared/ids.js`, `src/app/ErrorBoundary.jsx`.
- Cite the living spec with `§` when a rule is easy to get wrong: `/* §5.1. Planned answers "when do I intend to work on this" */` in `src/domains/tasks/model/task.js`.
- Comment the failure mode a future edit will recreate: Vite `assetsInlineLimit` in `vite.config.js`, Safari blob-URL revoke in `ErrorBoundary.jsx`.
- Do not narrate `map`/`filter`. Do not leave `TODO`/`FIXME` as a substitute for a decision.

**JSDoc/TSDoc:**
- Use JSDoc on public parsers and converters that have a non-obvious contract (`parseQuickAdd`, `quickAddToEntry` in `src/features/planner/quickAdd.js`).
- Document `@param` types in prose (`string`, `object`, `{ id, name }`) rather than introducing TypeScript.
- Skip JSDoc on a function whose name plus a one-line `assert*` already is the contract.

## Function Design

**Size:**
- Keep a command focused on one mutation. `createTask`, `deferTask`, `completeTask` in `src/domains/tasks/commands/taskCommands.js` are the size to copy.
- Extract a local helper when two commands share merge/replace logic (`commandState`, `replace`, `touch`, `result`).
- A parser may be long if it is one algorithm (`parseQuickAdd`). Do not split it into a utilities folder; keep the scanner in the same file.

**Parameters:**
- Commands take the collection first, then identity/input, then an options bag: `createTask(tasks, input, { now = null } = {})`.
- Never read `Date.now()`, `new Date()`, locale, or storage inside a domain or feature module. The caller supplies `now`, `todayDate`, `id`, and `createId`.
- Prefer option objects over positional booleans: `{ scope: "occurrence" }`, `{ override: true }`, `{ includeArchived: true }`.

**Return Values:**
- Domain commands return a result object, never mutate the input:

```javascript
// calendar
{ state, event, removed, domainEvents }

// tasks / notes
{ tasks, events }  // or { notes, events }
```

- Queries return derived data. They must not write, and they must not change processing state (`getInboxNotes` in `src/domains/notes`).
- Normalizers return a new canonical record. Input arrays that were sorted/deduped stay untouched (`normalizeEventInput` copies `alerts` / `byDay`).
- Use `null` for "nothing": blank quick-add, missing storage, no warning from `assertPlannedBeforeDeadline`. Do not return `undefined` for a domain miss; `resolveTaskForInspection` uses `?? null`.

## Module Design

**Exports:**
- Named exports for logic. Default export only for a React component (`export default function TimelineActionCard`, `Planner`).
- Re-export the public surface from `src/domains/<domain>/index.js`. New commands and queries must be added to that barrel or they are not part of the domain.
- Export error classes and catalogs from the same barrel the UI will import.
- Keep `src/storage.js` as the only browser storage I/O. Persistence talks to a `storagePort` with `{ get, set, remove }`.

**Barrel Files:**
- Required per domain: `src/domains/calendar/index.js`, `src/domains/tasks/index.js`, `src/domains/notes/index.js`, and the smaller domains.
- Do not add `src/features/index.js` or `src/platform/index.js`. Import the specific module.
- Do not grow `src/Planner.jsx`. New behavior extracts beside its owner (`docs/spec/structure.md`).

## Layer Rules

Follow `docs/adr/0001-domain-oriented-modular-monolith.md` and `docs/spec/structure.md`:

| Kind of change | Put it here |
| --- | --- |
| Domain rule, command, query, migration | `src/domains/<bounded-context>/` and export it from that domain's `index.js` |
| Persistence, schema cutover, import/export | `src/platform/persistence/` |
| Date, id, validation primitive | `src/shared/` |
| Application use-case, undo, projection, gesture arithmetic | `src/features/<area>/` |
| Visible React surface | `src/features/*/Foo.jsx`; `Planner.jsx` stays the composition root |
| Host storage adapter | `src/storage.js` |

Planner remains the composition root: state, wiring, and existing surfaces. New markup does not append to the 8k-line file.

## Immutability and Purity

- Treat planner state as immutable. Copy arrays with spread/`map`/`filter`. Copy maps of overrides with `{ ...state.overrides }`.
- Use `structuredClone` only for deletion snapshots that must survive later mutation (`deleteEvent` canonical-series path in `src/domains/calendar/commands/calendarCommands.js`).
- Assert immutability in tests: `assert.equal(before.events.length, 0)` after `createEvent`.
- A no-op command returns the same collection and `events: []`. `updateNote` does not bump `revision` when nothing changed. `addTaskDependency` is a no-op when the edge already exists.

## React and UI

- Function components with hooks. The one class component is `ErrorBoundary` because it needs `getDerivedStateFromError`.
- Pass theme tokens as props (`theme.accent`, `theme.on`, `theme.card`) and apply them as inline styles. Do not hard-code theme hex in a feature component; `ErrorBoundary` is the exception because it cannot trust the crashed tree.
- Hook test ids with `data-test`, matching `playwright.config.js` `testIdAttribute`. Domain identity uses `data-event-id`, `data-task`, `data-task-chip`, `data-day`.
- Keep gesture ownership exclusive. A press has one owner for its whole life. `pointercancel` / `touchcancel` restore the before state and write nothing (`docs/interaction-contracts/planner-interactions.md`).
- Button and rail copy is stored as capitals (`MARK COMPLETE`, `PLAN TODAY`). Do not introduce `text-transform` as a second source of casing without migrating existing strings (`DESIGN.md`).
- Use the named motion tokens in `src/index.css` (`--spring`, `--exit`, `--press-in`, `--press-out`). Do not invent a new curve.

## Time, Identity, and Persistence

- Calendar dates are `YYYY-MM-DD` keys validated by `assertDateKey` in `src/shared/time/dateKey.js`. Timed values are minutes from midnight (`0..1439`) or `YYYY-MM-DDTHH:MM` local strings.
- Half-open intervals and exclusive all-day end dates. Do not switch to inclusive end dates.
- Persisted ids go through `createId()` (`crypto.randomUUID()`, with a test-only fallback). Do not restore `Math.random().toString(36).slice(2, 9)` for notebook records.
- Schema writes go to `nbmp:state:v8`. Migrate in memory, write v8, read it back, validate, then drop the older key. Never dual-write an intermediate version.

## Constants and Magic Numbers

- Lift catalogs and limits into named exports: `MAX_DEPTH`, `MAX_DIAGNOSTIC_RECORDS`, `DEFAULT_DURATION_MINUTES`, `AUTO_COMPLETE_DELAY_MS`.
- Hour geometry (`68` px) and gesture hold times appear in UI and e2e tests. If you change one, change the other and the interaction contract.
- Theme list lives once in `src/design/themes.js`. Do not copy palettes into tests or scripts.

---

*Convention analysis: 2026-08-13*
