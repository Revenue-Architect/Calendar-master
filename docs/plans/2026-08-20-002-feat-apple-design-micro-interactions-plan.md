---
title: Apple Fluid Interfaces & Micro-Interaction Polish Engine
type: feature
status: proposed
date: 2026-08-20
origin: docs/adr/0001-domain-oriented-modular-monolith.md
target_domains:
  - src/features/motion/
  - src/features/planner/
  - src/design/
  - src/index.css
---

# Apple Fluid Interfaces & Micro-Interaction Polish Engine

## 1. Executive Summary & Intent Grounding

This document specifies the complete production implementation plan for upgrading Calendar Master's micro-interactions to **Apple Fluid Interface standards** (WWDC Design principles) and **Emil Kowalski UI engineering principles**.

Following our comprehensive visual audit of the running application, this plan establishes:
1. **Typography & Encoding Hygiene**: Immediate remediation of the UTF-8 character encoding mojibake (`â€“`, `â†’`, `Â·`).
2. **Shared-Element Fluid Motion**: Upgrading the `TIMELINE` / `AGENDA` / `ACTIONS` PillNav to a physical sliding spring.
3. **Tactile Sensory Feedback**: Replacing linear hold bars with direct tactile card depressions (`scale: 0.975`), charging accent borders, and elastic completion springs.
4. **Spatial Directional Day-Turns**: Animating the timeline canvas with momentum-aware directional page turns matching Date Ribbon selections.
5. **Standardized Kinetic Tokens**: Unified spring damping, response, and GPU transform tokens in `src/index.css`.

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
│ **2. Hold-to-Complete (TaskCard)**   │ ⚠️ Flat linear bar inside static card;│ 🍏 Tactile card depression (Z-axis), │
│                                      │ lacks tactile feedback on press.     │ charging border, & elastic snap pop. │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **3. Date Ribbon Navigation**        │ ⚠️ Canvas replaces abruptly with no  │ 🍏 Directional sliding canvas        │
│                                      │ spatial relationship to clicked day. │ (future enters right, past enters L).│
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **4. Composer Sheet Morph**          │ ⚠️ Fixed 480ms CSS keyframe delay;   │ 🍏 Interruptible spring morph        │
│                                      │ non-interruptible if aborted.        │ (`damping: 0.92, response: 0.34s`).  │
├──────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ **5. Live "Now" Time Tracker**       │ ⚠️ Static % badge with no life;      │ 🍏 Ambient breathing glow on the     │
│                                      │ feels like a disconnected label.     │ active elapsed boundary line.        │
└──────────────────────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. Standardized Kinetic Token System

