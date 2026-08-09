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

**Status:** Approved on 2026-08-09

## Responsibility and boundary

The Tasks domain owns intentional work: capture, organization, planning,
deadlines, recurrence, hierarchy, progress, and completion. It does not own
calendar events, rich note content, notification delivery, provider
synchronization, or reward calculations.

## Core domain objects

- `Task`: Canonical unit of work.
- `TaskList`: Primary organizational container.
- `TaskSeries`: Recurrence definition.
- `TaskOccurrence`: One actionable instance of a recurring task.
- `TaskSchedule`: When the user intends to work on the task.
- `TaskDeadline`: When the task must be finished.
- `Subtask`: Task linked to a parent task.
- `ChecklistItem`: Lightweight completion step without independent planning
  fields.
- `TaskCompletion`: Historical completion record.
- `TaskLink`: Relationship to an event, note, contact, attachment, or external
  resource.
- `TaskViewState`: Selected list, filters, ordering, grouping, and display
  preferences.

A subtask and checklist item are intentionally different:

| Type | Independent schedule | Deadline | Reminder | Recurrence | Notes | Completion history |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Subtask | Yes | Yes | Yes | Future-ready | Yes | Yes |
| Checklist item | No | No | No | No | No | Minimal |

The initial interface supports `Task -> Subtask -> Checklist item`. Tasks are
stored as flat records using `parentTaskId`, preventing nested persistence and
leaving room for deeper hierarchy later.

## 1. Task capture and lifecycle

### 1.1 Task creation

- Create from a global action, list, day, event, note, or parent task.
- Support title-only quick capture.
- Create a scheduled task by dropping onto the timeline.
- Duplicate without copying completion history.
- Create follow-up work from an event or note.
- Apply list and scheduling defaults from creation context.

### 1.2 Inbox capture

- Title-only capture MUST remain fast.
- Missing organization, date, priority, and duration are valid.
- Newly captured items default to Inbox unless created in explicit context.
- Inbox tasks remain actionable and searchable.
- Processing Inbox moves tasks without changing identity.

### 1.3 Task editing

- Edit title, description, list, tags, priority, schedule, deadline, estimate,
  recurrence, reminders, and links.
- Preserve fields not exposed by the current editor.
- Validate date relationships before commit.
- Editing a recurring occurrence MUST request an edit scope.
- Permission restrictions MAY make fields read-only later.

### 1.4 Duplication and conversion

- Duplicate as an independent task.
- Convert a checklist item into a subtask.
- Promote a subtask to a top-level task.
- Convert selected note text into a linked task.
- Schedule on Calendar without converting the task into an event.
- Preserve backlinks to the conversion origin.

### 1.5 Deletion and recovery

- Soft-delete before permanent removal.
- Restore hierarchy and links with a deleted task.
- Deleting a parent MUST ask whether to delete, detach, or promote subtasks.
- Deleting one recurring occurrence MUST NOT delete the series by default.
- Completion history SHOULD survive ordinary archive operations.

## 2. Task state

### 2.1 Canonical statuses

- `open`
- `in_progress`
- `waiting`
- `completed`
- `cancelled`
- `archived`
- The initial interface MAY emphasize Open and Completed while retaining the
  richer canonical model.

### 2.2 Derived states

- Inbox
- Planned
- Scheduled
- Due today
- Upcoming
- Overdue
- Deferred
- Blocked
- Unscheduled
- Recurring
- Waiting without follow-up
- Completed late
- Derived states MUST be calculated rather than stored as competing statuses.

### 2.3 State transitions

- Open to In progress
- Open, In progress, or Waiting to Completed
- Any active state to Cancelled
- Completed to Reopened
- Completed or Cancelled to Archived
- Archived to Restored
- Every transition records when it occurred and emits a domain event.

### 2.4 Waiting state

- Waiting tasks SHOULD support a follow-up date.
- The user MAY record whom or what they are waiting for.
- Reaching the follow-up date surfaces the task without changing its deadline.
- Waiting tasks remain searchable and can still become overdue.

## 3. Task content and metadata

### 3.1 Essential fields

- Title
- Status
- Owner
- Primary list
- Created and updated timestamps

### 3.2 Planning fields

- Planned date and optional start time
- Estimated duration
- Deadline date and optional time
- Priority
- Effort or energy estimate
- Follow-up date
- Recurrence
- Reminders

### 3.3 Context fields

- Short plain-text description
- Tags and category
- Location or context
- Source
- Linked event or note
- Attachments and contacts
- Long-form content belongs in Notes and is connected through `TaskLink`.

### 3.4 Collaboration-ready fields

- Owner ID
- Optional assignee ID
- Permission state
- Created-by and last-modified-by IDs
- Future follower or watcher references
- These fields exist without requiring sharing functionality now.

## 4. Organization

### 4.1 Task lists

- Every task has one primary list.
- Inbox is a system list.
- Create, rename, recolor, reorder, archive, restore, and delete lists.
- Deleting a list requires moving, archiving, or deleting remaining tasks.
- Lists MAY define default reminders, tags, or planning behavior.

### 4.2 Tags

- Tasks may have multiple tags independently from their primary list.
- Renaming or recoloring updates every reference.
- Deleting a tag removes relationships without deleting tasks.
- Tags support search and smart views.

### 4.3 Smart views

- Inbox
- Today
- Scheduled
- Upcoming
- Deadlines
- Overdue
- Waiting
- Someday
- Completed
- All tasks
- Smart views are queries, not task containers.

### 4.4 Someday and inactive work

- A task may be intentionally unscheduled without being an Inbox item.
- Someday tasks remain searchable but are excluded from daily pressure metrics.
- A review date MAY surface a Someday task for reconsideration.
- Someday is a planning state, not completion or cancellation.

## 5. Planned work versus deadlines

### 5.1 Planned date

- Answers when the user intends to work on the task.
- Is optional and freely reschedulable.
- May exist without a deadline.
- Moving it does not imply failure.

