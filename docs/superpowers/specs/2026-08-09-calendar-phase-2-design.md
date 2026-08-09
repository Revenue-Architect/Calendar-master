# Calendar Phase 2A and 2B Design

- **Status:** Approved for implementation
- **Date:** 2026-08-09
- **Scope:** Canonical event time, immediate v5 migration, advanced recurrence,
  typed exceptions, series splitting, and corresponding extensions to the current
  event editor
- **Integration scope:** Google and Microsoft integrations remain deferred
- **Presentation scope:** Extend the existing UI without visual redesign or polish

## Purpose

Phase 1 extracted the prototype's Calendar rules behind tested commands and
queries while preserving its legacy `{ date, start, dur, allDay, endDate, repeat }`
record shape. Phase 2A replaces that transitional representation with a canonical
time model. Phase 2B builds complete local recurrence and exception behavior on
that model.

This cycle deliberately excludes calendar-container management, availability,
conflict presentation, briefing projections, reminder scheduling, and provider
adapters. Those remain separate Calendar Phase 2 subprojects because they consume
the time and recurrence foundations defined here.

## Approved delivery approach

Use staged vertical migration:

1. Phase 2A introduces v5 persistence, shared temporal primitives, canonical
   event timing, range segmentation, domain commands and queries, and existing
   editor controls.
2. Phase 2B introduces the canonical recurrence model, typed exceptions, advanced
   expansion, series splitting, recurrence previews, and existing editor controls.
3. Each phase must leave the application runnable and must preserve unrelated
   Tasks, Notes, settings, theme, and gamification state.

Rejected approaches:

- A domain-first big bang would leave the UI disconnected too long and defer
  migration risk to one integration step.
- Extending legacy root fields would preserve ambiguity around dates, timezones,
  multi-day events, and recurrence anchors.

---

# Phase 2A: Canonical time model

## 1. Temporal vocabulary

The shared time layer defines and validates the following concepts:

- `DateKey`: Calendar date formatted `YYYY-MM-DD`.
- `LocalDateTime`: Wall-clock value formatted `YYYY-MM-DDTHH:mm` without an
  implied timezone.
- `Instant`: UTC timestamp identifying one point on the global timeline.
- `TimeZone`: Valid IANA timezone identifier.
- `DateInterval`: Date-only half-open interval `[startDate, endDateExclusive)`.
- `InstantInterval`: Instant half-open interval `[startInstant, endInstant)`.
- `LocalDateTimeInterval`: Wall-clock half-open interval before timezone
  resolution.

All interval ends are exclusive. Stored precision is minute-level for the current
editor, but domain types must not depend on display snapping.

## 2. Canonical event timing

Every event has exactly one `timing` value.

### 2.1 All-day timing

```js
{
  kind: "all-day",
  startDate: "2026-08-09",
  endDateExclusive: "2026-08-12"
}
```

Rules:

- Boundaries are date-only values.
- `endDateExclusive` must be after `startDate`.
- A single-day event ends on the following date.
- Timezone conversion never changes either date.
- An all-day event intersects every date `d` where
  `startDate <= d < endDateExclusive`.

### 2.2 Floating timed timing

```js
{
  kind: "timed",
  timeZoneMode: "floating",
  startLocal: "2026-08-09T23:00",
  endLocal: "2026-08-10T01:30"
}
```

Rules:

- Floating time preserves wall-clock values when the viewer timezone changes.
- End must be after start in local calendar arithmetic.
- Cross-midnight and multi-day intervals are valid.
- Floating values do not expose canonical instants until a workflow explicitly
  resolves them against a timezone.

### 2.3 Zoned timed timing

```js
{
  kind: "timed",
  timeZoneMode: "zoned",
  startLocal: "2026-11-01T01:30",
  endLocal: "2026-11-01T02:30",
  timeZone: "America/Toronto",
  startOffset: "-04:00",
  endOffset: "-05:00"
}
```

Rules:

- `timeZone` must be a valid IANA identifier.
- Local values preserve the author's editing intent.
- Stored offsets disambiguate repeated local times during a daylight-saving
  fallback.
- Commands resolve and validate corresponding instants.
- A skipped local time during a spring-forward transition is rejected with a
  structured issue rather than shifted silently.
- An ambiguous local time requires an explicit earlier or later offset choice.
- End instant must be after start instant.

### 2.4 Event fields outside timing

The event continues to own:

