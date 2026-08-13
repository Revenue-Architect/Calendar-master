# Codebase Concerns

**Analysis Date:** 2026-08-13

## Tech Debt

**Planner composition root still owns too much:**
- Issue: `src/Planner.jsx` is still the 7981-line composition root. Domain modules exist under `src/domains/`, but wiring, inspectors, JOIN, Search, timeline surfaces, and many event handlers remain in Planner. ADR 0001 and `docs/spec/structure.md` both say do not grow it, yet it is still the default landing zone for new UI.
- Files: `src/Planner.jsx`, `docs/spec/structure.md`, `docs/adr/0001-domain-oriented-modular-monolith.md`, `README.md`
- Impact: Reviews, CRLF edits, and interaction fixes all collide in one file. A JOIN or Add-a-Step change can accidentally reopen Event inspect or remount a sheet.
- Fix approach: Extract visible surfaces beside their owners in `src/features/<area>/`. Keep Planner as composition root only. Do not `git mv` Planner or start a Phase 1 folder move until the freeze is lifted.

**Incomplete modular-monolith migration:**
- Issue: Accepted ADR 0001 names target trees that do not exist yet (`src/ui/`, `src/domains/planner`, `src/domains/search`, `src/platform/integrations`, `src/platform/telemetry`). Current code is a hybrid: domains for calendar/tasks/notes, features for planner gestures, Planner for the rest.
- Files: `docs/adr/0001-domain-oriented-modular-monolith.md`, `docs/spec/structure.md`, `src/domains/`, `src/features/`, `src/platform/`
- Impact: Agents invent a fourth documentation plane or move files "to match the ADR" and break the freeze.
- Fix approach: Treat `docs/spec/structure.md` as the in-force placement map. Finish the ADR incrementally. Do not invent `.planning/` as a source of truth for folder layout.

**Dual documentation planes:**
- Issue: Living contracts live in `docs/spec/`, `docs/interaction-contracts/`, `DESIGN.md`, and a large `docs/superpowers/` archive of plans/specs/QA. GSD onboarding also detected 52 ADR/PRD/SPEC/RFC candidates.
- Files: `docs/spec/structure.md`, `docs/interaction-contracts/planner-interactions.md`, `docs/superpowers/`, `docs/qa/`, `docs/adr/`
- Impact: A later planner can treat a completed Superpowers plan as current work and reopen Phase 1 extractions or provider sync.
- Fix approach: Keep Superpowers/QA as evidence. Prefer accepted ADR > approved SPEC > living PRD > `DESIGN.md` > interaction contracts.

## Known Bugs

**Stale Vite listener can hide already-landed interaction fixes:**
- Symptoms: Day/Week JOIN appears to open the Event inspector, or Add a Step is missing from an editable Action sheet, even though `main` contains the fix.
- Files: `src/Planner.jsx`, `tests/e2e/join.spec.js`, `tests/e2e/interaction-contracts.spec.js`, `vite.config.js`
- Trigger: A listener on port 4323 or 5000 served from another checkout (historically the Codex tandem clone) or a stale Vite HMR session.
- Workaround: Confirm the listener cwd is `C:\\Users\\Kamran\\Calendar-master`, then hard-refresh. Default Vite port is 5000. Playwright preview is 4321.

**JOIN / Add a Step remain high-regression surfaces:**
- Symptoms: A JOIN click becomes `setInspect({kind:"event"})`. Add a Step only appears after EDIT ACTION.
- Files: `src/Planner.jsx`, `src/features/planner/TimelineActionCard.jsx`, `src/features/planner/timelineInteractionState.js`, `docs/interaction-contracts/planner-interactions.md`
- Trigger: Putting the visible JOIN word back inside the Event `role=button`, or gating `InlineAdd` on `detailEditing` instead of editability/status.
- Workaround: Keep the visible JOIN as the real sibling `<a href>` with `data-join`. Show Add a Step when `inspectDraft.status !== "completed"`.

## Security Considerations

**Local-only notebook is the product, not a cache:**
- Risk: Clearing site data, a bad import, or a crash-loop "fix" destroys the only copy. There is no server backup.
- Files: `src/storage.js`, `src/app/ErrorBoundary.jsx`, `src/app/notebookRecovery.js`, `src/platform/persistence/`
- Current mitigation: Error boundary exports a recovery JSON without using app state. Recovery probes host `window.storage` then `localStorage` across `nbmp:state:v8`..`v4`. Writes reject so the UI can show NOT SAVING / `saveBlocked`.
- Recommendations: Keep recovery independent of `src/storage.js`. Never write crash reports into the same notebook keys. Do not treat blocked storage as unread notebook.