### 5.2 Planned time

- Is an optional time within the planned date.
- MAY include estimated duration.
- Can appear on the Calendar timeline.
- Can move or resize independently from the deadline.
- The task remains owned by Tasks when displayed on Calendar.

### 5.3 Deadline

- Answers when the task must be finished.
- Is an optional date with optional time.
- Is independent from planned date.
- Drives due-today and overdue calculations.
- Moving planned work past its deadline requires a warning or confirmation.

### 5.4 Defer and reschedule

- Defer by one day, next working day, next week, or custom date.
- Preserve the deadline unless explicitly changed.
- Allow undo.
- Record reschedule history for future planning intelligence.
- Repeated deferral MAY trigger review but never silent deletion.

### 5.5 Overdue policy

- One-off unfinished tasks become overdue after their deadline.
- Tasks without deadlines do not become overdue because a planned date passed.
- Missed planned work follows the user carry-forward preference.
- Recurring tasks use their series-specific missed-occurrence policy.

## 6. Calendar relationship

### 6.1 Scheduled task blocks

- A task can appear on Calendar with planned start and estimated duration.
- The block references the task rather than copying it into an event.
- Completion updates the calendar representation.
- Moving or resizing updates `TaskSchedule`.
- Removing it from the timeline clears its schedule without deleting it.

### 6.2 Event links

- A task may prepare for, occur during, or follow an event.
- Event deletion MUST NOT automatically delete linked tasks.
- Moving an event does not move linked tasks without configured behavior.
- Planner composes linked events and tasks without changing domain ownership.

### 6.3 Scheduling conflicts

- Detect overlap with events and scheduled tasks.
- Allow deliberate overlap after warning.
- Support uncertain durations.
- Identify work that no longer fits before its deadline.
- Scheduling intelligence belongs to Planner using Calendar and Task queries.

### 6.4 Task-to-event conversion

- Preserve a backlink to the original task.
- Ask whether the task remains independently completable.
- Never create two completion sources of truth silently.
- Record conversion so it can be undone.

## 7. Subtasks

### 7.1 Subtask identity

- A subtask is a complete `Task` with `parentTaskId`.
- It has its own ID, status, schedule, deadline, reminders, links, and history.
- Moving between parents does not change identity.
- A task cannot be its own ancestor.

### 7.2 Initial hierarchy policy

- Initial visible hierarchy is one subtask level.
- A subtask MAY contain checklist items.
- Flat parent references leave room for deeper nesting later.
- Domain validation enforces the current depth limit.
- Provider adapters MAY flatten unsupported hierarchies without changing
  canonical data.

### 7.3 Parent progress

- Show completed subtasks versus total subtasks.
- MAY weight progress by estimated duration.
- Parent progress is derived from children.
- Cancelled subtasks are excluded from required completion totals.
- Waiting subtasks remain incomplete.

### 7.4 Parent completion

When incomplete subtasks remain, completing the parent must offer:

- Complete the parent and remaining subtasks
- Complete only the parent
- Cancel and return to the task
- The selected behavior is recorded. Incomplete child work MUST NOT disappear
  silently.

### 7.5 Moving and deleting subtasks

- Reorder within a parent.
- Move to another parent.
- Promote to top level.
- Detach without deleting.
- Prevent cycles.
- Preserve completion history and links.

### 7.6 Subtask scheduling

- Schedule a subtask independently.
- Parent and child schedules may differ.
- Warn when a child is scheduled after its parent deadline.
- Completing required subtasks MAY suggest completing the parent.

## 8. Checklist items

### 8.1 Checklist lifecycle

- Add, rename, reorder, complete, reopen, and remove.
- Keep checklist items lightweight.
- Exclude them from global results by default.
- Inherit task ownership and deletion lifecycle.

### 8.2 Checklist ordering

- Preserve explicit ordering.
- Completed items may remain in place or move according to preference.
- Ordering MUST remain stable across persistence reloads and devices.

### 8.3 Checklist completion

- Record completed state and timestamp.
- Report checklist progress separately from subtask progress.
- Completing the parent MAY complete remaining items after confirmation.
- Reopening the parent does not automatically reopen every checklist item.

### 8.4 Checklist promotion

- Promote a checklist item when it requires independent planning.
- Preserve title, completion state, order, and parent relationship.
- Promotion creates a full task identity and history.

## 9. Recurring tasks

### 9.1 Recurrence rules

- Daily, weekly, monthly, and yearly frequency
- Every N periods
- Selected weekdays
- End date, occurrence count, or indefinite recurrence
- Monthly Nth weekday and month-end behavior
- Shared recurrence primitives SHOULD align with Calendar without coupling the
  domains.

### 9.2 Task occurrence identity

- Every occurrence has a stable identity.
- Completion applies to one occurrence unless series scope is selected.
- Moving one occurrence creates an exception rather than moving the series.
- Notes and links can target a specific occurrence.

### 9.3 Missed-occurrence policy

- `skip`: Missed instances create no debt. Default for habits and rituals.
- `roll_forward`: The latest unfinished instance moves forward.
- `accumulate`: Every missed instance remains independently actionable.
- This policy prevents daily habits from producing uncontrolled overdue debt.

### 9.4 Recurrence edit scope

- This occurrence
- This and following occurrences
- Entire series
- Earlier completion history MUST remain intact.
- Changing recurrence MUST define the fate of future exceptions.

### 9.5 Completion history

- Record occurrence ID and completion time.
- Preserve skipped and missed states.
- Reopening affects the selected occurrence.
- Historical review does not require storing expanded future instances.

## 10. Completion and recovery

### 10.1 Completion

- Complete through an explicit command.
- Record completion timestamp and actor.
- Preserve original schedule and deadline.
- Emit `TaskCompleted`.
- Feedback and rewards react without modifying Task rules.

### 10.2 Reopening

- Reopen a task or occurrence.
- Preserve previous completion in audit history.
- Emit `TaskReopened`.
- Gamification MAY reverse or recalculate rewards independently.

