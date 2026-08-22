# Full visual validation and interaction QA report

Date: 2026-08-21
Branch: `main`
Validated source before this report: `353f924`
Scope: production visual review of the Calendar shell, navigation motion, Anchored Notch v2 Composer work, Week ribbon, sheets, calendar surfaces, gestures, themes, and recovery states.

## Executive result

The application is production-ready for the browser scope exercised in this audit. I found no application-level blocker, blank-screen regression, Week-ribbon visibility regression, navigation gap, sheet scaling, animated blur, or broken click-through. The complete Playwright suite passed **314/314**, the unit suite passed **630/630**, the production build passed, and the corrected visual contact matrix produced **120/120 frames**.

The only defect found during the audit was in the QA contact-sheet fixture itself. It labelled a compact v4 fixture as schema v8 and stored it under the v8 key. The application correctly rejected that malformed claim and displayed its recovery UI, which made the visual audit look like a product failure. I corrected the fixture to use the real v4 key/schema and legacy field shape so the contact sheet now exercises the application's actual v4-to-v8 migration path. No production React or CSS component was changed for this correction.

The prior Anchored Notch remediation remains intact and was revalidated rather than simplified:

- Composer sheets remain true-size panels revealed with asymmetric `clip-path` geometry.
- Content is not scaled, the page does not animate through width/height, and blur is not animated.
- Notch anchoring is scoped to the creation Composer; ordinary inspector sheets retain their symmetric geometry.
- ResizeObserver sizing, reduced motion, focus restoration, source identity, and in-flight reversal remain active.
- Navigation surface, drawer, labels, and the red calendar return rail share one reversible carrier timeline.

## Skills and review method

This audit used the named design/motion guidance as review criteria:

- **Emil design engineering:** checked hierarchy, hit targets, custom ease-out motion, transform/opacity usage, interruptibility, active feedback, reduced-motion behavior, and frame-level geometry rather than relying on a settled screenshot alone.
- **Micro-interaction:** checked deterministic states, 100–250 ms feedback expectations, faster exits, press feedback, focus visibility, and no interaction that depends on hover alone.
- **Transitions.dev:** used its transition vocabulary and decision rules as a read-only audit lens. I did not copy its CSS or add another animation framework. The source scan found no `transition: all` and no `scale(0)` in the audited motion paths.

## Repository and change discipline

Before testing, `HEAD`, branch, and worktree were checked. The branch was `main` at `353f924`, matching the pushed Anchored Notch remediation history. Several unrelated user-owned plan, handoff, profiling, screenshot, and E2E edits were already dirty; they were preserved and were not staged.

The only intentional source change from this audit is:

- `scripts/contact-sheet.mjs`: align the deterministic fixture with schema v4 (`nbmp:state:v4`, `schemaVersion: 4`, `overrides`, legacy event/task fields) so the real migration chain produces valid v8 state.

No `Planner.jsx`, `Sheet.jsx`, navigation component, motion stylesheet, ribbon implementation, or domain module was modified by this audit. The report commit will stage only this report and the contact-sheet correction.

## Visual coverage

### Deterministic contact matrix

The corrected harness completed **120 frames**:

- 15 themes: dark, light, neutral, and high-chroma combinations from the app's single source of truth.
- 393 × 844 phone viewport.
- 1280 × 900 desktop viewport.
- Four reachable surfaces per theme/viewport: Day, Week, Month, and settled Composer sheet.
- Seeded events, actions, a meeting link, a deadline, and an Any Time row so the review included real content rather than an empty shell.

The artifacts are in:

`C:\Users\Kamran\Documents\Codex\2026-08-19\visual-audit-2026-08-21\contact-sheet-final`

Representative frames manually inspected included Obsidian/Timepage Red desktop Day and Composer, Obsidian/Acid desktop Month, Cream/Terracotta desktop Composer, and Cream/Terracotta phone Composer. They showed complete populated content, readable contrast, stable card geometry, correct selected-day treatment, no white recovery screen, and no clipped Composer controls.

### Live Chrome pass

A live Chrome session was used for behavior and frame inspection. The host extension clamps the inspectable page viewport (for example, a requested 1280 px desktop window reports approximately 512 px inside the page), so exact responsive dimensions were validated with Playwright and the contact matrix. Chrome was still valuable for real click-through, focus, style, and in-flight observations.

