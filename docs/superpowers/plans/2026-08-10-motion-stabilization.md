# Motion Stabilization and Count-Driven Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Calendar Master’s liquid/morph visual language while making recent animations stable, restrained, connected, and count-driven for checklist progress.

**Architecture:** Keep the existing React component structure and motion CSS in `src/Planner.jsx`. Move the count-to-segment rule into a small pure motion helper so it is independently testable, and make `useLiquidPill` stage the previous rectangle before committing a destination rectangle. Remove the fragile multi-shape/filter layer while retaining one-material movement, fills, and the measured sheet notch.

**Tech Stack:** React 19, Vite, native CSS transitions/animations, Node test runner, Playwright E2E tests.

## Global Constraints

- Preserve task, checklist, persistence, scheduling, keyboard, pointer, and reduced-motion semantics.
- Use one bounded, non-overshooting motion curve for layout travel and a short ease for visual state changes.
- Progress segments fill left-to-right by completion count, never by checklist item identity.
- Production code must be preceded by a failing regression test.
- Verify unit tests, production build, browser tests when Chromium is available, final diff, and final Git status before pushing `main`.

---

### Task 1: Add regression coverage for count-driven progress and bounded motion

**Files:**
- Modify: `src/features/motion/fluidGeometry.test.js`
- Create: `src/features/motion/progressGeometry.test.js`
- Modify: `tests/e2e/timeline-polish.spec.js:64-110`
- Modify: `tests/e2e/motion.spec.js:12-77`
- Modify: `tests/e2e/search-control.spec.js:1-85`

**Interfaces:**
- `progressGeometry.js` will produce `progressSegmentStates(done, total): boolean[]`.
- The UI will consume the returned array as indexed visual segment state.

- [ ] **Step 1: Write the failing unit tests**

Add `progressGeometry.test.js` with these behaviors:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { progressSegmentStates } from "./progressGeometry.js";

test("fills segments from the left by count, not by item identity", () => {
  assert.deepEqual(progressSegmentStates(1, 4), [true, false, false, false]);
  assert.deepEqual(progressSegmentStates(3, 4), [true, true, true, false]);
});

