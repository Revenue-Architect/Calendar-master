# Calendar Phase 2A Canonical Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy Calendar date/minute fields with a canonical v5 all-day, floating-time, and zoned-time model supporting DST, cross-midnight events, multi-day events, segmentation, and immediate validated migration.

**Architecture:** Shared time modules own parsing, timezone resolution, interval arithmetic, and viewer projection. Calendar owns timing invariants, commands, and display segmentation. Persistence migrates complete planner state from v4 to v5 once, while React consumes only Calendar commands and projections.

**Tech Stack:** React 19, JavaScript ES modules, Node 24 built-in test runner, Vite 7, platform `Intl` APIs.

## Global Constraints

- Work directly on `main` because the user explicitly requested it.
- Do not add Google or Microsoft integration behavior.
- Do not visually redesign the frontend.
- Use `schemaVersion: 5` and `nbmp:state:v5`.
- Do not remove v4 until a complete v5 write is confirmed readable.
- Do not dual-write v4 and v5.
- Calendar and shared-time production modules cannot import React or browser storage.
- Tasks retain their current timing representation.
- Use a failing behavioral test before every production behavior.

## File map

- `src/shared/time/localDateTime.js`: strict local date-time parsing and arithmetic.
- `src/shared/time/timezone.js`: IANA validation, offset candidates, instant resolution, and viewer projection.
- `src/shared/time/interval.js`: half-open interval validation and intersection.
- `src/domains/calendar/model/timing.js`: canonical all-day and timed timing validation.
- `src/domains/calendar/segmentation/segmentOccurrence.js`: per-day display segments.
- `src/domains/calendar/migrations/migrateV4ToV5.js`: complete planner-state migration.
- `src/domains/calendar/migrations/validatePlannerStateV5.js`: migrated-state validation.
- `src/platform/persistence/plannerStateStore.js`: v5-first loading and immediate cutover.
- `src/storage.js`: add removal support to the current storage adapter.
- `src/domains/calendar/model/event.js`: use canonical timing and canonical event metadata.
- `src/domains/calendar/commands/calendarCommands.js`: operate on canonical timing.
- `src/domains/calendar/queries/calendarQueries.js`: query canonical intervals and segments.
- `src/domains/calendar/index.js`: export the Phase 2A public API.
- `src/Planner.jsx`: load v5 state and extend the existing composer.
- `README.md`: document v5 persistence and Phase 2A modules.

---

### Task 1: Strict local date-time and interval primitives

**Files:**
- Create: `src/shared/time/localDateTime.js`
- Create: `src/shared/time/localDateTime.test.js`
- Create: `src/shared/time/interval.js`
- Create: `src/shared/time/interval.test.js`

**Interfaces:**
- Produces: `assertLocalDateTime(value, fieldName?): string`
- Produces: `parseLocalDateTime(value): { dateKey, hour, minute }`
- Produces: `localDateTimeToEpochMinutes(value): number`
- Produces: `epochMinutesToLocalDateTime(value): string`
- Produces: `addMinutesToLocalDateTime(value, minutes): string`
- Produces: `compareLocalDateTimes(left, right): number`
- Produces: `assertHalfOpenInterval(start, end, compare, label?): void`
- Produces: `intersectsHalfOpen(startA, endA, startB, endB, compare): boolean`

- [x] **Step 1: Write failing local date-time tests**

```js
test("strict local date-times reject impossible dates and 24:00", () => {
  assert.throws(() => assertLocalDateTime("2026-02-30T09:00"), /valid local date-time/);
  assert.throws(() => assertLocalDateTime("2026-08-09T24:00"), /valid local date-time/);
});

test("calendar arithmetic crosses midnight and leap day", () => {
  assert.equal(addMinutesToLocalDateTime("2028-02-28T23:30", 90), "2028-02-29T01:00");
});
```

- [x] **Step 2: Run the local date-time test and verify RED**

Run: `npm test -- src/shared/time/localDateTime.test.js`

Expected: FAIL because `localDateTime.js` does not exist.

- [x] **Step 3: Implement strict UTC-backed calendar arithmetic**

Use UTC fields only as an arithmetic container so host timezone and DST cannot
change local calendar values. Reject seconds and malformed values.

- [x] **Step 4: Run the local date-time test and verify GREEN**

Run: `npm test -- src/shared/time/localDateTime.test.js`

Expected: all local date-time tests pass.

- [x] **Step 5: Write failing half-open interval tests**