**No auth and no outbound network in the shipped artifact:**
- Risk: Provider sync, tokens, and cloud identity are out of scope and easy to add in the wrong layer.
- Files: `package.json`, `docs/adr/0001-domain-oriented-modular-monolith.md`, `docs/superpowers/specs/2026-08-11-calendar-master-cross-platform-prd.md`
- Current mitigation: Dependencies are React + Vite/Tailwind/Playwright only. Artifact CSP blocks external requests. Font must stay inlined (`vite.config.js` `assetsInlineLimit`).
- Recommendations: Do not add Google Calendar / Graph / CalDAV / Todoist clients until an approved phase lifts the deferral. Do not put secrets in the frontend.

**Import / replace can wipe the live notebook:**
- Risk: A hostile or truncated JSON file can replace `nbmp:state:v8`.
- Files: `src/platform/persistence/plannerNotebookReplace.js`, `src/platform/persistence/plannerStateImport.js`, `tests/e2e/backup.spec.js`
- Current mitigation: Dedicated replace/wipe helpers and backup e2e coverage.
- Recommendations: Keep import behind an explicit user confirm. Never silently seed sample-week data over a large fixture (`tests/e2e/helpers.js` already waits for day-stream + STATE_KEY).

## Performance Bottlenecks

**Planner render surface:**
- Problem: One React module owns inspectors, search, timeline, actions column, and command palette. Any state tick can re-render a very large tree.
- Files: `src/Planner.jsx`
- Cause: Composition-root size, not a measured hot loop in a worker.
- Improvement path: Extract presentational surfaces first. Do not introduce a new state library to paper over the file.

**localStorage as the entire database:**
- Problem: Full notebook serialize/write on save. Recovery walks five schema keys.
- Files: `src/storage.js`, `src/app/notebookRecovery.js`, `src/platform/persistence/plannerStateStore.js`
- Cause: Personal-first, offline-first design. Quota and main-thread JSON are the ceiling.
- Improvement path: Keep schema cutovers in `src/platform/persistence/`. Do not shard keys casually; recovery order is load-bearing.

**Playwright preview rebuild:**
- Problem: `playwright.config.js` runs `npm run build && vite preview --port 4321` unless a server is reused. Full e2e is serial (`workers: 1`) because tests share one origin's localStorage.
- Files: `playwright.config.js`, `tests/e2e/`
- Cause: Correct isolation for a single-origin notebook.
- Improvement path: Reuse a known Calendar-master preview. Never point 4321/4323 at another worktree.

## Fragile Areas

**Timeline interaction ownership:**
- Files: `src/features/planner/timelineInteractionState.js`, `src/features/planner/TimelineActionCard.jsx`, `src/Planner.jsx`, `docs/interaction-contracts/planner-interactions.md`
- Why fragile: `idle → armed → active → committed|cancelled` must have one owner. Native listeners must ignore `[data-resize]`, `[data-timeline-complete]`, `a[href]`, and `[data-join]`. Cancel is never commit.
- Safe modification: Change the owner table and the matching tests together. Do not rewrite `timelineInteractionState.js` because a stale browser session hid a commit.
- Test coverage: `tests/e2e/join.spec.js`, `tests/e2e/interaction-contracts.spec.js`, `tests/e2e/actions.spec.js`, `tests/e2e/timeline-gestures.spec.js`, `tests/e2e/timeline-touch.spec.js`, `tests/e2e/week-drag.spec.js`

**Search / boot scroll:**
- Files: `src/Planner.jsx`, `src/features/accessibility/dialogFocus.js`, `src/index.css`
- Why fragile: Palette focus without `preventScroll: true`, or a Search sheet without `morph="none"`, shoves the calendar off-screen. `overflow-x: clip` on html/body/#root is load-bearing.
- Safe modification: Keep focus helpers in `dialogFocus.js`. Add a scroll snapshot around dialog open.
- Test coverage: `tests/e2e/search-control.spec.js`

**Schema / recovery key order:**
- Files: `src/app/notebookRecovery.js`, `src/platform/persistence/`
- Why fragile: A crash during v7→v8 cutover is exactly when the previous key is the real notebook. Reordering `RECOVERY_STATE_KEYS` can hide the rescue copy.
- Safe modification: Add a new key at the front. Keep oldest-last. Keep the crash probe import-free.
- Test coverage: `src/app/notebookRecovery.test.js`, `tests/e2e/error-boundary.spec.js`, `tests/e2e/backup.spec.js`

