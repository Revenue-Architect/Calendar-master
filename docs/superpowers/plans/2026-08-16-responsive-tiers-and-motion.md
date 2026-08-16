# Responsive Tiers and Motion Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two measured causes of stutter and the three measured causes of clipping across phone, tablet, and desktop, and put a regression guard under each so they cannot return.

**Architecture:** No new dependencies and no new animation library. The remediation is: lift the 447-line stylesheet out of the render path so real `@media` / `@container` rules become possible, unify the breakpoint constants that have drifted across CSS, JS, and Tailwind, build the medium tier that was never written, and convert the remaining layout-property transitions to the `clip-path` + `transform` technique the codebase already proved at `Planner.jsx:3891-3896`.

**Tech Stack:** React 19, Vite, Tailwind 4.1, native CSS / WAAPI, Node test runner, Playwright e2e against production Vite preview on port 4321.

**Related:** `docs/superpowers/plans/2026-08-15-shared-layout-motion.md` — now partially executed; see *Coordination* below.

**Line references** in this document are against `a0b332f`. `Planner.jsx` is 8721 lines and moves quickly; re-resolve by content before relying on a number.

---

## Framing — this is not a hardcoded-pixel problem

The brief was to find hardcoded sizes and convert them to flexible containers. I went looking and largely did not find them. What is already correct, and must not be churned:

- A token system for type, radii, elevation, and motion curves (`index.css:37-84`).
- **35** `min-w-0` and **9** `min-h-0` guards — someone understood the flex min-size trap.
- **6** `ResizeObserver`s driving live measurement.
- A hand-written `clip-path` substitution for width animation on mobile, with the reasoning written down (`Planner.jsx:3891-3896`).
- A documented standard against layout-property animation (`2026-08-15-shared-layout-motion-prd.md` §7.2, and line 158: *"new sibling motion must not add more layout-property animation"*).

The surviving pixel values are mostly on things that *should* be pixels: icons, 44 px touch targets, hairlines, corner radii. Converting those to flexible units would make the app worse.

The stutter and clipping come from four specific defects instead. Every claim below was measured in Chromium against the production bundle.

**Measured baseline:** frame timings under 6× CPU throttling; layout measured at DPR 1 across eleven viewports from 320×800 to 1920×1080.

---

## Finding A — the medium tier does not exist

There are two layouts: phone below 640 px and two-pane desktop at 1024 px and up. Everything between renders the phone layout stretched across a tablet, with the Actions column removed by `hidden lg:block` (`Planner.jsx:4939`) rather than relocated.

Measured `grid-template-columns` on `.nb-main`:

| Viewport | Computed tracks | Actions column |
| --- | --- | --- |
| 600×960 | `576px` | `display:none` |
| 768×1024 — iPad portrait | `728px` | `display:none` |
| 820×1180 — iPad Air | `780px` | `display:none` |
| 912×1368 — Surface Pro | `872px` | `display:none` |
| 1024×768 | `562px 402px` | visible |

No amount of px-to-flex conversion reaches this, because the tier is absent from the stylesheet rather than wrongly specified.

It is also invisible to CI. Existing e2e viewports are 320, 390, 393, 430, 489, and 1280 — **nothing in the 790 px band between 490 and 1279** where this defect lives.

Related dead code: `lg:grid-cols-12` at `Planner.jsx:4561` never applies, because `.nb-main.nb-actions-open` at `:3914` overrides it with a 2-track rule at equal-or-higher specificity. There is no `col-span-*` anywhere in the file.

---

## Finding B — five transitions drive layout, violating §7.2

This is the stutter, and it is the project's own standard being broken, not a new opinion.

| Site | Transitions | Note |
| --- | --- | --- |
| `Planner.jsx:3874` | `top`, `right`, `bottom`, `left`, **`width`** | On `.nb-app-surface` — the element containing the entire application |
| `Planner.jsx:3914` | **`grid-template-columns`**, `column-gap` | The 2026-08-15 plan already rejected animated grid tracks as WebKit-unsafe |
| `Planner.jsx:4261` | **`font-size`**, `line-height` | Forces text re-layout every frame |
| `Planner.jsx:4260` | **`padding`** | `.nb-day-heading` |
| `Planner.jsx:4220` | **`left`**, `width` | Per timeline card — cost multiplies by cards-per-lane |

A runtime audit of the live desktop DOM at rest counts **10** elements transitioning layout properties.

