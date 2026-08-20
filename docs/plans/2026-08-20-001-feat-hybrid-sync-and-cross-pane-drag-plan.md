---
title: Hybrid Local-First External Sync, Cross-Pane Drag-to-Plan & Drag-to-Create Engine
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

# Hybrid Local-First External Sync, Cross-Pane Drag-to-Plan & Drag-to-Create Engine

## 1. Executive Summary & Intent Grounding

This document specifies the complete production implementation plan for the core scheduling and synchronization systems of Calendar Master, synthesized through our **Intent design cycle** and an in-depth source analysis of reference architectures (`ilamy-calendar` and `tududi`):

1. **Cross-Pane Drag-to-Plan Interaction**: A zero-latency, Apple-grade direct manipulation gesture allowing users to grab unscheduled tasks from the right-hand Actions pane and drop them onto the 24-hour Day Timeline with magnetic 15-minute grid snapping, grab-offset preservation, and single-source-of-truth task modeling (no duplicates).
2. **Timeline Drag-to-Create Gesture** *(Adapted from `ilamy-calendar`)*: Direct timeline slot carving—click and drag down across empty timeline space to dynamically draw a dashed time block with live time bounds (`10:00 AM – 11:30 AM`), opening the Quick Composer on release pre-filled with the exact range.
3. **Boundary Edge Auto-Scrolling** *(Adapted from `ilamy-calendar`)*: A 60fps `requestAnimationFrame` edge-detection loop that smoothly auto-scrolls the timeline container when a dragged pointer approaches within 40px of the viewport boundaries.
4. **Hybrid Local-First Sync Gateway & Visual Conflict Resolver** *(Adapted from `tududi` & Nylas v3)*: A background-reconciled synchronization engine connecting external calendar providers (Google Calendar / Microsoft Outlook) with a side-by-side field-level visual diff modal (`Accept Remote` / `Keep Local` / `Split`), preserving Calendar Master's 0ms local mutation guarantee.

---

## 2. Principal Engineer & Product Manager Engine Evaluation

### A. Drag & Drop (DnD) Engine Selection
* **Evaluation**: Custom Native Pointer Events vs. `@dnd-kit/core`
* **Verdict**: **Keep Custom Native Pointer Events**.
  * *Rationale*: `@dnd-kit` is built for discrete DOM containers (Kanban columns, sortable lists). Continuous 2D timeline dragging with sub-pixel rubber-banding, 15-minute snapping, and release velocity momentum projection runs with 0ms overhead on native pointer events without triggering React component tree re-renders.
  * *Adopted from reference repos*:
    1. **Edge Auto-Scroll Loop**: Steal `ilamy-calendar`'s `computeEdgeScroll` rAF solver for container edge acceleration.
    2. **Keyboard a11y Protocol**: Steal `@dnd-kit`'s WAI-ARIA keyboard navigation protocol (`Space` to lift $\to$ `Arrow Keys` to translate $15\text{m}$ $\to$ `Enter` to drop $\to$ `Esc` to cancel).

### B. Temporal & Date Engine Selection
* **Evaluation**: Custom `src/shared/time/` vs. `date-fns v4` vs. `dayjs`
* **Verdict**: **Keep Custom `src/shared/time/` Engine**.
  * *Rationale*: Zero bundle overhead (0 kB), canonical half-open interval arithmetic (`[start, end)`), strict floating local time separation from UTC moments, and 600 verified unit tests.
  * *Adopted Micro-Dependencies*:
    1. `chrono-node`: Lightweight natural language parser for Quick-Add text input (e.g. `"sync with team tomorrow at 3pm"`).
    2. `rrule`: Isolated RFC-5545 recurrence rule compliance module.

---

## 3. Core Principles & Architecture Invariants

Following [ADR 0001: Domain-Oriented Modular Monolith](docs/adr/0001-domain-oriented-modular-monolith.md) and [PRODUCT.md](PRODUCT.md):

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

1. **Local-First Precedence**: Every user edit (dragging an action, resizing a block, completing a task) writes immediately to memory and local storage (`nbmp:state:v8`). Sync network calls execute strictly in the background outbox.
2. **Strict Domain Boundary**:
   * **Calendar Events** (`src/domains/calendar/`): Canonical half-open intervals, attendees, meeting links (`JOIN`), and external cloud sync metadata (`✓ GOOGLE SYNCED`, `⚡ SYNCING`, `⚠️ CONFLICT`).
   * **Actions / Tasks** (`src/domains/tasks/`): Personal tasks, subtask DAGs, checklist items, and private tags. **Never synced to corporate Google Calendar**.
