# Resilience and Accessibility Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden Calendar Master against the evaluated accessibility, storage-recovery, slow-bootstrap, gesture-discoverability, responsive, and stressed-motion failure modes while leaving cross-device sync out of scope.

**Architecture:** Extend the existing `Planner.jsx` shell and local-storage status flow with one small pure classifier for canonical versus supporting failures. Reuse the existing `SHORTCUTS`, `Sheet`, `LabeledNative`, Playwright helpers, and visual system rather than adding a new framework or dependency. Add a focused browser quality suite for the new contracts and run it with the existing serial production-bundle suite.

**Tech Stack:** React 19, Vite 7, Tailwind 4, browser-native storage, Node test runner, Playwright Chromium, existing CSS motion primitives.

## Execution record

Implemented on 2026-08-12. The approved scope excludes cross-device sync. The implementation also retains a raw recovery snapshot when notebook validation fails, routes the gesture hint through the host storage port, and makes the now-marker fixture deterministic across midnight test runs.

Verification completed: `npm test` (508 passing), production build, resilience/accessibility quality suite (9 passing), drag/resize interaction suite (39 passing), visual audit (13 flows, zero browser issues), and the corrected polish suite (6 passing). The full serial browser sweep reached 207/208 before exposing the now-marker test's 23:31+ fixture boundary; that fixture was corrected and its complete file suite rerun green.

## Global Constraints

- Do not implement account, synchronization, provider connections, or any cross-device behavior; evaluation finding #3 is excluded.
- Preserve the existing local-first notebook, recurrence, drag, completion/reopen, haptics, reminders, export, themes, and motion semantics.
- Do not add a localization framework or a third-party accessibility/performance dependency.
- Canonical storage failure means `planner` or `device`; supporting failure means `preferences`, `reminders`, `motivation`, or `diagnostics`.
- The existing `DESIGN.md` is foundational but dated; current interaction specs under `docs/superpowers/specs/` remain authoritative for newer behavior.
- Every task ends with its focused test or verification command before moving to the next task.

---

### Task 1: Add pure storage-failure classification

**Files:**
- Create: `src/platform/resilience/storageStatus.js`
- Create: `src/platform/resilience/storageStatus.test.js`

**Interfaces:**
- Produces `classifyStorageFailures(failures)` returning `{ canonical: boolean, supporting: string[] }`.
- Produces `isCanonicalStorageScope(scope)` returning a boolean.
- Consumes a `Set`, array, or iterable of scope strings; unknown scopes are supporting so a future auxiliary store cannot create a false red notebook alert.

- [ ] **Step 1: Write the failing unit tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { classifyStorageFailures, isCanonicalStorageScope } from "./storageStatus.js";

test("planner and device failures are canonical", () => {
  assert.equal(isCanonicalStorageScope("planner"), true);
  assert.equal(isCanonicalStorageScope("device"), true);
  assert.deepEqual(classifyStorageFailures(new Set(["planner", "diagnostics"])), {
    canonical: true,
    supporting: ["diagnostics"],
  });
});

test("supporting failures do not claim the notebook is not saving", () => {
  assert.equal(isCanonicalStorageScope("preferences"), false);
  assert.deepEqual(classifyStorageFailures(["preferences", "reminders"]), {
    canonical: false,
    supporting: ["preferences", "reminders"],
  });
});