- Immutable `id`
- `calendarId`, initially the system default calendar
- Title
- Description
- Location
- Category
- Availability: busy, free, tentative, or working elsewhere
- Privacy: default, public, or private
- Status: confirmed, tentative, or cancelled
- Reminder intents
- Recurrence rule
- Created and updated metadata
- Revision number
- Source metadata reserved for future integrations

Current `note`, `place`, `cat`, and `alerts` fields migrate into their canonical
counterparts without discarding compatible unknown fields.

### 2.5 Default calendar foundation

Version 5 creates one immutable app-native system calendar:

```js
{
  id: "calendar-default",
  name: "My Calendar",
  status: "active",
  role: "owner",
  isDefault: true,
  isVisible: true,
  includeInAvailability: true
}
```

Every migrated and newly created event receives `calendarId: "calendar-default"`
unless a valid calendar is explicitly supplied. Calendar management, additional
containers, and permission UI remain deferred, but event identity will not require
another migration when those capabilities arrive.

## 3. Timezone services

`shared/time` owns:

- IANA timezone validation
- Local-date-time parsing and comparison
- Local-to-instant resolution
- Instant-to-viewer projection
- Offset formatting
- DST skipped-time and ambiguous-time detection
- Date and instant interval intersection
- Calendar-day segmentation

The Calendar domain owns the policy for applying those primitives to events.
React must not calculate timezone offsets or split intervals.

The implementation may use platform `Intl` capabilities but must isolate them
behind a stable shared-time interface. Tests must set explicit timezone fixtures
and must not depend on the machine's default timezone.

## 4. Day and range projections

Calendar queries return event occurrences and display segments separately.

### 4.1 Occurrence

An occurrence represents one canonical event or one generated recurrence
position. It retains the complete timing interval and stable identity.

### 4.2 Display segment

```js
{
  eventId: "event-1",
  occurrenceId: "event-1",
  date: "2026-08-10",
  segmentStartLocal: "2026-08-10T00:00",
  segmentEndLocal: "2026-08-10T01:30",
  continuesBefore: true,
  continuesAfter: false,
  isStartSegment: false,
  isEndSegment: true
}
```

Rules:

- Segment an occurrence once for every viewer date it intersects.
- A segment never changes canonical event timing.
- All-day segments use date boundaries rather than midnight instants.
- Timed zoned events segment after projection into the viewer timezone.
- Floating timed events segment using their stored local values.
- The timeline and agenda consume shared projections rather than deriving spans.

## 5. Phase 2A commands and queries

Commands:

- `CreateEvent`
- `UpdateEvent`
- `MoveEvent`
- `ResizeEvent`
- `ChangeEventTimezoneMode`
- `ConvertEventToAllDay`
- `ConvertEventToTimed`
- `DeleteEvent`
- `RestoreEvent`

Queries:

- `GetEvent`
- `GetEventsForDay`
- `GetEventsForRange`
- `GetEventSegmentsForDay`
- `GetEventSegmentsForRange`
- `GetCalendarDensity`
- `GetNextEvent`

Every mutating command validates the complete resulting event. A failed command
returns structured issues and does not partially mutate state.

## 6. Existing editor changes

The current event composer gains:

- Start date and time
- End date and time
- Correct all-day start and inclusive user-facing through-date controls mapped to
  exclusive canonical storage
- Floating or timezone-bound selection
- Detected local timezone default
- IANA timezone selection using platform-supported values
- DST ambiguity choice when required
- Overnight and multi-day duration summary
- Structured validation feedback without clearing user input

The editor maintains drafts outside canonical state. Frontend visual redesign,
new navigation, and animation polish remain deferred.

## 7. Persistence v5

### 7.1 Versioning

The new state uses `schemaVersion: 5` and persists under `nbmp:state:v5`.

Calendar-owned v5 collections are explicit:

```js
{
  schemaVersion: 5,
  calendars: [],
  events: [],
  eventExceptions: [],
  occurrenceAliases: []
}
```

Tasks, Notes, settings, themes, XP, and other planner-owned state remain sibling
fields. Legacy `overrides` remains temporarily available only for Task recurrence;
Calendar exceptions no longer use it after migration.

### 7.2 Immediate cutover

The selected policy is an immediate validated cutover:

1. Read v5 when present.
2. Otherwise read the existing v4 record.
3. Parse and validate the complete v4 state.
4. Map every event and recurrence record to v5 in memory.
5. Validate the complete migrated v5 state.
6. Write v5 once.
7. Confirm the v5 write can be read and parsed.
8. Remove v4.
9. Continue exclusively on v5.

