# Tasks Phase 2 Implementation Plan

**Goal:** Make the Tasks domain authoritative — cut persistence over to schema v6, expand recurring tasks through the domain, and have the interface read and write canonical tasks instead of the legacy fields.

**Architecture:** `Planner.jsx` keeps presentation and effects; every task read goes through `domains/tasks` queries and every task write goes through a domain command. Recurring series stay unexpanded in storage and are materialised per day on read.

## Status

Complete.

| Area | Module | State |
| --- | --- | --- |
| Task recurrence, occurrence identity, missed policies (§9.1–9.5) | `recurrence/taskRecurrence.js` | Done |
| Day and overdue read model | `queries/dayView.js` | Done |
| v5 → v6 migration | `migrations/migrateV5ToV6.js` | Done |
| v6 structural validation | `migrations/validatePlannerStateV6.js` | Done |
| Confirmed-write cutover | `platform/persistence/plannerStateStore.js` | Done |
| Interface adoption | `src/Planner.jsx` | Done |
| Dependency surfacing (§15) | `src/Planner.jsx` | Done |
| Tests | `tests/recurrence.test.js`, persistence tests | Done — 131 total |

## Decisions worth keeping visible

- **A v4 notebook upgrades straight to v6 in one confirmed write.** Landing on v5
  first would leave an interrupted upgrade stranded on an intermediate version.
  The confirmed-write policy is unchanged: migrate in memory, write, read back,
  validate, and only then remove the older key.
- **Legacy `subs` migrate to checklist items, not subtasks.** They never had a
  schedule, deadline, reminder or history, and calling them subtasks would claim
  capabilities the data does not have. Promotion (§8.4) is how a step earns real
  subtask identity, and the interface now exposes that.
- **Legacy repeating tasks adopt `missedPolicy: "skip"`.** This is the policy their
  behaviour should always have had; it is what stops one daily habit reading as
  fourteen overdue rows.
- **Editing one occurrence detaches it.** Completing or reopening an occurrence
  records a typed exception so series history stays intact; any other edit detaches
  that occurrence into a real one-off task and cancels it on the series.
- **`PULL IN` became `PLAN TODAY`.** Under §5.5 overdue is a deadline fact, so
  planning work for today cannot clear it — only completing the task or moving the
  deadline can. The old label promised something the rule no longer allows.

## Carried into Tasks Phase 3

- [ ] Task lists and tags as user-manageable records (§4.1, §4.2). v6 stores a
      default list and the Inbox system list, but there is no interface to create,
      rename, or move between lists.
- [ ] Smart views as navigable surfaces (§4.3). The queries exist and are tested;
      the interface still shows a single day plus overdue and deadlines.
- [ ] Bulk selection and partial-failure reporting (§11.3).
- [ ] Dependency authoring in the interface. Edges are modelled, validated,
      surfaced on the card and enforced advisorily at completion, but there is no
      picker yet for choosing a blocker — they can only be set programmatically.
- [ ] `getEarliestResponsibleStart` (§15.6) is implemented and tested but not yet
      wired to a scheduling warning.
- [ ] Waiting state and follow-up dates (§2.4) are modelled but not exposed.
- [ ] Task reminders (§12), which remain calendar-only today.