### 10.3 Undo

- Undo recent completion, deferral, move, reorder, delete, and conversion.
- Use the original command result rather than reconstructing partial state.
- Expired undo does not remove recovery from trash or history.

### 10.4 Archive

- Archive manually or according to preference.
- Remove clutter without erasing history.
- Include archived tasks in search and reports only when requested.

## 11. Ordering and bulk actions

### 11.1 Stable ordering

- Use explicit rank in relevant lists and planning views.
- Reordering one view MUST NOT unpredictably reorder unrelated views.
- Recurring occurrences inherit series rank unless overridden.
- Persistence reloads MUST preserve order.

### 11.2 Drag-and-drop

- Reorder within a list or day.
- Move to another list or planned date.
- Schedule on the timeline.
- Nest under a parent.
- Preview target before commit.

### 11.3 Bulk selection

- Complete
- Defer
- Move list or planned date
- Add or remove tags
- Change priority
- Archive or delete
- Report partial failures rather than implying every task changed.

### 11.4 Pull-in planning

- Pull unfinished one-off work into today.
- Show exactly which tasks will move.
- Preserve deadlines.
- Exclude recurring occurrences governed by `skip`.
- Make the operation undoable.

## 12. Reminders

### 12.1 Reminder anchors

- Planned start
- Planned date
- Deadline
- Follow-up date
- Custom instant
- Relative offset

### 12.2 Reminder lifecycle

- Scheduled
- Delivered
- Snoozed
- Dismissed
- Cancelled
- Failed
- Superseded

### 12.3 Reminder safety

- Reschedule after planning changes.
- Prevent duplicate delivery.
- Cancel after deletion or completion when appropriate.
- Reopening MAY restore future reminder intent.
- Tasks defines intent; Reminders owns delivery.

## 13. Search, filtering, and review

### 13.1 Searchable content

- Title, description, list, tags, and checklist text
- Linked note or event
- Contact
- Attachment name

### 13.2 Filters

- Status, list, tag, and priority
- Planned date and deadline
- Assignee
- Recurring state
- Scheduled or unscheduled
- With incomplete subtasks

### 13.3 Review surfaces

- Inbox review
- Today planning
- Upcoming deadlines
- Overdue debt
- Waiting follow-ups
- Repeatedly deferred work
- Recently completed
- Someday review

### 13.4 Task intelligence

- Tasks exposes estimate, deadline, deferral count, and completion history.
- Planner MAY suggest daily load, free slots, at-risk deadlines, repeatedly
  deferred work, and parents blocked by children.
- Suggestions MUST NOT mutate tasks without confirmation.

## 14. Domain boundaries and auditability

### 14.1 Commands

- `CreateTask`
- `UpdateTask`
- `PlanTask`
- `ScheduleTask`
- `DeferTask`
- `CompleteTask`
- `ReopenTask`
- `MoveTask`
- `DeleteTask`
- `ChangeTaskRecurrence`
- `CreateSubtask`
- `PromoteChecklistItem`

### 14.2 Queries

- `GetTask`
- `GetTasksForDay`
- `GetTasksForRange`
- `GetInboxTasks`
- `GetOverdueTasks`
- `GetUpcomingDeadlines`
- `GetTaskTree`
- `SearchTasks`
- `GetTaskCompletionHistory`

### 14.3 Domain events

- `TaskCreated`
- `TaskChanged`
- `TaskPlanned`
- `TaskDeferred`
- `TaskCompleted`
- `TaskReopened`
- `TaskDeleted`
- `TaskHierarchyChanged`
- `TaskReminderIntentChanged`
- Calendar, Notes, Reminders, Gamification, and Planner MAY react without Tasks
  importing their implementations.

### 14.4 Test requirements

- Planned date versus deadline behavior
- Derived overdue states
- Recurrence and missed-occurrence policies
- Parent-child cycle prevention and depth enforcement
- Parent completion with unfinished children
- Checklist promotion
- Stable ordering
- Bulk-operation partial failure
- Completion and reopen history
- Undo, recovery, and permission enforcement

## Tasks module target

```text
domains/tasks/
  model/
  commands/
  queries/
  hierarchy/
  recurrence/
  planning/
  repositories/
  events/
  validation/
  tests/
```

---

# Notes domain

**Status:** Approved on 2026-08-09

## Responsibility and boundary

The Notes domain owns captured knowledge, reflection, contextual writing, document
content, note organization, links, and revision history. It does not own task
execution, calendar timing, reminder delivery, binary attachment storage, search
infrastructure, or provider synchronization.

The initial product exposes daily notes, notes linked to events or tasks, and a
standalone note inbox. Every note still receives durable identity and belongs to a
default system notebook internally so a future notebook product can be introduced
without re-identifying or rewriting existing notes.

## Core domain objects

- `Note`: Durable identity, ownership, metadata, lifecycle, and organization.
- `NoteDocument`: Versioned content belonging to one note.
- `NoteBlock`: Stable content unit within a document.
- `NoteLink`: Typed relationship to a day, event, occurrence, task, note, contact,
  document, location, or external resource.
- `Notebook`: Note container, initially represented by a default system notebook.
- `NoteFolder`: Optional future hierarchy within a notebook.
- `NoteTag`: Reusable user-owned classification.
- `NoteRevision`: Immutable document checkpoint.
- `NoteDraft`: Recoverable uncommitted editing state.
- `NoteAttachment`: Metadata reference to content owned by platform storage.
- `NoteViewState`: Selected note, sort, filters, layout, and navigation context.

## 1. Note capture and lifecycle

### 1.1 Quick capture

- Create a note from the global action, day surface, event, task, or note inbox.
- Capture MUST work with only text; title, tags, and organization remain optional.
- Record capture context without requiring the user to classify the note first.
- A fast capture MUST be recoverable if the surface closes unexpectedly.

### 1.2 Contextual capture