There is no dual write, compatibility period, or retained migration backup after
successful cutover.

### 7.3 Failure policy

- Never remove v4 before confirmed v5 persistence.
- Never seed blank data over a migration failure.
- Never persist a partially migrated state.
- Surface a blocking recovery message with export guidance.
- A transient v5 write failure leaves v4 untouched and may be retried.
- Once v5 is confirmed, later startup never reads v4.

### 7.4 v4 field mapping

Timed event:

- `date + start` becomes `startLocal`.
- `date + start + dur` becomes `endLocal`, including next-day rollover.
- Existing events migrate as floating because v4 carried no timezone identity.

All-day event:

- `date` becomes `startDate`.
- Inclusive `endDate` becomes `endDateExclusive + 1 day`.
- Missing `endDate` becomes `startDate + 1 day`.

Recurrence fields migrate according to the Phase 2B model below.

Tasks retain their existing timing representation during this cycle. Shared-time
primitives may later support Tasks without forcing Calendar's event model onto the
Tasks domain.

---

# Phase 2B: Advanced recurrence and series lifecycle

## 8. Canonical recurrence rule

```js
{
  frequency: "daily",
  interval: 1,
  weekStart: 1,
  byWeekday: [],
  byMonthDay: [],
  byMonth: [],
  count: null,
  until: null,
  missingDatePolicy: "skip"
}
```

### 8.1 Fields

- `frequency`: daily, weekly, monthly, or yearly.
- `interval`: Positive integer number of frequencies.
- `weekStart`: Weekday integer from 0 through 6.
- `byWeekday`: Ordered records `{ weekday, ordinal }`, where `ordinal` is null,
  1 through 4, or -1 for last.
- `byMonthDay`: Valid positive month-day values or `-1` for the last day.
- `byMonth`: Month integers 1 through 12.
- `count`: Positive generated-position limit or null.
- `until`: Inclusive local recurrence boundary or null.
- `missingDatePolicy`: `skip` or `last-day`.

`count` and `until` are mutually exclusive in the initial UI and canonical
validation. Imported future records that contain both are rejected until an
explicit precedence policy exists.

### 8.2 Supported patterns

- Every N days
- Every N weeks on selected weekdays
- Every N months on the same day
- Last day of the month
- Nth weekday of the month
- Last weekday of the month
- Every N years on selected month and date
- Yearly nth or last weekday patterns
- Leap-day recurrence using explicit missing-date policy

The initial model generates at most one canonical recurrence position per series
per local date. BYHOUR, BYMINUTE, BYSECOND, and multiple same-day generated
positions remain deferred.

## 9. Recurrence anchors and identity

Every generated occurrence has a stable recurrence anchor representing the local
start originally generated by the rule.

```text
seriesId@recurrenceAnchor
```

For all-day events, the anchor is a date. For timed events, it is a local date-time
including the series timezone mode. Moving or modifying the occurrence does not
change its anchor or identity.

The ID encoding must be reversible and cannot rely on ambiguous delimiter parsing.
Legacy Phase 1 date-based IDs migrate deterministically.

## 10. Typed exceptions

```js
{
  id: "exception-1",
  seriesId: "series-1",
  recurrenceAnchor: "2026-08-10T09:00",
  type: "modified",
  timing: null,
  patch: {},
  createdAt: "2026-08-01T12:00:00Z",
  updatedAt: "2026-08-01T12:00:00Z",
  deletedAt: null
}
```

Types:

- `modified`: Replaces allowed occurrence fields.
- `moved`: Replaces timing while preserving recurrence identity.
- `cancelled`: Suppresses the generated occurrence while retaining history.
- `added`: Adds an extra series-associated occurrence outside the rule.

Rules:

- One generated anchor has at most one active generated-occurrence exception.
- Added exceptions use immutable added-occurrence IDs and do not impersonate a
  generated anchor.
- Exact retries are idempotent.
- Soft-deleted exceptions remain recoverable until permanent retention cleanup.
- An exception whose anchor no longer exists becomes orphaned rather than deleted.
- Queries exclude orphaned exceptions by default but diagnostics can retrieve them.

## 11. Recurrence expansion

Expansion order:

1. Validate the series and requested range.
2. Generate recurrence anchors from the canonical rule.
3. Apply count or until boundaries.
4. Apply modified, moved, or cancelled exceptions by anchor.
5. Add active added exceptions.
6. Resolve occurrence aliases created by series splitting.
7. Project timing into the viewer timezone.
8. Segment occurrences for calendar views.
9. Sort deterministically by projected start and stable identity.

