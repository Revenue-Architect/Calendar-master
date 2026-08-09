# Calendar Phase 2B Advanced Recurrence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic advanced recurrence, typed exceptions, all three edit scopes, atomic series splitting, occurrence aliases, and current-editor controls on top of Phase 2A canonical timing.

**Architecture:** Canonical rules generate stable recurrence anchors over finite ranges. Typed exceptions transform generated occurrences without changing anchor identity. Series splitting is one immutable multi-record command that reassigns future exceptions and creates aliases for references.

**Tech Stack:** React 19, JavaScript ES modules, Node 24 built-in test runner, Vite 7, Phase 2A shared-time and Calendar modules.

## Global Constraints

- Phase 2A must be green before this plan starts.
- Work directly on `main` because the user explicitly requested it.
- Do not add provider-specific recurrence payloads.
- Do not add calendar-container or availability UI.
- Generate at most one rule-derived recurrence position per series per local date.
- `count` and `until` are mutually exclusive.
- Range queries must always be finite.
- Preserve stable recurrence anchors when occurrences move.
- Use a failing behavioral test before every production behavior.

## File map

- `src/domains/calendar/model/recurrenceRule.js`: canonical recurrence validation.
- `src/domains/calendar/model/exception.js`: typed exception validation.
- `src/domains/calendar/recurrence/occurrenceIdentity.js`: reversible stable IDs.
- `src/domains/calendar/recurrence/expandRecurrence.js`: finite anchor generation and exception application.
- `src/domains/calendar/recurrence/splitSeries.js`: split calculations and reassignment.
- `src/domains/calendar/commands/occurrenceCommands.js`: modify, move, cancel, add, restore.
- `src/domains/calendar/commands/seriesCommands.js`: recurrence change and atomic splitting.
- `src/domains/calendar/queries/occurrenceQueries.js`: occurrence, preview, exception, alias, and orphan queries.
- `src/domains/calendar/index.js`: public exports.
- `src/Planner.jsx`: recurrence editor and edit-scope adoption.

---

### Task 1: Canonical recurrence rule validation

**Files:**
- Create: `src/domains/calendar/model/recurrenceRule.js`
- Create: `src/domains/calendar/tests/recurrenceRule.test.js`

**Interfaces:**
- Produces: `normalizeRecurrenceRule(input, seriesTiming): RecurrenceRule | null`
- Produces: `describeRecurrenceRule(rule, seriesTiming): string`

- [ ] **Step 1: Write failing rule tests**

```js
test("monthly last weekday and yearly leap-day rules normalize", () => {
  assert.deepEqual(normalizeRecurrenceRule({ frequency: "monthly", interval: 1, byWeekday: [{ weekday: 1, ordinal: -1 }] }, timedTiming), expectedLastMonday);
  assert.equal(normalizeRecurrenceRule({ frequency: "yearly", byMonth: [2], byMonthDay: [29], missingDatePolicy: "skip" }, leapTiming).frequency, "yearly");
});

test("count and until cannot coexist", () => {
  assert.throws(() => normalizeRecurrenceRule({ frequency: "daily", count: 5, until: "2026-12-01" }, timedTiming), /mutually exclusive/);
});
```

- [ ] **Step 2: Run rule tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/recurrenceRule.test.js`

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement rule normalization and readable summaries**

Validate weekdays 0-6, ordinals 1-4 or -1, months 1-12, positive month days
or -1, positive count, inclusive until matching timing precision, interval, and
missing-date policy.

- [ ] **Step 4: Run rule tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/recurrenceRule.test.js`

Expected: rule and summary tests pass.

---

### Task 2: Stable occurrence identity and advanced anchor generation

**Files:**
- Create: `src/domains/calendar/recurrence/occurrenceIdentity.js`
- Create: `src/domains/calendar/recurrence/expandRecurrence.js`
- Replace: `src/domains/calendar/recurrence/recurrence.js`
- Create: `src/domains/calendar/tests/advancedRecurrence.test.js`

**Interfaces:**
- Produces: `makeOccurrenceId(seriesId, anchor): string`
- Produces: `parseOccurrenceId(id): { seriesId, anchor }`
- Produces: `generateRecurrenceAnchors(event, rangeStart, rangeEnd, limit?): string[]`
- Produces: `expandSeries(event, exceptions, range, options?): EventOccurrence[]`

- [ ] **Step 1: Write failing identity and generation tests**