- A note created from a day receives a date link.
- A note created from an event or task receives a typed entity link.
- The source context MAY prefill a title or template but MUST NOT copy canonical
  content from the linked entity.
- Removing a link MUST NOT delete the note.

### 1.3 Drafts

- Draft content remains separate from the last committed document revision.
- Autosave a local draft while editing.
- Restore a draft after refresh, crash, or accidental dismissal.
- Warn before discarding a modified draft that has not been safely persisted.

### 1.4 Editing

- Edit title, document content, tags, links, pin state, and organization.
- Preserve unsupported or temporarily hidden block data during edits.
- Reject stale writes when the expected revision no longer matches.
- Expose save state as saved, saving, offline, conflicted, or failed.

### 1.5 Archive and deletion

- Archive and restore notes without changing identity.
- Use recoverable soft deletion before permanent removal.
- Exclude archived and deleted notes from default views.
- Offer undo for recent destructive commands.

## 2. Note contexts

### 2.1 Inbox notes

- Notes created without a day or entity context enter the note inbox.
- Inbox membership is a processing state, not a notebook.
- A note leaves the inbox when the user files, links, archives, or explicitly marks
  it processed.
- A processed note remains discoverable through normal note views.

### 2.2 Daily notes

- A daily note links to a date-only value in the user's planning timezone.
- Do not create empty daily records merely because a date was viewed.
- Support multiple notes per day while allowing one note to be designated primary.
- Changing timezone MUST NOT silently move a date-only daily note.

### 2.3 Event notes

- Link to either an event series or a stable event occurrence.
- Series notes appear across the series context; occurrence notes appear only on
  the selected occurrence unless explicitly promoted.
- A moved occurrence retains its note links through occurrence identity.
- A deleted event does not delete linked notes; links become unresolved but
  recoverable.

### 2.4 Task notes

- Link to tasks or subtasks using stable task identity.
- Linked notes remain owned and editable by Notes.
- Completing, archiving, or rescheduling a task MUST NOT delete its notes.
- Task backlinks expose related notes without embedding document content.

### 2.5 Standalone notes

- Notes MAY exist without a day or entity link.
- Standalone notes remain addressable by ID, searchable, taggable, and movable.
- Adding context later MUST preserve identity and revision history.

## 3. Content model

### 3.1 Versioned document

- Store document schema version independently from note metadata version.
- Preserve unknown compatible block attributes during migration.
- Reject malformed content before replacing a valid document.
- Keep document serialization deterministic for reliable revisions and conflict
  detection.

### 3.2 Initial block types

- Paragraph
- Heading
- Bulleted list item
- Numbered list item
- Checklist item
- Quote
- Divider
- Code block
- Link preview placeholder

### 3.3 Stable block identity

- Every block MUST have an immutable ID within its note.
- Reordering a block MUST NOT change identity.
- Task extraction and deep links reference a block ID, not a text offset.
- Deleted block IDs MUST NOT be silently reused.

### 3.4 Text behavior

- Support plain-text entry and paste without requiring formatting controls.
- Preserve paragraph and list boundaries.
- Sanitize imported HTML and unsafe URLs.
- Normalize line endings without changing meaningful content.

### 3.5 Inline formatting

- Bold, italic, underline, strike-through, inline code, and links.
- Formatting MUST remain optional and keyboard-accessible.
- Pasted formatting SHOULD degrade safely to supported marks.
- Search indexing consumes readable text rather than serialized editor markup.

## 4. Daily notes

### 4.1 Creation policy

- Create a persisted daily note only after the user writes or applies a template.
- Reopening a date resolves the existing primary daily note when one exists.
- A blank abandoned draft MUST NOT create timeline noise.

### 4.2 Daily display

- Show the primary daily note, additional daily notes, and entity-linked notes as
  distinct groups.
- Preserve user ordering within the date.
- Surface unresolved drafts and save failures.

### 4.3 Prompts and templates

- MAY offer optional morning, planning, reflection, or review prompts.
- Prompts never create content without user action.
- Applied template content becomes normal editable note content.

### 4.4 Movement and duplication

- Move a date link to another day without changing note identity.
- Copy a note as a new note with new note and block identities.
- Duplicating a note MUST NOT copy revision history or external attachment ownership
  blindly.

## 5. Entity links and backlinks

### 5.1 Link types

- Day
- Event series
- Event occurrence
- Task or subtask
- Note
- Contact, document, location, attachment, or external URL

### 5.2 Link lifecycle

- Create and remove links independently from note content.
- Prevent exact duplicate links.
- Preserve unresolved links when a target is archived, deleted, or temporarily
  unavailable.
- Restore backlinks when a target returns.

### 5.3 Backlinks

- Linked entities can query notes that reference them.
- Note-to-note backlinks show incoming and outgoing relationships.
- Backlink queries MUST respect note ownership and visibility.

### 5.4 Occurrence links

- Store both series ID and stable occurrence identity.
- A moved occurrence remains resolvable.
- A series split defines whether existing occurrence links remain on the original
  series or are remapped through an explicit migration.

## 6. Inbox processing

### 6.1 Processing states

- Unprocessed
- In progress
- Processed
- Snoozed until a date
- Archived

### 6.2 Processing actions

- Add or change title.
- Add tags.
- Link to a day, task, event, or note.
- Move to a notebook or folder when those surfaces are exposed.
- Extract a task.
- Archive or delete.

### 6.3 Completion

- Processing state changes do not alter document content.
- Bulk processing reports partial failures rather than silently skipping notes.
- Snoozed notes return to the inbox when their date arrives.

## 7. Task extraction and note checklists

### 7.1 Task extraction

- Convert selected text or a whole block into a new task through an application
  workflow.
- Notes emits `TaskExtractionRequested`; Tasks owns task creation and validation.
- Preserve a backlink between the source block and created task.
- The note remains readable after extraction.

### 7.2 Duplicate prevention

- One extraction request has an idempotency key.
- Retrying after a failure MUST NOT create duplicate tasks.
- A block records created task links without embedding task state.

