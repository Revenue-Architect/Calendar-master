# Ribbon Remount Readiness Invariant — QA Record

Date: 2026-08-22
Base: 'b5b67ce22f84c664273ede23338d8d9ae3ccf0ae'
Final implementation SHA: '7a13fd696d0eec755a5e30182ff80bae8cdd56db'
QA commit: docs(qa): record ribbon remount readiness validation

## Result

PASS for the requested implementation and verification scope. The selected
date is rendered and intersects the ribbon on Day, Week, and Month semantic
re-entry. The existing same-node manual-browse center remains stable through
desktop-to-phone geometry changes. No production change outside
src/features/planner/useRibbonViewport.js was needed.

## Scope and file accounting

Task 1’s committed implementation changed:

- src/features/planner/useRibbonViewport.js
- tests/e2e/ribbon-readiness.spec.js

This QA task changes only:

- docs/qa/2026-08-22-ribbon-remount-readiness-invariant.md
- docs/plans/2026-08-22-fix-ribbon-remount-readiness-invariant-plan.md

The pre-existing untracked screenshots/ directory and the plan file’s
pre-existing working-tree state were preserved until this task’s explicit docs
staging. No Planner, WeekGrid, gesture/touch, Timeline chrome, navigation,
motion, Sheet, Composer, domain, persistence, recurrence, or JOIN source files
were changed. git diff --check was clean before the docs edit.

## Task 1 RED/GREEN/negative-control evidence

The complete Task 1 report is at
.superpowers/sdd/2026-08-22-fix-ribbon-remount-readiness-invariant-plan/task-1-report.md.
The evidence below is transcribed from that report; it is not presented as a
new Task 2 sabotage run.

With only the three browser regressions added and the original active-node gate
still present, the exact base (b5b67ce...) run was:

~~~powershell
$env:PLAYWRIGHT_PORT='48920'; npx playwright test tests/e2e/ribbon-readiness.spec.js --project=chromium --workers=1
~~~

Output: Running 13 tests using 1 worker; 3 failed; 10 passed (25.1s).
Day, Week, and Month each failed the frozen first-frame intersecting dates
assertion (Expected: > 0, Received: 0). No production file had changed
before this RED run.

Task 1’s final GREEN focused run was:

~~~powershell
$env:PLAYWRIGHT_PORT='48922'; npx playwright test tests/e2e/ribbon-readiness.spec.js --project=chromium --workers=1
~~~

Output: Running 13 tests using 1 worker; 13 passed (22.6s).
An independent four-case run (manual-browse preservation plus the three new
re-entry cases) reported 4 passed (11.9s).

Task 1 also recorded three local, immediately reverted negative controls:

1. Restoring active-node-before-window gating: the three re-entry tests failed
   (3 failed) at frozen-frame intersecting dates.
2. Bypassing final remount beginPosition while retaining selected-window
   rendering: the three re-entry tests failed (3 failed) because rendered
   cells had no intersecting dates.
3. Calling ensureDateVisible(selectedDateKey) from geometry retry: the
   manual-browse responsive preservation test failed (1 failed) at its
   center-date poll after the 7-second timeout.

The final hook keeps the minimal semantic-remount ordering and does not call
selected-date readiness from geometry retries.

## Root cause and correction

The virtual window remained centered on the user’s previous browse while the
calendar ribbon DOM node was absent in Actions or Month. On re-entry,
ribbonActiveNode was null and the old effect returned before preparing a
window containing selectedDateKey. The first mounted frame could therefore
contain spacer geometry but no selected real data-day cell.

Task 1 changes the existing readiness layout effect to prepare the selected
date’s window once the semantic remount has a mounted ribbon, then waits for the
selected DOM cell before the existing positioning transaction. The existing
null-position-request distinction prevents that semantic preparation from
re-centering a same-node user browse. The 56-day render bound and existing
scroll/retry/reveal/fade contracts remain unchanged.

## Frozen first-frame and responsive contracts

The focused regression has independent immutable Day, Week, and Month observers.
The repeated run below exercised each ten times; all 30 repetitions passed.
The Task 1 report’s final immutable snapshots had 56 rendered days, 11
intersecting real dates (2026-08-17..2026-08-27), selected rendered/intersects
true, and dataRibbonPosition=positioning for Day, Week, and Month.

