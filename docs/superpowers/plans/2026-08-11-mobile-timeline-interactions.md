# Mobile Timeline Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile day timeline scroll safely, complete scheduled Actions directly with perceptible feedback, gain vertical room through focus mode, and remove standalone FREE labels.

**Architecture:** Pure intent and haptic helpers define thresholds independently of React. The existing Planner touch delegate remains the single owner of timeline gestures, but it distinguishes empty-space creation, card manipulation, scrolling, and Action swiping. A focused stateless timeline Action-card component renders the new check and swipe treatment while every completion input still calls the existing `completeTask` command.

**Tech Stack:** React 19, Vite, Tailwind utility classes, Node test runner, Playwright, browser Vibration API, CSS transitions.

## Global Constraints

- Mobile day timeline only for focus-mode behavior; desktop, Agenda, Actions, week, and month layouts remain unchanged.
- Empty-space creation waits 650 ms; card movement and resize keep the existing 300 ms lift.
- Any actual stream scroll cancels draft creation for that touch sequence.
- All completion inputs reuse blocker confirmation, recurrence handling, persistence, rewards, celebration, undo, sound, and haptics.
- Completion haptics remain preference-gated and unsupported browsers fail quietly.
- Date number and briefing remain visible while mobile chrome is collapsed.
- Initial programmatic timeline positioning cannot activate focus mode.
- Standalone FREE labels disappear without changing free-slot calculations.
- Existing event/action lane packing, event resize/move, sheet morphs, and reduced-motion behavior must not regress.

---

### Task 1: Pure touch-intent and haptic contracts

**Files:**
- Modify: `src/features/planner/timelineGesture.js`
- Modify: `src/features/planner/timelineGesture.test.js`
- Create: `src/features/feedback/haptics.js`
- Create: `src/features/feedback/haptics.test.js`

**Interfaces:**
- Produces: `EMPTY_SPACE_LIFT_MS`, `ACTION_SWIPE_COMMIT_PX`, `liftDelayForTimelineTarget(targetKind)`, `timelineTouchIntent(origin, point)`, `shouldCommitActionSwipe(origin, point)`.
- Produces: `HAPTIC_PATTERNS.complete` and `triggerDeviceHaptic(pattern, device?)`.
- `targetKind` is `"empty" | "card" | "resize"`; touch intent is `"pending" | "horizontal" | "vertical"`.

- [ ] **Step 1: Write failing unit tests for touch intent**

Add literal behavior checks proving empty space has not lifted at 300 ms, cards do lift at 300 ms, 12 px horizontal movement is classified independently from vertical scrolling, and a right swipe commits only at 64 px with horizontal dominance.

- [ ] **Step 2: Run the timeline-gesture test and verify RED**

Run: `node --test src/features/planner/timelineGesture.test.js`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Implement the minimal intent helpers**

Use the existing finite-number and movement conventions. Keep `LIFT_MS = 300`, add `EMPTY_SPACE_LIFT_MS = 650`, and make swipe decisions from hand-derived 12 px intent and 64 px completion boundaries.

- [ ] **Step 4: Run the timeline-gesture test and verify GREEN**

Run: `node --test src/features/planner/timelineGesture.test.js`

Expected: all timeline gesture tests pass.

- [ ] **Step 5: Write failing haptic contract tests**

Test that completion requests a pattern whose active pulses are each at least 20 ms, that the pattern is sent unchanged to a supplied device boundary, and that missing/throwing vibration implementations return `false` without throwing.

- [ ] **Step 6: Run the haptic test and verify RED**

Run: `node --test src/features/feedback/haptics.test.js`

Expected: FAIL because the haptic module does not exist.

- [ ] **Step 7: Implement the minimal haptic module**

Export a frozen completion pattern `[24, 32, 36]`. Copy arrays before passing them to `device.vibrate`, return its boolean result, and catch unsupported or throwing boundaries.

- [ ] **Step 8: Run both unit files and verify GREEN**

Run: `node --test src/features/planner/timelineGesture.test.js src/features/feedback/haptics.test.js`

Expected: all tests pass.

- [ ] **Step 9: Commit the pure contracts**

Commit message: `test: define mobile timeline intent contracts`

---

### Task 2: Scroll-safe timeline touch delegation

**Files:**
- Modify: `src/Planner.jsx`
- Modify: `tests/e2e/timeline-gestures.spec.js`

**Interfaces:**
- Consumes: `liftDelayForTimelineTarget`, `timelineTouchIntent`, and `EMPTY_SPACE_LIFT_MS` from Task 1.
- Produces: one delegated touch sequence with `cancelled`, `held`, `intent`, `startScrollTop`, and timer state.

