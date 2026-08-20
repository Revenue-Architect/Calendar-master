---
title: Hybrid Local-First External Sync & Cross-Pane Drag-to-Plan Engine
type: feature
status: proposed
date: 2026-08-20
origin: docs/adr/0001-domain-oriented-modular-monolith.md
target_domains:
  - src/domains/tasks/
  - src/domains/calendar/
  - src/features/planner/
  - src/platform/integrations/
  - src/platform/persistence/
---

# Hybrid Local-First External Sync & Cross-Pane Drag-to-Plan Engine

## 1. Executive Summary & Intent Grounding

This document specifies the complete production implementation plan for two core architectural capabilities designed in the **Intent** design cycle:

1. **Cross-Pane Drag-to-Plan Interaction**: A zero-latency, Apple-grade direct manipulation gesture allowing users to grab unscheduled tasks from the right-hand Actions pane and drop them onto the 24-hour Day Timeline with magnetic 15-minute grid snapping, grab-offset preservation, and single-source-of-truth task modeling (no duplicates).
2. **Hybrid Local-First Sync Gateway (Nylas / Google / Outlook)**: A background-reconciled synchronization engine connecting external calendar providers without compromising Calendar Master's 0ms local mutation contract, offline capability, or private notebook boundaries.

---

## 2. Core Principles & Architecture Invariants

Following [ADR 0001: Domain-Oriented Modular Monolith](docs/adr/0001-domain-oriented-modular-monolith.md) and the [Product Spec](PRODUCT.md):

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      ARCHITECTURE INVARIANTS                                     │
├────────────────────────────────┬────────────────────────────────┬────────────────────────────────┤
│ 1. 0ms Mutation Guarantee      │ 2. Strict Domain Isolation     │ 3. Apple Fluid Motion          │
│ All user interactions execute  │ Calendar Events (Google/MS)    │ Direct manipulation uses       │
│ synchronously in local memory; │ and Personal Tasks (private)   │ analytical damped springs;     │
│ network I/O is 100% out-of-band│ never mix schemas or badges.   │ gestures are 100% interruptible│
└────────────────────────────────┴────────────────────────────────┴────────────────────────────────┘
```

1. **Local-First Precedence**: Every user edit (dragging an action, rescheduling an event, completing a task) writes immediately to memory and local storage (`nbmp:state:v8`). Background network failures or sync latency must never freeze the UI loop.
2. **Strict Domain Boundary**:
   * **Calendar Events** (`src/domains/calendar/`): Canonical half-open intervals, attendees, meeting links (`JOIN`), and external cloud sync metadata (`✓ GOOGLE SYNCED`, `⚡ SYNCING`, `⚠️ CONFLICT`).
   * **Actions / Tasks** (`src/domains/tasks/`): Personal tasks, subtask DAGs, checklist items, and private tags. **Never synced to corporate Google Calendar**.
3. **No Duplicate Entities**: An action planned on the timeline maintains a single canonical identity (`taskId`). Dragging an already-scheduled action from either the timeline or the Actions pane moves the existing time block rather than creating clones.

---

## 3. System Architecture & Data Flow

```
                                  [ User Gesture / Drag Drop ]
                                                │
                                                ▼ (0ms Synchronous)
                                 [ Local State Store (Schema v8) ]
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     ▼                                                     ▼
        [ Immediate 60fps UI Render ]                            [ Local Sync Outbox ]
        • Task gains time chip [ 10:00 AM ]                      • Appends mutation record
        • Timeline renders planned action card                   • Background retry worker
                                                                           │
                                                                           ▼ (Async REST / Webhooks)
                                                                 [ Nylas Sync Platform ]
                                                                           │
                                                            ┌──────────────┴──────────────┐
                                                            ▼                             ▼
                                                   [ Google Calendar ]           [ Microsoft Outlook ]
```

---

## 4. Interaction & Motion Specifications

### A. Cross-Pane Drag-to-Plan Gesture Anatomy
* **Phase 1: Press & Disambiguation (0–200ms)**:
  * Pointer-down triggers instant press feedback: `transform: scale(0.97)` within `100ms ease-out`.
  * Pointer capture preserves exact grab offset (`grabOffset = { x, y }`).
  * Tap release before 200ms / 8px travel opens the standard task inspector.
* **Phase 2: Lift & Flight ($\ge 200\text{ms}$ or $> 8\text{px}$ travel)**:
  * Triggers haptic tick; card scales to `scale(1.03)` with ambient shadow (`0 16px 36px rgba(0,0,0,0.5)`).
  * Source list item dims to `opacity: 0.35` (holds layout space).
  * Floating avatar follows pointer using decomposed 2D springs (`stiffness: 450, damping: 32`).
* **Phase 3: Magnetic Snapping**:
  * As pointer crosses the timeline pane boundary, translucent ghost block snaps to nearest 15-minute grid (`15px = 15 mins`).
  * Height reflects task duration (defaults to 30m if unspecified).
  * Header displays live projection: `✦ Rebuild pricing tier math · 10:00 AM – 10:45 AM`.
* **Phase 4: Release & Velocity Handoff**:
  * **Drop on Timeline**: Floating avatar animates into the snapped target slot inheriting release velocity: `spring({ damping: 0.85, response: 0.32s, velocity })`.
  * **Abort / Drop in Void**: Critically damped return to source card: `spring({ damping: 1.0, response: 0.28s })`.
  * **Undo Support**: Creates atomic snapshot in history ledger; pressing `⌘Z` or clicking toast `[UNDO]` cleanly unschedules the task.

### B. Kinetic & Spring Parameter Tokens

| Interaction Phase | Damping Ratio ($\zeta$) | Response Time ($T_0$) | Visual Behavior |
| :--- | :--- | :--- | :--- |
| **Pointer Down Press** | `1.0` | `0.10s` | Instant tactile feedback (`scale: 0.97`) |
| **Active Drag Tracking** | `1.0` | `0.00s` (Direct) | 1:1 hardware-accelerated tracking |
| **Timeline Slot Settle** | `0.85` | `0.32s` | Subtle physical settle bounce on commit |
| **Abort Return to List** | `1.0` (Critical) | `0.28s` | Non-distracting, zero-bounce return |

---

## 5. Detailed Implementation Phases

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│         PHASE 1         │ ──► │         PHASE 2         │ ──► │         PHASE 3         │
│ Core Gesture Coordinator│     │ Action-Timeline Dual ID │     │ Sync Outbox & Platform  │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
             │                                                               │
             ▼                                                               ▼
┌─────────────────────────┐                                     ┌─────────────────────────┐
│         PHASE 4         │ ──────────────────────────────────► │         PHASE 5         │
│ Conflict UI & Micro-Anim│                                     │ E2E Automated Regress.  │
└─────────────────────────┘                                     └─────────────────────────┘
```