```js
test("touching half-open intervals do not overlap", () => {
  assert.equal(intersectsHalfOpen(0, 10, 10, 20, numericCompare), false);
  assert.equal(intersectsHalfOpen(0, 11, 10, 20, numericCompare), true);
});
```

- [x] **Step 6: Run interval tests and verify RED**

Run: `npm test -- src/shared/time/interval.test.js`

Expected: FAIL because `interval.js` does not exist.

- [x] **Step 7: Implement interval validation and intersection**

Reject equal or reversed bounds. Compare interval ends exclusively.

- [x] **Step 8: Run interval tests and verify GREEN**

Run: `npm test -- src/shared/time/interval.test.js`

Expected: all interval tests pass.

---

### Task 2: IANA timezone resolution and DST behavior

**Files:**
- Create: `src/shared/time/timezone.js`
- Create: `src/shared/time/timezone.test.js`

**Interfaces:**
- Consumes: `localDateTime.js`.
- Produces: `isTimeZone(value): boolean`
- Produces: `assertTimeZone(value): string`
- Produces: `getOffsetCandidates(localDateTime, timeZone): Array<{ instant, offset }>`
- Produces: `resolveZonedDateTime(localDateTime, timeZone, preferredOffset?): { instant, offset }`
- Produces: `projectInstantToLocal(instant, timeZone): { localDateTime, offset }`
- Produces: `detectLocalTimeStatus(localDateTime, timeZone): "valid" | "ambiguous" | "skipped"`

- [x] **Step 1: Write failing timezone tests with literal Toronto fixtures**

```js
test("Toronto spring-forward local time is skipped", () => {
  assert.equal(detectLocalTimeStatus("2026-03-08T02:30", "America/Toronto"), "skipped");
  assert.throws(() => resolveZonedDateTime("2026-03-08T02:30", "America/Toronto"), /does not exist/);
});

test("Toronto fallback requires one of two explicit offsets", () => {
  assert.equal(detectLocalTimeStatus("2026-11-01T01:30", "America/Toronto"), "ambiguous");
  assert.deepEqual(getOffsetCandidates("2026-11-01T01:30", "America/Toronto").map(x => x.offset), ["-04:00", "-05:00"]);
});
```

- [x] **Step 2: Run timezone tests and verify RED**

Run: `npm test -- src/shared/time/timezone.test.js`

Expected: FAIL because `timezone.js` does not exist.

- [x] **Step 3: Implement resolution through `Intl.DateTimeFormat`**

Search a bounded UTC window around the requested wall time, project candidates
into the requested zone, and retain exact wall-time matches. Zero matches means
skipped; two means ambiguous. Format offsets as `±HH:MM`.

- [x] **Step 4: Run timezone tests and verify GREEN**

Run: `npm test -- src/shared/time/timezone.test.js`

Expected: valid, skipped, ambiguous, and viewer-projection tests pass.

---

### Task 3: Canonical event timing and segmentation

**Files:**
- Create: `src/domains/calendar/model/timing.js`
- Create: `src/domains/calendar/tests/timing.test.js`
- Create: `src/domains/calendar/segmentation/segmentOccurrence.js`
- Create: `src/domains/calendar/tests/segmentation.test.js`

**Interfaces:**
- Consumes: shared local date-time, timezone, date-key, and interval functions.
- Produces: `normalizeTiming(input): CanonicalTiming`
- Produces: `timingStartDate(timing, viewerTimeZone?): string`
- Produces: `timingEndDateExclusive(timing, viewerTimeZone?): string`
- Produces: `timingIntersectsDate(timing, dateKey, viewerTimeZone?): boolean`
- Produces: `segmentOccurrence(occurrence, startDate, endDate, viewerTimeZone?): DisplaySegment[]`

- [x] **Step 1: Write failing timing tests**

```js
test("all-day timing requires an exclusive end after start", () => {
  assert.deepEqual(normalizeTiming({ kind: "all-day", startDate: "2026-08-09", endDateExclusive: "2026-08-10" }), {
    kind: "all-day", startDate: "2026-08-09", endDateExclusive: "2026-08-10"
  });
  assert.throws(() => normalizeTiming({ kind: "all-day", startDate: "2026-08-09", endDateExclusive: "2026-08-09" }), /after start/);
});

test("zoned timing preserves explicit fallback offsets", () => {
  const timing = normalizeTiming({ kind: "timed", timeZoneMode: "zoned", startLocal: "2026-11-01T01:30", endLocal: "2026-11-01T02:30", timeZone: "America/Toronto", startOffset: "-04:00", endOffset: "-05:00" });
  assert.equal(timing.startOffset, "-04:00");
});
```

