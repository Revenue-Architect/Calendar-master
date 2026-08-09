# Planner Product Foundation

- **Status:** Living specification
- **Last updated:** 2026-08-09
- **Product scope:** Personal-first, collaboration-ready planner
- **Architecture:** Domain-oriented modular monolith
- **Integration scope:** Calendar and task provider integration is planned and
  deliberately deferred from this specification

## Purpose

Planner combines time-bound commitments, finishable actions, and contextual notes
into a daily operating system. The day is the primary planning surface, but each
domain remains independently understandable, testable, and maintainable.

The product model is:

| Domain object | User meaning |
| --- | --- |
| Event | Something that happens at a particular time |
| Task | Something the user intends to finish |
| Note | Context, thinking, or memory captured independently or against another entity |
| Day | A composed view of events, tasks, notes, reminders, and planning intelligence |

## Product decisions

1. The product is personal-first. Ownership and permission boundaries MUST allow
   future collaboration without requiring collaborative features in the first
   release.
2. Provider integration will eventually cover calendars and tasks, but provider
   APIs and sync behavior are outside the current foundation work.
3. Notes initially support daily notes, notes linked to events or tasks, and
   standalone inbox notes. Their identity, ownership, content, and repository
   contracts MUST remain extensible toward a full notebook system.
4. Product domains use a canonical internal model. Provider records, persistence
   formats, and UI component state are adapters around that model.
5. Frontend polish follows product and domain correctness rather than defining it.

## Specification convention

- Level 1 is a product capability.
- Level 2 is a sub-capability.
- Level 3 states required behavior, invariants, and important edge cases.
- Approved domain sections are appended to this document after product review.

---

# Calendar domain

**Status:** Approved on 2026-08-09

## Responsibility and boundary

The Calendar domain owns time-bound commitments and navigation through time. It
does not own provider APIs, task completion, note content, notification delivery,
gamification, or visual presentation.

## Core domain objects

- `Calendar`: Container with identity, ownership, visibility, color, permissions,
  timezone, and source metadata.
- `Event`: Canonical user-facing commitment.
- `EventSeries`: Recurrence definition shared by repeating events.
- `EventOccurrence`: One calculated or overridden appearance of a series.
- `EventException`: Changed, moved, added, or cancelled occurrence.
- `Reminder`: Instruction to notify, separate from notification delivery.
- `Attendee`: Optional collaboration-ready participation data.
- `EventLink`: Typed relationship to a task, note, location, meeting, attachment,
  contact, or external resource.
- `CalendarViewState`: Selected date, visible calendars, view, zoom, week start,
  and other user view preferences.

## 1. Calendar containers

### 1.1 Calendar lifecycle

- Create, rename, recolor, archive, restore, and delete an app-native calendar.
- Distinguish active, hidden, archived, read-only, and disconnected calendars.
- Block destructive or editing commands when ownership or permissions do not
  allow them.

### 1.2 Calendar identity

- Every calendar MUST have an immutable internal ID.
- External calendars MAY additionally carry provider and external IDs.
- Display name, color, and visibility MAY change without changing identity.

### 1.3 Ownership and permissions

- Support personal ownership now.
- Reserve owner, editor, contributor, and viewer roles.
- Events inherit permissions from their calendar unless explicitly restricted.
- Read-only calendars allow queries but reject mutation commands.

### 1.4 Calendar preferences

- Visible or hidden state
- Default calendar for new events
- User-selected color
- Inclusion in availability calculations
- Inclusion in briefings and search
- Default reminders

## 2. Date navigation and views

### 2.1 Date context

- Maintain today, selected date, selected range, and current local time as
  separate concepts.
- Preserve the selected date when changing views.
- Follow the selected date when it moves outside the current navigation window.
- Respect locale, first day of week, week numbering, and 12/24-hour preferences.

### 2.2 View modes

- Day timeline
- Multi-day or week timeline
- Month heatmap
- Chronological agenda
- Date picker or mini-calendar
- Every view MUST consume shared calendar queries rather than independently
  expanding recurrence or applying event rules.

### 2.3 Navigation

- Move by the unit represented by the current view.
- Jump to today or a specific date.
- Support swipe and keyboard navigation.
- Open search-result deep links at the correct date and occurrence.
- Restore the last selected view and date when appropriate.

### 2.4 Calendar density

- Calculate density from visible timed events, all-day events, and optionally
  scheduled tasks.
