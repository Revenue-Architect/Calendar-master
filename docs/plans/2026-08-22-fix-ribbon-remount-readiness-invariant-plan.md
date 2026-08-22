# Ribbon Remount Readiness Invariant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate spacer-only Day and Week ribbon frames after Calendar re-entry without regressing responsive manual-browse preservation.

**Architecture:** `useRibbonViewport.js` remains the one viewport lifecycle owner. On a semantic ribbon remount, ensure `selectedDateKey` is inside the existing 56-day React window before DOM positioning waits for its selected cell. On a same-node geometry change, retain PR #5 logical-centre preservation.

**Tech Stack:** React layout effects, existing ribbon virtualization, Playwright Chromium, Node test runner.

**Spec:** `DESIGN.md`, `docs/interaction-contracts/planner-interactions.md`, `docs/spec/structure.md`.

## Global Constraints

- Actions has no Calendar/ribbon context; Calendar return restores the selected date inside the visible ribbon before first paint.
- Same mounted node plus geometry change preserves a browsed logical centre. Do not recenter on every `ResizeObserver` event.
- Keep `RIBBON_RENDER_WINDOW_DAYS` at 56. Do not add a timer, retry loop, state machine, Planner state, or scroll lock.
- Preserve scrollend and fallback release, responsive logical-centre conversion, `ResizeObserver`, fonts, visibility retries, edge fades, and `data-day` semantics.
- Production scope is `src/features/planner/useRibbonViewport.js` only. Do not modify Planner, WeekGrid, gesture/touch code, Timeline chrome, navigation, motion, Sheet, Composer, domain, persistence, recurrence, or JOIN without stopping to report why the hook lacks required input.
- First-frame browser tests capture a single immutable observer snapshot. Polling may wait for that snapshot but may not sample live DOM until eventual recovery.

---

### Task 1: First-frame remount regression and minimal lifecycle correction

**Files:**
- Modify: `tests/e2e/ribbon-readiness.spec.js`
- Modify: `src/features/planner/useRibbonViewport.js`

**Interfaces:**
- Consumes: existing `selectedDateKey`, `ribbonRange`, `ribbonSpan`, `ribbonWindowStart`, `setRibbonWindowStart`, `ribbonNode`, and `ribbonActiveNode` contracts.
- Produces: immutable Day/Week/Month re-entry first-frame evidence and a selection-ready virtual window before the existing DOM reveal transaction.

- [x] **Step 1: Write the bounded browse helper and immutable first-frame helper**

```js
async function browseUntilSelectedIsUnrendered(page) {
  const ribbon = page.getByTestId("day-ribbon");
  const selected = await page.getByTestId("day-heading").getAttribute("data-date");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await ribbon.locator(`[data-day="${selected}"]`).count() === 0) return selected;
    await ribbon.evaluate((node) => {
      node.scrollLeft = Math.min(node.scrollWidth - node.clientWidth,
        node.scrollLeft + node.clientWidth * 1.5);
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(32);
  }
  throw new Error("selected date never left the rendered ribbon window");
}
```

While the ribbon is absent, install a `MutationObserver`. When the new `[data-test="day-ribbon"]` first appears, queue exactly one `requestAnimationFrame` and save one immutable object containing rendered date count, intersecting real `data-day` values, selected rendered/intersects booleans, position state, `clientWidth`, and `scrollLeft`.

- [x] **Step 2: Write the three RED first-frame regressions**

Add independent tests for:

1. Day: browse selected date out of the virtual window, Timeline → Actions → Timeline.
2. Week: browse out, Week → Actions → Timeline while remaining Week.
3. Month: browse out, Day/Week → Month → return to a ribbon zoom.

Before each transition require a valid selected date, zero selected `button[data-day]` count, and `0 < renderedDayCount <= 56`. On the frozen snapshot require:

```js
expect(firstFrame.renderedDayCount).toBeGreaterThan(0);
expect(firstFrame.intersectingRealDates.length).toBeGreaterThan(0);
expect(firstFrame.selectedRendered).toBe(true);
expect(firstFrame.selectedIntersects).toBe(true);
```

Then retain separate eventual `settled`/intersection assertions. Leave the existing manual-browse responsive resize-preservation test unchanged.

- [x] **Step 3: Verify RED on the exact base**

Run:

```powershell
$env:PLAYWRIGHT_PORT='48920'
npx playwright test tests/e2e/ribbon-readiness.spec.js --project=chromium --workers=1
```

Expected: affected compound re-entry tests fail because the frozen first frame does not render/intersect selection. If all are green, stop and record the snapshots; do not change production code on this hypothesis.

- [x] **Step 4: Implement the minimal ordering correction**

In the existing readiness `useLayoutEffect`, replace the early active-node gate with semantic window preparation after `enabled`, `ready`, and `ribbonNode` are known:

```js
useLayoutEffect(() => {
  if (!enabled || !ready || !ribbonNode) return;
  ensureDateVisible(selectedDateKey);
  if (!ribbonActiveNode) return;
  // retain current initial/selected-date/pending-window beginPosition logic
}, [beginPosition, enabled, ensureDateVisible, ready,
  ribbonActiveNode, ribbonNode, selectedDateKey]);
```

Do not invoke selected-date readiness from geometry retries. React must render the selected cell after `ensureDateVisible`, then the existing transaction positions that DOM cell.

- [x] **Step 5: Verify GREEN and negative controls**

Rerun the focused ribbon spec and require all tests green. Locally, without committing sabotage:

1. Restore the active-node-before-window gate and prove affected re-entry tests red.
2. Bypass final DOM `beginPosition` after selected rendering and prove selected rendered may pass while selected intersects fails.
3. Force selected-date recentering in the geometry retry path and prove the existing manual-browse resize preservation test red.

Restore the minimal implementation and record commands/output in the task report.

- [x] **Step 6: Commit Task 1**

```powershell
git add src/features/planner/useRibbonViewport.js tests/e2e/ribbon-readiness.spec.js
git commit -m "fix(ribbon): prepare selected window before remount positioning"
```

### Task 2: Cross-feature verification, visual validation, and QA evidence

**Files:**
- Create: `docs/qa/2026-08-22-ribbon-remount-readiness-invariant.md`
- Modify: `docs/plans/2026-08-22-fix-ribbon-remount-readiness-invariant-plan.md`

**Interfaces:**
- Consumes: Task 1 first-frame regressions and corrected hook ordering.
- Produces: auditable evidence that semantic re-entry restores selection while same-node resize preserves browsing.

- [x] **Step 1: Run upstream and downstream browser gates**

Run each with `--project=chromium --workers=1` and its own `PLAYWRIGHT_PORT`:

```powershell
npx playwright test tests/e2e/ribbon-readiness.spec.js
npx playwright test tests/e2e/navigation-shell.spec.js
npx playwright test tests/e2e/motion.spec.js
npx playwright test tests/e2e/timeline-gestures.spec.js
npx playwright test tests/e2e/week-drag.spec.js
npx playwright test tests/e2e/timeline-chrome-scroll.spec.js
npx playwright test tests/e2e/actions.spec.js
npx playwright test tests/e2e/interaction-contracts.spec.js
npx playwright test tests/e2e/recurring.spec.js
npx playwright test tests/e2e/join.spec.js
```

Verify Actions remains ribbon-free, Calendar return works, data-day gesture targets remain intact, and no adjacent suite changed behavior. Compare any new failure with `b5b67ce22f84c664273ede23338d8d9ae3ccf0ae` under identical execution conditions before classifying it.

- [x] **Step 2: Run repeat, unit, build, and complete gates**

```powershell
$env:PLAYWRIGHT_PORT='48930'
npx playwright test tests/e2e/ribbon-readiness.spec.js --project=chromium --workers=1 --grep "Day re-entry|Week re-entry|Month return" --repeat-each=10
node --test src/features/planner/ribbonViewport.test.js
npm test
npm run build
$env:PLAYWRIGHT_PORT='48931'
npx playwright test --project=chromium --workers=1
```

Require 10/10 repetitions for each new compound lifecycle case and fresh passing evidence for every command.

- [x] **Step 3: Perform Windows Chrome manual QA and write the QA record**

Reset/reseed browser sample data. At `1280×900`, `390×844`, and `390×601`, inspect Day browse → Actions → Timeline, Day/Week browse → Month → return, Week browse → Actions → Week, and same-node browse → `1280→900→390` resize. Re-entry must immediately restore selection without spacer-only flash; resize must preserve browsed centre. Inspect edge fades, selected styling, arrows, header, navigation, Composer, and horizontal post-settle movement.

Write QA evidence with base/final SHA; changed and intentionally untouched files; RED/GREEN/negative-control evidence; first-frame Day/Week/Month results; responsive counter-contract; all test counts; manual results; and residual known ribbon issues.

- [x] **Step 4: Commit Task 2**

```powershell
git add docs/qa/2026-08-22-ribbon-remount-readiness-invariant.md docs/plans/2026-08-22-fix-ribbon-remount-readiness-invariant-plan.md
git commit -m "docs(qa): record ribbon remount readiness validation"
```

## Definition of Done

- [x] Exact-base first-frame failures were observed before production code changed.
- [x] Day, Week, and Month re-entry first frames contain real dates and selected intersection.
- [x] Same-node responsive browse preservation remains green and the virtual window remains at most 56 dates.
- [x] No production file outside `useRibbonViewport.js` changes.
- [x] Negative controls are observed red and reverted.
- [x] Compound lifecycle repetition is 10/10; focused, unit, build, full Chromium, and Windows Chrome evidence are current.