- [ ] **Step 1: Add failing mobile browser tests**

Add one test that starts a touch on empty timeline space, scrolls fewer pixels than the old 12 px touch tolerance through `scrollTop`, waits beyond 650 ms, ends the touch, and asserts no composer appears. Add one control test that holds stationary empty space beyond 650 ms and asserts the draft gesture appears.

- [ ] **Step 2: Run the focused browser tests and verify RED**

Run: `npx playwright test tests/e2e/timeline-gestures.spec.js --grep "resting after scroll|stationary empty hold"`

Expected: the scroll/rest test fails because the existing timer matures after the stream scroll.

- [ ] **Step 3: Implement cancellation from real scroll intent**

Keep the press record through touchend after cancellation, clear its timer, set `cancelled: true`, and reject quick-create on cancelled touches. Add a native stream `scroll` listener that cancels the current touch sequence whenever `scrollTop` changes. Select 650 ms only for empty-space targets; cards and grips retain 300 ms.

- [ ] **Step 4: Run focused browser tests and verify GREEN**

Run: `npx playwright test tests/e2e/timeline-gestures.spec.js --grep "resting after scroll|stationary empty hold"`

Expected: both tests pass.

- [ ] **Step 5: Run existing timeline gesture tests**

Run: `npx playwright test tests/e2e/timeline-gestures.spec.js tests/e2e/week-drag.spec.js`

Expected: card tap, hold-to-move, resize, scrolling, and week drag tests all pass.

- [ ] **Step 6: Commit the touch fix**

Commit message: `fix: separate timeline scrolling from creation`

---

### Task 3: Direct scheduled-Action completion and useful haptics

**Files:**
- Create: `src/features/planner/TimelineActionCard.jsx`
- Modify: `src/Planner.jsx`
- Modify: `tests/e2e/actions.spec.js`
- Modify: `tests/e2e/timeline-polish.spec.js`

**Interfaces:**
- Consumes: `timelineTouchIntent`, `shouldCommitActionSwipe`, `HAPTIC_PATTERNS.complete`, and `triggerDeviceHaptic`.
- Produces: `TimelineActionCard` with `task`, geometry/style tokens, `swipeOffset`, `onOpen`, `onComplete`, and `onResizePointerDown` props.
- Completion controls call `completeTask(task.id)` and never mutate task state directly.

- [ ] **Step 1: Add failing checkmark and haptic browser tests**

Seed a timed Action, assert an accessible `Complete <title>` button exists, click it, assert the stored task is completed and the inspector did not open, and assert the vibration request equals `[24, 32, 36]`. Add a disabled-preference case that completes without a vibration request.

- [ ] **Step 2: Run the focused Action tests and verify RED**

Run: `npx playwright test tests/e2e/actions.spec.js --grep "timeline check|tactile feedback|haptics preference"`

Expected: FAIL because the timeline completion control and stronger pattern do not exist.

- [ ] **Step 3: Render the focused timeline Action card**

Replace the nested all-purpose button with a stateless lane/card component: a `div role="button"` opens on click/Enter/Space; a child button has `data-timeline-complete`, stops propagation, and calls `onComplete`; narrow-container styles hide secondary time before truncating the title; existing geometry and resize handle behavior remain props.

- [ ] **Step 4: Route completion through the shared haptic helper**

Replace the inline completion vibration with `buzz(HAPTIC_PATTERNS.complete)` and make `buzz` call `triggerDeviceHaptic`. Preserve preference gating.

- [ ] **Step 5: Run checkmark and haptic tests and verify GREEN**

Run: `npx playwright test tests/e2e/actions.spec.js --grep "timeline check|tactile feedback|haptics preference"`

Expected: all focused cases pass.

- [ ] **Step 6: Add a failing right-swipe completion test**

Dispatch a touch sequence on the timed Action with 72 px rightward travel and less than 12 px vertical travel. Assert completion, no inspector, and no active page-turn transform. Add a 40 px release case that leaves the Action open.

- [ ] **Step 7: Run swipe tests and verify RED**

Run: `npx playwright test tests/e2e/actions.spec.js --grep "swipe.*timeline"`

Expected: FAIL because the existing delegated handler treats the card as a move hold or the page as a day swipe.

- [ ] **Step 8: Implement delegated Action swipe state**

On horizontal intent, cancel the hold, stop propagation, prevent default, update a clamped positive offset, and reveal the completion backing. On release, call the current `completeTask` through a ref only when `shouldCommitActionSwipe` passes; otherwise animate the offset to zero. Ignore `data-timeline-complete` in the stream delegate.

- [ ] **Step 9: Run swipe and lane-layout tests and verify GREEN**