### 7.3 Note checklists

- Checklist items inside notes remain note content by default.
- Checking a note item does not award task completion or gamification rewards.
- Checklist ordering and completion are revisioned as document edits.

### 7.4 Checklist promotion

- Promote a checklist item into a task explicitly.
- Retain the source checklist item and show its task link.
- Removing the task link MUST NOT delete either record.

## 8. Organization

### 8.1 System views

- Inbox
- Daily notes
- Pinned
- Recent
- Linked notes
- Archived
- Trash

### 8.2 Pinning

- Pin or unpin without changing notebook or links.
- Support stable manual ordering of pinned notes.
- Pin state is personal by default.

### 8.3 Tags

- Create, rename, recolor, merge, and delete tags.
- Tag identity remains stable across rename.
- Deleting a tag removes classification, not notes.
- Normalize duplicate tag names according to locale-aware comparison rules.

### 8.4 Future notebooks

- Every note belongs to exactly one notebook internally.
- The initial default notebook is a hidden system container.
- Future UI MAY expose notebook creation, sharing, ordering, archive, and deletion.
- Moving between notebooks MUST preserve note and block identity.

### 8.5 Future folders

- Folders MAY form an ordered hierarchy within one notebook.
- Prevent hierarchy cycles.
- Moving or deleting a folder requires an explicit policy for contained notes and
  child folders.
- Folder identity remains independent from display name and path.

## 9. Search and discovery

### 9.1 Indexed fields

- Title
- Readable document text
- Tags
- Linked entity titles cached as non-canonical search hints
- Notebook and folder names
- Created, updated, linked, and daily dates

### 9.2 Filters

- Inbox state
- Date or date range
- Tag
- Link type or linked entity
- Notebook or folder
- Pinned, archived, deleted, or attachment state

### 9.3 Results

- Return a contextual snippet and matching block ID.
- Open at the matching block when possible.
- Clearly identify unresolved links or stale indexed context.
- Search remains useful offline.

### 9.4 Resurfacing

- Recent notes derive from meaningful open or edit activity.
- MAY resurface notes linked to today's events and tasks.
- Resurfacing rules remain explainable and dismissible.
- Do not create engagement pressure from private writing.

## 10. Autosave, revisions, and conflicts

### 10.1 Autosave

- Debounce document commits while maintaining an immediately recoverable draft.
- Expose saving, saved, offline, conflicted, and failed state.
- Retry transient persistence failures without losing the local draft.
- Never report saved until durable persistence confirms the revision.

### 10.2 Revisions

- Create immutable revisions at meaningful checkpoints rather than every keystroke.
- Retain author, timestamp, source, schema version, and content checksum.
- Allow a user to inspect and restore a prior revision.
- Restoring creates a new head revision and does not erase later history.

### 10.3 Conflicts

- Commit commands include the expected head revision.
- A mismatched revision produces a conflict result with both versions available.
- Never silently overwrite a newer revision.
- Future collaborative merging MAY operate at block level because blocks have
  stable identity.

### 10.4 Editor undo and redo

- Session undo and redo remain separate from persisted revision restoration.
- Autosave MUST NOT clear the editor undo stack unnecessarily.
- Closing and reopening MAY begin a new local undo session.

## 11. Attachments

### 11.1 Metadata ownership

- Notes stores attachment ID, display name, media type, size, checksum, status,
  caption, and storage reference.
- Platform storage owns binary bytes and upload mechanics.
- External URLs remain links, not attachments, unless explicitly imported.

### 11.2 Lifecycle

- Pending, available, failed, quarantined, missing, or deleted.
- Removing an attachment reference follows retention policy before binary deletion.
- Revision restoration MUST NOT revive expired binary data silently.

### 11.3 Safety

- Sanitize filenames and previews.
- Enforce allowed type and size policy at the storage boundary.
- Treat imported content as untrusted.
- A failed attachment MUST NOT block saving the note document.

### 11.4 Future media

- Images, files, scans, audio, drawings, and generated previews MAY be introduced
  without changing note identity.
- Rich media blocks reference attachment IDs rather than embedding large payloads.

## 12. Templates

### 12.1 Initial templates

- Blank note
- Daily planning
- Daily reflection
- Meeting note
- Task planning
- Weekly review
- Decision record

### 12.2 Template application

- Applying a template copies content into a note with new block IDs.
- Template updates do not rewrite notes previously created from it.
- Record template ID and version as optional provenance.

### 12.3 User templates

- Future user templates share the NoteDocument schema.
- Templates MAY provide default title, tags, links, or notebook destination.
- Invalid or outdated templates migrate or fail without replacing valid note data.

## 13. Privacy, ownership, and portability

### 13.1 Ownership

- Notes are private to their owner by default.
- Reserve owner, editor, commenter, and viewer roles.
- Linking a private note to a shared event or task does not share the note.
- Backlinks disclose only notes the current user may view.

### 13.2 Integration boundary

- Calendar and task providers receive no note content by default.
- A future explicit export or share action defines exactly what leaves the app.
- Provider IDs never become canonical note identity.

### 13.3 Export

- Export a note as plain text, Markdown, or native versioned JSON.
- Export notebook or selected-note collections with link metadata.
- Indicate missing attachments and unresolved links.

### 13.4 Import

- Import plain text, Markdown, and native backups initially.
- Sanitize rich content and URLs.
- Detect duplicates and support copy, merge, or skip where identity is known.
- Invalid imports MUST NOT replace valid notes.

## 14. Reliability and auditability

### 14.1 Commands

- `CreateNote`
- `UpdateNoteMetadata`
- `CommitNoteDocument`
- `MoveNote`
- `LinkNote`
- `UnlinkNote`
- `PinNote`
- `ArchiveNote`
- `DeleteNote`
- `RestoreNote`
- `CreateTaskFromNoteBlock`
- `RestoreNoteRevision`

### 14.2 Queries