- [x] **Step 2: Run timing tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/timing.test.js`

Expected: FAIL because `timing.js` does not exist.

- [x] **Step 3: Implement canonical timing validation**

Floating time compares local calendar values. Zoned time resolves both endpoints
to instants and compares instants. Do not silently select an ambiguous offset.

- [x] **Step 4: Run timing tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/timing.test.js`

Expected: all timing tests pass.

- [x] **Step 5: Write failing segmentation tests**

```js
test("a floating overnight occurrence becomes two display segments", () => {
  const segments = segmentOccurrence(overnightOccurrence, "2026-08-09", "2026-08-11", "America/Toronto");
  assert.deepEqual(segments.map(s => [s.date, s.continuesBefore, s.continuesAfter]), [
    ["2026-08-09", false, true],
    ["2026-08-10", true, false]
  ]);
});
```

- [x] **Step 6: Run segmentation tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/segmentation.test.js`

Expected: FAIL because segmentation does not exist.

- [x] **Step 7: Implement all-day, floating, and viewer-zoned segmentation**

Return one immutable segment per intersected viewer date with explicit continuation
flags and minute positions used by the current timeline.

- [x] **Step 8: Run segmentation tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/segmentation.test.js`

Expected: all segmentation tests pass.

---

### Task 4: Complete v4-to-v5 migration and persistence cutover

**Files:**
- Create: `src/domains/calendar/migrations/migrateV4ToV5.js`
- Create: `src/domains/calendar/migrations/validatePlannerStateV5.js`
- Create: `src/domains/calendar/tests/migration.test.js`
- Create: `src/platform/persistence/plannerStateStore.js`
- Create: `src/platform/persistence/plannerStateStore.test.js`
- Modify: `src/storage.js`

**Interfaces:**
- Produces: `migrateV4ToV5(state): PlannerStateV5`
- Produces: `validatePlannerStateV5(state): PlannerStateV5`
- Produces: `loadPlannerState(storagePort): Promise<{ state, migrated }>`
- Produces: `savePlannerState(storagePort, state): Promise<void>`
- Storage port: `{ get(key), set(key, value), remove(key) }`

- [x] **Step 1: Write failing migration tests**

```js
test("v4 inclusive all-day range becomes exclusive v5 timing", () => {
  const migrated = migrateV4ToV5(v4StateWithOffsite);
  assert.deepEqual(migrated.events[0].timing, { kind: "all-day", startDate: "2026-08-11", endDateExclusive: "2026-08-14" });
});

test("v4 timed duration rolls over into the next local day", () => {
  const migrated = migrateV4ToV5(v4StateWithLateEvent);
  assert.deepEqual(migrated.events[0].timing, { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-09T23:30", endLocal: "2026-08-10T01:00" });
});
```

- [x] **Step 2: Run migration tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/migration.test.js`

Expected: FAIL because migration modules do not exist.

- [x] **Step 3: Implement complete immutable migration and v5 validation**

Create `calendar-default`, add every event's `calendarId`, migrate event timing,
initialize `eventExceptions` and `occurrenceAliases`, preserve unrelated state and
compatible unknown fields, and leave Task overrides in `overrides`.

- [x] **Step 4: Run migration tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/migration.test.js`

Expected: migration and invalid-state tests pass.

- [x] **Step 5: Write failing persistence cutover tests with an in-memory real port**

```js
test("confirmed v5 cutover removes v4 only after v5 can be read", async () => {
  const port = memoryStorage({ "nbmp:state:v4": JSON.stringify(v4State) });
  const loaded = await loadPlannerState(port);
  assert.equal(loaded.state.schemaVersion, 5);
  assert.equal(await port.get("nbmp:state:v4"), null);
  assert.ok(await port.get("nbmp:state:v5"));
});

test("failed v5 write leaves v4 untouched", async () => {
  const port = failingV5Storage(v4State);
  await assert.rejects(() => loadPlannerState(port), /persist migrated v5/);
  assert.ok(await port.get("nbmp:state:v4"));
});
```

- [x] **Step 6: Run persistence tests and verify RED**

Run: `npm test -- src/platform/persistence/plannerStateStore.test.js`

Expected: FAIL because the store does not exist.

- [x] **Step 7: Implement v5-first load, confirmed cutover, save, and remove**

Reads never seed over malformed state. A missing v4 and v5 returns `{ state: null,
migrated: false }`. Add `remove` to host/local storage adapters.

