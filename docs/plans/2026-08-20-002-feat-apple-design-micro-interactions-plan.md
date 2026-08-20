---
title: Apple Fluid Interfaces, Kanban Workflow & Micro-Interaction Polish Engine
type: feature
status: proposed
date: 2026-08-20
origin: docs/adr/0001-domain-oriented-modular-monolith.md
target_domains:
  - src/features/motion/
  - src/features/planner/
  - src/domains/tasks/
  - src/design/
  - src/index.css
---

# Apple Fluid Interfaces, Kanban Workflow & Micro-Interaction Polish Engine

## 1. Executive Summary & Intent Grounding

This document specifies the complete production implementation plan for upgrading Calendar Master's micro-interactions, workflow surfaces, and tactile physics to **Apple Fluid Interface standards** (WWDC Design principles) and **Emil Kowalski UI engineering principles**, synthesized with deep architectural findings from reference systems (`tududi` and `ilamy-calendar`):

1. **Typography & Encoding Hygiene**: Immediate remediation of the UTF-8 character encoding mojibake (`â€“`, `â†’`, `Â·`).
2. **Shared-Element Fluid Motion**: Upgrading the `TIMELINE` / `AGENDA` / `ACTIONS` PillNav to a physical sliding spring.
3. **Kanban Board Workflow Engine** *(Adapted from `tududi`)*: A fluid multi-column task board (`BACKLOG`, `TODO`, `IN PROGRESS`, `DONE`) with column gap expansion, 2° card flight tilts, and bi-directional drag between Kanban columns and the Day Timeline.
4. **Eisenhower 2x2 Smart Matrix Surface** *(Adapted from `tududi`)*: An executive 4-quadrant prioritization grid (`Q1 Do First`, `Q2 Schedule Deep Work`, `Q3 Delegate`, `Q4 Someday`) with live metadata recalculation on drop.
5. **Habit Streak & Consistency Heatmap** *(Adapted from `tududi`)*: Daily ritual streak counters (`🔥 12 DAYS`), 30-day activity dot heatmaps, and celebrating micro-animations on habit check-off.
6. **WAI-ARIA Keyboard Drag Accessibility** *(Adapted from `@dnd-kit`)*: Keyboard-driven scheduling (`Space` to lift $\to$ `Arrow Keys` to translate $15\text{m}$ / switch columns $\to$ `Enter` to commit $\to$ `Esc` to cancel) with live ARIA announcements.

---

## 2. Visual Audit Findings & Resolution Matrix

```
┌──────────────────────────────────────┬──────────────────────────────────────┬──────────────────────────────────────┐
│ Surface & Interaction                │ Current Implementation Issue         │ Target Apple-Grade Interaction       │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **0. Typography & Symbols**          │ 🔴 Mojibake in build artifact        │ 🟢 Clean UTF-8 en-dashes (`–`),      │
│                                      │ (`â€“`, `â†’`, `Â·`, `â†©`).         │ arrows (`→`), and middots (`·`).     │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **1. View Switcher (PillNav)**       │ ⚠️ Linear opacity cross-fade;        │ 🍏 Single shared thumb sliding with  │
│                                      │ active pill jumps between buttons.   │ momentum stretch (`scaleX: 1.08`).   │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **2. Kanban Board (Workflow)**       │ ⚠️ Missing workflow column surface;  │ 🍏 Fluid column gaps, 2° flight tilt,│
│                                      │ all tasks are trapped in flat lists. │ and direct Kanban-to-Timeline drag.  │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **3. Eisenhower 2x2 Matrix**         │ ⚠️ Missing executive 2x2 grid;       │ 🍏 4-quadrant smart prioritization   │
│                                      │ urgent vs important is manual text.  │ matrix with fluid drag transitions.  │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **4. Hold-to-Complete (TaskCard)**   │ ⚠️ Flat linear bar inside static card;│ 🍏 Tactile card depression (Z-axis), │
│                                      │ lacks tactile feedback on press.     │ charging border, & elastic snap pop. │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **5. Habit Consistency Heatmap**     │ ⚠️ Habits are plain checklist items; │ 🍏 30-day activity dot matrix,       │
│                                      │ no streak visibility or motivation.  │ streak counters (`🔥`), & confetti.  │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **6. Keyboard Drag Accessibility**   │ ⚠️ 100% mouse/touch dependent;       │ 🍏 WAI-ARIA keyboard navigation      │
│                                      │ zero keyboard scheduling ability.    │ (`Space` lift, `Arrow` move, `Enter`).│
└──────────────────────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. Standardized Kinetic Token System

All micro-interactions draw from a unified token registry in [`src/index.css`](file:///C:/Users/Kamran/calendar-master/src/index.css):

```css
:root {
  /* ── Apple-Grade Kinetic Curves ─────────────────────────── */
  --spring-snappy: cubic-bezier(0.2, 1.25, 0.3, 1);    /* Micro-toggles, pills, badges */
  --spring-smooth: cubic-bezier(0.16, 1, 0.3, 1);     /* Sheets, drawers, page turns */
  --spring-critical: cubic-bezier(0.25, 1, 0.5, 1);   /* Drag aborts, cancellations */
  
  /* ── Tactile Press & Flight Transforms ──────────────────── */
  --press-card: scale(0.975);
  --press-button: scale(0.95);
  --press-pill: scale(0.96);
  --flight-card: scale(1.035) rotate(1.8deg) translateY(-4px);
  --lift-elevation: scale(1.03) translateY(-2px);

  /* ── Micro-Interaction Durations ────────────────────────── */
  --t-instant: 90ms;      /* Pointer-down tactile acknowledgement */
  --t-micro: 180ms;       /* Badges, tooltips, checkboxes */
  --t-transition: 260ms;  /* Segmented pills, view slides */
  --t-morph: 340ms;       /* Origin-anchored sheet reveals */
}