```js
test("occurrence IDs round-trip delimiter characters", () => {
  const id = makeOccurrenceId("series@west", "2026-08-10T09:00");
  assert.deepEqual(parseOccurrenceId(id), { seriesId: "series@west", anchor: "2026-08-10T09:00" });
});

test("last Monday and leap-day skip generate literal expected anchors", () => {
  assert.deepEqual(generateRecurrenceAnchors(lastMondayEvent, "2026-01-01", "2026-04-01"), ["2026-01-26T09:00", "2026-02-23T09:00", "2026-03-30T09:00"]);
  assert.deepEqual(generateRecurrenceAnchors(leapEvent, "2027-01-01", "2029-01-01"), ["2028-02-29"]);
});
```

- [ ] **Step 2: Run advanced recurrence tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/advancedRecurrence.test.js`

Expected: FAIL because identity and generator modules do not exist.

- [ ] **Step 3: Implement base64url component identity and finite generation**

Encode the series ID and anchor separately in a versioned ID. Generate daily,
weekly, monthly, and yearly anchors with interval, weekday, month, month-day,
ordinal, count, until, and missing-date policy. Bound every loop by range and limit.

- [ ] **Step 4: Run advanced recurrence tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/advancedRecurrence.test.js`

Expected: identity, boundaries, month-end, leap, count, until, DST, and determinism tests pass.

---

### Task 3: Typed exceptions and occurrence commands

**Files:**
- Create: `src/domains/calendar/model/exception.js`
- Create: `src/domains/calendar/commands/occurrenceCommands.js`
- Create: `src/domains/calendar/tests/occurrenceCommands.test.js`

**Interfaces:**
- Produces: `normalizeException(input, series): EventException`
- Produces: `modifyOccurrence(state, occurrenceId, patch, options): CommandResult`
- Produces: `moveOccurrence(state, occurrenceId, timing, options): CommandResult`
- Produces: `cancelOccurrence(state, occurrenceId, options): CommandResult`
- Produces: `addOccurrence(state, seriesId, eventInput, options): CommandResult`
- Produces: `restoreOccurrence(state, snapshot): CommandResult`

- [ ] **Step 1: Write failing typed-exception command tests**

```js
test("moving an occurrence changes timing but preserves its recurrence anchor", () => {
  const result = moveOccurrence(state, occurrenceId, movedTiming, { id: "exception-1" });
  assert.equal(result.exception.recurrenceAnchor, originalAnchor);
  assert.equal(result.exception.type, "moved");
});

test("cancel and restore preserve exact prior exception state", () => {
  const cancelled = cancelOccurrence(stateWithModifiedException, occurrenceId, { id: "exception-2" });
  const restored = restoreOccurrence(cancelled.state, cancelled.removed);
  assert.deepEqual(restored.state.eventExceptions, stateWithModifiedException.eventExceptions);
});
```

- [ ] **Step 2: Run occurrence-command tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/occurrenceCommands.test.js`

Expected: FAIL because typed exceptions and commands do not exist.

- [ ] **Step 3: Implement typed exception validation and immutable commands**

Enforce one active generated-anchor exception, immutable added IDs, series
membership, revisions, expected revision conflicts, and exact undo snapshots.

- [ ] **Step 4: Run occurrence-command tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/occurrenceCommands.test.js`

Expected: modify, move, cancel, add, restore, and idempotency tests pass.

---

### Task 4: Atomic series splitting and aliases

**Files:**
- Create: `src/domains/calendar/recurrence/splitSeries.js`
- Create: `src/domains/calendar/commands/seriesCommands.js`
- Create: `src/domains/calendar/tests/splitSeries.test.js`

**Interfaces:**
- Produces: `changeRecurrence(state, seriesId, rule, options): CommandResult`
- Produces: `splitSeries(state, occurrenceId, changes, options): CommandResult`
- Produces: `resolveOccurrenceAlias(aliases, occurrenceId): AliasResolution`

- [ ] **Step 1: Write failing split tests**

```js
test("splitSeries assigns remaining count and future exceptions to a new series", () => {
  const result = splitSeries(countedState, thirdOccurrenceId, { title: "New future" }, { newSeriesId: "series-2" });
  assert.equal(result.state.events.find(e => e.id === "series-1").recurrence.count, 2);
  assert.equal(result.state.events.find(e => e.id === "series-2").recurrence.count, 3);
  assert.equal(result.state.eventExceptions.find(x => x.id === "future-exception").seriesId, "series-2");
});

test("alias resolution rejects cycles", () => {
  assert.deepEqual(resolveOccurrenceAlias([{ from: "a", to: "b" }, { from: "b", to: "a" }], "a"), { status: "cycle", occurrenceId: "a" });
});
```

- [ ] **Step 2: Run split tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/splitSeries.test.js`

Expected: FAIL because split modules do not exist.

- [ ] **Step 3: Implement one atomic split transition**

Validate the anchor, partition count, create the new event, bound the old event,
reassign future exceptions, produce aliases, detect cycles, and return an exact
snapshot. Do not mutate input state when any check fails.

- [ ] **Step 4: Run split tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/splitSeries.test.js`

