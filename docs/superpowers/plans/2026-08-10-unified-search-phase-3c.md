# Unified Search and Deep Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver a pure, offline unified search and deep-link boundary for Calendar, Tasks, and Notes, then adopt it in the existing Search sheet.

**Architecture:** `domains/search` parses and ranks transient projections from canonical planner state; it owns neither source records nor browser storage. Calendar and Tasks own the occurrence queries needed to resolve series targets. `features/search` adapts the output for the existing UI, while `Planner.jsx` applies the returned target through its current navigation and inspection state.

**Tech Stack:** React 19, JavaScript ES modules, Node 24 built-in test runner, Vite 7, existing Calendar/Tasks/Notes public query APIs.

## Global Constraints

- Preserve schema-v7 compatibility; search results and indexes are never persisted.
- Do not introduce provider APIs, remote search, analytics, or a command palette.
- Keep canonical occurrence identity and recurrence expansion in Calendar and Tasks.
- Treat archived tasks and notes as excluded unless a future explicit filter changes that policy.
- Implement behavior test-first; every task runs its focused Node test before the next task.
- Before publishing directly to `main`, run `npm test && npm run build && git diff --check`.

---

### Task 1: Parse and normalize a search query

**Files:**
- Create: `src/domains/search/query/searchQuery.js`
- Create: `src/domains/search/query/searchQuery.test.js`
- Create: `src/domains/search/index.js`

**Interfaces:**
- `normalizeSearchText(value)` returns lower-case NFKD text with combining marks and punctuation collapsed to single spaces.
- `parseSearchQuery(raw)` returns `{ text, terms, filters, issues }`; `filters` contains arrays named `types`, `statuses`, `tags`, `dates`, `lists`, and `calendars`.
- Supported literal filter names are `type`, `status`, `tag`, `date`, `list`, and `calendar`. An unsupported `name:value` token goes into `issues` and not into `terms`.

- [x] **Step 1: Write the failing parser tests**

```js
test("normalizes diacritics and punctuation while preserving quoted phrases", () => {
  const query = parseSearchQuery('Café—plan "next step" type:task tag:Client');
  assert.deepEqual(query.terms, ["cafe", "plan", "next step"]);
  assert.deepEqual(query.filters.types, ["task"]);
  assert.deepEqual(query.filters.tags, ["client"]);
});

test("records an unsupported filter without treating it as free text", () => {
  const query = parseSearchQuery("roadmap owner:me");
  assert.deepEqual(query.terms, ["roadmap"]);
  assert.deepEqual(query.issues, [{ token: "owner:me", reason: "unsupported-filter" }]);
});
```

- [x] **Step 2: Verify focused tests fail**

Run: `node --test src/domains/search/query/searchQuery.test.js`

Expected: FAIL because the Search domain parser does not exist.

- [x] **Step 3: Write the minimal parser**

```js
export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKD")
    .replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().toLocaleLowerCase();
}

export function parseSearchQuery(raw) {
  // Tokenize quoted phrases before normalizing, classify supported name:value
  // pairs, and return non-empty normalized terms and filter arrays.
}
```

- [x] **Step 4: Verify focused tests pass**

Run: `node --test src/domains/search/query/searchQuery.test.js`

Expected: PASS.

- [x] **Step 5: Commit the parser boundary**

```bash
git add src/domains/search/query/searchQuery.js src/domains/search/query/searchQuery.test.js src/domains/search/index.js
git commit -m "feat: add planner search query parser"
```

### Task 2: Add source-owned next-occurrence queries

**Files:**
- Modify: `src/domains/calendar/queries/occurrenceQueries.js`
- Modify: `src/domains/calendar/index.js`
- Modify: `src/domains/calendar/tests/occurrenceQueries.test.js`
- Modify: `src/domains/tasks/queries/dayView.js`
- Modify: `src/domains/tasks/index.js`
- Modify: `src/domains/tasks/tests/recurrence.test.js`