Count applies to generated recurrence positions before cancellation, movement, or
addition. Added exceptions do not consume count. Cancelled occurrences still
consume their generated position.

Range expansion must be bounded and cannot materialize an unbounded series. Query
callers supply a finite range; recurrence preview supplies an explicit result
limit.

## 12. Edit scopes

### 12.1 This occurrence

- Create or update a typed exception.
- Leave the parent rule unchanged.
- Preserve recurrence identity and links.

### 12.2 This and following

Execute one atomic `SplitSeries` command:

1. Validate that the selected anchor belongs to the series.
2. End the original series immediately before the selected anchor.
3. Create a new series with a new immutable ID.
4. Apply the requested event and recurrence changes to the new series.
5. Move exceptions at or after the split to the new series.
6. Keep exceptions before the split on the original series.
7. Recalculate count boundaries.
8. Create occurrence aliases from affected old future identities to new identities.
9. Emit one correlated result only after the entire transition succeeds.

For count-based recurrence, the original series count becomes the number of
generated positions before the split. The new series receives the remaining count,
unless the user explicitly changes its ending rule.

### 12.3 Entire series

- Update the parent event and recurrence rule.
- Preserve the original series start unless explicitly changed by a move command.
- Retain still-valid exceptions.
- Mark exceptions orphaned when their anchors are no longer generated.
- Never silently discard linked or modified history.

## 13. Occurrence aliases

Series splitting changes the series ID for future occurrences. An alias record maps
an old occurrence identity to its new identity.

Aliases support:

- Linked notes and tasks
- Search deep links
- Reminder references
- Undo and audit history
- Future provider mappings

Alias resolution:

- Follows a bounded chain.
- Rejects cycles.
- Compresses chains when persisted safely.
- Returns an explicit unresolved result when the target no longer exists.

## 14. Phase 2B commands and queries

Commands:

- `ChangeRecurrence`
- `ModifyOccurrence`
- `MoveOccurrence`
- `CancelOccurrence`
- `AddOccurrence`
- `RestoreOccurrence`
- `SplitSeries`
- `DeleteSeries`
- `RestoreSeries`

Queries:

- `GetOccurrence`
- `GetOccurrencesForDay`
- `GetOccurrencesForRange`
- `PreviewRecurrence`
- `GetSeriesExceptions`
- `ResolveOccurrenceAlias`
- `GetOrphanedExceptions`

Commands and queries are exported through `domains/calendar/index.js`. React does
not import recurrence internals.

## 15. Existing recurrence editor changes

The current composer gains progressively disclosed controls for:

- Frequency and interval
- Weekly weekday selection
- Monthly same-date, last-day, nth-weekday, and last-weekday patterns
- Yearly month and date or weekday pattern
- Never, until-date, or after-count endings
- Missing-date policy
- Human-readable recurrence summary
- Next-five-occurrences preview
- This occurrence, this and following, or entire series scope

The common once, daily, weekly, and monthly actions remain fast. Advanced options
are not shown until relevant.

## 16. Delete and recovery

- Deleting one occurrence creates a cancelled exception.
- Deleting this and following uses series splitting and soft-deletes the new future
  series segment.
- Deleting a complete series soft-deletes the series and its active exception
  projections without erasing audit history.
- Undo restores exact prior series, exception, alias, and count state.
- Permanent trash retention remains a later Calendar Phase 2 subproject, but the
  domain representation must support `deletedAt` from this cycle onward.

---

# Cross-cutting architecture

## 17. Target files and responsibilities

```text
src/
  shared/time/
    dateKey.js
    localDateTime.js
    timezone.js
    interval.js
  domains/calendar/
    model/
      event.js
      timing.js
      recurrenceRule.js
      exception.js
    commands/
      eventCommands.js
      occurrenceCommands.js
      seriesCommands.js
    queries/
      eventQueries.js
      occurrenceQueries.js
    recurrence/
      expandRecurrence.js
      occurrenceIdentity.js
      splitSeries.js
    segmentation/
      segmentOccurrence.js
    migrations/
      migrateV4ToV5.js
      validatePlannerStateV5.js
    repositories/
      calendarRepository.js
    tests/
  platform/persistence/
    plannerStateStore.js
```

