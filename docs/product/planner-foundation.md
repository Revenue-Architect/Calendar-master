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
- Inbox additionally requires status `open`. Starting a task or moving it to
  waiting is triage, so those have left the inbox even when they carry no dates.

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

- A task reminder MUST be stored as an anchor plus an offset, never as an
  absolute time. Rescheduling a task then moves its reminder with it instead of
  firing at the moment the task used to occupy.
- Supported anchors are the planned time, the deadline, and the follow-up date.

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
- `AddTaskDependency`
- `RemoveTaskDependency`

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
- `GetBlockedTasks`
- `GetTaskBlockers`
- `GetEarliestResponsibleStart`

### 14.3 Domain events

- `TaskCreated`
- `TaskChanged`
- `TaskPlanned`
- `TaskDeferred`
- `TaskCompleted`
- `TaskReopened`
- `TaskDeleted`
- `TaskHierarchyChanged`
- `TaskDependenciesChanged`
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

## 15. Task dependencies

### 15.1 Dependency model

- A dependency is a directed "is blocked by" edge from a dependent task to a
  blocker.
- The edge is stored once, on the dependent task, as `dependsOn`.
- The inverse "blocks" direction MUST be derived rather than stored, so the two
  directions can never disagree after a partial write.
- Dependencies form a directed acyclic graph. Cycles MUST be rejected when the
  edge is added, evaluating the full transitive closure rather than direct edges
  only.
- A dependency references a task. Occurrence-level dependencies are deferred.

### 15.2 Permitted edges

- A task MAY depend on any other task, across lists and across parents.
- A task MUST NOT depend on itself.
- A task MUST NOT depend on its own ancestor or descendant. Hierarchy already
  defines that relationship through parent progress and parent completion, and a
  second, contradictory encoding of it produces a task that can never start.
- Subtasks under different parents MAY depend on each other. This is the case
  dependencies exist to serve: sequencing work across two workstreams.
- Adding an edge that already exists succeeds without duplicating it.

### 15.3 Satisfaction

- A dependency is satisfied when its blocker reaches a settled status:
  `completed`, `cancelled`, or `archived`.
- Cancelled and archived blockers MUST count as satisfied. Abandoned work that
  still blocks its dependents would strand them permanently with no path
  forward.
- A task is blocked when at least one of its dependencies is unsatisfied.
- Blocked is a derived state (§2.2) and MUST NOT be stored as a status.

### 15.4 Advisory enforcement

- Blocking is advisory, consistent with parent completion (§7.4).
- Starting or completing a blocked task MUST surface the unsatisfied blockers
  and MUST NOT proceed silently, but the user MAY override.
- An override MUST be recorded on the task's history.
- A hard block would strand users who know something the graph does not, which
  is why the domain reports blockers and leaves refusal to the caller.

### 15.5 Lifecycle integrity

- Deleting a task MUST remove every edge that references it. Dangling blocker
  references would make dependents permanently and invisibly blocked.
- Deleting a blocker MUST NOT delete its dependents.
- Undo MUST restore removed edges from the original command result (§10.3),
  not by reconstructing them.
- A checklist item promoted to a task (§8.4) participates in dependencies like
  any other task.

### 15.6 Scheduling intelligence

- The earliest responsible start date is the latest known date among unsatisfied
  blockers, preferring a blocker's deadline and falling back to its planned date.
- Planning work before that date SHOULD warn, consistent with §5.3.
- Dependencies MUST NOT move dates automatically. Tasks exposes the query and
  Planner owns the warning.

## Tasks module target