test("clamps malformed counts to the available segments", () => {
  assert.deepEqual(progressSegmentStates(-1, 3), [false, false, false]);
  assert.deepEqual(progressSegmentStates(9, 3), [true, true, true]);
  assert.deepEqual(progressSegmentStates(1, 0), []);
});
```

Update the stretch expectation in `fluidGeometry.test.js` to the restrained
contract: zero travel remains `1`, a 52px move returns `1.13`, and a very large
move is capped at `1.18`.

- [ ] **Step 2: Update browser regression assertions before implementation**

In `timeline-polish.spec.js`, seed four open steps, click `Step 2` first, and
assert the progressbar has `data-filled="true"` only on segment `0`; click
`Step 4` next and assert only segments `0` and `1` are filled. Keep the existing
ARIA and even-width assertions.

In `motion.spec.js` and `search-control.spec.js`, change filter assertions to
the new contract: no `goo-pill`, `goo-days`, or `goo-search` filters are mounted
at rest or during the associated interaction. Keep assertions for selection
changes, search expansion, reduced motion, and sheet route behavior.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```powershell
& 'C:\Users\Kamran\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/features/motion/fluidGeometry.test.js src/features/motion/progressGeometry.test.js
```

Expected: failure because the new progress helper does not exist and the
restrained stretch values are not implemented yet.

- [ ] **Step 4: Commit the failing test contract**

```powershell
git add src/features/motion/fluidGeometry.test.js src/features/motion/progressGeometry.test.js tests/e2e/timeline-polish.spec.js tests/e2e/motion.spec.js tests/e2e/search-control.spec.js
git commit -m "test: define stable motion and progress behavior"
```

### Task 2: Implement the pure geometry and progress rules

**Files:**
- Modify: `src/features/motion/fluidGeometry.js`
- Create: `src/features/motion/progressGeometry.js`
- Modify: `src/Planner.jsx:100-120`

**Interfaces:**
- `fluidPillStretch(previousBox, nextBox): number` returns a value in `[1, 1.18]`.
- `progressSegmentStates(done, total): boolean[]` returns exactly `total` booleans.

- [ ] **Step 1: Implement the minimal helper behavior**

Use finite numeric normalization, clamp `done` to `[0, total]`, and return
`index < clampedDone` for each indexed segment. Keep the helper independent of
React and persistence state.

Reduce `fluidPillStretch` to a bounded, subtle stretch that returns `1.13` for
52px travel and `1.18` for travel at or above 260px.

- [ ] **Step 2: Run focused tests to verify GREEN**

Run the focused command from Task 1. Expected: all focused unit tests pass.

- [ ] **Step 3: Commit the pure rules**

```powershell
git add src/features/motion/fluidGeometry.js src/features/motion/progressGeometry.js src/Planner.jsx
git commit -m "fix: bound liquid motion and define progress segments"
```

### Task 3: Stabilize liquid controls and recent animation timing

**Files:**
- Modify: `src/Planner.jsx:2590-2718`
- Modify: `src/Planner.jsx:5144-5348`
- Modify: `src/Planner.jsx:5917-6098`

**Interfaces:**
- `useLiquidPill` keeps returning `{ box, stretch, settled }` to existing callers.
- `PillNav`, `Chips`, and `InlineChoiceRow` keep their current props and labels.

- [ ] **Step 1: Stage the previous pill rectangle**

Keep the last committed rectangle in a ref. On an active-option change, leave the
indicator at the previous rectangle for the current painted frame, set the
bounded stretch, then commit the new measured rectangle on the next animation
frame. Cancel pending frames and timers in cleanup. Initial mount still places the
indicator immediately without a travel animation.

- [ ] **Step 2: Remove fragile droplet/filter lifecycles**

Delete `GooeyFilter` usage from `PillNav`, `GooeySearch`, and the weekly weekday
row. Keep `GooeySearch`’s reserved-width layout and animate its single pill width,
label opacity, and bubble position. Keep `LiquidFill` for weekday chips and other
multi-select chips.

- [ ] **Step 3: Replace overshoot timing and duplicate press feedback**

Use `cubic-bezier(.22,.8,.25,1)` for sheet, notch, pill, reveal, edit, and
mobile-sheet travel. Replace the global button scale curve with the same
restrained curve, remove `.nb-tap:active` transform scaling, and reduce the
completion pop peak scale to `1.06`. Keep reduced-motion and disabled-control
behavior.

- [ ] **Step 4: Run focused motion tests and build**

```powershell
& 'C:\Users\Kamran\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test src/features/motion/*.test.js
& 'C:\Users\Kamran\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vite/bin/vite.js build
```

Expected: focused motion tests and the production build pass.

- [ ] **Step 5: Commit motion stabilization**

```powershell
git add src/Planner.jsx src/features/motion/fluidGeometry.js tests/e2e/motion.spec.js tests/e2e/search-control.spec.js
git commit -m "fix: stabilize liquid interaction motion"
```

### Task 4: Implement count-driven animated progress bars

**Files:**
- Modify: `src/Planner.jsx:4231-4405`
- Modify: `tests/e2e/timeline-polish.spec.js:64-110`

**Interfaces:**
- `TaskCard` continues deriving `subDone` from the checklist and continues
  exposing the same progressbar label and ARIA values.

- [ ] **Step 1: Render indexed tracks and inner fills**

Render `progressSegmentStates(subDone, checklist.length)` rather than mapping
checklist items. Give each track `data-segment-index` and each inner fill
`data-filled`. Keep equal flex sizing and the existing progressbar role. Animate
the inner fill with `transform: scaleX(0|1)`, `transformOrigin: left center`, a
260ms monotonic ease, and a small index-based delay only for a newly filled
segment. Do not key or position segments with checklist IDs.

- [ ] **Step 2: Run targeted progress tests**

Run the focused unit command and the targeted Playwright files. Expected: the
out-of-order completion test passes and existing checklist semantics remain.

- [ ] **Step 3: Commit progress rendering**

```powershell
git add src/Planner.jsx tests/e2e/timeline-polish.spec.js
git commit -m "fix: animate checklist progress by completion count"
```

### Task 5: Full QA and impact review

**Files:**
- Inspect: all modified files and the final Git diff

- [ ] **Step 1: Run the complete unit suite**

```powershell
& 'C:\Users\Kamran\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
```

Expected: zero failures.

- [ ] **Step 2: Run the production build**

```powershell
& 'C:\Users\Kamran\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vite/bin/vite.js build
```

Expected: exit code 0, with no new compilation errors.

- [ ] **Step 3: Run the complete Playwright suite**

Start the built preview with the direct Node runtime and run all `tests/e2e`.
If Chromium remains unavailable, record the exact environment blocker and use
static, build, and unit evidence without claiming browser success.

- [ ] **Step 4: Review upstream/downstream impact**

Confirm the final diff changes only motion presentation, test expectations, the
pure progress helper, and design/plan documentation. Confirm task state writes,
checklist toggling, completion delay, persistence, scheduling, reduced motion,
and accessibility attributes remain unchanged.

### Task 6: Publish a visual Sites preview and push `main`

**Files:**
- Inspect/modify: `.openai/hosting.json` only if Sites requires project metadata

- [ ] **Step 1: Publish a private Sites preview**

Use the Sites connector’s existing-project or create-site flow, package the
validated `dist/` artifact, save one version at the verified commit SHA, deploy
privately, poll until successful, and open the exact deployed URL in the in-app
browser.

- [ ] **Step 2: Push the verified commits to `origin/main`**

```powershell
git status --short --branch
git log --oneline origin/main..HEAD
git push origin main
```

Expected: push succeeds and local `main` tracks the new `origin/main` head.

- [ ] **Step 3: Verify after push**

```powershell
git status --short --branch
git rev-parse HEAD
```

Expected: clean worktree and `main...origin/main` with no ahead/behind count.
