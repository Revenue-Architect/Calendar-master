# Tasks Phase 1 Implementation Plan

**Goal:** Establish the Tasks domain foundation behind a public `domains/tasks` API — canonical task model, hierarchy, dependencies, planning semantics, lifecycle commands, and smart-view queries — with behavior driven by the approved specification rather than by the current screen.

**Architecture:** Mirrors Calendar Phase 1. Domain functions are pure, immutable, and browser-independent; the caller supplies ids and timestamps so results are reproducible under test. Commands return `{ tasks, events }` so Calendar, Notes, Reminders, and Gamification can react without Tasks importing them.

**Tech Stack:** JavaScript ES modules, Node built-in test runner.

## Global constraints

- Work directly on `main` because the user explicitly requested it.
- Do not add provider integration or provider-shaped canonical data.
- Do not redesign the frontend in this phase.
- Reward calculation stays outside the domain (§10.1); commands emit events instead.
- Production code must be browser-independent and tested through the public API.

## Status

Complete, with one deliberate carry-over recorded below.

| Area | Module | State |
| --- | --- | --- |
| Statuses and transitions (§2.1, §2.3) | `model/taskStatus.js` | Done |
| Canonical task, planned vs deadline (§3, §5.1–5.3) | `model/task.js` | Done |
| Checklist items (§8) | `model/checklistItem.js` | Done |
| Hierarchy, depth, progress (§7) | `hierarchy/taskHierarchy.js` | Done |
| Dependencies (§15) | `dependencies/taskDependencies.js` | Done |
| Derived states and overdue policy (§2.2, §5.5) | `planning/derivedState.js` | Done |
| Lifecycle commands (§14.1) | `commands/taskCommands.js` | Done |
| Smart-view queries (§4.3, §14.2) | `queries/taskQueries.js` | Done |
| Domain events (§14.3) | `events/taskEvents.js` | Done |
| Behavior tests (§14.4) | `tests/*.test.js` | Done — 39 tests |

## Decisions worth keeping visible

- **Overdue derives from deadlines only (§5.5).** A planned date is an intention the
  user may move without penalty, so a passed planned date does not create overdue
  debt. A task with no deadline never becomes overdue.
- **`skip` is the default missed-occurrence policy (§9.3).** One daily habit would
  otherwise manufacture unbounded overdue debt, which is the failure this planner
  already exhibited before the domain existed.
- **Dependencies are stored once and derived in the inverse direction (§15.1).**
  A two-sided edge is the standard way a graph ends up disagreeing with itself.
- **Cancelled and archived blockers are satisfied (§15.3).** Otherwise abandoning a
  blocker deadlocks every dependent permanently.
- **Blocking is advisory and recorded, not enforced (§15.4).** Completing past a
  blocker requires an explicit override and is marked on the task, consistent with
  parent completion.
- **Hierarchy edges cannot double as dependencies (§15.2).** Parent progress already
  encodes that ordering; a second encoding produces a task that can never start.

## Carried into Tasks Phase 2

These are intentionally not in this phase, and the app is unaffected because the
stored task shape has not changed yet.

- [ ] Persistence cutover: `migrateV5ToV6` plus a v6 validator promoting stored tasks
      to the canonical shape, following the confirmed-write policy used for v5.
- [ ] `Planner.jsx` adoption of the Tasks public API, replacing the legacy
      `done` / `subs` / `at` / `due` / `order` fields at the call sites.
- [ ] Task recurrence expansion and occurrence identity (§9.1–9.5), mirroring
      Calendar Phase 2B, including `roll_forward` behavior.
- [ ] Task lists and tags as first-class records (§4.1, §4.2).
- [ ] Bulk selection and partial-failure reporting (§11.3).
- [ ] Dependency surfacing in the interface: blocker chips, an unblock affordance,
      and the §15.6 earliest-responsible-start warning.