```text
domains/tasks/
  model/
  commands/
  queries/
  hierarchy/
  dependencies/
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

## 15. Notes Phase 3: notebook and contextual writing

**Status:** Approved for delivery on 2026-08-09

This is the first user-facing organization slice. It deliberately exposes useful
views over one existing system notebook instead of introducing notebook creation,
folders, sharing, or storage-backed attachments. The user outcome is simple: a
note can start on its own or in the context of work, and it remains easy to find
from either direction.

### 15.1 Notebook surface

- Expose **All**, **Pinned**, and **Archived** as derived views over the same note
  records. These views MUST NOT copy or move documents.
- **All** includes every active note: daily, standalone, event-linked, and
  task-linked. **Pinned** includes active pinned notes only. **Archived** includes
  archived notes only.
- The surface MUST create a standalone note with a durable ID and the default
  system notebook. A title or document body is sufficient to save it.
- A note row shows its title or excerpt, its context, and its pin/archive state;
  opening it always edits the canonical note.
- Pinning and archiving preserve note ID, block IDs, links, and revision history.
  Archived notes leave All and Pinned immediately; restoring returns them to All.

### 15.2 Contextual notes and backlinks

- Event and task detail views expose a notes section and a **New note** action.
- A note created from an event stores an `event` link. For a recurring event, the
  current occurrence is represented by the series ID plus `occurrenceDate`; a
  series-level note has no `occurrenceDate`.
- A note created from a task stores the canonical task-series ID, never a rendered
  recurring-occurrence ID. Subtasks use their own stable task ID when present.
- Backlinks are derived from `NoteLink` records, not duplicated onto Calendar or
  Tasks. Entity detail views query and render only matching notes.
- Completing, deleting, moving, or rescheduling a task/event never deletes a
  linked note. An unresolved target remains a recoverable note link.

### 15.3 Boundaries and acceptance criteria

- Notes remains the owner of documents, metadata, revisions, and link records;
  Calendar and Tasks expose references only.
- The Notes domain query layer owns view membership and contextual-link matching;
  React supplies IDs, timestamps, and navigation effects.
- Automated coverage proves view membership, archive/pin transitions, standalone
  creation, recurring-event occurrence matching, task canonical-ID matching, and
  block identity stability during shorthand edits.
- Browser coverage proves standalone capture, all/pinned/archived transitions,
  event/task note creation, backlink opening, reload persistence, and keyboard
  isolation while each sheet is open.
- Deferred: notebook CRUD/folders, inbox processing states, note tags UI,
  templates, attachments, draft conflict resolution, collaboration, and provider
  integration.

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

**Implementation status:** Phase 2A and Phase 2B completed on 2026-08-09

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

The implementation is exposed through `src/domains/calendar/index.js`. Seventy-six
automated tests cover Calendar and shared-time behavior at Phase 2 completion, and
the production Vite bundle plus local development-server module smoke check pass.
Provider integrations, calendar management UI, availability, conflict detection,
reminder extraction, and frontend polish remain intentionally deferred.

### Later Phase 2 subprojects

- Calendar containers, visibility, defaults, and permissions.
- Availability, conflict detection, briefing projections, and reminder intents.

## Phase 3: Planner composition

- Extract Tasks and Notes behind their own commands, queries, and repositories.
- Introduce the day aggregate and cross-domain workflows.
- Extract Reminders, Search, Gamification, Settings, and persistence adapters.
- Complete accessibility alternatives and reliability projections.

### Phase 3A delivery record — 2026-08-10

- `domains/planner` now composes the selected day as a read-only projection of
  Calendar, Tasks, and Notes. It preserves source identities and keeps a usable
  day when an optional source is unavailable; it never persists a duplicate record.
- The React shell consumes the shared day projection for selected-day events,
  actions, notes, overdue debt, and deadlines. Presentation, direct manipulation,
  and source-domain commands remain at their existing boundaries.
- Daily review reports completed work, unfinished planned work, notes, and event
  count. Schedule variance is deliberately unavailable until an explicit event
  attendance or actual-time model exists; a calendar entry alone is not evidence
  that a meeting happened.

### Phase 3B delivery record — 2026-08-10

- `domains/reminders` owns a durable local delivery ledger, while Calendar alerts
  and Task reminders remain source intent. Schedules are derived by stable source,
  occurrence, intent, and resolved-time identities, so a changed source supersedes
  rather than duplicates an active reminder.
- The ledger persists independently from the planner notebook. It supports bounded
  reconciliation, in-app delivery, snooze, dismissal, cancellation, and audit
  timestamps without mutating source events or tasks.
- Browser notifications are a permission-gated best effort while the app runs.

### Phase 3D delivery record — 2026-08-10

- Preferences now persist in a versioned local aggregate separate from the v7
  notebook. Theme, clock format, sound, notification intent, reduced motion, and
  motivation controls affect future experience only; legacy display fields seed a
  new preference record once for compatibility.
- Motivation now uses an immutable ledger rather than mutable planner `xp`.
  Task completion awards are source- and action-idempotent; reopening records an
  explicit reversal; retries cannot create a second active reward. Levels and
  streaks are pure reads from unreversed task-completion entries, never from task
  debt or calendar attendance.
- A malformed preferences or motivation record does not overwrite the notebook.
  Each persistence failure remains visible at the existing device-save warning.
  Import and full wipe start a fresh ledger from the imported legacy opening
  balance while leaving device preferences intact.
  Closed-browser scheduling is intentionally deferred to a future platform adapter;
  the product does not claim an unavailable background service.

### Phase 3C delivery record — 2026-08-10

- `domains/search` now owns an offline, on-demand projection over canonical
  Calendar, Task, and Note records. It normalizes case, punctuation, and
  diacritics; handles quoted text plus the current `type`, `status`, `tag`,
  `date`, `list`, and `calendar` filters; records unsupported filters explicitly;
  and ranks results deterministically without persisting a duplicate index.
- Search deep links resolve from current source state. Calendar and Tasks each
  supply a next-occurrence query, so moved event exceptions and recurring task
  instances retain canonical IDs without React constructing recurrence identities.
  A missing, archived, or exhausted target returns an unavailable outcome rather
  than opening stale content.
- The Search sheet is now a feature adapter over those projections. Command
  palette actions, remote/background indexing, saved searches, and provider
  search remain intentionally deferred.

## Phase 4: Integrations

- Add Google and Microsoft calendar and task adapters behind existing domain ports.
- Define sync, conflict, deletion, identity mapping, retry, and observability policy
  in provider-specific specifications.

---

# Interface and presentation

**Status:** Approved on 2026-08-09

Presentation is specified separately from behavior. Nothing here changes what the
domains do; it constrains how their output is drawn so the same rules read the same
way everywhere.

## 1. Card language

### 1.1 Events and tasks are cards

- An event, an all-day entry, a scheduled task, and an action all render as a
  rounded rectangle lifted above the day surface, not cut into it.
- Corner radius is a single shared value; mixed radii read as mixed components.
- The lift is an opaque blend of the surface toward white on dark themes and
  toward black on light ones. Opacity would let the hour grid show through the
  card and break the sense that it sits above the page.

### 1.2 Colour belongs to the category

- Each category owns one colour, carried by a dot at the start of the card.
- Category colours are fixed rather than tinted per theme. A category keeps the
  same colour wherever it appears, which is what makes the dot scannable.
- Colours sit in the mid-luminance band so a single value reads on both a
  near-black and a cream ground.
- The dot is used instead of a full-height left rail because a card can be as
  short as one 22px row, where a rail is invisible.

### 1.3 Time is secondary to title

- The title is the primary line; the time is quieter and set in the mono face.
- A time range is written with an arrow, `09:00 → 11:00`, not a dash.
- On a card too short for a second line, the start time moves to the right edge
  of the title row rather than being dropped.
- An all-day entry shows no time at all; the `ALL DAY` section label carries it.

### 1.4 State is shown, not described

- A live event is outlined in the now colour and shows elapsed percentage.
- A past event is dimmed rather than restyled.
- A held card lifts further with a shadow and takes the accent outline.
- A draft slot drawn by holding on the canvas is an outline with its time range
  centred inside, so it reads as a space being claimed rather than an event that
  already exists.

## 2. Day view

### 2.1 The hour rail

- Hour labels sit in a fixed left gutter, right-aligned against the events lane.
- A label is centred on the rule it names, not dropped below it, so the eye reads
  the mark and its name as one thing.
- The rail omits `:00`. An hour label is a ruler mark, not a timestamp.
- The clock format is a display preference offered in 12-hour and 24-hour form.
  It changes labels only: minutes since midnight remain the single stored
  representation, so switching format can never move an event.

### 2.2 Depth without rules

- Alternating hour bands carry the sense of depth; the hourly hairline is faint
  enough to orient without drawing a table across the content.
- The events lane is inset from the gutter so no card touches a rule.
- Hour height is generous enough that a thirty-minute event is still a legible
  card rather than a strip.

### 2.3 Sections are labelled

- All-day entries sit in a labelled band above the timeline.
- The timeline itself is a labelled section, so an empty day still reads as a
  day with nothing in it rather than as a failure to load.

## 3. Agenda view

### 3.1 Two questions, one set of days

- The timeline answers "when, and for how long". The agenda answers "what is
  coming". They show the same days and the same data through the same domain
  queries, so an occurrence, an exception, or a missed habit behaves identically
  in both.
- The choice between them is a view mode, not a zoom level. Zoom changes how much
  time is on screen; view mode changes what the time is drawn as.

### 3.2 Days are a continuous run

- Days stack down a single rail, each labelled with its weekday and date.
- Today is outlined in the rail rather than filled, so it marks position without
  claiming selection.
- A day with nothing in it is still drawn. The gap is the information: the shape
  of a week is visible without counting entries.

### 3.3 Entries are one line of meaning each

- An entry shows its category dot, its title, and one trailing value.
- The trailing value is the start time for a timed event, `ALL DAY` for an
  all-day entry, the planned time for a scheduled action, and `ACTION` for an
  unscheduled one.
- A location appears under the title when there is one; nothing else competes for
  the row.
- Opening an entry from the agenda moves to its day first, so the detail view is
  always read in the context of the day it belongs to.

## 4. Detail view

### 4.1 Header states the essentials

- Title, then the time range, then the day, centred and in descending weight.
- An all-day entry says so in place of a range.

### 4.2 Figures the app can answer

- The two figures below the header are drawn from the item itself — length and
  time-to-start for an event, reward and step progress for a task.
- The view MUST NOT show figures the product has no source for. Borrowed
  metrics such as travel time or weather are not invented from nothing.
- A countdown reads in the largest unit that still says something useful, and an
  item that has begun reads as happening or ended rather than as negative time.

### 4.3 One attribute per row

- Each attribute is a single pill: an icon, the value in plain words.
- A pill tints itself only when the attribute carries meaning — the category's
  own colour, or the warning colour for something overdue or blocked.
- Attributes with no value are omitted rather than shown as an em dash, so the
  view length reflects how much is actually known.

### 4.4 A task detail is a working document

- A task opens left-aligned, not centred. Its checklist is a list to act on
  rather than a title card to read.
- Steps are full-width rows with their own control, and the add affordance is the
  same row shape so the list grows in place.
- Progress is a bar with its own count beside it.
- The facts that govern the task — when it is planned, whether it repeats, its
  reminder, its deadline, what blocks it — are grouped into one card so they read
  as a set of rules rather than a run of unrelated rows.
- Any relationship that can be created from this view MUST also be removable from
  it.

### 4.5 Editing is the detail view in an editable state

- An editor uses the same surfaces as the view it edits: filled rounded fields
  rather than outlined boxes, and the same grouping.
- An event is composed the way it is read — centred title above its day. An action
  is composed left-aligned, like the working document it becomes.
- Moving between reading and editing MUST NOT feel like moving between two
  different applications.
- An editor shows only what the entry cannot exist without. Everything else waits
  behind a disclosure, so adding a thing is one decision and refining it is a
  separate one.
- Everything selectable in an editor is the same shape. Mixing pills with boxed
  fields makes unrelated controls look like different kinds of thing.
- The disclosure animates open rather than appearing, so the form is understood as
  having grown rather than been replaced.

### 4.6 The detail view is the editor

- A detail view MUST be directly editable. Changing one attribute MUST NOT require
  opening a second surface: the value shown is the field, and touching it edits it.
- This applies to every attribute a person changes one at a time — title, time,
  duration, day, category, place, note, deadline, reward, reminder, status, list,
  tags, steps, and dependencies.
- A field reads as its value until it is touched. The control appears in place on
  the same surface the value occupied; nothing reflows around it, because a layout
  that jumps on focus makes the field feel like a different screen.
- A set of choices expands from the value rather than being permanently displayed.
  Collapsed, an attribute costs one line; expanded, it shows what else it could be.
- An edit commits when the field is left or confirmed, and is abandoned on escape.
  A field MUST NOT commit per keystroke: a half-typed title is not a title.

### 4.7 What stays behind a deliberate gesture

- Recurrence and time zone are NOT inline fields. They do not change one entry —
  they rewrite a series, or reinterpret every instant in it. They stay behind an
  explicit gesture with room to explain themselves.
- Creation stays a composer. Making a thing and refining a thing are different
  decisions, and the composer's job is to ask only what the entry cannot exist
  without (§4.5).
- Consequently the detail view MUST NOT carry a general "edit" action that reopens
  the record in another form. An action that leads elsewhere names what it is for.

### 4.8 An inline edit is the same write

- An inline edit MUST take the same write path as the same change made in the
  composer. Two paths to one record drift, and the drift shows up as a rule that
  is enforced on one route and not the other.
- In particular, editing an occurrence of a recurring entry MUST ask the same scope
  question (§6.5) — this day, this and following, or the whole series. Convenience
  is not a reason to guess: renaming one standup MUST NOT silently rename every
  standup.
- A record MUST have exactly one rendering. Where a view shows an attribute the
  editor does not, or the reverse, the two have already drifted.

## 5. Selection and bulk action

### 5.1 Selection reuses the completion control

- Entering selection turns each row's completion control into its selection
  control. No second checkbox appears and nothing changes position, so the list
  does not reflow under the pointer as the mode changes.
- Selection is entered explicitly and left explicitly. It never begins by
  accident from an ordinary tap.

### 5.2 A bulk action is many single actions

- Each selected task runs through the same command a single task would use, so a
  bulk run cannot bypass a rule that a single run enforces — a blocked task is
  still blocked when it is one of twenty.
- The result MUST report what actually changed and what refused, naming the
  reason. Reporting a clean total when part of the run was rejected is the
  failure mode bulk action exists to avoid, because the user's whole reason for
  operating on many things at once is that they are not watching each one.

## 6. Reach and recovery

### 6.1 Every frequent action has a keyboard path

- Completing, deferring, capturing and undoing MUST be reachable without a
  pointer. A hold, a swipe and a drag are good affordances and poor sole ones.
- Keyboard actions apply to the day's next open action, so no separate focus
  model has to be learned.
- Shortcuts are listed in Settings; an unlisted shortcut does not exist.

### 6.2 A row that shows work must lead to it

- Any row naming an entry MUST open that entry. A list that only displays is a
  dead end, and a deadline you cannot act on is worse than no deadline list.
- Opening from a summary navigates to the entry's own day first, so it is read in
  context.

### 6.3 Labels size to their content

- A label MUST NOT be clipped to a fixed width it cannot hold. Truncated or
  overlapping text is a correctness failure, not a cosmetic one.
- Where a long word will not fit, shorten the word rather than the box.

### 6.4 A tap must not undo itself

- Where a touch handler opens a surface, it MUST suppress the compatibility click
  the browser emits afterwards. That click lands on the surface it just opened and
  dismisses it, so the tap appears to do nothing at all.
- A surface MUST ignore a dismissal arriving in the same tap that opened it.
- Every tappable thing on a surface MUST be recognised by whatever handles that
  surface's touches. An element the handler does not know about is treated as
  background, and its own handler is suppressed along with the click.
- Listeners bound to an element MUST be rebound when that element is replaced. A
  view that unmounts and returns leaves an inert copy behind otherwise.

### 6.5 A surface that asks must be reachable

- A surface raising a question MUST stack above whatever prompted it. A question
  rendered beneath its own form cannot be answered, and the work that prompted it
  is lost on the way out.
- Cancelling a question returns to the surface that raised it with its state
  intact.

### 6.6 Deleting must not strand what referenced it

- Deleting a record MUST take its dependent records with it, or clear the
  references pointing at it. A stored child whose parent is gone fails
  whole-notebook validation, and once validation fails nothing saves at all —
  the interface keeps working while every change is silently discarded.
- What is removed travels in the command result so undo restores it rather than
  reconstructing it.
- A failed write MUST be visible on the surface the user is already looking at.
  A warning only reachable from a settings screen is not a warning.

### 6.7 Undo must actually reverse

- Every action that offers undo MUST be reversible by the payload it recorded.
- An undo affordance that does nothing is worse than none, because it is trusted.

## 7. Surfaces and density

### 7.1 Three depths only

- Page, day surface, and card. Additional depths make the hierarchy ambiguous.
- Sheets sit above all three on a scrim.

### 7.2 Quiet chrome

- Hour rules, free-slot hints, and empty states use the faint token, never the
  body colour. They orient without competing with content.
- The events lane is inset from the hour gutter so cards never touch the rules.

### 7.3 Turning a page

- A swipe past the threshold hands straight over to the page turn: the drag offset
  is dropped in the same commit, without its own return animation.
- Two transforms MUST NOT animate against each other on nested elements. A page
  springing back while its replacement rotates in reads as a glitch, not as two
  effects.
- An abandoned swipe returns with a transition, because there nothing else is
  moving.
- An element at rest sets no transform at all. A zero translate still creates a
  containing block and a compositing layer for no benefit.

### 7.4 Now, and the passage of time

- The current time is a rule in the theme accent, not a separate signal colour.
- A live event fills with the accent as it elapses, so "now" is expressed in the
  same colour system as everything else and reads as part of its card.
- Elapsed fill and the now rule move on the same easing, so the two never appear
  to disagree about the time.
- The rule runs up to a live event and stops; inside the card the elapsed fill
  carries the same accent onward and its leading edge continues the line. The rule
  is one continuous reading of "now" that flows into the event, never a line that
  disappears behind a card halfway across.

### 7.5 Density is countable

- A day cell shows its load as a small number of marks, capped, not as a wash of
  colour. A wash tints the whole strip and leaves the selected day competing with
  its neighbours.
- Selection is a filled cell; today, when not selected, is an outlined one.

### 7.6 Theme integrity

- Every colour resolves from the active theme except the category hues and the
  now colour, which are deliberately constant.
- The page background, browser chrome colour, and `color-scheme` follow the
  active theme so native controls match the page.
- A theme is a ground plus one accent. A new colour is a new theme on an existing
  ground, not a new palette, so the neutrals stay shared and comparable.
- Body text MUST reach 4.5:1 against the surface behind it, and a label on a
  filled control MUST reach 4:1 against its accent. The label on a primary button
  is the last text that should be hard to read.

## 8. Type

### 8.1 Three faces, fixed roles

- Sans carries titles and body.
- Mono carries times, labels, counts, and any value read as data.
- Serif italic carries written reflection: notes and empty-state prose.

### 8.2 Labels

- Section and metadata labels are uppercase mono with wide tracking.
- Labels name what follows; they never repeat a value shown beside them.

## 9. Written pages

### 9.1 A block reads as what it is

- Every block type the document model holds (§Notes 3.2) MUST render distinguishably
  on the page. A heading, a quote, a list line and prose MUST NOT share one style:
  if typing shorthand changes nothing visible, the shorthand is not worth typing.
- Headings take the label face (uppercase mono) rather than a larger body size, so a
  written page keeps the same typographic system as the rest of the product.
- A quote carries an accent rule down its left edge; a divider draws a hairline and
  no text; code keeps its own whitespace in mono on a raised surface.
- A numbered line counts from the start of its own run, not from its position in the
  document, so a list that follows prose still begins at one.

### 9.2 Marks render, source is preserved

- Inline marks (§Notes 3.5) MUST render as the mark, not as the punctuation that
  declares it. `**bold**` reads as bold.
- The stored text keeps the punctuation. Rendering MUST NOT rewrite what was typed:
  search indexes readable text, and the note stays legible outside this product.
- Anything derived from a line for another domain — a task extracted from a checklist
  — takes the readable text, not the punctuation.

### 9.3 History is reachable

- A note with earlier versions (§Notes 10.2) MUST offer a way into them from its
  editor, labelled with how many exist.
- History lists versions newest first, each with when it was taken and enough of its
  body to recognise. Going back to one MUST be a single action from that list.
- Going back is itself an edit: the version being left becomes the newest earlier
  version. Nothing in the history is erased by returning to an earlier point.
- A version whose checksum no longer matches its content is shown as damaged and
  cannot be restored. Putting corrupted text over a good document is worse than
  losing the snapshot.
- Deleting a note takes its history with it, and undoing the deletion MUST bring both
  back (§6.6, §6.7).

# Notes implementation status

The Notes domain foundation is implemented under `src/domains/notes`. What is built,
and what deliberately is not, is recorded in the Notes Phase 1 plan.

Built: the block document model with stable block identity and deterministic
serialization; daily, event, task and standalone note kinds; links with derived
backlinks; system views for daily, inbox, pinned and archived; search over title,
body and tags; revision counting that ignores no-op saves; checklist blocks with
task extraction guarded against duplication; and the v6 to v7 migration that turns
each legacy text note into a daily note of paragraph blocks.

Reachable from the interface: every block type through line shorthand, both to write
(`#`, `-`, `1.`, `[ ]`, `>`, `---`, fenced code) and to read back, since the editor
shows the same notation it parses; inline marks rendered as marks while the typed
punctuation stays in storage; and revision history, browsable from the note editor
with a single action to return to an earlier version. Revisions are recorded on save,
dropped with the note, and restored by undoing the deletion.