test("the classifier handles an empty or unknown scope collection", () => {
  assert.deepEqual(classifyStorageFailures([]), { canonical: false, supporting: [] });
  assert.deepEqual(classifyStorageFailures(["future-support-store"]), {
    canonical: false,
    supporting: ["future-support-store"],
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test src/platform/resilience/storageStatus.test.js`
Expected: FAIL because `storageStatus.js` does not exist yet.

- [ ] **Step 3: Implement the classifier**

```js
const CANONICAL = new Set(["planner", "device"]);

export function isCanonicalStorageScope(scope) {
  return CANONICAL.has(scope);
}

export function classifyStorageFailures(failures) {
  const scopes = [...(failures || [])];
  return {
    canonical: scopes.some(isCanonicalStorageScope),
    supporting: scopes.filter((scope) => !isCanonicalStorageScope(scope)),
  };
}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test src/platform/resilience/storageStatus.test.js`
Expected: PASS with 3 tests.

- [ ] **Step 5: Commit the isolated helper**

```bash
git add src/platform/resilience/storageStatus.js src/platform/resilience/storageStatus.test.js
git commit -m "test: define scoped storage failure status"
```

### Task 2: Fix native field names and the inactive zoom control

**Files:**
- Modify: `src/Planner.jsx:7835-7944` composer native date/time inputs
- Modify: `src/Planner.jsx:4019-4024` Day-view zoom control
- Modify: `tests/e2e/shell.spec.js` Day-view zoom expectation
- Create: `tests/e2e/accessibility-quality.spec.js`

**Interfaces:**
- Existing input behavior and visible labels remain unchanged.
- Each visible `input[type="date"]` and `input[type="time"]` exposes an accessible name through `aria-label`.
- Day view renders no `data-test="zoom-in"`; Week and Month continue to render it.

- [ ] **Step 1: Add the failing browser assertions**

Add a test that opens the event composer, expands More Options, and asserts every visible native date/time input has a non-empty accessible name. Add a second assertion that the Day view contains zero `zoom-in` controls and the existing Week navigation test still finds one after zooming out.

- [ ] **Step 2: Run the focused browser tests and verify the current failure**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js tests/e2e/shell.spec.js --grep "native|zoom" --workers=1`
Expected: the accessible-name assertion reports the composer’s unnamed direct inputs, and the existing Day-view disabled-control assertion conflicts with the new contract.

- [ ] **Step 3: Add semantic names without changing layout**

Use explicit names at the existing direct inputs: `Start time`, `End time`, `Action date`, `Last event day`, `Event day`, `Action time`, `Due date`, and `Repeat until`. Keep the existing visible `FROM`, `ON`, `DUE`, and `UNTIL` text. Render the zoom-in button only when `zoom !== "day"`.

- [ ] **Step 4: Run the focused browser tests**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js tests/e2e/shell.spec.js --grep "native|zoom" --workers=1`
Expected: PASS with no visible unnamed native fields and no blank Day control.

### Task 3: Split canonical and supporting storage recovery UI

**Files:**
- Modify: `src/Planner.jsx:121-180` imports and derived storage state
- Modify: `src/Planner.jsx:889-965` storage state and classification
- Modify: `src/Planner.jsx:4214-4224` backup-nudge guard
- Modify: `src/Planner.jsx:4635-4650` global storage alert
- Modify: `src/Planner.jsx:5408-5412` Settings data status
- Modify: `tests/e2e/accessibility-quality.spec.js`

**Interfaces:**
- `storageStatus = classifyStorageFailures(storageFailures)` is the single UI source for `canonical` and `supporting` status.
- Canonical alert uses `data-test="storage-alert"`; supporting guidance uses `data-test="supporting-storage-warning"` in Settings.
- The canonical message wraps on narrow widths and its action is labelled `SAVE A COPY`.

- [ ] **Step 1: Add failing blocked/supporting-storage assertions**

Extend the quality suite to block `localStorage`, assert the canonical alert is visible, assert its full explanation is readable at 390px, and assert the Settings supporting warning is not shown when only the canonical path is failing. Add a second test that supplies a storage implementation failing only the preferences key and asserts the red canonical alert is absent while the scoped supporting warning is present.

- [ ] **Step 2: Run the focused tests and verify the current failure**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js --grep "storage" --workers=1`
Expected: the current broad `storageBad` alert cannot distinguish the failure classes and the narrow message is truncated.

- [ ] **Step 3: Wire the classifier and responsive copy**

Import `classifyStorageFailures`, derive `storageStatus`, use `storageStatus.canonical` for the global alert and backup-nudge guard, render supporting status only in Settings, replace `truncate` with a wrapping `min-w-0 flex-1` message, and make the action text `SAVE A COPY` while preserving the current export function.

- [ ] **Step 4: Run focused storage and visual checks**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js --grep "storage" --workers=1`
Expected: PASS; the 390px alert contains the complete safety sentence without horizontal overflow.

### Task 4: Add slow-bootstrap recovery without data mutation

**Files:**
- Modify: `src/Planner.jsx:763-766` loading state
- Modify: `src/Planner.jsx:1000-1130` bootstrap lifecycle
- Modify: `src/Planner.jsx:3247-3260` loading surface
- Modify: `tests/e2e/accessibility-quality.spec.js`

**Interfaces:**
- The watchdog exposes `loadingSlow` only while `ready === false`.
- The recovery action reloads the current page; it never seeds, saves, or clears notebook data.
- Normal bootstrap remains on the existing fast path.

- [ ] **Step 1: Add the delayed-storage browser test**

Before navigation, install `window.storage` with `get` returning a Promise that resolves after 3 seconds and `set/remove` resolving normally. Assert `data-test="loading-recovery"` appears before the delayed bootstrap resolves, then assert the day stream appears and the recovery surface disappears.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js --grep "delayed storage" --workers=1`
Expected: FAIL because the current loader remains `OPENING THE NOTEBOOK` with no recovery control.

- [ ] **Step 3: Implement a cancellable watchdog**

Start a timer when the Planner mounts, set `loadingSlow` after 2,000ms, clear it when bootstrap completes or the component unmounts, and render a simple loader message with `RELOAD`. Keep the existing `ready`/`db` gate and do not add a fallback notebook path.

- [ ] **Step 4: Run the focused test**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js --grep "delayed storage" --workers=1`
Expected: PASS with the recovery state visible only during the delayed load.

### Task 5: Document gestures and add the first-use Timeline hint

**Files:**
- Modify: `src/Planner.jsx:255-274` shared `SHORTCUTS`
- Modify: `src/Planner.jsx:808-820` UI hint state
- Modify: `src/Planner.jsx:5327-5334` shortcut sheet
- Modify: `src/Planner.jsx` Timeline empty/stream context near the existing hint and status surfaces
- Modify: `tests/e2e/accessibility-quality.spec.js`

**Interfaces:**
- `SHORTCUTS` gains a `GESTURES` group; the existing sheet renderer consumes it without a second hand-written list.
- The first-use hint is dismissible, non-modal, and keyed by `nbmp:ui:gestureHintSeen`; storage errors fall back to in-memory dismissal.
- Hint controls expose `data-test="gesture-hint"` and `data-test="gesture-hint-dismiss"`.

- [ ] **Step 1: Add failing help assertions**

Open the existing shortcut sheet with `?`, assert the `GESTURES` group and its five gesture descriptions, then reload a clean notebook and assert the first-use hint appears once and disappears after dismissal.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js --grep "gesture|shortcut" --workers=1`
Expected: the current sheet has keyboard groups only and no gesture hint.

- [ ] **Step 3: Implement the shared help additions**

Add the gesture entries to `SHORTCUTS`, render the group in the existing sheet, and add a small inline hint with a `SHORTCUTS` link and dismiss action. Do not add a modal or a new navigation route.

- [ ] **Step 4: Run focused help tests**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js --grep "gesture|shortcut" --workers=1`
Expected: PASS; existing keyboard shortcut behavior remains unchanged.

### Task 6: Add RTL, reflow, volume, and motion quality coverage

**Files:**
- Modify: `tests/e2e/accessibility-quality.spec.js`
- Modify: `tests/e2e/helpers.js` only if a bounded 1,000-record fixture helper is needed
- Modify: `package.json` only if a named `test:quality` script is useful

**Interfaces:**
- The quality suite uses the production preview configured by `playwright.config.js`.
- A generated fixture contains at least 1,000 valid records and remains bounded to the test.
- Stress checks report browser errors, horizontal overflow, and severe long tasks; they do not fail on a brittle fixed FPS number.

- [ ] **Step 1: Add the failing stress tests**

Add tests that set `document.documentElement.dir = "rtl"`, apply a bounded 200% reflow simulation, fill a long mixed-script title, seed 1,000 records, and perform repeated timeline scrolls while collecting `PerformanceObserver` long-task entries and page errors. Assert the primary surface remains reachable and no supported state exceeds the viewport horizontally.

- [ ] **Step 2: Run the stress tests and record failures**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js --workers=1`
Expected: any real overflow, missing primary control, page error, or severe long task is reported with the viewport/state that caused it.

- [ ] **Step 3: Make only evidence-backed layout or motion fixes**

Keep the existing low-frequency transitions and arrival spring. If a stress test identifies a high-frequency lane/pill bottleneck, change only that property or timing and add a focused assertion for the corrected behavior. Do not replace all transitions with a blanket static state.

- [ ] **Step 4: Run the complete quality suite**

Run: `npx playwright test tests/e2e/accessibility-quality.spec.js --workers=1`
Expected: PASS at desktop, 390px, and 320px cases with zero browser errors.

### Task 7: Full regression, visual QA, and push

**Files:**
- Modify: only source/test files proven necessary by Tasks 1–6
- Preserve: all existing untracked audit attachments and captures; do not stage them

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: all unit tests pass.

- [ ] **Step 2: Run the complete serial browser suite**

Run: `npm run test:e2e -- --workers=1`
Expected: all existing and new browser tests pass.

- [ ] **Step 3: Build the production artifact**

Run: `npm run build`
Expected: build succeeds; the existing large-chunk advisory may remain, but no build error is allowed.

- [ ] **Step 4: Run the visual audit and inspect key captures**

Run: `node audit\\2026-08-12\\visual-audit.mjs`
Inspect the storage alert, gesture hint/shortcut sheet, composer fields, narrow Month/Timeline surfaces, and action completion states. Confirm zero page errors and no new overflow.

- [ ] **Step 5: Review the diff and commit implementation**

```bash
git diff --check
git status --short
git add src tests package.json docs/superpowers/plans/2026-08-12-resilience-accessibility-hardening.md
git commit -m "fix: harden planner accessibility and recovery"
```

Only tracked implementation/spec/plan files are staged; unrelated untracked audit artifacts stay untouched.

- [ ] **Step 6: Push the verified commit to main**

```bash
git push origin HEAD:main
```

Expected: `origin/main` advances to the verified implementation commit.