**Two Calendar checkouts:**
- Files: machine-local `C:\\Users\\Kamran\\Calendar-master` vs `C:\\Users\\Kamran\\Documents\\Codex\\2026-08-10\\can-you-pull-my-calendar-master`
- Why fragile: The tandem clone has historically served a different HEAD on port 4323 and may contain untracked `.planning/`. Checking `main` out there, or writing GSD artifacts there, collides with Codex.
- Safe modification: Product and `.planning/` stay in Calendar-master. Do not `git mv` `src/Planner.jsx`, rename e2e specs, or move `src/domains` / persistence keys unless the user reverses that.

**Windows edit/commit mechanics:**
- Files: `src/Planner.jsx`
- Why fragile: CRLF Planner breaks some patch tools. Commit messages must use `-F` a file; bash heredoc via cmd fails.
- Safe modification: Normalize CRLF → LF, replace once, write CRLF. Always `cd` into Calendar-master before git.

## Scaling Limits

**Single-origin localStorage notebook:**
- Current capacity: Personal planner state, schema v8, one browser origin.
- Limit: Quota, one-tab-writer assumptions, and Playwright's forced serial e2e.
- Scaling path: Host `window.storage` already exists for embed. Cloud sync is explicitly deferred. Do not add a second writer without a lock.

**No CI workflow in-repo:**
- Current capacity: Local `npm test`, `npm run test:e2e`, `npm run test:all`.
- Limit: Nothing in `.github/workflows` enforces the browser suite on push.
- Scaling path: Add CI only if the user asks; keep Chromium executable override (`PLAYWRIGHT_CHROMIUM_EXECUTABLE`) in mind.

## Dependencies at Risk

**React 19 + Vite 7 + Tailwind 4:**
- Risk: Current, fast-moving majors. Plugin or CSS changes can alter motion, focus, or inlined fonts.
- Impact: Artifact typography 404s if `assetsInlineLimit` drops below the subset font. Motion specs are already large (`tests/e2e/motion.spec.js`).
- Migration plan: Pin behavior with `tests/e2e/typography.spec.js` and motion/timeline suites before upgrading.

**No backend SDK today:**
- Risk: Adding one later will tempt agents to put tokens in Vite env and call providers from Planner.
- Impact: Breaks the local-first / CSP artifact contract.
- Migration plan: New clients belong in `src/platform/integrations/` only after an approved phase.

## Missing Critical Features

**Provider sync deferred:**
- Problem: Google Calendar, Microsoft Graph, CalDAV, Apple Reminders, Google Tasks, and Todoist are named as non-goals in the cross-platform PRD.
- Blocks: Two-way calendar/task sync. Do not treat that PRD as a build order.

**GSD planning artifacts not yet initialized:**
- Problem: This map is the first `.planning/` output. `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, and `STATE.md` are still missing.
- Blocks: `$gsd-new-project` / remaining onboard steps. Do not let GSD agents spawn writers that create extra `.planning/` trees in the Codex clone.

## Test Coverage Gaps

**Full e2e / hardware / deployed preview:**
- What's not tested: A fresh full `npm run test:all`, `node scripts/contact-sheet.mjs`, real Samsung/Windows/MacBook hardware, and deployed-preview smoke were not re-verified as part of this map.
- Files: `package.json`, `tests/e2e/`, `scripts/`
- Risk: Focused JOIN/Add-a-Step suites can be green while motion, mobile, or typography regress.
- Priority: Medium unless shipping a visual or persistence change.

**Desktop-only Playwright project:**
- What's not tested: Default e2e viewport is 1280x900 Chromium. Mobile/touch coverage exists as specs (`tests/e2e/mobile.spec.js`, `timeline-touch.spec.js`) but not as a second Playwright project/device.
- Files: `playwright.config.js`, `tests/e2e/mobile.spec.js`, `tests/e2e/timeline-touch.spec.js`
- Risk: `lg`-only Actions column and collapse controls can pass while phone layout fails.
- Priority: Medium for mobile interaction work, Low otherwise.

**No in-repo CI gate:**
- What's not tested: Push/PR automatically running unit + e2e.
- Files: no `.github/workflows` detected
- Risk: Mapping or planning commits can land without the  browser suite.
- Priority: Low for local GSD onboarding.

---

*Concerns audit: 2026-08-13*
