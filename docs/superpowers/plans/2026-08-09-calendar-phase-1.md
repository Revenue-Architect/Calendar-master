# Calendar Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the prototype's current Calendar behavior into tested domain commands, queries, recurrence, layout, validation, and shared time modules while preserving its frontend experience and stored data.

**Architecture:** Keep the existing React screen operational while moving Calendar rules behind a public `domains/calendar` API. Domain functions are immutable and browser-independent; the React component supplies IDs and effects, and the current persisted `{ events, overrides }` shape remains compatible during Phase 1.

**Tech Stack:** React 19, JavaScript ES modules, Vite 7, Node 24 built-in test runner.

## Global Constraints

- Work directly on `main` because the user explicitly requested it.
- Do not add provider integration, account sync, or provider-shaped canonical data.
- Do not redesign or polish the frontend in this phase.
- Preserve compatibility with `nbmp:state:v4` local data.
- Production Calendar code must be browser-independent and tested through public behavior.
- Use a failing test before each production behavior is introduced.

## File map

- `src/shared/time/dateKey.js`: Date-only validation, parsing, formatting, arithmetic, and comparison.
- `src/domains/calendar/model/event.js`: Event input normalization, invariants, and validation errors.
- `src/domains/calendar/recurrence/recurrence.js`: Recurrence matching, stable occurrence identity, and exception expansion.
- `src/domains/calendar/queries/calendarQueries.js`: Day, range, density, and next-event projections.
- `src/domains/calendar/commands/calendarCommands.js`: Immutable create, update, move, resize, delete, and restore transitions.
- `src/domains/calendar/layout/packEventLanes.js`: Deterministic collision clusters and lanes.
- `src/domains/calendar/index.js`: Public Calendar API.
- `src/domains/calendar/tests/*.test.js`: Domain behavior tests.
- `src/shared/time/dateKey.test.js`: Date arithmetic tests.
- `src/Planner.jsx`: Adopt the Calendar public API for current event behavior.
- `package.json`: Add Node's built-in test command.
- `README.md`: Explain the new module boundary and test command.

---

### Task 1: Shared date-only primitives

**Files:**
- Create: `src/shared/time/dateKey.js`
- Create: `src/shared/time/dateKey.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `isDateKey(value): boolean`
- Produces: `assertDateKey(value, fieldName?): string`
- Produces: `keyOf(date): string`
- Produces: `parseKey(dateKey): Date`
- Produces: `addDays(dateOrKey, amount): Date`
- Produces: `addDaysToKey(dateKey, amount): string`
- Produces: `diffDays(leftDateKey, rightDateKey): number`

- [ ] **Step 1: Add the built-in test script and failing date tests**

```js
test("addDaysToKey crosses a DST boundary without skipping a date", () => {
  assert.equal(addDaysToKey("2026-03-07", 1), "2026-03-08");
  assert.equal(addDaysToKey("2026-03-08", 1), "2026-03-09");
});

test("diffDays compares calendar dates rather than elapsed local hours", () => {
  assert.equal(diffDays("2026-03-09", "2026-03-07"), 2);
});