Chrome captures are in:

`C:\Users\Kamran\Documents\Codex\2026-08-19\visual-audit-2026-08-21`

Observed captures include `chrome-nav-mid.png`, `chrome-nav-open.png`, `chrome-nav-close-mid.png`, `chrome-composer-early.png`, `chrome-composer-settled.png`, `chrome-action-more-options.png`, `chrome-palette-open.png`, and `chrome-theme-switched.png`.

## Click-through and micro-interaction matrix

| Flow / surface | What was exercised | Result |
|---|---|---|
| Initial load and reload | Shell, Week ribbon, selected day, heading, Timeline control, and NEW after a cold preview load and reload | PASS; no white or blank screen |
| Desktop hamburger | Open, settle, press outside, Escape, close, and inspect the carrier/drawer/labels at intermediate and settled frames | PASS; channels move together and reverse cleanly |
| Mobile hamburger | Open/close at phone width, red calendar return rail, interrupted close/reopen, return to calendar | PASS; rail reaches the viewport edge with no black gap and does not snap or disappear early |
| Red calendar return rail | Measure its settled right edge and press it during the open navigation state | PASS; measured right edge is flush with the viewport and the rail remains an active return control |
| NEW Composer | Pointer-origin open, early frame, settled frame, close button, Escape, backdrop, and focus handoff | PASS; source identity is visible during entry, content arrives after the shape, focus lands in the first field |
| Anchored Notch geometry | Desktop top-right origin and mobile origin, frame-zero bounds, 15/35/60% expansion, no internal scaling | PASS; true-size panel with left/down expansion and no portal gap |
| Composer interruptions | Escape at 25%, 50%, and 75%; backdrop close during entry; rapid close then reopen | PASS; in-flight reversal settles as one Composer |
| Event ↔ Action | Semantic tab switch, field focus, title preservation, Action prompt, and form usability after switching | PASS |
| More Options | Expand and collapse optional Composer fields, then close | PASS; no layout corruption or stranded focus |
| Composer save | Create an Action and verify it lands in the notebook; preserve the opened kind through save | PASS |
| Ordinary inspector sheet | Open from a card, cross-day/agenda origin, resize/exit, delete exit, and focus restoration | PASS; ordinary sheet geometry remains separate from notch Composer geometry |
| Backdrop and Escape semantics | Close sheets through backdrop and keyboard, including interruption states | PASS |
| Command palette | `Ctrl+K`, filter, keyboard navigation, command selection, and Escape dismissal | PASS |
| Theme switching | Acid to Cyan through the palette, status announcement, accent and text contrast | PASS; theme variables update coherently |
| Day / Week / Month | Zoom transitions, selected date, week ribbon readiness, month grid, and return to Day | PASS |
| Timeline and Actions | Event/action cards, Any Time row, join link, completion, resize/move gestures, collapse/restore, and full-screen Actions | PASS |
| Touch interaction | Coarse-pointer controls, mobile sheet hit targets, deliberate swipe completion, resize grips, and scroll intent | PASS; no hover-only dependency |
| Reduced motion | Browser reduced-motion and in-app preference for pills, navigation, sheets, and feedback | PASS; semantics remain while travel/staging is removed |
| Focus and accessibility | Visible focus, focus restoration, named controls, keyboard tabs/arrows, and 44 px mobile targets | PASS |
| Recovery behavior | Forced planner crash, storage failure, slow bootstrap, malformed notebook, and reload recovery | PASS; recovery UI is explicit instead of a blank page |
| Transient overlays | Backup nudge, reminder report, and action feedback over populated surfaces | PASS; overlays are valid product states and do not corrupt layout |

## Findings

### Fixed: contact-sheet fixture produced a false recovery state

The harness wrote a compact v4-shaped object to `nbmp:state:v8` while labelling it `schemaVersion: 8`. The validator correctly treated it as unreadable, so every frame contained the recovery banner. This was a QA harness defect, not an application crash or migration defect.

The fixture now:

1. Uses `nbmp:state:v4`.
2. Declares `schemaVersion: 4` and includes the v4 `overrides` field.
3. Uses the legacy `date`, `start`, and `dur` event representation and the legacy task fields.
4. Lets the production migration chain normalize the fixture to v8 before capture.