/* Reduced motion accessibility contract */
@media (prefers-reduced-motion: reduce) {
  :root {
    --spring-snappy: ease-out;
    --spring-smooth: ease-out;
    --press-card: none;
    --press-button: none;
    --flight-card: none;
    --lift-elevation: none;
    --t-transition: 0.01ms;
    --t-morph: 0.01ms;
  }
}
```

---

## 4. Component-by-Component Specifications

### Feature 0: Typography & UTF-8 Build Hygiene
* **File**: [`build-artifact.mjs`](file:///C:/Users/Kamran/calendar-master/build-artifact.mjs), [`index.html`](file:///C:/Users/Kamran/calendar-master/index.html)
* **Problem**: Inlined bundle decodes UTF-8 bytes into ASCII/Windows-1252 strings, converting typographic characters (`–`, `→`, `·`, `↩`) into mojibake.
* **Fix**: Enforce explicit UTF-8 encoding in `fs.readFileSync(..., "utf8")` and `fs.writeFileSync(..., "utf8")` with `<meta charset="utf-8" />` guaranteed in document `<head>`.

---

### Feature 1: Fluid Shared-Element PillNav (`TIMELINE` · `AGENDA` · `ACTIONS`)
* **Files**: [`src/features/planner/PillNav.jsx`](file:///C:/Users/Kamran/calendar-master/src/features/planner/PillNav.jsx), [`src/features/motion/viewPills.js`](file:///C:/Users/Kamran/calendar-master/src/features/motion/viewPills.js)
* **Mechanics**:
  1. Single absolute thumb background (`.nb-pill-thumb`) inside navigation container.
  2. Animate the thumb using independent X-translation and width springs (`--spring-snappy`).
  3. Apply a micro-squash: `scaleX(1.06)` during transit, settling cleanly on arrival.

---

### Feature 2: Kanban Board Workflow Surface *(Adapted from `tududi`)*
* **Files**: `src/features/planner/KanbanBoard.jsx`, `src/features/planner/KanbanColumn.jsx`
* **Mechanics**:
  1. Render 4 status columns: `BACKLOG`, `TODO (READY)`, `IN PROGRESS (ACTIVE)`, `DONE`.
  2. **Active Drag Flight**: When lifted, the card tilts subtly (`transform: var(--flight-card)`), casting an ambient shadow (`0 14px 32px rgba(0,0,0,0.4)`).
  3. **Gap Expansion**: Hovering over a column expands a dashed placeholder slot with fluid layout transition (`transition: height 200ms var(--spring-smooth)`).
  4. **Cross-Surface Drag to Timeline**: Dragging a Kanban card onto the Day Timeline immediately schedules the task at the dropped hour and advances its status to `IN PROGRESS`.

---

### Feature 3: Eisenhower 2x2 Smart Prioritization Matrix *(Adapted from `tududi`)*
* **Files**: `src/features/planner/EisenhowerMatrix.jsx`, `src/domains/tasks/queries/taskQueries.js`
* **Mechanics**:
  1. Compute 4 quadrants based on task `deadline` and `priority`/`blockers`:
     * **Q1 (Do First - Urgent & Important)**: Deadlines $\le 2\text{ days}$ + High Priority.
     * **Q2 (Schedule - Not Urgent & Important)**: Deadlines $> 2\text{ days}$ + Deep Work tag.
     * **Q3 (Delegate - Urgent & Not Important)**: Deadlines $\le 2\text{ days}$ + Admin/Quick tag.
     * **Q4 (Someday - Not Urgent & Not Important)**: No deadline + Backlog.
  2. Dragging a task into **Q2** automatically suggests open 90-minute focus blocks on the timeline!

---

### Feature 4: Habit Streak Counters & Consistency Heatmap *(Adapted from `tududi`)*
* **Files**: `src/features/planner/HabitTracker.jsx`, `src/features/planner/HabitHeatmap.jsx`
* **Mechanics**:
  1. Render daily rituals with a 30-day activity dot grid (subtle gray for inactive, vibrant neon-accent for completed days).
  2. Display active streak badges: `🔥 14 DAYS`.
  3. **Completion Animation**: Checking a habit triggers an explosive radial ring dissipation with micro-confetti particle physics.

---

### Feature 5: Keyboard Drag & Drop Accessibility Protocol *(Adapted from `@dnd-kit`)*
* **Files**: `src/features/accessibility/keyboardDragCoordinator.js`
* **Mechanics**:
  1. `Space` or `Enter` on a focused task lifts the card into **Keyboard Drag Mode**.
  2. `ArrowUp` / `ArrowDown`: Move task backward/forward by 15 minutes on the timeline.
  3. `ArrowLeft` / `ArrowRight`: Move task across Kanban columns or between Actions pane and Timeline.
  4. Screen reader announces each move via an `aria-live="assertive"` region:
     * *"Picked up task: Ship pricing model. Currently at 10:00 AM."*
     * *"Moved to 10:15 AM on Thursday, Aug 20."*
  5. `Enter` commits the drop; `Esc` restores the previous time slot.

---

## 5. Phase-by-Phase Implementation Roadmap

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│         PHASE 1         │ ──► │         PHASE 2         │ ──► │         PHASE 3         │
│ Encoding & Token System │     │ Shared PillNav Physics  │     │ Tactile Card Feedback   │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
             │                                                               │
             ▼                                                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│         PHASE 4         │ ──► │         PHASE 5         │ ──► │         PHASE 6         │
│ Kanban Board Surface    │     │ Eisenhower & Habits     │     │ Keyboard A11y & E2E     │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

### Phase 1: Encoding Hygiene & Kinetic Token System
- [ ] Fix UTF-8 encoding in `build-artifact.mjs` and HTML templates.
- [ ] Add standardized kinetic tokens (`--spring-snappy`, `--flight-card`, `--t-morph`) to `src/index.css`.
- [ ] Verify clean typography across all themes (`–`, `→`, `·`).

### Phase 2: PillNav Shared-Element Fluid Motion
- [ ] Refactor `src/features/planner/PillNav.jsx` to use an absolute sliding thumb with transform/width transitions.
- [ ] Update `src/features/motion/viewPills.js` with bounding-box derivation.
- [ ] Add momentum squash/stretch during active tab transitions.

### Phase 3: TaskCard & TimelineActionCard Tactile Engines
- [ ] Add `pointerdown` tactile depression (`var(--press-card)`) to `TaskCard.jsx` and `TimelineActionCard.jsx`.
- [ ] Implement charging border stroke animation during hold-to-complete.
- [ ] Add elastic celebration spring pop (`task-complete-pop`) on task completion.

### Phase 4: Kanban Board Workflow Engine (`src/features/planner/`)
- [ ] Create `src/features/planner/KanbanBoard.jsx` *(adapted from `tududi`)*:
  - Render 4 status columns with fluid layout physics.
  - Implement 2° card flight tilts and column placeholder gap animations.
  - Support cross-pane drag between Kanban columns and the Day Timeline.

### Phase 5: Eisenhower Matrix & Habit Streak Heatmap
- [ ] Create `src/features/planner/EisenhowerMatrix.jsx` *(adapted from `tududi`)*:
  - 4-quadrant smart prioritization view with automated metadata assignment.
- [ ] Create `src/features/planner/HabitTracker.jsx` *(adapted from `tududi`)*:
  - 30-day activity dot matrix and streak counter (`🔥`).
  - Radial burst celebration micro-animation on completion.

### Phase 6: Keyboard Drag Accessibility & Automated E2E Regression
- [ ] Create `src/features/accessibility/keyboardDragCoordinator.js` *(adapted from `@dnd-kit`)*:
  - Implement `Space` $\to$ `Arrows` $\to$ `Enter` keyboard scheduling with ARIA live announcements.
- [ ] Run Playwright motion & accessibility tests:
  - `tests/e2e/kanban.spec.js`
  - `tests/e2e/eisenhower.spec.js`
  - `tests/e2e/a11y-keyboard-drag.spec.js`

---

## 6. Verification Criteria & Acceptance Tests

1. **Typographic Integrity**: Zero mojibake (`â€“`, `â†’`) in both `dist/index.html` and `artifact/planner.html`.
2. **PillNav Fluidity**: Active pill slides seamlessly between tabs with zero jump cuts.
3. **Kanban Fluidity**: Dragging cards across columns tilts smoothly, expands target gaps, and allows dropping onto the timeline.
4. **Eisenhower Responsiveness**: Moving cards between quadrants updates priority and suggests optimal timeline blocks.
5. **Habit Streak Delight**: Checking off daily rituals triggers vibrant visual and audio/haptic feedback with accurate streak tracking.
6. **Keyboard Accessibility**: Users can navigate, lift, move, and schedule any task or event strictly using the keyboard without a mouse.
