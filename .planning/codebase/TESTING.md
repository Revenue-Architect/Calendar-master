# Testing Patterns

**Analysis Date:** 2026-08-13

## Test Framework

**Runner:**
- Unit / domain / feature / platform: Node.js built-in test runner (`node --test`)
- Browser: Playwright `@playwright/test` `^1.62.1`
- Config: `playwright.config.js` (e2e only). No `vitest.config.*`, `jest.config.*`, or coverage config.

**Assertion Library:**
- Unit: `node:assert/strict`
- E2E: Playwright `expect` (including `expect.poll`)

**Run Commands:**
```bash
npm test              # node --test  (domain, feature, and platform unit tests)
npm run test:e2e      # playwright test (against the built bundle)
npm run test:e2e:ui   # playwright test --ui
npm run test:all      # npm test && npm run test:e2e
npx playwright install chromium   # one-time browser install
```

Point at a preinstalled Chromium with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Override the preview port with `PLAYWRIGHT_PORT` (default `4321`).

## Test File Organization

**Location:**
- Colocate next to the module for `src/app/`, `src/design/`, `src/features/`, `src/platform/`, `src/shared/`: `quickAdd.js` + `quickAdd.test.js`.
- Put domain suites in `src/domains/<domain>/tests/` (`src/domains/calendar/tests/commands.test.js`, `src/domains/tasks/tests/planning.test.js`, `src/domains/notes/tests/notes.test.js`).
- A domain file may still carry a colocated test when it is the only consumer (`src/domains/calendar/portability/eventToIcs.test.js`, `src/domains/gamification/model/ledger.test.js`).
- Browser specs live only in `tests/e2e/*.spec.js`. Do not rename them as part of folder cleanup (`docs/spec/structure.md`).
- Shared e2e setup is `tests/e2e/helpers.js`.

**Naming:**
- Unit: `<area>.test.js` describing the module or capability (`recurrenceEquivalence.test.js`, `monthBatching.test.js`).
- E2E: `<surface>.spec.js` (`actions.spec.js`, `timeline-gestures.spec.js`, `interaction-contracts.spec.js`).
- Test titles are sentences about behavior, not method names: `"a passed planned date does not make a task overdue"`.

**Structure:**
```
src/
  domains/<domain>/
    tests/*.test.js          # domain commands, queries, migrations
    <role>/*.test.js         # occasional colocated file
  features/<area>/*.test.js  # projections, parsers, gestures
  platform/**/*.test.js
  shared/**/*.test.js
  design/*.test.js
  app/*.test.js
tests/e2e/
  helpers.js
  *.spec.js
```

There are 83 `*.test.js` files and 24 `*.spec.js` files. `src/Planner.jsx` has no unit tests; browser specs cover its surfaces.

## Test Structure

**Suite Organization:**

Unit tests are a flat list of `test()` calls. Do not introduce `describe()` in new unit files.

```javascript
import test from "node:test";
import assert from "node:assert/strict";

import { createEvent, updateEvent } from "../commands/calendarCommands.js";

const timedInput = () => ({
  title: "Planning",
  date: "2026-08-09",
  start: 540,
  dur: 60,
  alerts: [],
});

test("createEvent is immutable and emits EventCreated", () => {
  const before = { events: [], overrides: {} };
  const result = createEvent(before, timedInput(), { id: "event-1" });
  assert.equal(before.events.length, 0);
  assert.equal(result.domainEvents[0].type, "EventCreated");
});

test("createEvent rejects duplicate identity", () => {
  const before = { events: [{ id: "event-1", ...timedInput() }], overrides: {} };
  assert.throws(() => createEvent(before, timedInput(), { id: "event-1" }), /already exists/);
});
```

Playwright specs group by contract with `test.describe`:

```javascript
import { expect, test } from "@playwright/test";
import { openPlanner, seedPlanner, settledState } from "./helpers.js";

test.describe("the actions column", () => {
  test("collapses, restores, and remembers across a reload", async ({ page }) => {
    await openPlanner(page);
    // ...
  });
});

test.describe("scheduled action completion in the mobile timeline", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("a deliberate right swipe completes the timeline action without turning the day", async ({ page }) => {
    // ...
  });
});
```

**Patterns:**
- Setup: factory functions at module top (`timedInput()`, `task()`, `daily()`, `notebook()`, `stateWithDailyEvent()`). They return new objects every call.
- Teardown: none. Tests are pure or use an in-memory port that dies with the test.
- Assertion: `assert.equal` / `assert.deepEqual` / `assert.ok` / `assert.match` for values; `assert.throws` / `assert.rejects` for errors. Playwright uses `expect` plus `expect.poll` for persistence and computed style.
- Pin the product rule in the title, then assert the consequence. Add a message on the assertion when the failure would otherwise be a bare `false` (`"moving planned work is not failure"`).

## Mocking

**Framework:** None. Do not add Jest/Vitest mocks or `sinon`. Hand a fake collaborator in.

**Patterns:**