3. **No Duplicate Entities**: An action planned on the timeline maintains a single canonical identity (`taskId`). Dragging an already-scheduled action moves its time block rather than creating clones.

---

## 4. System Architecture & Data Flow

```
                                  [ User Gesture / Drag Drop / Create ]
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

## 5. Interaction & Motion Specifications

### A. Cross-Pane Drag-to-Plan Gesture
* **Phase 1: Press & Disambiguation (0–200ms)**:
  * Pointer-down triggers instant press feedback: `transform: scale(0.97)` within `100ms ease-out`.
  * Pointer capture preserves exact grab offset (`grabOffset = { x, y }`).
  * Tap release before 200ms / 8px travel opens the standard task inspector.
* **Phase 2: Lift & Flight ($\ge 200\text{ms}$ or $> 8\text{px}$ travel)**:
  * Triggers haptic tick; card scales to `scale(1.03)` with ambient shadow (`0 16px 36px rgba(0,0,0,0.5)`).
  * Source list item dims to `opacity: 0.35` (holds layout space).
  * Floating avatar follows pointer using decomposed 2D springs (`stiffness: 450, damping: 32`).
* **Phase 3: Magnetic Snapping & Auto-Scroll**:
  * As pointer crosses the timeline pane boundary, translucent ghost block snaps to nearest 15-minute grid (`15px = 15 mins`).
  * When pointer is within `40px` of container top/bottom, auto-scroll accelerates smoothly (`2–12px/frame`).
  * Header displays live projection: `✦ Rebuild pricing tier math · 10:00 AM – 10:45 AM`.
* **Phase 4: Release & Velocity Handoff**:
  * **Drop on Timeline**: Floating avatar animates into the snapped target slot inheriting release velocity: `spring({ damping: 0.85, response: 0.32s, velocity })`.
  * **Abort / Drop in Void**: Critically damped return to source card: `spring({ damping: 1.0, response: 0.28s })`.
  * **Undo Support**: Creates atomic snapshot in history ledger; pressing `⌘Z` or clicking toast `[UNDO]` cleanly unschedules the task.

### B. Timeline Drag-to-Create Gesture *(Adapted from `ilamy-calendar`)*
* **Trigger**: Click-and-drag down on empty canvas space where no event or task exists.
* **Visual Representation**: Translucent neon-accent bounding box with dashed perimeter (`border: 1.5px dashed var(--accent)`).
* **Live Timestamp Chip**: Floating pill above cursor showing dynamic range: `10:30 AM → 11:45 AM (1h 15m)`.
* **Release Behavior**: Opens Quick Composer Sheet with `{ startMinutes, endMinutes, dateKey }` pre-filled and title input autofocused.

### C. Side-by-Side Visual Conflict Resolver *(Adapted from `tududi`)*
* **Trigger**: Clicking on an event carrying a `⚠️ CONFLICT` badge.
* **UI Surface**: Anchored modal showing side-by-side field diff:
  * **Column 1 (Local Version)**: Title, Time, Location, Notes edited locally on-device.
  * **Column 2 (Remote Version)**: Incoming changes from Google Calendar / Outlook.
  * **Actions**: `[✓ ACCEPT REMOTE]`, `[★ KEEP LOCAL]`, or `[⎘ SPLIT INTO TWO EVENTS]`.

---

## 6. Detailed Implementation Phases

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│         PHASE 1         │ ──► │         PHASE 2         │ ──► │         PHASE 3         │
│ Core Gesture & AutoScrl │     │ Action-Timeline Dual ID │     │ Drag-to-Create Engine   │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
             │                                                               │
             ▼                                                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│         PHASE 4         │ ──► │         PHASE 5         │ ──► │         PHASE 6         │
│ Sync Outbox & Gateway   │     │ Visual Conflict Diff UI │     │ E2E Automated Regress.  │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

### Phase 1: Cross-Pane Gesture Coordinator & Edge Auto-Scroll (`src/features/planner/`)
- [ ] Create `src/features/planner/crossPaneDragCoordinator.js`:
  - Manage pointer capture, 200ms hold timer, travel distance threshold, and velocity history buffer.
  - Implement analytical spring solver for drop and abort animations.
- [ ] Create `src/features/planner/edgeAutoScroll.js` *(adapted from `ilamy-calendar`)*:
  - 40px boundary proximity detector with quadratic velocity curve (`v = (40 - d)^2 * k`).
  - Seamless rAF scrolling for timeline containers during active drag.
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

### Phase 3: Timeline Drag-to-Create Interaction Engine
- [ ] Create `src/features/planner/dragToCreateGesture.js` *(adapted from `ilamy-calendar`)*:
  - Detect pointer-down on empty grid coordinates (ignoring existing event tiles).
  - Compute starting 15m quantum slot: `startMin = Math.floor(y / 15) * 15`.
  - Draw dynamic bounding preview overlay with live duration calculator.
  - On pointer-up, open Composer with pre-populated start/end times.

### Phase 4: Hybrid External Sync Platform Port & Outbox (`src/platform/integrations/`)
- [ ] Create `src/platform/integrations/nylas/`:
  - `nylasClient.js`: Unified REST client for Nylas v3 Grant API.
  - `nylasAdapter.js`: Translate Nylas Event payloads into canonical Calendar domain records.
- [ ] Create `src/platform/persistence/syncOutboxQueue.js`:
  - Store pending mutations in `nbmp:outbox:v1`.
  - Background worker with exponential backoff and retry mechanisms.
  - Offline listener to pause/resume queue execution.

### Phase 5: Visual Conflict Diff Resolver & Sync Wizard (`src/features/planner/`)
- [ ] Create `src/features/planner/SyncConflictSheet.jsx` *(adapted from `tududi`)*:
  - Side-by-side field comparison table (Local vs Remote).
  - Highlight colliding fields (Time, Title, Location).
  - 1-click resolution buttons: `[ACCEPT REMOTE]`, `[KEEP LOCAL]`, `[SPLIT]`.
- [ ] Add multi-calendar setup wizard modal for connecting Google/Outlook credentials.

### Phase 6: Automated Test Suite & Regression Coverage
- [ ] Add Unit Tests in `src/domains/tasks/tests/`:
  - Test task planning idempotency and single-source-of-truth invariants.
  - Test unscheduling and duration adjustments.
- [ ] Add Playwright E2E Tests in `tests/e2e/`:
  - `tests/e2e/cross-pane-drag.spec.js`: Test drag from actions list to timeline, edge auto-scrolling, and timeline repositioning.
  - `tests/e2e/drag-to-create.spec.js`: Test drag-to-create bounding box and composer invocation.
  - `tests/e2e/sync-conflict.spec.js`: Test conflict sheet interactions and resolution choices.

---

## 7. Verification Criteria & Acceptance Tests

1. **Gesture Disambiguation**: Quick vertical flick on Actions list scrolls the container; holding for 200ms lifts the card into drag mode with zero accidental scrolling.
2. **Snapping & Auto-Scroll Accuracy**: Dragging to any point between 10:01 AM and 10:14 AM snaps cleanly to 10:00 AM. Dragging near top/bottom scrolls timeline at 60fps.
3. **Drag-to-Create Precision**: Dragging from 2:00 PM to 3:30 PM opens the Composer pre-filled with `14:00 → 15:30`.
4. **No Duplicate Records**: Scheduling the same task 5 times results in exactly 1 task record with updated timestamps.
5. **Conflict Resolution Clarity**: Conflicted events clearly display the side-by-side diff; clicking `[ACCEPT REMOTE]` immediately reconciles the local store.
6. **Undo Reliability**: Pressing `⌘Z` immediately removes the timeline block and restores the unscheduled state in the Actions rail.

---

## 8. Artifacts & Reference Implementations
* **Interactive Sandbox Prototype**: [`interactive-sandbox.html`](file:///C:/Users/Kamran/calendar-master/interactive-sandbox.html)
* **`ilamy-calendar` Reference**: `C:\Users\Kamran\ilamy-calendar` (Drag-to-create & edge scroll)
* **`tududi` Reference**: `C:\Users\Kamran\tududi` (Conflict resolver & sync wizard)
* **Architecture Reference**: [`docs/adr/0001-domain-oriented-modular-monolith.md`](file:///C:/Users/Kamran/calendar-master/docs/adr/0001-domain-oriented-modular-monolith.md)