- `GetNote`
- `GetNotesForDay`
- `GetNotesForEntity`
- `GetInboxNotes`
- `GetRecentNotes`
- `GetBacklinks`
- `SearchNotes`
- `GetNoteRevisions`
- `GetNotebookTree`

### 14.3 Domain events

- `NoteCreated`
- `NoteDocumentChanged`
- `NoteLinked`
- `NoteUnlinked`
- `NoteMoved`
- `NotePinned`
- `NoteArchived`
- `NoteDeleted`
- `NoteRestored`
- `TaskExtractionRequested`

### 14.4 Test requirements

- Draft recovery and autosave failure
- Expected-revision conflicts
- Date-only daily notes across timezone changes
- Link and backlink consistency
- Deleted and restored link targets
- Task extraction idempotency
- Checklist promotion
- Notebook and folder hierarchy cycles
- Import sanitization
- Revision restoration
- Attachment retention
- Ownership and permission enforcement

## Notes module target

```text
domains/notes/
  model/
  commands/
  queries/
  documents/
  links/
  organization/
  revisions/
  repositories/
  events/
  validation/
  tests/
```

---

# Shared planner capabilities

**Status:** Approved for foundation delivery on 2026-08-09

These capabilities compose Calendar, Tasks, and Notes without taking ownership of
their canonical records. They complete the planner foundation while preserving
domain boundaries and leaving provider integrations deferred.

## 1. Planner composition

### 1.1 Day aggregate

- Compose one date from visible event occurrences, planned tasks, deadlines,
  daily notes, linked notes, reminder state, and planning intelligence.
- Preserve source domain identity in every item.
- A composed day is a query result, not a persisted duplicate of domain records.
- Partial domain failure MUST identify unavailable sections while preserving the
  rest of the day.

### 1.2 Today

- Distinguish current date, selected date, and current time.
- Surface live event, next event, open actions, overdue debt, reminders, and daily
  note without automatically changing canonical data.
- Recalculate at the user's planning-day boundary and after relevant domain events.

### 1.3 Plan mode

- Pull selected overdue tasks into a planned day through Tasks commands.
- Suggest unscheduled tasks and free calendar intervals.
- Preview changes before committing bulk scheduling.
- Never move events or tasks automatically without confirmation.

### 1.4 Review mode

- Daily review: completed work, unfinished work, schedule variance, and notes.
- Weekly review: inboxes, overdue debt, upcoming deadlines, calendar load, and
  unresolved planning conflicts.
- Review state records dismissal or completion without rewriting source records.

### 1.5 Cross-domain workflows

- Task extraction from a note.
- Task scheduling into a calendar block.
- Event preparation and follow-up tasks.
- Notes linked to days, events, occurrences, tasks, or subtasks.
- Workflows are coordinated in `app`, use idempotency keys, and never import one
  domain's persistence implementation into another domain.

## 2. Reminders

### 2.1 Reminder intent

- Calendar and Tasks define reminder intent and anchors.
- Reminders owns scheduling, delivery, snooze, dismissal, retry, and audit state.
- An intent references its source by domain, entity ID, and optional occurrence ID.

### 2.2 Scheduling

- Resolve relative anchors into delivery instants using shared time policy.
- Recalculate when source timing, timezone, recurrence, or completion changes.
- Cancel superseded schedules safely.
- Use idempotency keys to prevent duplicate scheduled deliveries.

### 2.3 Delivery channels

- In-app reminders are the baseline channel.
- System notifications are permission-gated.
- Future email, wearable, or platform channels remain adapters.
- Channel failure does not mutate the source event or task.

### 2.4 User controls

- Snooze to a duration, time, or date.
- Dismiss one occurrence without changing future recurrence.
- Respect quiet hours, disabled calendars or lists, and notification permission.
- Explain why a reminder fired and what source produced it.

### 2.5 Reliability

- States: pending, scheduled, delivered, snoozed, dismissed, cancelled, failed,
  and superseded.
- Record attempt count, last error category, and next retry.
- Reconcile overdue schedules after app restart without flooding the user.

## 3. Global search and command surface

### 3.1 Unified search

- Search events, tasks, notes, and later commands from one surface.
- Domains provide searchable projections and deep-link targets.
- Search owns indexing and ranking, not canonical content.

### 3.2 Query behavior

- Normalize case, punctuation, and diacritics according to locale.
- Support quoted text and filters for type, date, status, tag, calendar, list, and
  linked entity.
- Return useful local results while offline.
- Exclude deleted or inaccessible records by default.

### 3.3 Ranking

- Combine text match, recency, upcoming relevance, pin state, and current context.
- Keep ranking explainable and deterministic enough for stable use.
- Private activity MUST NOT be used for manipulative engagement ranking.

### 3.4 Deep links

- Resolve to the correct date, entity, occurrence, or note block.
- Preserve navigation context so back returns to search.
- Handle archived, deleted, moved, or unavailable targets explicitly.

### 3.5 Command palette foundation

- Commands MAY share the search surface after explicit selection.
- Destructive commands require confirmation where appropriate.
- Keyboard shortcuts are discoverable, remappable in the future, and disabled while
  text input owns the same keystroke.

## 4. Gamification and humane motivation

### 4.1 Reward boundary

- Gamification reacts to verified task completion and review actions.
- It never owns task completion state.
- Calendar attendance and private note writing do not grant rewards by default.

### 4.2 Points and levels

- Point awards are idempotent per completion record.
- Reopening a task reverses or invalidates its award predictably.
- Level thresholds are versioned so policy changes do not corrupt history.
- Displayed celebration never blocks core planning actions.

### 4.3 Streaks

- Define exactly which behavior qualifies and which timezone/day boundary applies.
- Preserve a grace policy separately from completion history.
- Recurring-task streaks do not manufacture overdue task debt.
- Streak loss is communicated neutrally without shame or artificial urgency.

### 4.4 Controls

- Users can disable sound, haptics, celebrations, points, levels, and streaks.
- Reduced-motion settings suppress non-essential animation.
- Core task and calendar behavior remains complete when gamification is disabled.