All micro-interactions across the application must draw from a unified token registry in [`src/index.css`](file:///C:/Users/Kamran/calendar-master/src/index.css):

```css
:root {
  /* ── Apple-Grade Kinetic Curves ─────────────────────────── */
  --spring-snappy: cubic-bezier(0.2, 1.25, 0.3, 1);    /* Micro-toggles, pills, badges */
  --spring-smooth: cubic-bezier(0.16, 1, 0.3, 1);     /* Sheets, drawers, page turns */
  --spring-critical: cubic-bezier(0.25, 1, 0.5, 1);   /* Drag aborts, cancellations */
  
  /* ── Tactile Press Scale Responses ──────────────────────── */
  --press-card: scale(0.975);
  --press-button: scale(0.95);
  --press-pill: scale(0.96);
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
* **Fix**: Enforce explicit UTF-8 encoding in `fs.readFileSync(..., "utf8")` and `fs.writeFileSync(..., "utf8")` with `<meta charset="utf-8" />` guaranteed in the document `<head>`.

---

### Feature 1: Fluid Shared-Element PillNav (`TIMELINE` · `AGENDA` · `ACTIONS`)
* **Files**: [`src/features/planner/PillNav.jsx`](file:///C:/Users/Kamran/calendar-master/src/features/planner/PillNav.jsx), [`src/features/motion/viewPills.js`](file:///C:/Users/Kamran/calendar-master/src/features/motion/viewPills.js)
* **Mechanics**:
  1. Render a single absolute thumb background (`.nb-pill-thumb`) inside the navigation container.
  2. On tab selection, measure the target tab's `offsetLeft` and `offsetWidth`.
  3. Animate the thumb using independent X-translation and width springs:
     ```css
     .nb-pill-thumb {
       position: absolute;
       top: 4px;
       bottom: 4px;
       border-radius: 999px;
       background: var(--accent);
       transition: transform 260ms var(--spring-snappy),
                   width 220ms var(--spring-smooth);
       will-change: transform, width;
     }
     ```
  4. While in motion, apply a micro-squash: `scaleX(1.06)` during transit, settling cleanly on arrival.

---

### Feature 2: Tactile Hold-to-Complete & Ratchet Feedback
* **Files**: [`src/features/planner/TaskCard.jsx`](file:///C:/Users/Kamran/calendar-master/src/features/planner/TaskCard.jsx), [`src/features/planner/TimelineActionCard.jsx`](file:///C:/Users/Kamran/calendar-master/src/features/planner/TimelineActionCard.jsx)
* **Mechanics**:
  1. **Pointer Down (0ms)**: Card immediately dips on the Z-axis (`transform: var(--press-card)`).
  2. **Hold Ratchet (0–400ms)**: A neon accent border stroke charges clockwise around the card perimeter (`stroke-dashoffset`). Audio haptic clicks fire at accelerating intervals (`step = 0.17 - 0.11 * p`).
  3. **Release before 400ms (Abort)**: Card springs back to rest (`scale(1.0)`) with critically damped ease; border charge dissipates in 120ms.
  4. **Completion (400ms)**: Card bursts with an elastic completion pop:
     ```css
     @keyframes task-complete-pop {
       0% { transform: scale(0.975); }
       50% { transform: scale(1.035); }
       100% { transform: scale(1.0); }
     }
     ```

---

### Feature 3: Directional Spatial Day-Turn Physics
* **Files**: [`src/features/planner/navigation.jsx`](file:///C:/Users/Kamran/calendar-master/src/features/planner/navigation.jsx), [`src/features/motion/fluidGeometry.js`](file:///C:/Users/Kamran/calendar-master/src/features/motion/fluidGeometry.js)
* **Mechanics**:
  1. Maintain previous and next `dateKey` in navigation state.
  2. Compute travel delta: `diff = diffDays(targetDate, currentDate)`.
  3. **Future Day (diff > 0)**:
     * Current canvas exits to the left: `translate3d(-24px, 0, 0)`, `opacity: 0`.
     * New canvas enters from the right: `translate3d(+24px → 0, 0, 0)`, `opacity: 0 → 1`.
  4. **Past Day (diff < 0)**:
     * Current canvas exits to the right: `translate3d(+24px, 0, 0)`, `opacity: 0`.
     * New canvas enters from the left: `translate3d(-24px → 0, 0, 0)`, `opacity: 0 → 1`.
  5. Uses GPU-composited transforms with `duration: 180ms ease-out`.

---

### Feature 4: Origin-Anchored Spring Sheets & Composers
* **Files**: [`src/features/motion/Sheet.jsx`](file:///C:/Users/Kamran/calendar-master/src/features/motion/Sheet.jsx), [`src/features/motion/morphTiming.js`](file:///C:/Users/Kamran/calendar-master/src/features/motion/morphTiming.js)
* **Mechanics**:
  1. Capture trigger bounding box (`recentFluidTriggerRect`).
  2. When opened from `+ NEW` or a timeline slot, sheet scales outwards directly from the trigger rect rather than fading from center.
  3. Reduce container morph duration from `480ms` to **`340ms`**, making it feel instantaneous for power users while preserving fluid spatial continuity.
  4. Dismiss gesture (`Esc` or downward swipe) reverses along the exact same spatial vector.

---

### Feature 5: Live Ambient "Now" Time Tracker
* **Files**: [`src/features/planner/TimelineActionCard.jsx`](file:///C:/Users/Kamran/calendar-master/src/features/planner/TimelineActionCard.jsx), [`src/Planner.jsx`](file:///C:/Users/Kamran/calendar-master/src/Planner.jsx)
* **Mechanics**:
  1. Active event progress pill (e.g. `74%`) gains a subtle ambient breathing shimmer:
     ```css
     .nb-live-gauge {
       animation: ambient-gauge-pulse 3s ease-in-out infinite alternate;
     }
     @keyframes ambient-gauge-pulse {
       from { box-shadow: 0 0 4px rgba(212, 255, 0, 0.2); }
       to { box-shadow: 0 0 12px rgba(212, 255, 0, 0.45); }
     }
     ```
  2. Timeline "Now" line pulses with a 1px neon beam whenever the active minute changes.

---

## 5. Phase-by-Phase Implementation Roadmap

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│         PHASE 1         │ ──► │         PHASE 2         │ ──► │         PHASE 3         │
│ Encoding & Token System │     │ Shared PillNav Physics  │     │ Tactile Card Feedback   │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
             │                                                               │
             ▼                                                               ▼
┌─────────────────────────┐                                     ┌─────────────────────────┐
│         PHASE 4         │ ──────────────────────────────────► │         PHASE 5         │
│ Spatial Day-Turn Engine │                                     │ Motion Tests & Verify   │
└─────────────────────────┘                                     └─────────────────────────┘
```

### Phase 1: Encoding Hygiene & Kinetic Token System
- [ ] Fix UTF-8 encoding in `build-artifact.mjs` and HTML templates.
- [ ] Add standardized kinetic tokens (`--spring-snappy`, `--press-card`, `--t-morph`) to `src/index.css`.
- [ ] Verify clean typography across all themes (`–`, `→`, `·`).

### Phase 2: PillNav Shared-Element Fluid Motion
- [ ] Refactor `src/features/planner/PillNav.jsx` to use an absolute sliding thumb with transform/width transitions.
- [ ] Update `src/features/motion/viewPills.js` with bounding-box derivation.
- [ ] Add momentum squash/stretch during active tab transitions.

### Phase 3: TaskCard & TimelineActionCard Tactile Engines
- [ ] Add `pointerdown` tactile depression (`var(--press-card)`) to `TaskCard.jsx` and `TimelineActionCard.jsx`.
- [ ] Implement charging border stroke animation during hold-to-complete.
- [ ] Add elastic celebration spring pop (`task-complete-pop`) on task completion.

### Phase 4: Spatial Ribbon & Day-Turn Engine
- [ ] Update `src/features/planner/navigation.jsx` with directional travel detection.
- [ ] Add directional GPU slide transitions (`-24px` vs `+24px`) on date switches.
- [ ] Add ambient breathing glow to the live "Now" indicator.

### Phase 5: Automated Motion Verification
- [ ] Run Playwright motion tests: `npm run test:e2e -- tests/e2e/motion.spec.js tests/e2e/polish.spec.js`.
- [ ] Verify 60fps performance across low-end and high-refresh displays.

---

## 6. Verification Criteria & Acceptance Tests

1. **Typographic Integrity**: Zero mojibake (`â€“`, `â†’`) in both `dist/index.html` and `artifact/planner.html`.
2. **PillNav Fluidity**: The active pill slides seamlessly between `TIMELINE`, `AGENDA`, and `ACTIONS` with zero jump cuts or flicker.
3. **Tactile Feedback**: Action cards visibly compress on press (< 90ms) and celebrate on completion with a snappy spring.
4. **Directional Continuity**: Tapping a future date slides the timeline in from the right; tapping a past date slides in from the left.
5. **Reduced Motion Respect**: When `prefers-reduced-motion` is active, all transforms are replaced with clean instant state switches.