Files may be combined when the resulting unit remains focused and reviewable.
Commands cannot import browser persistence. Migration code cannot import React.
Platform persistence implements Calendar-owned repository contracts.

## 18. Application data flow

Read path:

```text
Persistence -> v5 validation -> Calendar query -> occurrence expansion
-> timezone projection -> segmentation -> React view
```

Write path:

```text
React draft -> application command -> Calendar validation -> immutable transition
-> persistence transaction -> confirmed result -> UI effects
```

Sounds, haptics, sheets, gesture previews, and toast presentation remain UI
concerns. Canonical state changes happen only after domain validation.

## 19. Error handling

Structured error categories:

- `validation`: Invalid field or invariant.
- `ambiguous-time`: Zoned local time has two valid offsets.
- `skipped-time`: Zoned local time does not exist.
- `not-found`: Event, series, occurrence, or alias target is unavailable.
- `conflict`: Expected revision does not match.
- `migration`: Existing state cannot be transformed safely.
- `persistence`: Confirmed state could not be stored.

Errors retain user draft values. Technical errors do not expose note, title,
location, or other user-authored content in diagnostics.

## 20. Revisions and atomicity

- Events, series, and exceptions carry integer revisions.
- Mutating commands accept optional expected revisions.
- Multi-record series splits are atomic in memory and persistence.
- Domain events are emitted only for successful transitions.
- Undo stores a domain transition snapshot rather than reverse-engineering changes
  in React.

## 21. Test strategy

### 21.1 Shared time

- Local date-time validation
- Leap years and month boundaries
- DST skipped and repeated local times
- Earlier and later ambiguity choices
- Zoned projection across viewer timezones
- Date and instant intersection
- Cross-midnight and multi-day segmentation

### 21.2 Migration

- Every v4 seed event shape
- Timed rollover across midnight
- Inclusive to exclusive all-day conversion
- Recurrence and override migration
- Preservation of Tasks, Notes, settings, XP, and unknown compatible fields
- Invalid JSON and invalid records
- Failed v5 write leaves v4 untouched
- Confirmed v5 cutover removes v4
- Repeated startup does not rerun migration

### 21.3 Recurrence

- Daily, weekly, monthly, and yearly intervals
- Selected weekdays
- Same date, last date, nth weekday, and last weekday
- Leap-day skip and last-day policies
- Count and until boundaries
- Zoned recurrence across DST
- Floating recurrence across viewer timezone changes
- Cross-midnight recurring occurrences
- Deterministic bounded expansion

### 21.4 Exceptions and splitting

- Modify, move, cancel, add, restore
- Idempotent retry
- This-occurrence edits
- This-and-following split
- Remaining-count calculation
- Exception reassignment
- Occurrence aliases and cycle rejection
- Orphan detection
- Delete and exact undo
- Linked identity preservation

### 21.5 UI and build

- Editor field conversion into canonical commands
- Validation keeps draft values
- Scope selection invokes the correct command
- Recurrence preview matches saved expansion
- Existing day, week, month, reminders, search, export, gestures, and undo remain
  operational against v5 projections
- Full Node test suite
- Production Vite build
- Live development-server smoke check

## 22. Completion criteria

Phase 2A and 2B are complete when:

1. Newly created events persist only canonical v5 timing and recurrence fields.
2. Valid v4 data migrates once and is removed only after confirmed v5 persistence.
3. Migration failure cannot overwrite existing valid state with seed data.
4. Cross-midnight, multi-day, floating, and zoned events query and segment correctly.
5. DST ambiguity and skipped times produce explicit behavior.
6. Daily, weekly, monthly, yearly, count, until, nth-weekday, last-weekday, and
   missing-date recurrence rules pass deterministic tests.
7. All four exception types work with stable occurrence identity.
8. All three edit scopes work, including exact count and exception behavior.
9. The existing editor exposes the approved controls without a visual redesign.
10. No Calendar domain module depends on React or browser persistence.
11. The full automated suite, production build, and smoke check pass.
12. Documentation reflects actual implementation and deferred work accurately.

## 23. Explicitly deferred

- Google and Microsoft integration and synchronization
- Calendar management UI, sharing, and collaborative permissions
- Availability and scheduling suggestions
- Conflict detection and presentation
- Day briefing extraction
- Reminder scheduler and delivery extraction
- Search indexing improvements
- Permanent trash cleanup policy and UI
- BYHOUR, BYMINUTE, BYSECOND, and multiple generated positions per local day
- Frontend visual redesign and polish