- [x] **Step 8: Run persistence tests and verify GREEN**

Run: `npm test -- src/platform/persistence/plannerStateStore.test.js`

Expected: cutover and failure tests pass.

---

### Task 5: Calendar commands and queries adopt canonical timing

**Files:**
- Modify: `src/domains/calendar/model/event.js`
- Modify: `src/domains/calendar/commands/calendarCommands.js`
- Modify: `src/domains/calendar/queries/calendarQueries.js`
- Modify: `src/domains/calendar/recurrence/recurrence.js`
- Modify: `src/domains/calendar/index.js`
- Modify: `src/domains/calendar/tests/event.test.js`
- Modify: `src/domains/calendar/tests/commands.test.js`
- Modify: `src/domains/calendar/tests/queries.test.js`

**Interfaces:**
- Consumes: canonical timing and segmentation.
- Produces: existing command names with canonical event inputs.
- Produces: `getEventSegmentsForDay(events, date, options): DisplaySegment[]`
- Produces: `getEventSegmentsForRange(events, start, end, options): DisplaySegment[]`

- [x] **Step 1: Replace legacy tests with failing canonical command/query tests**

```js
test("moveEvent preserves duration across midnight", () => {
  const result = moveEvent(state, "event-1", { startLocal: "2026-08-10T23:30" });
  assert.equal(result.event.timing.endLocal, "2026-08-11T01:00");
});

test("day queries include an event that started yesterday", () => {
  assert.equal(getEventsForDay([overnightEvent], "2026-08-10").length, 1);
});
```

- [x] **Step 2: Run Calendar tests and verify RED**

Run: `npm test -- src/domains/calendar/tests/event.test.js src/domains/calendar/tests/commands.test.js src/domains/calendar/tests/queries.test.js`

Expected: FAIL because legacy event fields are still required.

- [x] **Step 3: Refactor event normalization, commands, and queries**

Store `timing`, canonical metadata, revision, and `calendarId`. Queries inspect
interval intersection and return canonical occurrences. Event movement accepts a
new canonical start and preserves duration in the event's timing mode.

- [x] **Step 4: Run Calendar tests and verify GREEN**

Run: `npm test -- src/domains/calendar/tests/event.test.js src/domains/calendar/tests/commands.test.js src/domains/calendar/tests/queries.test.js`

Expected: canonical Calendar tests pass.

---

### Task 6: React and current editor adopt v5 timing

**Files:**
- Modify: `src/Planner.jsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: planner state store and Calendar public API.
- Produces: existing timeline/editor behavior backed by v5 timing and segments.

- [x] **Step 1: Replace direct storage load/save with `plannerStateStore`**

Use v5-first load, seed only when both keys are absent, and show the existing
storage warning on migration or persistence failure without replacing valid data.

- [x] **Step 2: Adapt day views, reminders, search, ICS export, inspection, gestures, and duplication**

Read display date/start/duration from Calendar occurrence projections. Keep Task
logic unchanged. Gesture commands submit canonical timing changes.

- [x] **Step 3: Extend `Composer` with canonical timing controls**

Add start/end dates, start/end times, all-day through-date mapping, floating/zoned
mode, timezone selection, ambiguity offset selection, and multi-day summary.

- [x] **Step 4: Run all tests and production build**

Run: `npm test && npm run build`

Expected: all tests pass and Vite builds with no unresolved imports.

- [x] **Step 5: Update README persistence and module documentation**

Document v5 cutover, canonical timing, timezone policy, and migration failure
behavior.

---

### Task 7: Phase 2A completion verification

**Files:**
- Review all Phase 2A files and `docs/superpowers/specs/2026-08-09-calendar-phase-2-design.md`.

- [x] **Step 1: Scan for forbidden coupling and transitional event fields**

Run: `rg -n "window\\.|localStorage|from .*storage" src/domains/calendar src/shared/time && rg -n "event\\.(date|start|dur|endDate)" src/Planner.jsx src/domains/calendar`

Expected: no browser coupling; remaining legacy field matches are Task-specific or migration fixtures.

- [x] **Step 2: Run fresh verification**

Run: `npm test && npm run build && git diff --check`

Expected: zero test failures, successful production bundle, and no whitespace errors.

- [x] **Step 3: Commit Phase 2A**

```bash
git add README.md src docs/superpowers/plans/2026-08-09-calendar-phase-2a-time.md
git commit -m "feat: add canonical calendar time model"
```