Measured under 6× CPU throttle at `a0b332f`:

| Interaction | median | p95 | worst | frames >32 ms |
| --- | --- | --- | --- | --- |
| Nav open | 16.7 ms | **116.6 ms** | **133.3 ms** | **12** |
| Actions collapse | 16.7 ms | **66.7 ms** | **100.0 ms** | **8** |
| Actions restore | 16.7 ms | 50.1 ms | 100.0 ms | 6 |
| Idle baseline | 16.7 ms | 16.7 ms | 16.7 ms | **0** |

Run-to-run variance on worst-frame is roughly ±15 ms; an earlier run at `ef57323` measured nav open at 150.1 ms worst / 11 janky. The p95 and janky-frame counts are stable and are the figures to regress against.

The technique to fix this is already in the repo. `Planner.jsx:3891-3896` explains that animating width "made its complete layout reflow on every frame" and replaces it with `clip-path` plus `transform` — but only inside the `max-width:639px` block. Desktop never received the same treatment.

---

## Finding C — the viewport contract ignores the notch

`index.html:5` sets `viewport-fit=cover`, which deliberately extends the page under the status bar and home indicator. Nothing then pads for them:

- `grep -c "env("` over `src/` → **0**. There is not one `env(safe-area-inset-*)` in the codebase.
- Mixed units: `88vh` ×2, `76vh`, `100vh` alongside `76dvh` and `100dvh`. The `vh` sites do not account for the mobile URL bar.
- `Planner.jsx:7906` sizes sheets as `Math.min(content.scrollHeight, window.innerHeight * .88)`, re-measured on every `resize`. On mobile `innerHeight` changes continuously as the URL bar collapses during a scroll, so the sheet resizes underneath the finger scrolling it.
- `index.html:5` also sets `maximum-scale=1, user-scalable=no`, which blocks pinch zoom and fails WCAG 1.4.4. The zoom-on-focus problem it was added for is already handled independently by the 16 px input rule at `Planner.jsx:3839`.

Note: Chromium at DPR 1 reports `visualViewport.height === innerHeight`, so this class of defect is **not reproducible in the current CI browser**. It needs a real device check.

---

## Finding D — constants have drifted

| Site | Declares | Problem |
| --- | --- | --- |
| `Planner.jsx:2910` | `matchMedia("(max-width:1023px)")` | JS tier boundary is 1 px off the CSS `1024`; a 1023.5 px window disagrees with itself |
| `Planner.jsx:3906` | `.nb-search-wrap{width:32px!important}` | Measured child is 37 px wide — clipped at every viewport |
| `Planner.jsx:3904` | `.nb-hud-left .w-14{width:36px}` | CSS overriding a Tailwind utility by specificity |
| `Planner.jsx:267` | `RIBBON_FALLBACK_CELL_WIDTH = 80` | Real cells are 64 / 80 / 96 px across tiers (`:4054-4056`); the constant matches only the middle one |
| `Planner.jsx:4977` | `innerWidth - 248`, fallback `390` | Popover width and a phone width hardcoded into one clamp |
| `Planner.jsx:966` | `fitTimeline` | Effectively inert — see below |

**`fitTimeline` never fires in practice.** It computes `floor((clientHeight - 8) / 3)` and clamps to `[44, 68]`, so compaction requires a stream shorter than ~212 px and the 44 px floor requires ~140 px. Measured across a sweep from 617 px down to 217 px of stream height, `dayHourHeight` never left 68 and timeline content height stayed 1632 px at every step. The comment above it oversells what it does; either the divisor is wrong or the mechanism is dead weight.

Two further defects found by measurement rather than reading:

- **`actions-restore` is `position:fixed` inside a transformed ancestor.** `.nb-app-surface` carries `transform: translate3d(...)`, which makes it the containing block for fixed descendants. The button is therefore not viewport-fixed, and contributes a consistent 48 px to the surface's scroll width at 1024, 1280, and 1920 px.
- **320 px clips.** `.nb-timeline-chrome` measures `334 > 320` and is cut off; a view-toggle button overflows to x=333.

Also observed: **15–19 interactive controls under 40 px** at every viewport. Worth a separate accessibility pass; `.nb-tap::after` (`:4042`) covers some but not all of them.

---

## Coordination with the shared-layout-motion plan