The fresh Task 2 repeat run was:

~~~powershell
$env:PLAYWRIGHT_PORT='48930'; npx playwright test tests/e2e/ribbon-readiness.spec.js --project=chromium --workers=1 --grep "Day re-entry|Week re-entry|Month return" --repeat-each=10
~~~

Output: Running 30 tests using 1 worker; 30 passed (58.7s).

The same-node responsive counter-contract was observed manually in Chrome and
also passed in the focused automated suite. Starting from a far-browsed Day
ribbon at 1280px, the logical center was 2026-10-11 while the selected
2026-08-22 was outside the 56 rendered dates. Resizing without navigation or
reload produced:

| viewport | ribbon client width | center date | center distance | rendered days | state |
| --- | ---: | --- | ---: | ---: | --- |
| 1280×900 | 1208 | 2026-10-11 | 0.22 px | 56 | settled |
| 900×844 | 829 | 2026-10-11 | 3.63 px | 56 | settled |
| 390×844 | 334 | 2026-10-11 | 1.53 px | 56 | settled |
| 390×601 | 334 | 2026-10-11 | 1.53 px | 56 | settled |

No selected-date recenter occurred during those geometry-only changes.

## Automated verification

Every browser command used Chromium, --workers=1, a production preview, and
an isolated port. Commands ran one at a time; no existing worktree server was
reused.

| command / port | result |
| --- | --- |
| $env:PLAYWRIGHT_PORT='48920'; npx playwright test tests/e2e/ribbon-readiness.spec.js --project=chromium --workers=1 | 13 passed (23.0s) |
| $env:PLAYWRIGHT_PORT='48921'; npx playwright test tests/e2e/navigation-shell.spec.js --project=chromium --workers=1 | 14 passed (48.3s) |
| $env:PLAYWRIGHT_PORT='48922'; npx playwright test tests/e2e/motion.spec.js --project=chromium --workers=1 | 49 passed (1.7m) |
| $env:PLAYWRIGHT_PORT='48923'; npx playwright test tests/e2e/timeline-gestures.spec.js --project=chromium --workers=1 | 23 passed (46.9s) |
| $env:PLAYWRIGHT_PORT='48924'; npx playwright test tests/e2e/week-drag.spec.js --project=chromium --workers=1 | 11 passed (37.5s) |
| $env:PLAYWRIGHT_PORT='48925'; npx playwright test tests/e2e/timeline-chrome-scroll.spec.js --project=chromium --workers=1 | 4 passed (14.0s) |
| $env:PLAYWRIGHT_PORT='48926'; npx playwright test tests/e2e/actions.spec.js --project=chromium --workers=1 | 45 passed (1.4m) |
| $env:PLAYWRIGHT_PORT='48927'; npx playwright test tests/e2e/interaction-contracts.spec.js --project=chromium --workers=1 | 11 passed (23.9s) |
| $env:PLAYWRIGHT_PORT='48928'; npx playwright test tests/e2e/recurring.spec.js --project=chromium --workers=1 | 2 passed (9.9s) |
| $env:PLAYWRIGHT_PORT='48929'; npx playwright test tests/e2e/join.spec.js --project=chromium --workers=1 | 13 passed (19.4s) |
| $env:PLAYWRIGHT_PORT='48930'; npx playwright test tests/e2e/ribbon-readiness.spec.js --project=chromium --workers=1 --grep "Day re-entry|Week re-entry|Month return" --repeat-each=10 | 30 passed (58.7s), 10/10 each |
| node --test src/features/planner/ribbonViewport.test.js | 7 pass, 0 fail; 85.5ms |
| npm test | 645 pass, 0 fail; 9.426s |
| npm run build | 187 modules transformed; build succeeded in 3.98s |
| $env:PLAYWRIGHT_PORT='48931'; npx playwright test --project=chromium --workers=1 | 358 passed (11.2m) |

The build and each Playwright web server emitted the existing non-fatal Vite
warning that a JavaScript chunk is larger than 500 kB. There were no test
failures requiring a base comparison during this Task 2 run. The complete
Chromium run included the focused readiness cases again and remained green.

## Windows Chrome Computer Use manual validation

Manual validation used the Windows Chrome extension through Computer Use, with
the production bundle served from the isolated preview:

~~~powershell
npx vite preview --port 48932 --strictPort
~~~

The browser sample was reset/reseeded on a fresh localhost:48932 origin and
EXPLORE THE SAMPLE was activated through the visible Computer Use DOM control.
All interactions below used visible DOM Computer Use clicks and Chrome CUA
scrolls; state reads and screenshots were observational only.

| viewport | Day browse far → Actions → Timeline | Day/Week browse far → Month → return | Week browse far → Actions → Week |
| --- | --- | --- | --- |
| 1280×900 | PASS; far window had 56 real dates around Sep–Nov with 2026-08-22 absent; Actions had no ribbon; 50ms return had 56 cells and selected/intersects true | PASS; Month navigator visible; 50ms Week return had 56 cells, selected/intersects true | PASS; far window had 56 real dates around Sep–Nov with selection absent; Actions had no ribbon; return selected/intersects true |
| 390×844 | PASS; far window around Oct–Dec, selection absent; Actions ribbon count 0; return selected/intersects true | PASS; Month navigator visible; return first frame selected/intersects true | PASS; far window around Oct–Dec, selection absent; Actions ribbon count 0; return selected/intersects true |
| 390×601 | PASS; 56-cell far window and no selected rendered cell; Actions ribbon count 0; return selected/intersects true | PASS; Month navigator visible; return first frame selected/intersects true | PASS; far window and no selected rendered cell; Actions ribbon count 0; return selected/intersects true |

Representative desktop re-entry observations at 50ms were:

- Day: count=56, selected 2026-08-22 rendered/intersects true, state
  settled, scrollLeft=34580.07, opacity 1, mask none.
- Week: count=56, selected rendered/intersects true, state settled,
  scrollLeft=34544.29, opacity 1, mask none.
- Month return: count=56, selected rendered/intersects true, state
  settled, scrollLeft=34544.29, opacity 1, mask none.

The immediate and post-settle horizontal positions matched in each sampled
return; no corrective horizontal jump was observed after the first ready frame.
The selected cell was the bright lime active card centered in the ribbon. The
header remained 22 / SAT · AUG 2026; previous/next arrows remained visible.
Edge fades were visible, opacity 1, and both edge controls reported
pointer-events: none. The ribbon scroller reported mask-image: none and 56
rendered dates. Actions stayed ribbon-free while open.

At phone widths the compact top navigation remained usable (hamburger, Today,
Write/Search, New), the selected styling and edge arrows remained legible, and
the bottom Actions bar stayed within the viewport at both 844px and 601px
heights. The Composer was opened at 390×844: its NEW sheet showed EVENT/ACTION
tabs, title, date/time, duration, category, reminder, recurrence, location,
link, and notes controls; the disabled ADD TO TIMELINE state was visible for
an empty title. The sheet background was blurred and the ribbon/header did not
flash blank. Composer close returned to a settled ribbon without data changes.

## Physical-device limitations

This is Windows Chrome extension Computer Use with explicit browser viewport
overrides, not a physical Android/iOS handset or hardware touch sensor. It does
not establish device-specific pixel density, browser chrome, OS text rasterizer,
real inertial touch scrolling, or platform virtual-keyboard behavior. The
automated Chromium matrix and manual CUA matrix cover the requested viewport
dimensions; physical-device validation remains outside this run.

## Separate known ribbon issues and concerns

- The hook’s ribbonPositionRequestRef.current == null distinction is a
  deliberate lifecycle boundary and remains a maintenance concern: semantic
  remount and same-node manual browse must not be conflated.
- The large virtualized horizontal scroll surface (about 70,368px at desktop)
  is intentional for the rolling date range, not a new regression.
- RIBBON_FALLBACK_CELL_WIDTH has historical responsive-tier technical debt in
  older planning notes; this task did not change that constant or claim to
  redesign cell metrics.
- This record does not claim to resolve every historical hard-reload,
  compositor/no-paint, or physical-touch issue outside the tested semantic
  re-entry and same-node resize contracts. The focused no-paint/readiness and
  adjacent regression suites were green in this production run.

## Plan status

All Task 1 evidence-backed boxes and Task 2 Steps 1–3 plus the relevant
definition-of-done boxes are marked in the plan. Task 2 Step 4 is marked only
after the two requested docs are explicitly staged and committed.
