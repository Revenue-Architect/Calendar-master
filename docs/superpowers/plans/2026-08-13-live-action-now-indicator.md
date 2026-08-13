# Live Action NOW Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an estimated Action that is currently underway receive the same continuous NOW-rule and elapsed-fill presentation as a live Event.

**Architecture:** Derive one display-only `liveTimelineItem` after lane packing. Timed Events remain first priority; an estimated, open Action is selected only when no Event is live. Pass the Action's live state and elapsed percentage into its existing passive timeline card, leaving persistence and gestures untouched.

**Tech Stack:** React 19, Vite, Playwright.

## Global Constraints

- Do not change task scheduling, lane packing, persistence, or gesture ownership.
- A live Event wins over an overlapping Action.
- Only estimated, non-completed Actions gain live treatment.
- The fill is decorative, pointer-events none, and uses the existing 260ms linear timing and accent alpha.
- Preserve the existing NOW marker's position, width, and gutter-chip transitions.

---

### Task 1: Define the live Action presentation contract

**Files:**
- Modify: `tests/e2e/actions.spec.js:19-31,113-129`

**Interfaces:**
- Consumes: `seedPlanner`, `createTask`, `[data-task-chip]`, `[data-test="timeline-now-line"]`.
- Produces: focused browser coverage for live Actions and Event priority.

- [ ] **Step 1: Write failing browser tests**

Add an `actionAt(now)` fixture whose task starts twenty minutes before `now`, has a sixty-minute estimate, and targets `keyOf(now)`. In one test, freeze the page clock to `2026-08-13T10:20:00`, seed that Action, then assert:

```js
await expect(page.getByTestId("timeline-action-live-fill")).toBeVisible();
const geometry = await page.evaluate(() => {
  const line = document.querySelector('[data-test="timeline-now-line"]');
  const layer = line?.parentElement;
  return { line: line?.getBoundingClientRect().width, layer: layer?.getBoundingClientRect().width };
});
expect(geometry.line).toBeLessThan(geometry.layer);
await expect(page.getByTestId("timeline-action-live-fill")).toHaveCSS("pointer-events", "none");
```

Add an overlap test that seeds a 10:00–11:00 Event plus the same Action and asserts the Event elapsed fill exists while `timeline-action-live-fill` has count zero.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/actions.spec.js --grep "live estimated Action|Event wins" --workers=1`

Expected: failure because the current live selection searches Events only and the Action fill does not exist.

- [ ] **Step 3: Commit the failing contract**

Run: `git add tests/e2e/actions.spec.js; git commit -m "test: define live action now indicator"`

### Task 2: Share the live-item geometry and render the Action fill

**Files:**
- Modify: `src/Planner.jsx:1782-1785,4541,4563-4606,4741-4767`
- Modify: `src/features/planner/TimelineActionCard.jsx:3-25,87-137`

**Interfaces:**
- Consumes: packed `events` and `plannedTasks` entries containing `start`, `dur`, `lane`, and `cols`.
- Produces: `liveEvent`, `liveAction`, `liveTimelineItem`, `livePct`, `laneL`, and Action card props `live` / `livePct`.

- [ ] **Step 1: Derive Event-first live selection**

Replace the Event-only geometry with:

```js
const liveEvent = isToday ? events.find((event) => nowMin >= event.start && nowMin < event.start + event.dur) : null;
const liveAction = !liveEvent && isToday
  ? plannedTasks.find((task) => task.status !== "completed" && task.planned.estimateMinutes != null
    && nowMin >= task.start && nowMin < task.start + task.dur)
  : null;
const liveTimelineItem = liveEvent ?? liveAction;
const livePct = liveTimelineItem ? (nowMin - liveTimelineItem.start) / liveTimelineItem.dur : 0;
const laneL = liveTimelineItem ? (liveTimelineItem.lane / liveTimelineItem.cols) * 100 : 0;
```

Use `liveTimelineItem` for NOW rule width, gutter chip placement, and hour-label clearance. Retain `liveEvent` for Event-specific fill/content.

- [ ] **Step 2: Pass and draw Action live state**

For each planned Action, derive `const live = liveAction?.id === t.id` and `const pct = live ? livePct * 100 : 0`; pass both to `TimelineActionCard`. Add these props with defaults and render:

```jsx
{live && <span data-test="timeline-action-live-fill" aria-hidden="true"
  className="absolute inset-y-0 left-0 pointer-events-none"
  style={{ width: `${livePct}%`, background: `${theme.accent}26`, transition: "width 260ms linear" }}>
  <span className="absolute inset-y-0 right-0" style={{ width: 2, background: theme.accent }} />
</span>}
```

Place it below the face content and below all existing interactive controls, so it cannot intercept completion, swipe, drag, or resize.

- [ ] **Step 3: Run focused tests and build**

Run: `npm run test:e2e -- tests/e2e/actions.spec.js --grep "live estimated Action|Event wins|live-time rule" --workers=1; npm run build`

Expected: selected browser tests and production build pass.

- [ ] **Step 4: Commit implementation**

Run: `git add src/Planner.jsx src/features/planner/TimelineActionCard.jsx tests/e2e/actions.spec.js; git commit -m "fix: flow now indicator through live actions"`

### Task 3: Verify no interaction regression and publish

**Files:**
- Verify: `src/Planner.jsx`, `src/features/planner/TimelineActionCard.jsx`, `tests/e2e/actions.spec.js`, `tests/e2e/timeline-polish.spec.js`

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a verified commit pushed on top of current `origin/main`.

- [ ] **Step 1: Run regression gates**

Run: `npm test; npm run test:e2e -- tests/e2e/actions.spec.js tests/e2e/timeline-polish.spec.js --workers=1`

Expected: unit tests and Action completion, swipe, drag, resize, Event NOW, hour-label, and motion coverage all pass.

- [ ] **Step 2: Inspect the final scope**

Run: `git diff --check origin/main...HEAD; git diff --name-only origin/main...HEAD`

Expected: only the approved spec/plan, two presentation files, and focused browser coverage change; no domain, persistence, or gesture module appears.

- [ ] **Step 3: Rebase and push**

Run: `git fetch origin; git rebase origin/main; git push origin HEAD:main`

Expected: main receives a fast-forward update. If main changed an owned source or test seam, reconcile that narrow overlap before retrying.