`docs/superpowers/plans/2026-08-15-shared-layout-motion.md` is **now partially executed** — `712a010`, `e2f66fc`, `c3a1992`, and `a0b332f` landed its NEW-morph and compact view-pill tasks. It independently found the same 1023-vs-639-vs-640 drift recorded in Finding D, and shipped the fix:

- `src/features/motion/viewPills.js:13` — `export const VIEW_PILL_COMPACT_MAX = 639.98`
- `Planner.jsx:7454` — `useCompactViewPills()`

**Phase 3 must extend that token rather than compete with it.** A second breakpoint system is the exact failure this plan exists to remove. The `1024` boundary still has no token; that is the gap Phase 3 fills, alongside generalising `useCompactViewPills` into a tier hook.

---

## Ship-first items

These are small, independently revertible, and remove both measured jank sources. They do not depend on the phases below and should not wait for them.

- [ ] `Planner.jsx:3874` — drop `top`/`right`/`bottom`/`left`/`width` from the transition list; animate `transform` + `clip-path`, mirroring the mobile block at `:3896`. Removes the ~133 ms stall.
- [ ] `Planner.jsx:3914` — make the grid tracks static; translate the collapsing pane instead. `.nb-actions-column` already translates at `:3923`. Removes the ~100 ms stall.
- [ ] `Planner.jsx:4261` — delete the `font-size` / `line-height` transition.
- [ ] `index.html:5` — add `env(safe-area-inset-*)` padding to the shell; remove `maximum-scale=1, user-scalable=no`.

---

## Phase 1 — Make it measurable

**~1 day · no dependencies · low risk**

Every later phase is unverifiable without this, and these defects survived precisely because nothing tests the band they live in.

- [ ] Add a viewport sweep spec covering 320, 390, 430, 600, 640, 768, 820, 912, 1024, 1280, 1920, asserting the expected `grid-template-columns` per tier.
- [ ] Assert no element exceeds its scroll container, allow-listing the virtualised ribbon explicitly by selector.
- [ ] Add a frame-budget assertion on nav-open and Actions-collapse under `Emulation.setCPUThrottlingRate`. Regress against p95 and janky-frame count, not worst-frame, which carries ±15 ms variance. Follow the guidance in `2026-08-12-resilience-accessibility-hardening-design.md:55` — fail on severe long tasks, not on a fragile frame-rate threshold.
- [ ] Add a touch-target audit recording the current 15–19 sub-40 px controls as a ratchet.

**Exit:** suite green, and reverting any ship-first item turns it red.

## Phase 2 — Lift the stylesheet out of render

**~2 days · needs Phase 1 · medium risk, mechanical**

447 lines of CSS live in a template literal inside the component (`Planner.jsx:3831-4277`), unmemoized, interpolating theme values. Every render rebuilds the string; every theme change re-parses the sheet. More importantly it blocks the tooling Phases 4–6 need.

- [ ] Move to a real `.css` file.
- [ ] Theme values become custom properties set on the root element — the pattern `--nb-line` already uses (`index.css:69`).
- [ ] Verify `@media` and `@container` rules are now statically analysable.

**Exit:** no CSS string in the render path; Phase 1 suite unchanged and still green.

## Phase 3 — One source of truth for tiers

**~1 day · needs Phase 2 · low risk**

- [ ] Extend `VIEW_PILL_COMPACT_MAX` into a full tier token set covering the `1024` boundary, which currently has no token.
- [ ] Generalise `useCompactViewPills` (`Planner.jsx:7454`) into a `useLayoutTier()` hook; replace the ad-hoc `matchMedia` at `:2910` and reconcile 1023↔1024.
- [ ] Delete dead `lg:grid-cols-12` at `:4561`.
- [ ] Retire `width:32px!important` at `:3906` and the `.w-14` override at `:3904`; size those controls from content with a min-width floor.
- [ ] Derive `RIBBON_FALLBACK_CELL_WIDTH` from the tier rather than restating it.
- [ ] Decide `fitTimeline`'s fate (`:966`): correct the divisor or delete it. Do not leave it inert with a comment claiming otherwise.

**Exit:** grepping for a raw breakpoint number returns only the token definitions.

## Phase 4 — Build the medium tier

**~3 days including design · needs Phase 3 · design decision required**

The only phase with a genuine open question: what *should* 640–1023 px be?

**Recommendation:** Actions becomes a second grid *row* beneath the timeline rather than a hidden pane. It preserves the two-surface model on a device with the height for it, and degrades from the desktop layout by rotating the axis rather than deleting content. A slide-over sheet is the alternative if the phone metaphor is preferred; decide before implementing.

