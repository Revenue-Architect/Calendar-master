# Subtask Hierarchy Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make checklist items and promoted subtasks immediately distinguishable while preserving Action, Timeline, and completion behavior.

**Architecture:** Keep the existing flat `parentTaskId` domain model and parent-only day projections. Change only Planner presentation and browser regression tests: derive a task’s hierarchy role from `parentTaskId`, give checklist/subtask groups explicit semantic state, and retain Timeline children as compact parent metadata.

**Tech Stack:** React 19, Vite, Tailwind utility classes with inline theme tokens, Node test runner, Playwright.

## Global Constraints

- Keep `MAX_DEPTH = 1`; a child checklist item never exposes conversion.
- Do not change task persistence, domain commands, day-view queries, Timeline drag/resize/swipe, haptic feedback, or COMPLETE-overlay behavior.
- Use existing theme tokens and `nb-tap` / hover primitives; no animation library, gradients, layout springs, or new dependencies.
- Conversion feedback may animate only opacity and a 4px transform for 160–180ms; keyboard activation has no movement.
- Preserve the existing 44px effective touch targets and reduced-motion behavior.

---

## File structure

- `src/Planner.jsx` — renders card groups, inspector hierarchy context, and compact Timeline metadata.
- `tests/e2e/actions.spec.js` — proves parent/child visibility, inspector context, and Timeline affordances.
- `docs/superpowers/specs/2026-08-14-subtask-hierarchy-design.md` — approved product and design contract.

### Task 1: Protect conditional checklist presentation

**Files:**
- Modify: `tests/e2e/actions.spec.js`
- Modify: `src/Planner.jsx` (`TaskCard` checklist section)

**Interfaces:**
- Consumes: `TaskCard({ t, subtasks, ... })` and existing `data-test="task-add-step"`.
- Produces: a visible `+ QUICK STEP` control only when `checklist.length === 0 && subtasks.length > 0`.

- [ ] **Step 1: Write failing browser tests**

```js
test("a parent with only subtasks hides its empty checklist until Quick Step is chosen", async ({ page }) => {
  // Seed one parent and one child, open Actions, assert no task-add-step,
  // click + QUICK STEP, then assert the existing Add a step input is visible.
});
```

- [ ] **Step 2: Run the new test and confirm it fails because the empty composer is still visible.**

Run: `npx playwright test tests/e2e/actions.spec.js --grep "only subtasks hides"`

- [ ] **Step 3: Add the smallest local UI state needed to reveal the existing composer on demand and conditionally render the empty checklist section.**

- [ ] **Step 4: Run the targeted test and the existing “every open Action exposes Add a step immediately” test after changing that expectation to the approved empty-parent rule.**

- [ ] **Step 5: Commit the task.**

### Task 2: Give checklist and subtask groups distinct hierarchy treatment

**Files:**
- Modify: `tests/e2e/actions.spec.js`
- Modify: `src/Planner.jsx` (`TaskCard`, `PromotedSubtasks`)

**Interfaces:**
- Consumes: `checklist`, `subtasks`, existing `SegmentedProgress`, and complete/reopen callbacks.
- Produces: labelled `CHECKLIST` and `SUBTASKS` groups with distinct accessible roles and conversion copy.

- [ ] **Step 1: Write failing browser tests asserting both group labels, child status control, and `Convert to subtask` copy.**
- [ ] **Step 2: Run them to confirm the current near-identical groups fail the assertions.**
- [ ] **Step 3: Implement labelled group wrappers and distinct child row treatment without changing callbacks or progress calculations.**
- [ ] **Step 4: Run targeted tests plus existing promotion, complete/reopen, and segmented-progress suites.**
- [ ] **Step 5: Commit the task.**

### Task 3: Preserve orientation in the inspector

**Files:**
- Modify: `tests/e2e/actions.spec.js`
- Modify: `src/Planner.jsx` (inspector Sheet title, action body, checklist controls)

**Interfaces:**
- Consumes: inspected task record and `parentTaskId`.
- Produces: `SUBTASK` title, parent breadcrumb, and no child-level conversion control.

- [ ] **Step 1: Write failing browser tests that open a child from Timeline and Actions, assert `SUBTASK`, then use the parent breadcrumb to return to `ACTION`.**
- [ ] **Step 2: Run tests and confirm current sheets still identify both records as `ACTION`.**
- [ ] **Step 3: Derive parent context once and render the breadcrumb only for children; prevent conversion controls on child checklist rows.**
- [ ] **Step 4: Run targeted inspector tests and the full Actions browser spec.**
- [ ] **Step 5: Commit the task.**

### Task 4: Make child work discoverable in all Timeline card sizes

**Files:**
- Modify: `tests/e2e/actions.spec.js`
- Modify: `src/Planner.jsx` (`TimelineActionCard`)

**Interfaces:**
- Consumes: existing `subtaskProgress` prop.
- Produces: an always-present, non-interactive compact child marker when `total > 0`; rich count remains height-gated.

- [ ] **Step 1: Write failing browser tests for an estimated short Timeline Action and a taller one.**
- [ ] **Step 2: Run them and confirm the current height gate hides all child information on the short card.**
- [ ] **Step 3: Render a compact marker in the existing text row, with an accessible `N subtasks` label, without adding pointer interception.**
- [ ] **Step 4: Run Timeline drag, resize, swipe, NOW, live-progress, and completion-overlay tests.**
- [ ] **Step 5: Commit the task.**

### Task 5: Full regression and ship

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-subtask-hierarchy-design.md` only if implementation reveals an approved wording correction.

- [ ] **Step 1: Run Node domain tests:** `npm test`.
- [ ] **Step 2: Run browser Actions suite:** `npx playwright test tests/e2e/actions.spec.js`.
- [ ] **Step 3: Run full browser suite:** `npm run test:e2e`.
- [ ] **Step 4: Build production artifact:** `npm run build`.
- [ ] **Step 5: Inspect the diff for unrelated changes, commit documentation and implementation, then push the approved branch to `main`.**

## Self-review

- Spec coverage: Tasks 1–4 implement every approved screen and interaction decision; Task 5 protects upstream and downstream behavior.
- Scope: no persistence, domain, provider, or Timeline gesture changes.
- Ambiguity resolved: children remain parent-scoped and are not independently scheduled in this release.