In-memory storage port (`src/platform/persistence/plannerStateStore.test.js`):

```javascript
function memoryStorage(initial = {}, failKey = null) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    async get(key) { calls.push(["get", key]); return values.has(key) ? { value: values.get(key) } : null; },
    async set(key, value) {
      calls.push(["set", key]);
      if (failKey && key === failKey) throw new Error("disk full");
      values.set(key, value);
    },
    async remove(key) { calls.push(["remove", key]); values.delete(key); },
  };
}
```

Device stub (`src/features/feedback/haptics.test.js`):

```javascript
const device = { vibrate(pattern) { received = pattern; return true; } };
assert.equal(triggerDeviceHaptic(HAPTIC_PATTERNS.complete, device), true);
```

Clock and identity are injected, not mocked:

```javascript
createTask([], { id: "a", title: "Chase the invoice", planned: { date: TODAY } }, { now: NOW });
parseQuickAdd(text, { todayDate: "2026-08-10" });
```

Playwright seeds a valid notebook with the same domain commands the app uses (`tests/e2e/helpers.js` `seedPlanner`, plus `createBlankPlannerState` / `createTask` / `createEvent`). It does not click through a migration to build a fixture.

E2E haptics hook:

```javascript
await page.addInitScript(() => {
  window.__calendarMasterVibrations = [];
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: (pattern) => { window.__calendarMasterVibrations.push(pattern); return true; },
  });
});
```

**What to Mock:**
- Storage ports, `navigator.vibrate`, and host `window.storage` probes.
- `todayDate` / `now` / ids — by passing them in, not by stubbing `Date`.
- Browser APIs the unit under test already accepts as a parameter (`device = globalThis.navigator`).

**What NOT to Mock:**
- Domain commands, recurrence expansion, or projections. Call the real function.
- React. There is no component unit-test renderer. UI behavior goes through Playwright.
- The production bundle. E2E runs `npm run build && npx vite preview`, not the Vite dev server (`playwright.config.js`).

## Fixtures and Factories

**Test Data:**

Fixed calendar Monday so weekday math is checkable by hand (`src/features/planner/quickAdd.test.js`):

```javascript
/* 2026-08-10 is a Monday */
const MONDAY = "2026-08-10";
const on = (text, options = {}) => parseQuickAdd(text, { todayDate: MONDAY, ...options });
```

Canonical task factory (`src/domains/tasks/tests/planning.test.js`):

```javascript
const TODAY = "2026-08-09";
const NOW = "2026-08-09T10:00";
const task = (input) => normalizeTaskInput({ id: "t", title: "T", ...input });
```

Blank notebook plus real commands (`src/features/planner/monthBatching.test.js`, e2e specs):

```javascript
let state = createBlankPlannerState({});
state = createEvent(state, { /* canonical timing */ }, { id: "evt-1" }).state;
state = { ...state, tasks: createTask(state.tasks, { id: "t1", title: "Task" }).tasks };
```

**Location:**
- Factories stay in the test file that uses them. There is no `tests/fixtures/` tree.
- Shared e2e constants live in `tests/e2e/helpers.js` (`STATE_KEY = "nbmp:state:v8"`).
- Theme and type-scale fixtures are the production modules: import `THEMES` from `src/design/themes.js` and `TYPE_SCALE` from `src/design/typography.js`. Do not copy palettes into a test.

## Coverage

**Requirements:** None enforced. No `c8` / nyc / istanbul config and no coverage gate in `package.json`.

**View Coverage:**
```bash
# Not configured. Do not add a coverage number that no one fails a build on.
# DESIGN.md: "A test that cannot fail is worse than no test, because it gets counted."
```

Coverage is by capability, not by line percentage:

| Layer | How it is proven |
| --- | --- |
| Domain invariants | `src/domains/*/tests/*.test.js` |
| Feature parsers / projections | colocated `*.test.js` |
| Persistence cutover | `src/platform/persistence/*.test.js` |
| Theme contrast + type scale | `src/design/contrast.test.js` |
| Layout, motion, gestures, persistence-in-browser | `tests/e2e/*.spec.js` |
| Recurrence optimiser | equivalence vs a naive reference (`recurrenceEquivalence.test.js`) |

`src/Planner.jsx` is exercised only through e2e. New UI still needs a Playwright spec if unit tests cannot see it.

## Test Types

**Unit Tests:**
- Pure functions with injected time and ids.
- Assert immutability of the input collection.
- Assert the domain event type (`EventCreated`, `TaskDeferred`).
- Assert structured validation (`CalendarValidationError`, `error.issues`).
- Prefer many small `test()` cases over one table that hides the rule.

**Integration Tests:**
- Persistence tests drive `loadPlannerState` / `savePlannerState` through a fake `storagePort` and check call order (write v8, read back, then remove v4).
- Feature tests may compose several domains (`monthBatching.test.js` builds a notebook with events + tasks and compares batched vs per-day queries).
- Do not boot React in Node.