Not yet built: conflict resolution (§10.3), attachments (§11), notebooks and folders
as user-facing features (§8.4, §8.5), note templates and daily prompts (§4.3),
resurfacing (§9.4), inbox processing states (§6.1), and the collaboration fields
(§3.4). These remain specified above and unimplemented.

# Decision log

| Date | Decision |
| --- | --- |
| 2026-08-09 | Use a domain-oriented modular monolith. |
| 2026-08-09 | Build personal-first while reserving collaboration-ready ownership and permissions. |
| 2026-08-09 | Defer provider integration while preserving provider-neutral ports and identity. |
| 2026-08-09 | Start Notes as daily, linked, and inbox notes inside a future-compatible notebook model. |
| 2026-08-09 | Deliver Calendar first by extracting current behavior behind tested domain commands and queries. |
| 2026-08-09 | Cut planner persistence directly to validated v5 after a confirmed migration write; do not dual-write. |
| 2026-08-09 | Model event time as exclusive all-day, floating local, or explicit IANA-zoned intervals. |
| 2026-08-09 | Use stable recurrence anchors, typed exceptions, and atomic series splitting for recurring edits. |
| 2026-08-09 | Derive overdue from deadlines only, so replanning a task is never recorded as failure. |
| 2026-08-09 | Store task dependencies on the dependent task and derive the inverse, preventing two-sided drift. |
| 2026-08-09 | Treat cancelled and archived blockers as satisfied so abandoned work cannot deadlock its dependents. |
| 2026-08-09 | Keep dependency blocking advisory and recorded rather than enforced, consistent with parent completion. |
| 2026-08-09 | Require status `open` for Inbox, so starting or parking a task counts as triage. |
| 2026-08-09 | Anchor task reminders to an existing date plus an offset, never an absolute time. |
| 2026-08-09 | Migrate legacy sub-items to checklist items, not subtasks, and expose promotion instead. |
| 2026-08-09 | Upgrade a v4 notebook straight to v6 in one confirmed write, never landing on an intermediate version. |
| 2026-08-09 | Keep system and default task lists undeletable, and move rather than delete work when a list is removed. |
| 2026-08-09 | Draw events and tasks as lifted rounded cards rather than blocks cut into the day surface. |
| 2026-08-09 | Give each category one fixed colour carried by a dot, constant across every theme. |
| 2026-08-09 | Blend card lift opaquely so the hour grid never shows through a card. |
| 2026-08-09 | Centre hour labels on their rule and carry day-view depth with bands rather than rules. |
| 2026-08-09 | Offer 12-hour and 24-hour clocks as display only; minutes since midnight stay the stored form. |
| 2026-08-09 | Show only figures the product has a source for; never invent travel time or weather. |
| 2026-08-09 | Express "now" in the theme accent rather than a separate signal colour. |
| 2026-08-09 | Show day density as countable marks, not a colour wash across the strip. |
| 2026-08-09 | Give tasks their own detail layout: left-aligned, checklist-led, with grouped governing facts. |
| 2026-08-09 | Treat timeline and agenda as view modes over the same queries, not as separate zoom levels. |
| 2026-08-09 | Draw empty days in the agenda, because the gap is what shows the shape of a week. |
| 2026-08-09 | Require that any relationship creatable from a view is removable from it. |
| 2026-08-09 | Run every bulk action through the single-task command and report refusals by name. |
| 2026-08-09 | Reuse the completion control for selection so the list never reflows on entering the mode. |
| 2026-08-09 | Bound the page to one viewport below the desktop breakpoint so the day surface fills the space left. |
| 2026-08-09 | Store note content as identified blocks rather than a string, so links and extraction can reference a line. |
| 2026-08-09 | Carry unknown block attributes through migration rather than dropping what a later version wrote. |
| 2026-08-09 | Split migrated note text only on blank lines; never infer headings or lists from prose. |
| 2026-08-09 | Skip the revision bump when a save changes nothing, so autosave cannot inflate history. |
| 2026-08-09 | Allow one daily note per day; writing on a day that has one edits it rather than adding a second. |
| 2026-08-09 | Flow the now rule into a live event's elapsed fill rather than letting a card cut it off. |
| 2026-08-09 | Style each editor as its own detail view in an editable state, not as a separate form. |
| 2026-08-09 | Show only required fields in an editor; everything else expands behind a disclosure. |
| 2026-08-09 | Offer undo on completion, the most-used action and the easiest to trigger by accident. |
| 2026-08-09 | Let an action be captured with no day, which is what makes the Inbox reachable. |
| 2026-08-09 | Ask on first run whether to keep the sample notebook or start empty. |
| 2026-08-09 | Warn on overlapping events from the lane clusters; detect and warn, never prevent. |
| 2026-08-09 | Run the agenda backwards as well as forwards so past days are reviewable. |
| 2026-08-09 | Give every frequent action a keyboard path; a hold or swipe is never the only way. |
| 2026-08-09 | Require that a row naming an entry opens it, rather than only displaying it. |
| 2026-08-09 | Guard date navigation at its entry point so a bad key cannot take the screen down. |
| 2026-08-09 | Hold body text to 4.5:1 and filled-control labels to 4:1 against their accent. |
| 2026-08-09 | Hand a committed swipe straight to the page turn; never animate two transforms against each other. |
| 2026-08-09 | Suppress the compatibility click after a touch opens a surface, and ignore same-tap dismissals. |
| 2026-08-09 | Take dependent records with a deletion, and carry them in the result so undo restores them. |
| 2026-08-09 | Surface a failed write where the user already is, not only in settings. |
| 2026-08-09 | Stack a question above the surface that raised it, so it can be answered. |
| 2026-08-09 | Let a note line declare its own block type through shorthand rather than a toolbar. |
| 2026-08-09 | Show the editor the same notation it parses, so a type is never lost by editing. |
| 2026-08-09 | Record note revisions at checkpoints with a checksum, capped per note. |
| 2026-08-10 | Render each block type distinguishably; shorthand that changes nothing visible is not worth typing. |
| 2026-08-10 | Render inline marks while keeping the typed punctuation in storage, so a note stays legible elsewhere. |
| 2026-08-10 | Derive anything handed to another domain from the readable text, never the mark punctuation. |
| 2026-08-10 | Make going back to a version an edit of its own, so history is never erased by returning to it. |
| 2026-08-10 | Show a revision whose checksum fails as damaged rather than restoring corrupted text over a good page. |
| 2026-08-10 | Persist device preferences and motivation history separately from canonical planner content, preserving schema-v7 compatibility. |
| 2026-08-10 | Treat legacy XP as a one-time opening balance; only new auditable task completions and reversals change the motivation ledger. |
| 2026-08-10 | Read what a deletion removes before the state updater runs, since the payload is built before it does. |
| 2026-08-10 | Offer undo only where there is something to undo; a confirmation carries no button. |
| 2026-08-10 | Clamp a new entry's start to a minute the day actually has, so "now" near midnight cannot leave the day. |
| 2026-08-10 | Make the detail view the editor; changing one attribute never opens a second surface. |
| 2026-08-10 | Keep recurrence and time zone behind a deliberate gesture, because they rewrite a series rather than an entry. |
| 2026-08-10 | Route every inline edit through the composer's write path, so the scope question is asked identically. |
| 2026-08-10 | Expand a choice set from its value rather than displaying it permanently. |
| 2026-08-10 | Commit a field on leaving or confirming it, never per keystroke. |