### Phase 1: Cross-Pane Gesture Coordinator (`src/features/planner/`)
- [ ] Create `src/features/planner/crossPaneDragCoordinator.js`:
  - Manage pointer capture, 200ms hold timer, travel distance threshold, and velocity history buffer.
  - Implement analytical spring solver for drop and abort animations.
- [ ] Create `src/features/planner/GhostSlotProjection.jsx`:
  - Render magnetic snap preview on the 24-hour timeline grid.
  - Display dynamic start/end timestamps based on task estimated duration.

### Phase 2: Action-to-Timeline Dual Identity & Task Commands
- [ ] Extend [`src/domains/tasks/commands/taskCommands.js`](file:///C:/Users/Kamran/calendar-master/src/domains/tasks/commands/taskCommands.js):
  - Ensure `planTaskCommand(taskId, { dateKey, timeMinutes, duration })` idempotently updates the task without duplication.
  - Wire `unscheduleTaskCommand(taskId)` to remove time bounds while preserving list assignment.
- [ ] Update timeline rendering in [`src/Planner.jsx`](file:///C:/Users/Kamran/calendar-master/src/Planner.jsx):
  - Render planned tasks alongside calendar events with distinct styling (`action-card-timeline` with task checkbox and tag).
  - Enable direct timeline drag-to-reschedule and edge-resizing on planned action cards.
  - Wire two-way sync to the right-rail Actions list item (displaying active time badge).

### Phase 3: Hybrid External Sync Platform Port (`src/platform/integrations/`)
- [ ] Create `src/platform/integrations/nylas/`:
  - `nylasClient.js`: Unified REST client for Nylas v3 Grant API.
  - `nylasAdapter.js`: Translate Nylas Event payloads into canonical Calendar domain records.
- [ ] Create `src/platform/persistence/syncOutboxQueue.js`:
  - Store pending mutations in `nbmp:outbox:v1`.
  - Background worker with exponential backoff and retry mechanisms.
  - Offline listener to pause/resume queue execution.

### Phase 4: Conflict Resolution Sheet & Micro-Interactions
- [ ] Create `src/features/planner/SyncConflictSheet.jsx`:
  - Non-blocking popover anchored to conflicted event cards.
  - Offer explicit 1-tap options: `[ACCEPT REMOTE TIME]` vs `[KEEP LOCAL TIME]`.
- [ ] Add micro-sync badge state transitions:
  - `✓ GOOGLE SYNCED` (solid green)
  - `⚡ SYNCING...` (breathing opacity pulse)
  - `⚠️ CONFLICT` (amber border + warning chip)

### Phase 5: Automated Test Suite & Regression Coverage
- [ ] Add Unit Tests in `src/domains/tasks/tests/`:
  - Test task planning idempotency and single-source-of-truth invariants.
  - Test unscheduling and duration adjustments.
- [ ] Add Playwright E2E Tests in `tests/e2e/`:
  - `tests/e2e/cross-pane-drag.spec.js`: Test drag from actions list to timeline, magnetic snapping, and timeline repositioning.
  - `tests/e2e/sync-conflict.spec.js`: Test conflict sheet interactions and resolution choices.

---

## 6. Verification Criteria & Acceptance Tests

1. **Gesture Disambiguation**: Quick vertical flick on Actions list scrolls the container; holding for 200ms lifts the card into drag mode with zero accidental scrolling.
2. **Snapping Accuracy**: Dragging to any point between 10:01 AM and 10:14 AM snaps cleanly to 10:00 AM; 10:16 AM to 10:29 AM snaps to 10:15 AM.
3. **No Duplicate Records**: Scheduling the same task 5 times results in exactly 1 task record with updated timestamps.
4. **Rescheduling Fluidity**: Planned tasks on the timeline can be dragged to a new hour slot directly on the timeline or from the right rail.
5. **Undo Reliability**: Pressing `⌘Z` immediately removes the timeline block and restores the unscheduled state in the Actions rail.
6. **Sync Boundary Integrity**: Personal tasks never emit API requests to external calendar endpoints; only Calendar Events participate in the sync outbox.

---

## 7. Artifacts & Reference Implementations
* **Interactive Sandbox Prototype**: [`interactive-sandbox.html`](file:///C:/Users/Kamran/calendar-master/interactive-sandbox.html)
* **Architecture Reference**: [`docs/adr/0001-domain-oriented-modular-monolith.md`](file:///C:/Users/Kamran/calendar-master/docs/adr/0001-domain-oriented-modular-monolith.md)
* **Living Product Spec**: [`docs/product/planner-foundation.md`](file:///C:/Users/Kamran/calendar-master/docs/product/planner-foundation.md)