**E2E Tests:**
- Playwright, Chromium only, `workers: 1`, `fullyParallel: false` — specs share one origin's `localStorage` and would wipe each other if parallel.
- Default viewport `1280 × 900` so the Actions column and two-pane layout exist. Mobile suites call `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })`.
- `testIdAttribute` is `data-test`. Trace and screenshot retain on failure.
- `webServer` builds the production bundle and serves it with `vite preview --strictPort`. A bug that only survives Vite's dev transform is not a product bug.
- Use `openPlanner(page)` for an empty notebook, or `seedPlanner(page, state)` for states that cannot be clicked into existence (recurrence, hidden calendars, mid-migration shapes).
- `seedPlanner` writes via a one-shot `addInitScript` and a sessionStorage marker so a later `reload()` tests real persistence instead of reseeding.
- Never call `localStorage.clear()` through `addInitScript` on every navigation — that erases the notebook a reload is supposed to prove (`tests/e2e/helpers.js`).

Visual / tactile checks that are not assertions: `scripts/contact-sheet.mjs` (15 themes × 2 widths × 4 surfaces). Run it around a visual change; do not treat it as a CI gate.

## Common Patterns

**Async Testing:**

```javascript
test("failed v8 write leaves the previous version untouched", async () => {
  const port = memoryStorage({ [V4_KEY]: JSON.stringify(v4State) }, V8_KEY);
  await assert.rejects(() => loadPlannerState(port), /persist migrated v8/);
  assert.ok(await port.get(V4_KEY));
});
```

Playwright persistence — poll the stored notebook, do not sleep-and-hope:

```javascript
const state = await settledState(
  page,
  (stored) => stored.tasks[0]?.status === "completed",
  "timeline check did not complete the action",
);
expect(state.tasks[0].status).toBe("completed");
```

`page.waitForTimeout` is reserved for motion settling (sheet morph, hold-to-drag threshold), not for I/O.

**Error Testing:**

```javascript
assert.throws(
  () => normalizeEventInput({ title: " ", date: "2026-08-09", start: 540, dur: 60 }),
  CalendarValidationError,
);

assert.throws(
  () => normalizeEventInput({ /* yearly repeat */ }),
  (error) => error instanceof CalendarValidationError
    && error.issues.some((issue) => issue.field === "repeat.freq"),
);

assert.throws(() => parseQuickAdd("x", {}), TypeError);
```

**Immutability and purity:**

```javascript
assert.deepEqual(input.alerts, [30, 5, 30]);          // normalizer did not sort in place
assert.deepEqual(on("Lunch Tue 1pm"), on("Lunch Tue 1pm"));  // parser is deterministic
assert.equal(result.state.tasks, before.tasks);       // calendar command leaves foreign keys intact
```

**Equivalence for optimisations:**
When replacing a slow correct path, do not assert the new numbers. Assert the new path equals a separately implemented reference across many generated cases (`src/domains/calendar/tests/recurrenceEquivalence.test.js`, `src/features/planner/monthBatching.test.js`). Use a seeded PRNG so a failure is reproducible. If they disagree, trust the test file, not the optimisation.

**Clock discipline:**
- Unit tests pass `todayDate` / `now` as literals (`"2026-08-09"`, `"2026-08-09T10:00"`).
- E2E specs that need "today" call `keyOf(new Date())` at the start of the test or fixture, then thread that key through `createTask` / locators. Do not hard-code a calendar day in a spec that runs against the live clock.

**Where a new test goes:**

| If you added… | Write… |
| --- | --- |
| A domain command / query / migration | `src/domains/<domain>/tests/<area>.test.js` and export the symbol from `index.js` first |
| A feature parser, projection, or gesture helper | `<module>.test.js` beside the source |
| A persistence / preferences / diagnostics change | colocated `*.test.js` under `src/platform/` |
| Layout, motion, focus, hit-testing, or localStorage survival | `tests/e2e/<surface>.spec.js` using `helpers.js` |
| A theme or type-scale token | extend `src/design/contrast.test.js` and the e2e typography spec |

Do not test `Planner.jsx` internals. Drive the exported function or the rendered surface.

**E2E helpers to reuse** (`tests/e2e/helpers.js`):
- `openPlanner(page, { keepSample, showGestureHint })` — clean origin, dismiss first-run.
- `seedPlanner(page, state)` — valid-by-construction notebook.
- `palette(page, text)` / `quickAdd(page, line)` — capture path.
- `storedState` / `storedRecord` / `expectStored` / `settledState` — persistence.
- `pressHoldAndDrag` — week/day drag; a plain `dragTo` will not lift a card.
- `hitTarget` / `isContainedBy` / `cancelCurrentPointer` — interaction contracts.

**CI behavior** (`playwright.config.js`):
- `forbidOnly: !!process.env.CI`
- `retries: process.env.CI ? 1 : 0`
- `reuseExistingServer: !process.env.CI`
- Reporter: list locally; list + HTML (`open: "never"`) on CI

No GitHub Actions workflow is in the repo. Treat `npm run test:all` as the gate.

---

*Testing analysis: 2026-08-13*
