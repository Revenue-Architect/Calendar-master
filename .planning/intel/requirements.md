# Ingested Requirements

## REQ-personal-first
- source: docs/product/planner-foundation.md
- description: The product is personal-first. Ownership and permission boundaries MUST allow future collaboration without requiring collaborative features in the first release.
- acceptance: Support personal ownership now. Reserve owner, editor, contributor, and viewer roles. Collaboration features are not required in the first release.
- scope: ownership, permissions, collaboration-ready

## REQ-provider-integration-deferred
- source: docs/product/planner-foundation.md
- description: Provider integration will eventually cover calendars and tasks, but provider APIs and sync behavior are outside the current foundation work.
- acceptance: Preserve provider-neutral ports and identity. Do not implement Google Calendar, Microsoft Graph, CalDAV, or task-provider sync in foundation work.
- scope: integrations, calendars, tasks

## REQ-canonical-model
- source: docs/product/planner-foundation.md
- description: Product domains use a canonical internal model. Provider records, persistence formats, and UI component state are adapters around that model.
- acceptance: Provider payloads are translated at integration boundaries and are never used as canonical domain models.
- scope: domain model, adapters

## REQ-notes-extensible
- source: docs/product/planner-foundation.md
- description: Notes initially support daily notes, notes linked to events or tasks, and standalone inbox notes. Identity, ownership, content, and repository contracts MUST remain extensible toward a full notebook system.
- acceptance: Every note receives durable identity and belongs to a default system notebook internally. Capture MUST work with only text.
- scope: notes, notebook

## REQ-calendar-domain
- source: docs/product/planner-foundation.md
- description: Calendar owns time-bound commitments and navigation through time. It does not own provider APIs, task completion, note content, notification delivery, gamification, or visual presentation.
- acceptance: Events have immutable calendar identity, timed or all-day models, recurrence with stable occurrence identity, and shared queries for Day, range, density, and next event. React components MUST NOT implement calendar arithmetic.
- scope: calendar, events, recurrence

## REQ-tasks-domain
- source: docs/product/planner-foundation.md
- description: Tasks owns intentional work: capture, organization, planning, deadlines, recurrence, hierarchy, progress, and completion.
- acceptance: Inbox capture remains title-only and fast. Planned date and deadline are independent. Overdue derives from deadlines only. Subtasks are full tasks with parentTaskId. Checklist items are lightweight. Recurring missed-occurrence policy is skip, roll_forward, or accumulate.
- scope: tasks, inbox, overdue, checklists

## REQ-notes-domain
- source: docs/product/planner-foundation.md
- description: Notes owns captured knowledge, document content, organization, links, and revision history.
- acceptance: Drafts remain separate from the last committed revision. Removing a link MUST NOT delete the note. Soft-delete before permanent removal. Store content as identified blocks.
- scope: notes, revisions, daily notes

## REQ-shared-planner
- source: docs/product/planner-foundation.md
- description: Shared planner capabilities compose Calendar, Tasks, and Notes without taking ownership of their canonical records.
- acceptance: A composed day is a query result, not a persisted duplicate. Never move events or tasks automatically without confirmation. Cross-domain workflows are coordinated in app and never import another domain's persistence.
- scope: planner composition, plan mode, review mode

## REQ-reminders
- source: docs/product/planner-foundation.md
- description: Calendar and Tasks define reminder intent. Reminders owns scheduling, delivery, snooze, dismissal, retry, and audit state.
- acceptance: In-app reminders are the baseline channel. Channel failure does not mutate the source event or task. Prevent duplicate delivery.
- scope: reminders

## REQ-import-export
- source: docs/product/planner-foundation.md
- description: Application backup uses a versioned JSON format with schema validation.
- acceptance: Preview before replacement. Support merge or replace. Never replace valid state with an invalid import. Produce valid ICS for calendar export.
- scope: backup, ICS, migrations

## REQ-daily-notes-primary
- source: docs/product/planner-foundation.md
- description: Each user/date has at most one primary daily note. Opening the default daily-note editor resolves the primary note; if none exists, the first saved note becomes primary.
- acceptance: Uniqueness is enforced on primary placement, not a UI boolean. getPrimaryDailyNote(date) returns zero or one note. The default editor edits or creates the primary note. Changing timezone MUST NOT silently move a date-only daily note. Do not create empty daily records merely because a date was viewed.
- scope: daily notes, primary

## REQ-daily-notes-additional
- source: docs/product/planner-foundation.md
- description: A date may have additional day-linked notes created through an explicit add action. Users may designate another day-linked note as primary through an explicit action.
- acceptance: createAdditionalDailyNote(date) requires an explicit Add note or contextual creation action. designatePrimaryDailyNote(noteId, date) is an explicit user action. Event/task-linked notes remain separate and do not compete for the day's primary slot.
- scope: daily notes, additional
