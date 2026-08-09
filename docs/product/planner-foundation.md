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

**Status:** Awaiting product review

This section will be appended after its three-level capability model is approved.