### 4.5 Auditability

- Store immutable award entries with reason, source, policy version, and reversal.
- Rebuild totals from the ledger when needed.
- Prevent duplicate awards after retries, imports, or repeated completion events.

## 5. Settings and preferences

### 5.1 Profile preferences

- Locale, timezone, planning-day boundary, week start, date format, and 12/24-hour
  clock.
- Working days, working hours, and default planning duration.
- Preferences have safe defaults and explicit schema versions.

### 5.2 Domain defaults

- Default calendar, event duration, event reminders, task list, task reminder,
  note template, and inbox behavior.
- A changed default affects new records, not existing records unless the user asks.

### 5.3 Experience preferences

- Theme, density, text size, sound, haptics, reduced motion, and gamification.
- Calendar density and business rules remain independent from visual theme.
- Respect operating-system accessibility preferences by default.

### 5.4 Notification preferences

- Permission state, enabled channels, quiet hours, and per-domain controls.
- Explain when browser or operating-system permission blocks delivery.
- Disabling delivery preserves reminder intent unless the user removes it.

### 5.5 Reset and recovery

- Reset one preference group or all preferences separately from user content.
- Destructive data reset requires clear scope and confirmation.
- Export is offered before full local-data deletion when storage is available.

## 6. Persistence, migrations, and portability

### 6.1 Repository ports

- Each domain defines repository interfaces around domain concepts.
- Platform persistence implements those interfaces.
- UI code does not read or write browser storage directly.
- Transactions preserve invariants across records changed by one command.

### 6.2 Local-first baseline

- Core create, read, update, delete, recurrence, planning, and notes work offline.
- Persist canonical records, drafts, indexes, settings, and outbox state separately.
- Surface degraded or read-only storage before data is lost.

### 6.3 Schema versions

- Version the application backup and each persisted aggregate family.
- Migrations are deterministic, restartable, and covered by fixtures.
- Preserve compatible unknown fields.
- Never replace valid data with a failed migration result.

### 6.4 Import and export

- Native JSON backup includes schema version and integrity metadata.
- Preview counts, conflicts, unsupported data, and destructive impact.
- Support merge, replace, copy, or skip as appropriate to identity.
- ICS and Markdown exports remain domain-specific projections.

### 6.5 Backup and recovery

- Provide manual export from the local-first release.
- Future automatic backup remains a platform adapter.
- Detect interrupted writes and retain the last known valid snapshot.
- Recovery actions explain data age and scope.

### 6.6 Deletion and retention

- Soft-delete domain records before permanent removal.
- Keep retention policy explicit by record type.
- Permanent deletion clears dependent indexes and platform blobs without deleting
  unrelated linked records.

## 7. Shared time, recurrence, validation, and identity

### 7.1 Time primitives

- Date-only, local date-time, instant, duration, timezone, and planning-day types.
- Centralize date arithmetic, parsing, formatting, comparison, and DST policy.
- UI components consume formatted values and commands rather than implementing
  calendar calculations.

### 7.2 Recurrence primitives

- Share recurrence vocabulary and parsing without forcing Calendar and Tasks to
  share occurrence policies.
- Support frequency, interval, weekday selection, count, until, and exceptions.
- Domain-specific services decide missed-task behavior, event movement, and
  completion semantics.

### 7.3 Identity

- Internal IDs are immutable and provider-independent.
- Occurrence IDs are stable and derivable from a series and recurrence anchor.
- Idempotency keys protect retried commands and cross-domain workflows.
- Imported external IDs live in source metadata, never as sole canonical identity.

### 7.4 Validation

- Validate at domain command boundaries and import boundaries.
- Return structured field and invariant errors suitable for UI presentation.
- Preserve unknown compatible fields while rejecting malformed canonical data.
- Do not rely on form controls as the only validation layer.

### 7.5 Domain events

- Events include unique ID, type, aggregate ID, occurred-at time, schema version,
  causation ID, and correlation ID.
- Publish only after the owning state transition succeeds.
- Consumers are idempotent and tolerate replay.

## 8. Reliability, offline behavior, and future sync readiness

### 8.1 Operation states

- Commands expose pending, succeeded, rejected, conflicted, or failed outcomes.
- Distinguish validation, permission, storage, connectivity, and unexpected errors.
- Retain user input after recoverable failure.

### 8.2 Offline behavior

- Read and mutate local canonical data without a network connection.
- Queue future remote operations in an outbox without changing domain APIs.
- Show local-only, pending, conflicted, and failed state where it affects trust.

### 8.3 Conflict foundation

- Aggregates carry revision or version values.
- Mutating commands MAY require an expected version.
- Preserve both sides of an unresolved conflict.
- Provider conflict policy remains in future integration specifications.

### 8.4 Idempotency

- Every externally retried or cross-domain command accepts an idempotency key.
- Store successful results long enough to return them on retry.
- Duplicate delivery MUST NOT duplicate records, notifications, or rewards.

### 8.5 Error recovery

- Autosave and command failures are visible and retryable.
- Crashes do not discard persisted drafts or the last valid snapshot.
- Domain errors are safe for user display; technical detail goes to diagnostics.

## 9. Accessibility and interaction contracts

### 9.1 Keyboard

- Every core action has a keyboard path.
- Focus order follows visual and semantic order.
- Shortcuts do not fire while an input owns the keystroke.
- Focus returns predictably after dialogs, sheets, and destructive actions.

### 9.2 Screen readers

- Use semantic controls and meaningful accessible names.
- Announce save state, validation errors, reminders, drag alternatives, and undo.
- Time and recurrence labels are understandable without relying on visual position.

### 9.3 Direct manipulation alternatives

- Drag, swipe, hold, and pinch actions have button, menu, or keyboard equivalents.
- A gesture previews its result and can be cancelled.
- Failed gestures do not leave partial canonical mutations.

### 9.4 Visual accessibility

