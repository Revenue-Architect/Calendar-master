---
title: PR #13 review corrections
type: corrective
status: complete
date: 2026-08-23
pr: 13
base: af5de2dde30de628558b855cfeb910aa8351fe5a
starting_head: dd0fb640318be9146d916d2a47c2be5c02858a44
environment:
  node: v22.22.2
  npm: 10.9.7
  playwright: 1.62.1
  chromium: 141.0.7390.37 (/opt/pw-browsers/chromium-1194)
---

# PR #13 review corrections

Corrective pass over an open PR. The four accepted product fixes are **not**
reopened: live-event duration, smart-view edge fade, `useEdgeFade` extraction,
DUPLICATE de-emphasis, boolean `inert`, deferred drawer focus, lowered ratchet.

## Reviewer findings, checked before accepting

| Finding | Verdict |
| --- | --- |
| D — `toBeCloseTo(sample.progress, 0.08)` still open debt | **Reviewer right, I was wrong.** `origin/main` already has `Math.abs(corner.scaleX - sample.progress) < 0.08` at `navigation-shell.spec.js:138-140`. My handoff read a mid-branch diff. Remove the queue item. |
| E — "Ten smart views, six chips" is wrong | **Both wrong.** `SMART_VIEWS` has 10 and `ActionsPanel` maps all 10, but `ActionsPanel.jsx:132` drops any view whose count is 0 unless it is selected or `today`. Render count is **data-dependent**. Neither "renders six" nor "all 10 render" is a rule. |
| A — ribbon can reach zero tab stops | Accepted, pending RED proof. |
| B — clock-dependent `test.skip` | Accepted. |
| C — conditional overflow assertion | Accepted. Finding E means the fixture must guarantee chips, not assume them. |
| F — "permanently red / never passed" over-generalised | Accepted. Scope every count to this browser build. |
| G — categorical clip-path claim | Accepted. Separate historical assumption from measured result. |

## Task 1 — Ribbon keyboard reachability

**Files:** `src/features/planner/ribbonViewport.js`,
`src/features/planner/useRibbonViewport.js`, `src/Planner.jsx`,
`tests/e2e/accessibility-quality.spec.js`, plus a colocated unit test.

**Contract.** While the ribbon is rendered, exactly one rendered day button has
`tabIndex === 0`. The selected day owns it when rendered; otherwise a rendered
day at the current browse position does, without changing `selectedDateKey`,
recentering, or adding a second scroll model.

1. **RED** — browse the ribbon until the selected date is unrendered; assert
   `[data-day][tabindex="0"]` count is 1. Must fail with 0 on `dd0fb64`.
   `npx playwright test tests/e2e/accessibility-quality.spec.js -g "ribbon"`
2. **Implement** — pure `ribbonKeyboardAnchorIndex({ selectedIndex, windowStart,
   windowLength, logicalCenter })` in `ribbonViewport.js`, returning an absolute
   index. `useRibbonViewport` derives it from the logical centre it already
   owns (`ribbonLogicalCenterRef`) and exposes it as state. Planner renders
   `tabIndex={i === keyboardAnchorIndex ? 0 : -1}`.
3. **GREEN** — same command; plus real keyboard entry: focus the control before
   the ribbon, `Tab`, expect the fallback day focused; activate it, expect
   `selectedDateKey` to change and ownership to move to it.
4. **Negative control** — restore `tabIndex={on ? 0 : -1}`, expect RED, restore.
5. **Repeat gate** — `--repeat-each=10`, no retries.
6. **Commit** — test and implementation as one TDD unit after RED is recorded.

## Task 2 — Deterministic live-event clock

**Files:** `tests/e2e/accessibility-quality.spec.js`.

Remove the `test.skip(minutesIntoDay < 40 || minutesIntoDay > 1400)` entirely.
Search for an existing clock seam first; otherwise install Playwright's browser
clock **before** Planner mounts. Scenario: now 12:00, event 11:40→12:20,
inspector headline `Now`.

- **Negative control** — drop `inspectDraft.dur` at `Planner.jsx:4988`, expect
  `Ended`; restore, expect `Now`.
- **Commit** — `test(planner): make live event countdown deterministic`.

## Task 3 — Smart-view overflow guard

**Files:** `tests/e2e/accessibility-quality.spec.js`.

Because render count is data-dependent (Finding E), seed a notebook that
populates enough views to guarantee chips, then measure which viewport actually
overflows. Assert `overflows === true` **and** `maskImage !== "none"`
unconditionally.

- **Negative control** — remove `style={smartViewFade}`, expect RED; restore.
- **Commit** — `test(actions): require smart view overflow cue`.

## Task 4 — Documentation correction

**Files:** `docs/plans/HANDOFF-2026-08-23.md`,
`docs/plans/2026-08-23-001-fix-navigation-shell-clip-path-repaint-plan.md`.

- Remove the `toBeCloseTo` queue item (already fixed on main).
- Replace the smart-view claim with the count-dependent truth.
- Scope every red-test claim to this browser build; drop "permanently red" and
  "has never passed".
- Separate the historical clip-path assumption from PR #11's measured result.
- Keep both device paint gates open.
- **Commit** — `docs: correct 23 Aug evidence and handoff state`.

## Task 6 — Pre-merge review of Task 1's own evidence

Raised against this branch after Tasks 1–5 landed, and both points checked before
accepting.

| Claim | Verdict |
| --- | --- |
| The Task 1 `Tab` test never presses `Tab` | **Reviewer right.** `day-ribbon.previousElementSibling` is `null` — the strip is the first child of `ribbon-viewport`, and `Previous day` is a sibling of the viewport. The fallback focused the anchor, and the loop broke on iteration 0 because `activeElement` already had a `data-day`. Instrumented press count: **0**. Rewritten to focus `Previous day`, assert that focus landed, press `Tab` once, assert the anchor is focused. No loop, no fallback. |
| `keyboardAnchorIndex` starts `null`, so frame 1 has no stop | **Reviewer right about the code, and I could not produce a RED.** Every input is a prop, so the initializer is now seeded synchronously — the contract holds by construction. But `Planner` never unmounts in the re-entry flow, so the hook's state survives the strip: the first-frame test passes identically with `useState(null)`. Landed as hardening, documented in the test as *not* covering the initializer. |

The re-entry first-frame test is kept for what it does guard — the anchor *policy*
across a strip remount: 0 stops if the anchor names an unrendered day, 2 if
selection and fallback both claim it.

**Gate.** The negative control targets the `Tab` line itself, not merely something
earlier in the test: starting focus on a non-adjacent control (`nav-toggle`) leaves
the anchor `inactive` after one hop → **RED at the focus assertion**; restoring
`Previous day` → green. Both keyboard tests `--repeat-each=50` → **100/100**, no
retries.

That distinction is the whole lesson of this task. The original test's 50/50 was a
measure of how reliably it avoided testing anything, and a control that fires on an
earlier line would have looked just as convincing.

## Task 5 — Verification

Focused suites, `--repeat-each=10` on the ribbon case, `npm test`, `npm run
build`, full Chromium. Any failure gets a controlled A/B against `dd0fb64` on
the same Node, Playwright, Chromium, worker count and port strategy before it is
classified. Update the PR body. Do not merge.