Expected: date/count splits, exception reassignment, aliases, orphaning, rollback,
and immutability tests pass.

---

### Task 5: Occurrence queries and Calendar public API

**Files:**
- Create: `src/domains/calendar/queries/occurrenceQueries.js`
- Modify: `src/domains/calendar/queries/calendarQueries.js`
- Modify: `src/domains/calendar/index.js`
- Modify: `src/domains/calendar/tests/queries.test.js`
- Create: `src/domains/calendar/tests/occurrenceQueries.test.js`

**Interfaces:**
- Produces: `getOccurrence(state, occurrenceId, options): EventOccurrence | null`
- Produces: `getOccurrencesForRange(state, start, end, options): EventOccurrence[]`
- Produces: `previewRecurrence(event, limit, options): EventOccurrence[]`
- Produces: `getSeriesExceptions(state, seriesId): EventException[]`
- Produces: `getOrphanedExceptions(state, seriesId): EventException[]`

- [ ] **Step 1: Write failing query tests**

```js
test("cancelled generated positions consume count but are absent from results", () => {
  const result = getOccurrencesForRange(cancelledCountedState, "2026-08-01", "2026-08-10");
  assert.deepEqual(result.map(x => x.recurrenceAnchor), ["2026-08-01T09:00", "2026-08-03T09:00"]);
});

test("added occurrences do not consume count", () => {
  assert.equal(getOccurrencesForRange(stateWithAdded, rangeStart, rangeEnd).length, generatedCount + 1);
});
```

- [ ] **Step 2: Run occurrence-query tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/occurrenceQueries.test.js`

Expected: FAIL because occurrence queries do not exist.

- [ ] **Step 3: Implement exception-aware bounded queries and orphan detection**

Expand finite ranges, apply typed exceptions, resolve aliases, exclude orphaned
records by default, project time, segment only when the caller requests display
segments, and sort by start then identity.

- [ ] **Step 4: Run occurrence-query tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/occurrenceQueries.test.js src/domains/calendar/tests/queries.test.js`

Expected: all occurrence and Calendar query tests pass.

---

### Task 6: Existing recurrence editor and edit scopes

**Files:**
- Modify: `src/Planner.jsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: recurrence normalizer, preview query, occurrence commands, and split command through Calendar public API.

- [ ] **Step 1: Replace legacy repeat controls with canonical recurrence draft state**

Support once, daily, weekly, monthly, yearly, interval, weekdays, monthly pattern,
yearly month/pattern, never/until/count, and missing-date policy.

- [ ] **Step 2: Add next-five preview and readable summary**

Preview from the unsaved canonical draft. Invalid rules show structured validation
without mutating canonical state.

- [ ] **Step 3: Extend recurring edit/delete scope controls**

Map this occurrence to typed exception commands, this and following to
`splitSeries`, and entire series to series commands. Use returned snapshots for
undo rather than direct override mutation.

- [ ] **Step 4: Remove Calendar use of legacy `overrides` and `repeat` arithmetic**

Task recurrence may retain its legacy temporary functions. Calendar reads only
`event.recurrence`, `eventExceptions`, and `occurrenceAliases`.

- [ ] **Step 5: Run all tests and production build**

Run: `npm test && npm run build`

Expected: all tests pass and Vite builds.

---

### Task 7: Phase 2B completion, documentation, and publication

**Files:**
- Modify: `docs/product/planner-foundation.md`
- Modify: `README.md`
- Review all Phase 2 files.

- [ ] **Step 1: Update implementation status and actual test count**

Mark Phase 2A and 2B complete only after verification. Keep later Phase 2
subprojects explicitly deferred.

- [ ] **Step 2: Run requirement and coupling scans**

Run: `rg -n "TBD|TODO|FIXME" docs src/domains/calendar src/shared/time || true && rg -n "window\\.|localStorage|from .*storage" src/domains/calendar src/shared/time || true`

Expected: no placeholders and no browser/persistence coupling in domain/shared code.

- [ ] **Step 3: Run fresh final verification**

Run: `npm test && npm run build && git diff --check`

Expected: zero failures, successful build, and no whitespace errors.

- [ ] **Step 4: Commit Phase 2B**

```bash
git add README.md src docs
git commit -m "feat: add advanced calendar recurrence"
```

- [ ] **Step 5: Push every pending main commit**

Run: `git push origin main`

Expected: `origin/main` advances through all Phase 1, product-foundation, Phase 2
design, Phase 2A, and Phase 2B commits. Never force-push.