- Support text scaling and reflow.
- Do not encode category, status, conflict, or density with color alone.
- Respect reduced motion and sufficient contrast.
- Current-time indicators and focus rings remain distinguishable across themes.

### 9.5 Destructive safety

- Confirm permanent or broad deletion.
- Offer undo for recent recoverable changes.
- Describe scope explicitly for one occurrence, future occurrences, or full series.

## 10. Telemetry, privacy, and diagnostics

### 10.1 Product telemetry

- Collect only events needed to understand reliability and feature outcomes.
- Do not collect note content, event titles, task titles, locations, or attendee data.
- Use coarse categories and counts where possible.

### 10.2 Consent and controls

- Make analytics policy clear and configurable where required.
- Core planning remains functional without optional analytics.
- Deletion and export requests include applicable telemetry identifiers according to
  policy.

### 10.3 Diagnostics

- Record technical error category, app version, schema version, operation type,
  and anonymized correlation ID.
- Redact user-authored content and provider secrets.
- Diagnostic export is explicit and previewable.

### 10.4 Health signals

- Persistence write failure
- Migration failure
- Reminder scheduling and delivery failure
- Search index lag or corruption
- Command conflict and unhandled application error

## 11. Security foundation

### 11.1 Untrusted input

- Treat imports, pasted rich text, URLs, files, and future provider payloads as
  untrusted.
- Sanitize rendered content and prevent executable markup.
- Validate protocol allowlists for opened links.

### 11.2 Local data

- Avoid exposing planner content in logs, URLs, or analytics.
- Use platform-provided secure storage for future credentials.
- Browser storage limitations and shared-device risk are communicated honestly.

### 11.3 Authorization

- Domain commands enforce ownership and role policy even when the current release
  has one owner.
- UI visibility is not an authorization control.
- Cross-domain queries filter inaccessible linked records.

## Shared platform module targets

```text
src/
  app/
    commands/
    queries/
    workflows/
  domains/
    planner/
    reminders/
    gamification/
    search/
  platform/
    persistence/
    notifications/
    integrations/
    telemetry/
  shared/
    time/
    recurrence/
    validation/
    types/
  ui/
    primitives/
    patterns/
    themes/
```

---

# Delivery sequence

## Phase 1: Calendar domain foundation

**Implementation status:** Completed on 2026-08-09

Phase 1 extracts the calendar rules already exercised by the prototype into a
tested domain module without redesigning the visual experience.

### Included

- Shared date-key arithmetic that remains correct across DST boundaries.
- Event validation and canonical creation commands.
- Stable occurrence identity for daily, weekly, and monthly recurrence.
- One-occurrence exceptions and whole-series updates or deletion.
- Event move and resize commands.
- Day, date-range, density, and next-event queries.
- Deterministic overlap clustering and lane assignment.
- React adoption of calendar commands and queries for all current event behavior.
- Compatibility with the current local-storage schema and existing user data.
- Automated domain tests plus production build verification.

The implementation lives behind `src/domains/calendar/index.js`, uses shared
date-only primitives from `src/shared/time/dateKey.js`, and is adopted by the
current React planner for event reads and writes. Thirty-four automated tests
cover the initial Calendar and shared-time behavior at completion.

### Explicitly deferred

- Provider accounts and synchronization.
- Multiple calendar container UI and permissions.
- Canonical timezone-bound instants and timezone conversion UI.
- Cross-midnight and arbitrary multi-day timed events.
- Yearly and advanced monthly recurrence.
- Count-based recurrence and `this and following` series splitting.
- Added occurrences outside a recurrence rule.
- Durable trash retention beyond the existing immediate undo interaction.
- Reminder delivery extraction, advanced availability, and search indexing.
- Frontend visual and interaction polish.

## Phase 2: Calendar completeness

**Design status:** Phase 2A and Phase 2B approved on 2026-08-09

The detailed design is maintained in
`docs/superpowers/specs/2026-08-09-calendar-phase-2-design.md`.

### Phase 2A: Canonical time

- Immediate validated cutover from `nbmp:state:v4` to versioned v5 state.
- Canonical all-day, floating timed, and timezone-bound timed event models.
- Exclusive all-day end dates.
- DST ambiguity and skipped-time handling.
- Cross-midnight and multi-day timed events.
- Shared timezone projection and per-day event segmentation.
- Existing editor extensions without visual redesign.

### Phase 2B: Advanced recurrence

- Daily, weekly, monthly, and yearly rules.
- Count, until, selected weekdays, month-day, nth-weekday, last-weekday, and
  missing-date policies.
- Stable recurrence anchors and typed modified, moved, cancelled, and added
  exceptions.
- This occurrence, this and following, and entire-series edits.
- Atomic series splitting, exception reassignment, occurrence aliases, orphan
  detection, and exact recovery.
- Existing recurrence editor extensions and occurrence preview.

### Later Phase 2 subprojects

- Calendar containers, visibility, defaults, and permissions.
- Availability, conflict detection, briefing projections, and reminder intents.

## Phase 3: Planner composition

- Extract Tasks and Notes behind their own commands, queries, and repositories.
- Introduce the day aggregate and cross-domain workflows.
- Extract Reminders, Search, Gamification, Settings, and persistence adapters.
- Complete accessibility alternatives and reliability projections.

## Phase 4: Integrations

- Add Google and Microsoft calendar and task adapters behind existing domain ports.
- Define sync, conflict, deletion, identity mapping, retry, and observability policy
  in provider-specific specifications.

---

# Decision log

| Date | Decision |
| --- | --- |
| 2026-08-09 | Use a domain-oriented modular monolith. |
| 2026-08-09 | Build personal-first while reserving collaboration-ready ownership and permissions. |
| 2026-08-09 | Defer provider integration while preserving provider-neutral ports and identity. |
| 2026-08-09 | Start Notes as daily, linked, and inbox notes inside a future-compatible notebook model. |
| 2026-08-09 | Deliver Calendar first by extracting current behavior behind tested domain commands and queries. |