- Hidden calendars MUST NOT affect density unless explicitly requested.
- Distinguish free, light, moderate, busy, and overloaded days.
- Density calculations MUST remain independent from theme colors.

## 3. Event lifecycle

### 3.1 Event creation

- Create from a global action, timeline position, or dragged time range.
- Duplicate an existing event.
- Convert or link a task to scheduled time without duplicating task ownership.
- Apply default calendar and reminder preferences.

### 3.2 Draft handling

- Maintain unsaved drafts outside canonical event state.
- Validate required title, date, and time range.
- Warn before closing a modified draft.
- Prevent drafts from appearing in queries, reminders, or integration queues.
- Preserve a recoverable draft after accidental dismissal when practical.

### 3.3 Event editing

- Edit title, calendar, timing, location, description, reminders, recurrence,
  availability, privacy, status, and links.
- Convert between timed and all-day events.
- Preserve fields that are not represented in the current editor.
- Check permissions before committing a mutation.

### 3.4 Deletion and recovery

- Delete one event, one occurrence, this and future occurrences, or an entire
  series.
- Use recoverable soft deletion before permanent removal.
- Offer undo for recent destructive commands.

## 4. Event time model

### 4.1 Timed events

- Require start and end instants with end after start.
- Support short events, multi-day events, and cross-midnight events.
- Display an event on every day it intersects.
- Allow display snapping without unnecessarily changing stored precision.

### 4.2 All-day events

- Store date-only boundaries rather than midnight timestamps.
- Use exclusive end-date semantics internally.
- Prevent timezone conversion from shifting all-day dates.
- Support single-day and multi-day events.

### 4.3 Timezones

- Store the event timezone independently from the viewer timezone.
- Distinguish floating local time from timezone-bound time.
- Preserve the original timezone for editing.
- Display converted time when the viewer timezone changes.
- Surface a meaningful timezone difference to the user.

### 4.4 Calendar correctness

- Handle daylight-saving transitions, leap years, month boundaries, ambiguous or
  skipped local times, and provider timestamps with differing precision.
- Shared time primitives MUST own date arithmetic and formatting policy. React
  components MUST NOT implement calendar arithmetic.

## 5. Recurrence and exceptions

### 5.1 Recurrence rules

- Daily, weekly, monthly, and yearly frequency
- Every N periods
- Selected weekdays
- End on a date, after a count, or never
- The canonical model SHOULD remain compatible with standard recurrence concepts
  without storing provider-specific payloads.

### 5.2 Monthly and yearly rules

- Same day of month
- Last day of month
- Nth weekday and last weekday
- Leap-day behavior
- Explicit policy for months without the requested date

### 5.3 Occurrence identity

- Every occurrence MUST have a stable derived identity.
- Moving an occurrence MUST preserve its relationship to the series.
- Completion, reminders, tasks, and notes MAY reference an occurrence without
  copying the entire series.
- Search results MUST resolve to a real occurrence.

### 5.4 Edit scope

- This occurrence only
- This and following occurrences
- Entire series
- Editing a whole series MUST preserve its original start unless the user
  explicitly changes it.

### 5.5 Exceptions

- Modified occurrence
- Moved occurrence
- Cancelled occurrence
- Added occurrence outside the original rule
- Provider-deleted exception
- Exception whose parent series is unavailable

## 6. Timeline and event layout

### 6.1 Timeline structure

- Configurable visible hours with access to the full day
- Hour and sub-hour grid lines
- Current-time indicator
- Initial scroll to current time or first relevant event
- Separate all-day and timed regions

### 6.2 Overlapping events

- Group events into collision clusters.
- Assign stable lanes and recalculate widths within the affected cluster.
- Support partial overlaps and fully nested events.
- Unrelated events MUST NOT cause layout changes.

### 6.3 Direct manipulation

- Tap to inspect or create.
- Hold and drag to create a duration.
- Drag to move, resize, or change date.
- Duplicate and undo.
- Gestures MUST produce domain commands rather than rewriting stored objects.

### 6.4 Scheduling boundaries

- Prevent negative durations and invalid values such as `24:00`.
- Support cross-midnight scheduling explicitly.
- Preview the proposed time before commit.
- Respect read-only and permission states.

## 7. Event details and context

### 7.1 Essential fields

- Title, calendar, start, end, and all-day state
- Description and location
- Recurrence and reminders

### 7.2 Planning fields