Run: `npx playwright test tests/e2e/actions.spec.js tests/e2e/timeline-polish.spec.js --grep "swipe|timeline check|same time share lanes|short meeting keeps"`

Expected: direct completion works and existing cards remain non-overlapping and readable.

- [ ] **Step 10: Commit Action completion**

Commit message: `feat: complete scheduled actions in the timeline`

---

### Task 4: Mobile timeline focus mode and availability-label cleanup

**Files:**
- Modify: `src/Planner.jsx`
- Modify: `tests/e2e/timeline-polish.spec.js`

**Interfaces:**
- Produces: `timelineFocused` state, a `data-test="timeline-chrome"` collapsible region, and `data-test="timeline-focus-toggle"` in the persistent date heading.
- Consumes the real stream touch/scroll sequence from Task 2; programmatic scrolls do not set focus.

- [ ] **Step 1: Add failing focus-mode layout tests**

At a 390×844 touch viewport, record the stream height after initial auto-positioning and assert chrome is expanded. Perform intentional touch scrolling and assert chrome collapses, the stream height increases, and `day-heading` remains visible. Set the stream near midnight through an intentional touch scroll and assert chrome expands. Click the date-heading toggle twice and assert explicit collapse/expand.

- [ ] **Step 2: Run focused layout tests and verify RED**

Run: `npx playwright test tests/e2e/timeline-polish.spec.js --grep "timeline focus"`

Expected: FAIL because the collapsible region and toggle do not exist.

- [ ] **Step 3: Implement focus state and connected collapse**

Wrap the HUD and calendar navigator in one grid-row transition region. Activate focus only from a touch sequence whose stream position moved at least 24 px; reset near the first hour, on active-date change, or when leaving mobile day view. Keep the date heading outside the region, make it compact while focused, and add an accessible chevron toggle. Use non-overshooting easing and reduced-motion overrides.

- [ ] **Step 4: Run focus-mode tests and verify GREEN**

Run: `npx playwright test tests/e2e/timeline-polish.spec.js --grep "timeline focus"`

Expected: all focus-mode cases pass.

- [ ] **Step 5: Add a failing presentation test for FREE labels**

Open a day with suggested slots and assert the day stream contains no standalone text node matching `FREE`, while Find-a-slot suggestions still render when activated.

- [ ] **Step 6: Run the FREE-label test and verify RED**

Run: `npx playwright test tests/e2e/timeline-polish.spec.js --grep "standalone FREE"`

Expected: FAIL on the current hour-band label.

- [ ] **Step 7: Remove only the standalone timeline label**

Delete the `FREE` span from the hour band. Do not alter `suggested`, slot-search functions, briefing generation, month density, or empty month-peek copy.

- [ ] **Step 8: Run the focus and presentation tests and verify GREEN**

Run: `npx playwright test tests/e2e/timeline-polish.spec.js --grep "timeline focus|standalone FREE|three-hour event|same time share lanes"`

Expected: all focused mobile density cases pass.

- [ ] **Step 9: Commit focus mode and cleanup**

Commit message: `feat: expand the mobile timeline while scrolling`

---

### Task 5: Full regression, publication, and deployed verification

**Files:**
- Modify only if verification reveals a scoped regression.
- Package existing `dist/`, `.openai/hosting.json`, and `scripts/sites-worker.js` for Sites.

**Interfaces:**
- Consumes all prior tasks.
- Produces a main-branch GitHub commit and a succeeded private Sites deployment.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 2: Run all browser tests**

Run: `npm run test:e2e`

Expected: zero failures, including touch, overlap, modal motion, Agenda, navigation, and Action completion coverage.

- [ ] **Step 3: Run the production build and diff checks**

Run: `npm run build`

Run: `git diff --check`

Expected: both exit successfully with no warnings attributable to changed source.

- [ ] **Step 4: Review the final diff against the design**

Confirm every requirement has a corresponding test, no stored schema changed, no free-slot logic changed, and no unrelated files were modified.

- [ ] **Step 5: Commit any final scoped verification correction**

Use a narrow `fix:` commit only if Step 1–4 exposed a regression; otherwise do not create an empty commit.

- [ ] **Step 6: Push the verified HEAD to GitHub main**

Push the current verified commit to `origin/main` and confirm the remote SHA matches local HEAD.

- [ ] **Step 7: Package and deploy the same validated source to Sites**

Build the established Sites artifact, save one version using the private source repository head, deploy privately, and poll until status is `succeeded`.

- [ ] **Step 8: Open and verify the deployed URL**

Open the returned deployed URL in Codex, verify the app loads, then hand off the URL. Note that physical haptic feel must be confirmed on the Samsung phone.