**Interfaces:**
- `getNextEventOccurrence(state, eventId, fromDate, options?)` returns the first current/future canonical occurrence for one event series, including moved exceptions, or `null`.
- `getNextTaskOccurrence(state, taskId, fromDate, { maxDays = 10958 }?)` returns a canonical one-off task or materialized task occurrence, or `null`.
- Neither function changes source state, materializes future records into state, or constructs identities in React.

- [x] **Step 1: Write failing source-query tests**

```js
test("finds a moved recurring event by its actual future date", () => {
  const occurrence = getNextEventOccurrence(state, "series", "2026-08-10");
  assert.equal(occurrence.id, movedOccurrenceId);
  assert.equal(occurrence.timing.startLocal, "2026-08-12T11:00");
});

test("finds the next recurring task instance with its canonical identity", () => {
  const occurrence = getNextTaskOccurrence(taskState, "habit", "2026-08-10");
  assert.equal(occurrence.id, "habit@2026-08-10");
  assert.equal(occurrence.occurrenceDate, "2026-08-11");
});
```

- [x] **Step 2: Verify focused tests fail**

Run: `node --test src/domains/calendar/tests/occurrenceQueries.test.js src/domains/tasks/tests/recurrence.test.js`

Expected: FAIL because neither public next-occurrence query exists.

- [x] **Step 3: Implement bounded source queries**

```js
export function getNextEventOccurrence(state, eventId, fromDate) {
  for (let start = fromDate, year = 0; year <= 30; year += 1) {
    const endExclusive = addDaysToKey(start, 366);
    const found = getOccurrencesForRange(state, start, endExclusive)
      .find((item) => (item.seriesId || item.id) === eventId);
    if (found) return found;
    start = endExclusive;
  }
  return null;
}
```

For tasks, return a one-off task only when it is active and planned on/after `fromDate`; for a recurring series, loop by day at most `maxDays`, use `occursOn` and `materializeOccurrence`, and skip cancelled or completed instances.

- [x] **Step 4: Verify focused tests pass**

Run: `node --test src/domains/calendar/tests/occurrenceQueries.test.js src/domains/tasks/tests/recurrence.test.js`

Expected: PASS.

- [x] **Step 5: Commit source-owned deep-link queries**

```bash
git add src/domains/calendar/queries/occurrenceQueries.js src/domains/calendar/index.js src/domains/calendar/tests/occurrenceQueries.test.js src/domains/tasks/queries/dayView.js src/domains/tasks/index.js src/domains/tasks/tests/recurrence.test.js
git commit -m "feat: add source-owned next occurrence queries"
```

### Task 3: Compose and rank searchable projections

**Files:**
- Create: `src/domains/search/queries/searchPlanner.js`
- Create: `src/domains/search/queries/searchPlanner.test.js`
- Modify: `src/domains/search/index.js`

**Interfaces:**
- `searchPlanner(state, { query, todayDate, limit = 30 })` returns `{ query, results }`.
- Each result has `{ id, kind, title, excerpt, date, status, tags, target, match }`; `target` carries only canonical entity identity and an optional preferred date.
- Event fields are title, description/note, location/place, category, and calendar ID. Task fields are title, note, category, tags, checklist text, status, list ID, planned/deadline/follow-up dates. Note fields are title, plain block text, tags, kind, date, and links.
- Archive exclusion, text match, typed filters, deterministic rank, and `limit` happen only in this pure query.

- [x] **Step 1: Write failing composition tests**

```js
test("searches all domains with accent-insensitive deterministic ranking", () => {
  const found = searchPlanner(fixture, { query: "cafe plan", todayDate: "2026-08-10" }).results;
  assert.deepEqual(found.map((item) => [item.kind, item.id]), [
    ["task", "task-title"], ["note", "note-body"], ["event", "event-place"],
  ]);
});

test("applies type status tag date list and calendar filters to owning records", () => {
  const found = searchPlanner(fixture, {
    query: "type:task status:open tag:client date:2026-08-10 list:list-work",
    todayDate: "2026-08-10",
  }).results;
  assert.deepEqual(found.map((item) => item.id), ["task-title"]);
});

test("omits archived tasks and notes by default", () => {
  const found = searchPlanner(fixture, { query: "archive", todayDate: "2026-08-10" }).results;
  assert.deepEqual(found, []);
});
```