- Availability: busy, free, tentative, or working elsewhere
- Privacy: default, public, or private
- Status: confirmed, tentative, or cancelled
- Category or label
- Preparation time and optional travel buffer
- Source and last-updated information

### 7.3 Meeting context

- Physical location and virtual meeting URL
- Dial-in information
- Organizer, attendees, and RSVP state
- Attachments and supporting links
- The canonical model MAY support this context before collaborative editing is
  exposed.

### 7.4 Domain relationships

- Events MAY link to tasks, notes, preparation checklists, follow-up actions,
  documents, locations, and contacts.
- A linked entity remains owned by its original domain.

## 8. Reminders

### 8.1 Reminder rules

- At event start
- Fixed time before or after
- Custom date and time
- Multiple reminders
- Calendar defaults and event overrides

### 8.2 Reminder lifecycle

- Scheduled, delivered, snoozed, dismissed, cancelled, failed, or superseded
  after an event change

### 8.3 Reminder safety

- Reschedule after event movement.
- Cancel after deletion.
- Recalculate after timezone changes.
- Prevent duplicate delivery.
- Record failures and respect permissions and quiet hours.
- Calendar defines reminder intent; the Reminders domain owns scheduling and
  delivery.

## 9. Calendar intelligence

### 9.1 Day briefing

- Current event and remaining duration
- Next event and free time before it
- Total scheduled time
- Open scheduled actions
- Conflicts and all-day commitments
- Day-complete state

### 9.2 Availability

- Calculate busy and free intervals.
- Respect minimum usable duration and working hours.
- Include only calendars configured for availability.
- Optionally include scheduled tasks.

### 9.3 Scheduling suggestions

- Suggest free slots based on desired duration, conflicts, and working hours.
- Explain why a slot is suggested.
- Never reschedule automatically without confirmation.

### 9.4 Conflict detection

- Time overlap and double booking
- Travel-buffer conflict
- Event and scheduled-task collision
- Blocking all-day event
- Conflict introduced by recurrence changes

## 10. Search and filtering

### 10.1 Searchable content

- Title, description, location, attendee, calendar, category, meeting URL,
  linked task, and linked note

### 10.2 Search behavior

- Search all time or a date range.
- Restrict by calendar, past/upcoming state, recurrence, attendee, category, or
  location.
- Open the correct occurrence from results.

### 10.3 Search resilience

- Exclude hidden calendars unless requested.
- Exclude deleted items from normal results.
- Avoid storing thousands of recurrence instances only for search.
- Preserve useful local search while offline.

## 11. Import, export, and portability

### 11.1 Calendar export

- Produce valid ICS with timezone metadata, all-day semantics, recurrence,
  exceptions, cancellations, and supported reminders.

### 11.2 Application backup

- Use a versioned JSON format with schema validation.
- Preview before replacement.
- Support merge or replace mode.
- Migrate between supported schema versions with clear error reporting.

### 11.3 Data integrity

- Never replace valid state with an invalid import.
- Preserve compatible unknown fields during migration.
- Detect duplicate imported records.
- Maintain internal identity when restoring a native backup.

## 12. Reliability and auditability

### 12.1 Commands

- `CreateEvent`
- `UpdateEvent`
- `MoveEvent`
- `ResizeEvent`
- `DeleteEvent`
- `ChangeRecurrence`
- `ModifyOccurrence`

### 12.2 Queries

- `GetEventsForDay`
- `GetEventsForRange`
- `GetCalendarDensity`
- `GetAvailability`
- `GetNextEvent`
- `SearchEvents`

### 12.3 Domain events

- `EventCreated`
- `EventChanged`
- `EventMoved`
- `EventDeleted`
- `OccurrenceChanged`
- `ReminderIntentChanged`
- Other domains MAY react without Calendar importing their implementation.

### 12.4 Test requirements

- Recurrence expansion and exception behavior
- Timezones, DST, all-day, and cross-midnight events
- Overlap layout
- Edit scopes and permissions
- Import validation
- Undo and recovery

## Calendar module target

```text
domains/calendar/
  model/
  commands/
  queries/
  recurrence/
  availability/
  repositories/
  events/
  validation/
  tests/
```

React components consume Calendar through application-facing commands and queries.
They MUST NOT contain recurrence arithmetic, persistence logic, provider payloads,
or canonical mutation rules.

---

# Tasks and subtasks domain

**Status:** Awaiting product review

This section will be appended after its three-level capability model is approved.