test("assertDateKey rejects impossible dates", () => {
  assert.throws(() => assertDateKey("2026-02-30"), /valid date key/);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/shared/time/dateKey.test.js`

Expected: FAIL because `dateKey.js` does not exist.

- [ ] **Step 3: Implement UTC-backed date-only arithmetic with local parsing for UI dates**

```js
export function diffDays(left, right) {
  const a = dateKeyParts(assertDateKey(left));
  const b = dateKeyParts(assertDateKey(right));
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000);
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/shared/time/dateKey.test.js`

Expected: all date-key tests pass.

---

### Task 2: Recurrence, queries, and overlap layout

**Files:**
- Create: `src/domains/calendar/recurrence/recurrence.js`
- Create: `src/domains/calendar/queries/calendarQueries.js`
- Create: `src/domains/calendar/layout/packEventLanes.js`
- Create: `src/domains/calendar/tests/recurrence.test.js`
- Create: `src/domains/calendar/tests/queries.test.js`
- Create: `src/domains/calendar/tests/layout.test.js`

**Interfaces:**
- Consumes: date-key functions from Task 1.
- Produces: `makeOccurrenceId(seriesId, recurrenceDate): string`
- Produces: `splitOccurrenceId(id): { seriesId: string, recurrenceDate: string | null }`
- Produces: `occursOn(event, dateKey): boolean`
- Produces: `expandEventOnDay(event, dateKey, overrides?): EventOccurrence[]`
- Produces: `getEventsForDay(events, dateKey, overrides?): EventOccurrence[]`
- Produces: `getEventsForRange(events, startDate, endDate, overrides?): EventOccurrence[]`
- Produces: `getCalendarDensity(events, dateKey, overrides?): number`
- Produces: `getNextEvent(events, dateKey, minute, overrides?): EventOccurrence | null`
- Produces: `packEventLanes(events): PackedEvent[]`

- [ ] **Step 1: Write failing recurrence tests**

```js
test("weekly recurrence keeps a stable occurrence ID and applies one exception", () => {
  const event = { id: "series-1", date: "2026-08-03", title: "Standup", start: 540, dur: 30, repeat: { freq: "weekly", interval: 1, byDay: [1, 3] } };
  const overrides = { "series-1@2026-08-05": { start: 600, title: "Late standup" } };
  assert.deepEqual(getEventsForDay([event], "2026-08-05", overrides), [{ ...event, ...overrides["series-1@2026-08-05"], id: "series-1@2026-08-05", seriesId: "series-1", recurrenceDate: "2026-08-05", date: "2026-08-05", instance: true }]);
});

test("a deleted exception suppresses only its occurrence", () => {
  const event = dailyEvent();
  assert.equal(getEventsForDay([event], "2026-08-10", { "daily@2026-08-10": { deleted: true } }).length, 0);
  assert.equal(getEventsForDay([event], "2026-08-11", { "daily@2026-08-10": { deleted: true } }).length, 1);
});
```

- [ ] **Step 2: Verify recurrence RED**

Run: `npm test -- src/domains/calendar/tests/recurrence.test.js`

Expected: FAIL because recurrence modules do not exist.

- [ ] **Step 3: Implement stable identity and current daily, weekly, and monthly rules**

The implementation rejects malformed occurrence IDs, respects recurrence start and `until`, defaults weekly weekdays to the series start weekday, and does not mutate source events or overrides.

- [ ] **Step 4: Verify recurrence GREEN**

Run: `npm test -- src/domains/calendar/tests/recurrence.test.js`

Expected: recurrence tests pass.

- [ ] **Step 5: Write failing query and layout tests**

```js
test("range queries return chronological occurrences with stable IDs", () => {
  const result = getEventsForRange([dailyEvent()], "2026-08-09", "2026-08-11");
  assert.deepEqual(result.map((event) => event.id), ["daily@2026-08-09", "daily@2026-08-10", "daily@2026-08-11"]);
});

test("separate collision clusters do not inherit each other's lane count", () => {
  const packed = packEventLanes([
    { id: "a", start: 540, dur: 60 },
    { id: "b", start: 570, dur: 60 },
    { id: "c", start: 720, dur: 30 },
  ]);
  assert.deepEqual(packed.map(({ id, lane, cols }) => ({ id, lane, cols })), [
    { id: "a", lane: 0, cols: 2 },
    { id: "b", lane: 1, cols: 2 },
    { id: "c", lane: 0, cols: 1 },
  ]);
});
```

- [ ] **Step 6: Verify query/layout RED**

Run: `npm test -- src/domains/calendar/tests/queries.test.js src/domains/calendar/tests/layout.test.js`

Expected: FAIL because query and layout modules do not exist.

- [ ] **Step 7: Implement queries and deterministic layout**

Queries validate date boundaries, return new arrays, and sort by date, all-day status, start minute, and stable ID. Layout assigns lanes only within overlapping clusters.

- [ ] **Step 8: Verify query/layout GREEN**

Run: `npm test -- src/domains/calendar/tests/queries.test.js src/domains/calendar/tests/layout.test.js`

Expected: query and layout tests pass.

---

### Task 3: Event validation and immutable commands

**Files:**
- Create: `src/domains/calendar/model/event.js`
- Create: `src/domains/calendar/commands/calendarCommands.js`
- Create: `src/domains/calendar/tests/event.test.js`
- Create: `src/domains/calendar/tests/commands.test.js`

**Interfaces:**
- Consumes: date-key and recurrence identity functions.
- Produces: `CalendarValidationError extends Error` with `issues`.
- Produces: `normalizeEventInput(input): EventInput`
- Produces: `createEvent(state, input, options): CalendarCommandResult`
- Produces: `updateEvent(state, eventId, patch, options?): CalendarCommandResult`
- Produces: `moveEvent(state, eventId, target, options?): CalendarCommandResult`
- Produces: `resizeEvent(state, eventId, duration, options?): CalendarCommandResult`
- Produces: `deleteEvent(state, eventId, options?): CalendarCommandResult`
- Produces: `restoreEvent(state, snapshot): CalendarCommandResult`

`CalendarCommandResult` is `{ state, event, removed, domainEvents }`; unused fields are `null`.

- [ ] **Step 1: Write failing validation tests**

```js
test("timed events require a title, valid date, start, and positive in-day duration", () => {
  assert.throws(() => normalizeEventInput({ title: " ", date: "2026-08-09", start: 540, dur: 60 }), CalendarValidationError);
  assert.throws(() => normalizeEventInput({ title: "Meeting", date: "2026-08-09", start: 1430, dur: 30 }), /must end within the day/);
});

test("all-day input normalizes timing and rejects an end before its start", () => {
  assert.deepEqual(normalizeEventInput({ title: "Offsite", date: "2026-08-09", allDay: true, endDate: "2026-08-10" }).start, 0);
  assert.throws(() => normalizeEventInput({ title: "Offsite", date: "2026-08-09", allDay: true, endDate: "2026-08-08" }), /end date/);
});
```

- [ ] **Step 2: Verify validation RED**

Run: `npm test -- src/domains/calendar/tests/event.test.js`

Expected: FAIL because the event model does not exist.

- [ ] **Step 3: Implement structured validation and normalization**

Normalization trims title, clamps no values silently, defaults optional strings and arrays safely, and preserves compatible unknown fields supplied by existing records.

- [ ] **Step 4: Verify validation GREEN**

Run: `npm test -- src/domains/calendar/tests/event.test.js`

Expected: event tests pass.

- [ ] **Step 5: Write failing command tests**

```js
test("createEvent is immutable and emits EventCreated", () => {
  const before = { events: [], overrides: {} };
  const result = createEvent(before, timedInput(), { id: "event-1" });
  assert.equal(before.events.length, 0);
  assert.equal(result.state.events[0].id, "event-1");
  assert.equal(result.domainEvents[0].type, "EventCreated");
});

test("updating one occurrence stores an exception without changing its series", () => {
  const before = stateWithDailyEvent();
  const result = updateEvent(before, "daily@2026-08-10", { start: 600 }, { scope: "occurrence" });
  assert.equal(result.state.events[0].start, 540);
  assert.equal(result.state.overrides["daily@2026-08-10"].start, 600);
});

test("deleting and restoring one occurrence changes only its exception", () => {
  const removed = deleteEvent(stateWithDailyEvent(), "daily@2026-08-10", { scope: "occurrence" });
  assert.equal(removed.state.overrides["daily@2026-08-10"].deleted, true);
  const restored = restoreEvent(removed.state, removed.removed);
  assert.equal(restored.state.overrides["daily@2026-08-10"], undefined);
});
```

- [ ] **Step 6: Verify command RED**

Run: `npm test -- src/domains/calendar/tests/commands.test.js`

Expected: FAIL because command functions do not exist.

- [ ] **Step 7: Implement immutable commands and domain-event envelopes**

Series scope updates the base event; occurrence scope writes an exception. Move and resize delegate to update semantics. Delete returns an exact snapshot suitable for undo, and restore replays that snapshot without regenerating identity.

- [ ] **Step 8: Verify command GREEN**

Run: `npm test -- src/domains/calendar/tests/commands.test.js`

Expected: command tests pass.

---

### Task 4: Public API and React adoption

**Files:**
- Create: `src/domains/calendar/index.js`
- Modify: `src/Planner.jsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: all Calendar interfaces from Tasks 1-3.
- Produces: one stable import boundary for React and later application workflows.

- [ ] **Step 1: Add public exports and switch Calendar reads first**

Replace event recurrence expansion with `getEventsForDay`, event density with `getCalendarDensity`, next-event projections where compatible, and overlap layout with `packEventLanes`. Keep Tasks on its current temporary recurrence path.

- [ ] **Step 2: Run focused tests and build**

Run: `npm test && npm run build`

Expected: all tests pass and Vite builds.

- [ ] **Step 3: Switch Calendar writes to commands**

Route event creation, series or occurrence update, move, resize, duplicate, deletion, and occurrence undo through Calendar commands. Keep sound, haptics, dialogs, and undo toast state in React.

- [ ] **Step 4: Remove Calendar rules superseded in `Planner.jsx`**

Delete local event recurrence matching, event expansion, occurrence-ID parsing for event paths, and event overlap packing. Retain temporary equivalents only where Tasks still depends on them.

- [ ] **Step 5: Document the boundary**

Update README layout and testing instructions. State that `Planner.jsx` still owns presentation and temporary Task/Note orchestration while Calendar Phase 1 lives under `src/domains/calendar`.

- [ ] **Step 6: Verify complete behavior**

Run: `npm test && npm run build && git diff --check`

Expected: all tests pass, production build exits zero, and no whitespace errors exist.

---

### Task 5: Requirements and diff review

**Files:**
- Review: `docs/product/planner-foundation.md`
- Review: all changed implementation and test files

**Interfaces:**
- Consumes: Phase 1 Included and Explicitly deferred lists.
- Produces: verified implementation ready for one intentional commit to `main`.

- [ ] **Step 1: Check Phase 1 coverage line by line**

Confirm tests or React adoption cover date arithmetic, validation, recurrence identity, occurrence exceptions, series updates/deletion, move/resize, queries, layout, storage compatibility, and build verification.

- [ ] **Step 2: Scan for placeholders and forbidden coupling**

Run: `rg -n "TBD|TODO|FIXME|window\.|localStorage|storage" src/domains/calendar src/shared/time docs/superpowers/plans/2026-08-09-calendar-phase-1.md`

Expected: no placeholders and no browser or persistence coupling in domain/shared production code.

- [ ] **Step 3: Review the exact diff and status**

Run: `git diff --check && git status -sb && git diff --stat && git diff -- src/Planner.jsx src/domains src/shared package.json README.md docs`

- [ ] **Step 4: Run final fresh verification**

Run: `npm test && npm run build`

Expected: zero test failures and successful production bundle.

- [ ] **Step 5: Commit intentionally on main**

```bash
git add README.md package.json src/Planner.jsx src/domains src/shared docs
git commit -m "feat: establish calendar domain foundation"
```

- [ ] **Step 6: Push the requested branch**

Run: `git push origin main`

Expected: remote `main` advances to the new commit. If authentication or GitHub App permissions block the push, preserve the local commit and report the exact blocker without claiming remote success.