- [x] **Step 2: Verify focused tests fail**

Run: `node --test src/domains/search/queries/searchPlanner.test.js`

Expected: FAIL because the composition query does not exist.

- [x] **Step 3: Implement projections, matching, filters, and rank**

```js
export function searchPlanner(state, { query, todayDate, limit = 30 } = {}) {
  const parsed = parseSearchQuery(query);
  const candidates = [
    ...projectEvents(state.events ?? []),
    ...projectTasks(state.tasks ?? []),
    ...projectNotes(state.notes ?? []),
  ];
  return {
    query: parsed,
    results: candidates.filter(matches(parsed))
      .sort(compareSearchResults(todayDate)).slice(0, limit),
  };
}
```

A `matches` implementation requires every parsed term and every populated filter to match the candidate's own fields. A `compareSearchResults` implementation compares numeric text tier, absolute date distance from `todayDate`, `kind`, then `id`.

- [x] **Step 4: Verify focused tests pass**

Run: `node --test src/domains/search/queries/searchPlanner.test.js`

Expected: PASS.

- [x] **Step 5: Commit unified composition**

```bash
git add src/domains/search/queries/searchPlanner.js src/domains/search/queries/searchPlanner.test.js src/domains/search/index.js
git commit -m "feat: compose unified planner search"
```

### Task 4: Resolve a selected search result

**Files:**
- Create: `src/domains/search/queries/resolveSearchTarget.js`
- Create: `src/domains/search/queries/resolveSearchTarget.test.js`
- Modify: `src/domains/search/index.js`

**Interfaces:**
- `resolveSearchTarget(state, result, { todayDate })` returns an available or unavailable source target.
- A recurring event uses `getNextEventOccurrence`; a recurring task uses `getNextTaskOccurrence`; a note must still be active; one-off records use their canonical entity ID.
- Unavailable outcomes use one of `missing`, `archived`, or `no-upcoming-occurrence`.

- [x] **Step 1: Write failing resolver tests**

```js
test("opens a moved recurring event at its actual occurrence date", () => {
  const target = resolveSearchTarget(state, eventResult, { todayDate: "2026-08-10" });
  assert.equal(target.status, "available");
  assert.equal(target.occurrenceId, movedOccurrenceId);
  assert.equal(target.date, "2026-08-12");
});

test("opens the next recurring task occurrence without UI-built identity", () => {
  const target = resolveSearchTarget(state, taskResult, { todayDate: "2026-08-10" });
  assert.deepEqual(target, {
    status: "available", kind: "task", entityId: "habit",
    occurrenceId: "habit@2026-08-10", date: "2026-08-11",
  });
});

test("reports an archived note selected from stale UI state", () => {
  assert.deepEqual(resolveSearchTarget(state, noteResult, { todayDate: "2026-08-10" }), {
    status: "unavailable", kind: "note", entityId: "archived", reason: "archived",
  });
});
```

- [x] **Step 2: Verify focused tests fail**

Run: `node --test src/domains/search/queries/resolveSearchTarget.test.js`

Expected: FAIL because the resolver does not exist.

- [x] **Step 3: Implement the resolver**

```js
export function resolveSearchTarget(state, result, { todayDate } = {}) {
  // Find the canonical record by result.kind and result.target.entityId.
  // Use the source-owned next-occurrence query for recurring records.
  // Return one explicit unavailable object for a stale or unavailable target.
}
```

- [x] **Step 4: Verify focused tests pass**

Run: `node --test src/domains/search/queries/resolveSearchTarget.test.js`

Expected: PASS.

- [x] **Step 5: Commit deep-link resolution**

```bash
git add src/domains/search/queries/resolveSearchTarget.js src/domains/search/queries/resolveSearchTarget.test.js src/domains/search/index.js
git commit -m "feat: resolve planner search deep links"
```

### Task 5: Adopt search at the feature and UI seam

**Files:**
- Modify: `src/features/search/searchProjection.js`
- Modify: `src/features/search/searchProjection.test.js`
- Modify: `src/Planner.jsx`