- [ ] Implement the medium tier.
- [ ] Fix the 320 px `.nb-timeline-chrome` overflow (`334 > 320`) while the tier work is open.
- [ ] Re-home `actions-restore` so it is not `position:fixed` inside a transformed ancestor.

**Exit:** 768, 820, and 912 px each render a deliberate layout, asserted by the Phase 1 sweep.

## Phase 5 — Container queries for components

**~2–3 days · needs Phase 2 · medium risk**

This is the "more dynamic components" ask done properly. Cards, rows, and the HUD currently infer size from the viewport, which is why the same component needs different rules per pane. Tailwind 4.1 supports `@container`; it is currently unused.

- [ ] Establish `@container` on the timeline pane and the Actions column.
- [ ] Move timeline cards, action cards, and HUD chips to container-relative rules.
- [ ] Remove the negative-margin bleed (`-mx-1` inside an `overflow-x:hidden` parent) that makes the Actions column's content 4 px wider than its box at every desktop width.

**Exit:** one rule set renders a card correctly in both a 402 px column and a 1085 px pane.

## Phase 6 — De-jank the remaining motion

**~2 days · needs Phase 1, easier after Phase 2 · low risk**

The ship-first items cover the two worst offenders. This finishes the set and guards it.

- [ ] `Planner.jsx:4220` — timeline card `left`/`width` → `translate`/`scale`. Highest remaining cost, because it multiplies by cards-per-lane.
- [ ] `Planner.jsx:4260` `.nb-day-heading` padding and `:4258` `.nb-timeline-chrome` height → transform or a settled step.
- [ ] Add a guard rejecting new layout-property transitions, enforcing §7.2 mechanically rather than by review.

**Exit:** zero elements transitioning layout properties; frame budget holds under throttle.

## Phase 7 — Viewport and safe area

**~1 day · parallelisable with Phases 3–6 · low risk**

- [ ] `vh` → `dvh` at the four remaining sites.
- [ ] `env(safe-area-inset-*)` on shell edges, sheets, and bottom controls.
- [ ] Sheet height from `visualViewport`, not `window.innerHeight` (`Planner.jsx:7906`).
- [ ] Replace the hardcoded `248` / `390` clamp at `:4977` with measured popover width and `visualViewport.width`.

**Exit:** verified on a notched device in both orientations, and pinch zoom works. **This cannot be verified in CI** — Chromium at DPR 1 reports `visualViewport.height === innerHeight`. Requires a manual device pass.

---

## When a pixel is right

The useful distinction is not px versus flex — it is what the value is measured against.

| Kind of value | Unit | Because |
| --- | --- | --- |
| Touch targets, icons, hairlines, radii | **Fixed px — keep** | A 44 px target is 44 px on every screen; that is the point |
| The type scale (`--t-*`) | **Fixed px — keep** | Defensible for an app shell, and `index.css:41` already argues it |
| Pane and column widths | → `fr` / `minmax` | These express a ratio between panes, not a physical size |
| Anything mid-animation | → `transform` | A px that changes 60×/second is a layout pass 60×/second |
| Full-height shells and sheets | → `dvh` + `env()` | `vh` and `innerHeight` both lie on mobile |
| Component internals | → container queries | The same card renders in a 402 px column and a 1085 px pane |
| Tier boundaries | → one token set | Currently declared in CSS, JS, and Tailwind, and they disagree |

## What not to touch

A "make it responsive" brief tends to expand into these, and the code is already right.

- **The type scale in `index.css`.** Fixed px is correct for an app shell; the file argues why at `:41`.
- **The 35 `min-w-0` / 9 `min-h-0` guards.** Removing these reintroduces overflow.
- **Icon and touch-target sizes** (`w-4`, `h-11`, and friends). Physical constants, correctly fixed.
- **The virtualised ribbon's ±34,000 px scroll width.** Alarming in an overflow audit; it is the rolling-window design working as intended (`Planner.jsx:261-266`).
- **The mobile `clip-path` nav transition** (`:3891-3896`). It is the reference implementation for Phase 6 — copy it, do not replace it.

---

*Audit run against the production bundle at `a0b332f`, Chromium via Playwright. Frame timings under 6× CPU throttling; layout measurements at DPR 1. Diagnostic specs were throwaway and are not committed; Phase 1 promotes them into the suite.*