The corrected run completed 120 frames with populated calendar content and no recovery banner.

### Confirmed clear: mobile red rail and shared navigation motion

The rail's settled right edge measured flush with the viewport (`right ≈ viewport width`), and intermediate Chrome captures showed the carrier and rail moving on the same timeline. Playwright additionally covers synchronized open/close, interrupted close, stale completion suppression, mobile layout preservation, and reduced motion. No edge gap or early disappearance was reproduced.

### Confirmed clear: Week ribbon visibility

Cold load, reload, narrow remount, Day ↔ Week transitions, Actions return, and reveal-without-paint cases all passed. The ribbon was visible without requiring arrow interaction. The Anchored Notch work did not touch the ribbon implementation.

### Confirmed clear: blank-screen behavior

The error-boundary suite intentionally crashes the planner, blocks storage, delays bootstrap, and supplies malformed state. The app presents explicit recovery and export paths and returns to a usable screen after recovery. The full suite found no spontaneous blank screen in the exercised flows.

### Confirmed clear: Anchored Notch v2 architecture

The live and automated checks confirm the design contract: no full-sheet scale, no width/height morph, no animated blur, source identity during entry, bounded portal radius, asymmetric clip expansion, internal content arriving only after the shape, and reversible in-flight animation. The ordinary inspector path remains on symmetric geometry.

## Release gates

| Gate | Result | Evidence |
|---|---:|---|
| Unit/domain suite | PASS | `npm test` — 630 passed, 0 failed |
| Production build | PASS | `npm run build` — built successfully; existing advisory only for the 670 kB JS chunk |
| Focused visual/interaction suite | PASS | 84 passed, 0 failed across navigation, motion, Composer, ribbon, recovery, feedback, and mobile specs |
| Full Playwright suite | PASS | `npx playwright test` — 314 passed in 9.7 minutes |
| Contact-sheet matrix | PASS | 120/120 frames generated |
| Source motion scan | PASS | No `transition: all`, no `scale(0)`, no animated blur in audited paths |
| Worktree safety | PASS | Only the report and contact-sheet correction will be staged; unrelated user changes remain untouched |

## Suggestions and follow-up polish

These are non-blocking recommendations. They are deliberately not mixed into the production fix because the current architecture and tests are green.

| Area | Before / current state | Suggested after-state | Why it matters |
|---|---|---|---|
| Motion tokens | Several intentional components use nearby hand-authored durations (160–420 ms) even though their behavior is coherent | Gradually map semantic tokens such as `--motion-feedback`, `--motion-enter`, `--motion-exit`, and `--motion-sheet` to the existing values | Reduces timing drift while preserving the current feel; do this incrementally, not by importing literal Transitions.dev CSS |
| Contact-sheet clarity | Seeded captures include valid backup/reminder banners, which can obscure a portion of the core surface | Add an explicit “clean settled” capture state plus a separate “transient overlay” state | Makes visual diffs easier to triage without hiding real product states |
| Real-device validation | Chrome/Playwright cover responsive browser behavior and coarse pointers | Add one Safari iOS and one Android hardware pass before a major public release | Hardware compositor, safe-area, keyboard, and touch-cancel behavior can differ from Chromium |
| Bundle advisory | The production build reports a 669.83 kB minified JS chunk | Track a follow-up split-point investigation with a budget and a before/after measurement | Improves cold load without changing motion or interaction behavior |
| Full-suite stability | The current full run is green; earlier historical runs had a load-sensitive interaction test | Keep a same-machine baseline/current rerun in release QA if that flake returns | Prevents unrelated timing noise from being misattributed to motion work |
| Week ribbon scope | Ribbon readiness is green and was intentionally independent of Anchored Notch | Keep the ribbon P1 as a separate change stream | Avoids coupling two timing-sensitive surfaces and makes regressions easier to localize |

## Sign-off

For the tested Chromium/browser automation and visual matrix, this audit is a **PASS**. The corrected QA harness, report, and evidence are ready to push to `main`. The only follow-up items are the non-blocking polish suggestions above and a future real-device pass; neither prevents shipping the validated work.