**Interfaces:**
- `projectPlannerSearch(state, context)` delegates to `searchPlanner` and returns display-safe results only.
- `resolvePlannerSearchPick(state, result, context)` delegates to `resolveSearchTarget` and returns `{ status, inspect, date, reason? }`.
- `SearchPanel` receives `results`, `queryIssues`, and a query-change callback; it never reads raw event, task, or note collections.
- `Planner.jsx` remains the owner of `jumpTo`, sheet close/open ordering, and user-visible unavailable feedback.

- [x] **Step 1: Write failing feature-adapter tests**

```js
test("projects filterable display-safe results without note blocks", () => {
  const projection = projectPlannerSearch(state, {
    query: "type:note roadmap", todayDate: "2026-08-10",
  });
  assert.deepEqual(projection.results.map((item) => item.kind), ["note"]);
  assert.equal("blocks" in projection.results[0], false);
});

test("maps a recurring target to the inspection contract", () => {
  const pick = resolvePlannerSearchPick(state, result, { todayDate: "2026-08-10" });
  assert.deepEqual(pick, {
    status: "available", inspect: { kind: "task", id: "habit@2026-08-10" },
    date: "2026-08-11",
  });
});
```

- [x] **Step 2: Verify focused tests fail**

Run: `node --test src/features/search/searchProjection.test.js`

Expected: FAIL because the new adapter exports do not exist.

- [x] **Step 3: Implement adapter and UI adoption**

Replace the `SearchPanel` local `db.events.filter`, `db.tasks.filter`, and `searchNotes` composition with a memoized feature projection. On a selected result, close Search, resolve exactly once against the current `db`, call `jumpTo(pick.date)` when available, then open `setNoteEdit` for notes or `setInspect(pick.inspect)` for Calendar/Task records. Render a plain unavailable message when a stale result cannot resolve.

- [x] **Step 4: Verify focused tests and build pass**

Run: `node --test src/features/search/searchProjection.test.js && npm run build`

Expected: PASS and Vite exits 0.

- [x] **Step 5: Commit UI adoption**

```bash
git add src/features/search/searchProjection.js src/features/search/searchProjection.test.js src/Planner.jsx
git commit -m "feat: adopt unified planner search"
```

### Task 6: Document, verify, and publish Phase 3C

**Files:**
- Modify: `docs/product/planner-foundation.md`
- Modify: `docs/README.md`
- Create: `docs/qa/2026-08-10-unified-search-phase-3c.md`
- Modify: `docs/superpowers/plans/2026-08-10-shared-planner-foundation.md`
- Modify: `docs/superpowers/plans/2026-08-10-unified-search-phase-3c.md`

**Interfaces:**
- The delivery record states that search and deep links are derived/offline, unsupported filters are explicit, and command palette/indexing remain deferred.

- [x] **Step 1: Record coverage**

Document exact focused-test count, complete-suite count, production build result, and the browser/device result or blocker. Include event, task, note, quoted query, filters, recurrence, keyboard, and unavailable-target flows.

- [x] **Step 2: Run the final verification gate**

Run: `npm test && npm run build && git diff --check`

Expected: all tests pass, Vite exits 0, and no whitespace errors appear.

- [x] **Step 3: Commit and publish directly to main**

```bash
git add docs/product/planner-foundation.md docs/README.md docs/qa/2026-08-10-unified-search-phase-3c.md docs/superpowers/plans/2026-08-10-shared-planner-foundation.md docs/superpowers/plans/2026-08-10-unified-search-phase-3c.md
git commit -m "docs: record unified search delivery"
git push origin main
```

Expected: a non-forced fast-forward makes the verified commit visible on `main`.

## Plan self-review

- The plan covers Phase 3C normalization, quotes, current filters, deterministic ranking, source-owned recurrence resolution, UI adoption, documentation, and verification.
- It deliberately excludes commands, persistence, providers, and background indexing; those belong to later Planner slices or integration work.
- Every production behavior has a focused executable test before implementation, and all interfaces used by later tasks are introduced by an earlier task.
