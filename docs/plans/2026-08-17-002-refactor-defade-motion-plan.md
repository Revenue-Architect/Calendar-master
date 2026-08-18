---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
title: "refactor: every surface comes from somewhere"
created: 2026-08-17
revised: 2026-08-17
type: refactor
depth: deep
---

# refactor: Every surface comes from somewhere

**Baseline:** `c45136e`. All motion lives in one `<style>` block in `src/Planner.jsx` —
`src/index.css` contains no animation at all.

> **Revision note.** The first draft of this plan was written from a static read of the
> CSS. Running the app corrected it on two counts that changed the whole shape of the work,
> and removed its single largest unit. Both corrections are recorded in Problem Frame.
> **The navigation drawer and everything hamburger-related is out of scope by instruction
> and is not touched by any unit here.**

---

## Goal Capsule

Opacity is currently doing a job that geometry should do: telling the eye where a surface
came from. Replace arrival-by-fading with arrival-from-a-place — a surface grows from the
control that opened it, or slides from the edge it belongs to — and keep opacity only where
it carries meaning.

The bar is not "no fades". It is that a person should never have to wonder where something
came from or where it went.

---

## Problem Frame

### What running the app corrected

**Correction 1 — the generic fade is nearly dead already.** The first draft called
`nbfluid` (`opacity 0→1` + rise) "the big one" and proposed a unit to widen trigger capture
so fewer sheets would fall into it. Audited live, every sheet resolves to a real origin:

| Opened by | `data-fluid-origin` | Animation | Opacity |
|---|---|---|---|
| ⌘K palette | `none` | none | 1 |
| keyboard `n` / `a` | `none` | none | 1 |
| NEW click | `notch` | `nbnotchin, nbnotchwash` | 1 |
| `+ ADD` click | `notch` | `nbnotchin, nbnotchwash` | 1 |
| event card click | `trigger` | `nbfluidorigin` | 1 |
| task chip click | `trigger` | `nbfluidorigin` | 1 |
| LISTS click | `trigger` | `nbfluidorigin` | 1 |
| **first-run Welcome** | **UNSET** | **`nbfluid`** | **mid-fade** |

`nbfluid` fires on **one screen, once per notebook**. The origin system is already
comprehensive. **The first draft's U1 is deleted**, not deferred — there is nothing to widen.

**Correction 2 — keyboard-opened sheets have no exit at all, and that is correct.**
A sheet opened with `n` is gone 60ms after Escape: `data-fluid-origin="none"` sets
`animation: none`, and its specificity (`0,2,1`) beats the closing rule (`0,2,0`), so
`nbfluidout` never applies. That looks like a defect and is not one. Keyboard-initiated
actions are repeated dozens of times a day, and animating them makes the app feel slower —
Raycast ships no open/close animation for exactly this reason. **This behaviour is load-bearing
and must be protected by a test, not "fixed".**

### The inventory

Keyframes that declare opacity at both ends to *prevent* a fade (`nbnotchin`, `nbnotchout`,
`nbfluidorigin`, `nbfluidoriginout`) are excluded — they stay.

**Group A — a surface arrives or leaves by fading**

| # | Mechanism | Where | Frequency | Verdict |
|---|---|---|---|---|
| A1 | `nbfluid` / `nbfluidout` | `4366`/`4389` | Once per notebook | **Low priority.** First-run only |
| A2 | `nbscrim` / `nbscrimout` | `4495`/`4497` | Every sheet | **Keep** — see KTD4 |
| A3 | `nbask` | `4485` | Occasional | Replace |
| A4 | `nbrise` | `4518` | Every detail edit | Replace |
| A5 | `nbup` | `4322` | Occasional | Replace |
| A6 | `nbtoastout` | `4508` | Every undo | Replace |
| A7 | `.nb-actions-column` / `.nb-actions-restore` | `4174-4177` | Daily | Replace |
| ~~A8~~ | ~~`.nb-nav-*`~~ | ~~`4130`~~ | — | **Out of scope — nav untouched** |

**Group B — content fades in inside a surface that already arrived**

| # | Mechanism | Where | Frequency |
|---|---|---|---|
| B1 | `nbnotchgroupin` | `4455` | Every composer open |
| B2 | `nb-list-enter` | `4327` | Every agenda/list render |
| B3 | `.nb-cell` + the `mounted` gate | `4304` | **Every load** |
| B4 | `.nb-timeline-chrome-inner` | `4590` | Every chrome collapse |
| B5 | `.nb-app-surface>*` | `4148` | Blanket rule |

**Group C — two states of one element cross-fade**

`C1` label handover (`4456-4457`), `C2` `.nb-edit-face` (`4501`), `C3` `.nb-chip-fill` (`4504`).

**Group D — opacity that is not an arrival. Keep all of it.**

`turnnext`/`turnprev` (`4318`/`4320`, a dim not an appearance), `.nb-tap` (`4235`), the
global pressable rule (`4543`), `.nb-timeline-lane` (`4551`), `nbrw`/`nbp`/`nbb`,
`.nb-action-complete-overlay` (`4360`).

**Group E — React-driven opacity.** Two kinds:
- **Semantic — keep.** `completed ? 0.45`, `past ? 0.74`, `held && overDay ? 0.35`. State, not motion.
- **Arrival gates — replace.** `mounted ? 1 : 0`, `expanded ? 1 : 0`, `more ? 1 : 0`,
  `editing ? 1 : 0`, `overdueReviewOpen ? 1 : 0`, `dx > 20 ? 1 : 0`, `on ? 1 : 0`.

### What the surfaces actually look like

Screenshots drove three decisions that a CSS read could not have:

- **The Actions column has a visible anchor.** Collapsed, an accent-filled vertical
  `ACTIONS` tab clings to the right edge. The column should come *out of that tab* and
  return *into it* — a morph, not a slide from nowhere. The tab is a measurable rect, so
  the machinery already exists.
- **The agenda list has a spine.** Cards sit to the right of a day rail (`MON 10`, `TUE 11`)
  with a vertical divider. Cards should be uncovered left-to-right off that rail, so the
  day appears to extrude its own contents.
- **The timeline is dense and mostly empty.** Anything that animates per-row across it will
  read as noise. B2's stagger must stay small and must never run on scroll.

### The dependency that constrains everything

`4602-4607` — under `prefers-reduced-motion` and the in-app preference, the app
**deliberately replaces movement with a fade**:

```
.nb-fluid,.nb-msheet,.nb-timeline-chrome-inner,.nb-morph-source-label{transition:opacity 160ms ease!important}
```

That is the correct accessible fallback and must survive untouched. **Every unit here is
scoped to the full-motion path.** A de-fade applied globally is an accessibility regression.

### Test coupling

~58 assertion sites: `motion.spec.js` (28), `actions.spec.js` (15), `timeline-polish.spec.js`
(8), `reveal-without-paint.spec.js` (3), `note-templates.spec.js` (2), `audit-harden.spec.js`
and `interaction-feedback.spec.js` (1 each).

`reveal-without-paint.spec.js` is the sharp one: it pins B3 and exists because a
paint-gated reveal once left 56 ribbon cells permanently blank.

---

## The motion thesis

Three rules, applied in this order. Everything below is an application of them.

**1. Every surface comes from somewhere the user can point to.** If there is a control, the
surface grows from it. If there is an edge it belongs to, it comes from that edge. If it has
neither, the honest answer is to not animate at all — which is what keyboard opens already do.

**2. Frequency sets the budget.** This is the whole difference between polish and drag.

| Seen | Budget | Examples |
|---|---|---|
| Every keystroke | **Zero.** No animation | ⌘K, `n`, `a` |
| Every load | ≤200ms, one gesture | B3 ribbon/month |
| Many times a day | 150–260ms | B2 list, C2/C3 faces, A7 column |
| A few times a day | 260–480ms | Composer morph, detail sheet |
| Once per notebook | Can be generous | First-run |

**3. Reveal, don't introduce.** Content that already exists in the layout should be
*uncovered* by clip, never faded up. Fading says "this is new"; clipping says "this was
always here, you just couldn't see it yet". For an editor full of persistent fields, the
second is the truth.

---

## Requirements

| ID | Requirement |
|---|---|
| R1 | No surface arrives or departs by changing opacity on the full-motion path. |
| R2 | Every animated surface has a named origin: a control's rect, or a screen edge. |
| R3 | Content inside an arriving surface is revealed by clip, not by fading. |
| R4 | Cross-fades between two states of one element become wipes. |
| R5 | Semantic dimming is untouched. |
| R6 | The reduced-motion fade fallback still applies, and still fades. |
| R7 | Nothing's visibility depends on an animation having run. |
| R8 | No layout property is animated (shared-layout PRD §7.2). |
| R9 | Keyboard-opened surfaces stay instant, in and out. |
| R10 | The navigation drawer and its contents are not modified. |

---

## Key Technical Decisions

**KTD1 — Frequency decides the budget, and the budget decides the technique.**
`(session-settled: user-directed — the bar is Apple Design Award level, which means restraint on hot paths, not more motion everywhere.)`
The most-seen animation in the app is the load reveal (B3); it gets the least motion. The
least-seen (first-run) can afford the most. Governs R1, R2.

**KTD2 — Two idioms only: grow-from-control, and slide-from-edge.**
The first draft listed a third (the drawer's inset reveal). That idiom belongs to the nav,
which is now out of scope, so it is removed rather than imitated elsewhere. Governs R2, R10.

**KTD3 — Clip is the reveal.**
`clip-path: inset()` is already the app's idiom (`nbnotchin`, `.nb-action-complete-overlay`).
It composites, never animates layout, and reads as uncovering. Groups B and C become clips.
Governs R3, R4, R8.

**KTD4 — The scrim keeps its fade.**
A scrim is not a surface; it is an absence of light, with no edge to come from. Wiping
darkness reads as a shutter. This exception is deliberate — do not "fix" it later.

**KTD5 — Reduced motion keeps every fade, and keyboard keeps none.**
Two protected paths at opposite ends. `4602-4607` unchanged; `origin="none"` stays instant.
Governs R6, R9.

**KTD6 — The nav is frozen.**
`(session-settled: user-directed — "do not touch the hamburger menu related anything, keep that as is".)`
A8 is struck from the inventory. No unit reads or writes `.nb-nav-*`, `NavigationShell`, or
`--nav-page-scale`. Where the drawer's reveal was cited as inspiration, that citation is
removed rather than reinterpreted. Governs R10.

---

## High-Level Technical Design

```
                        how often is this surface seen?
                                      │
        ┌──────────────┬──────────────┼───────────────┬──────────────┐
   every keystroke   every load   many/day        few/day        once
        │              │              │               │             │
      NOTHING      CLIP SWEEP    CLIP or MORPH     MORPH        anything
     (protect)      ≤200ms        150-260ms      260-480ms      goes
        │              │              │               │             │
        └──────────────┴──────────────┴───────────────┴─────────────┘
                                      │
                        does it have a control to come from?
                              ┌───────┴────────┐
                             yes               no
                              │                 │
                     grow from its rect   slide from its edge
                     (fluidMorphFromRects) (translate %, no opacity)

   reduced motion short-circuits everything to the existing 160ms cross-fade
```

---

## Scope Boundaries

**In scope:** A1, A3–A7, all of B, all of C, the arrival-gate half of E.

**Not in scope:** the navigation drawer and every `.nb-nav-*` rule (KTD6); the scrim (KTD4);
all of Group D; semantic dimming in E; the reduced-motion block; keyboard-open instancy.

### Deferred to Follow-Up Work

- `.nb-app-surface>*` (B5) is a blanket rule over every child of the page surface. Auditing
  what depends on it is its own change.
- The flaky `view-pills.spec.js:145` and the desktop chrome regression at
  `timeline-chrome-scroll.spec.js:34` are separate live issues.

---

## Implementation Units

Ordered by frequency: the surfaces people see most often are fixed first, because that is
where the difference is felt and where a mistake is most visible.

### U1. Uncover the load, don't fade it in

**Goal:** B3 and the `mounted` gate stop being an opacity switch. This is the most-seen
animation in the app.

**Requirements:** R1, R3, R7, R8. Implements KTD1, KTD3.

**Files:** `src/Planner.jsx` (`4304`, the `mounted` sites), `tests/e2e/reveal-without-paint.spec.js`

**Approach:**
Ribbon and month cells are uncovered by a single clip sweep along the axis they read in —
horizontally for the ribbon, top-down for the month grid — with a small per-cell offset,
total under 200ms. One gesture, not fifty-six.

**The resting state must be visible with no animation having run.** Prefer `@starting-style`
so the entrance is an enhancement the browser applies rather than a gate JavaScript opens.
That is the guarantee `reveal-without-paint.spec.js` exists to hold after a paint-gated
reveal left the ribbon permanently blank.

**Test scenarios:**
- With `requestAnimationFrame` neutralised, every ribbon cell and month cell is fully visible.
- No cell's resting style depends on a JS-set class or flag.
- The whole reveal completes within 200ms of first paint.

### U2. Grow the Actions column out of its own tab

**Goal:** A7 stops fading. The column comes from the accent `ACTIONS` tab it collapses into.

**Requirements:** R1, R2. Implements KTD2.

**Files:** `src/Planner.jsx` (`4174-4177`), `tests/e2e/actions.spec.js`

**Approach:**
Both rules already translate; they also fade, which is what makes the collapse read as
dissolving rather than folding. Remove the opacity term and let the transform carry it —
the column travels fully past its own edge so there is nothing left to hide.

The restore tab is a measurable rect, so the richer version is a morph between tab and
column rather than a plain slide. Try the slide first: it is a one-line change and may be
enough. Escalate to the morph only if the slide reads as arriving from nowhere.

`visibility` keeps its delayed toggle so a hidden column cannot take focus.

**Test scenarios:**
- Collapsing and restoring never puts the column below full opacity.
- The collapsed column is not focusable.
- The timeline still gains the width the column gave up.

### U3. Wipe the list off its rail

**Goal:** B2 stops fading.

**Requirements:** R1, R3. Implements KTD3.

**Dependencies:** U1 (shares the clip-sweep helper).

**Files:** `src/Planner.jsx` (`4327`)

**Approach:**
The agenda has a visible day rail on the left with cards attached to its right. Uncover each
card left-to-right off that rail so the day extrudes its own contents. Keep the stagger
small — 30–40ms, total under 300ms — and **never run it on scroll**, only on a real list
change. The timeline is dense; per-row motion during scrolling would read as noise.

### U4. Reveal composer content by clip instead of cascade

**Goal:** B1 retires.

**Requirements:** R3, R7, R8. Implements KTD3.

**Dependencies:** U1, U3.

**Files:** `src/Planner.jsx` (`4455`, the `--nb-stage` block), `tests/e2e/motion.spec.js`

**Approach:**
Replace the eight-group opacity stagger with a single `clip-path` sweep down the body on the
morph's own clock. One animation instead of eight, nothing ever below full opacity, and the
content revealed by the same mechanism as its container.

**Execution note:** this contradicts a live constraint in
`docs/superpowers/plans/2026-08-17-framer-fidelity-motion.md` ("do not delete
`nbnotchgroupin`"). That constraint exists to stop content being opaque *from frame 0*,
which a clip does not do — the content is still withheld until the shape has somewhere to
land. **Reconcile with that plan before writing code**; do not overrule it silently.

**Test scenarios:**
- No element inside the sheet is below full opacity at any point.
- Content is still not fully *visible* at 40% of the morph.
- Existing timing assertions are rewritten to measure the clip, each seen failing first.

### U5. Wipe the handovers and the face swaps

**Goal:** C1, C2, C3 become clips.

**Requirements:** R4. Implements KTD3.

**Dependencies:** U4.

**Files:** `src/Planner.jsx` (`4456-4457`, `4501`, `4504`)

**Approach:**
The trigger label (C1) cross-fades with the sheet beneath it; wipe it instead, from the side
the sheet is growing toward, so the label is consumed by the surface rather than dissolving
over it. `.nb-edit-face` and `.nb-chip-fill` take the same treatment —
`.nb-action-complete-overlay` (`4360`) already proves the pattern in this codebase.

### U6. Send the toast back the way it came

**Goal:** A6, A3, A4, A5, B4 and the arrival gates in E.

**Requirements:** R1, R3, R5.

**Dependencies:** U2.

**Files:** `src/Planner.jsx` (`4322`, `4484`, `4507`, `4512`, `4517`, `4590`)

**Approach:**
Toasts exit the edge they entered from — symmetry is what makes swipe-to-dismiss legible,
and an undo toast that leaves the way it arrived tells you where undo lives. `nbask`,
`nbrise` and `nbup` take a short travel from their owning edge. B4's opacity term is
redundant inside an existing height collapse and can simply go.

**Audit Group E carefully as part of this unit, not as an afterthought.** A completed task
at `0.45` is information; the boundary between that and an arrival gate is the risky part
of this whole plan.

### U7. Give first-run the one generous moment

**Goal:** A1 retires — last, because it is seen once.

**Requirements:** R1, R2. Implements KTD1.

**Dependencies:** U6.

**Files:** `src/Planner.jsx` (`4366`, `4389`)

**Approach:**
The Welcome sheet has no origin and legitimately cannot have one — nothing was pressed. It
gets the edge slide: `translateY(100%) → 0`, percentage so it adapts to height, no opacity
term, with the scrim fading underneath to give the opaque card something to arrive against.

This is the one surface that can afford to be generous, and it is the first thing anyone
sees. Everything else in this plan is restraint; this is the exception that earns it.

**Test scenarios:**
- The Welcome sheet is `opacity: 1` on its first frame.
- Its transform starts at a full self-height offset.
- Under reduced motion it still fades.

### U8. Protect the two paths that must not change

**Goal:** Lock in keyboard instancy and the reduced-motion fallback so a future de-fade
cannot erode them.

**Requirements:** R6, R9, R10.

**Dependencies:** U7.

**Files:** `tests/e2e/motion.spec.js`

**Approach:**
Two assertions the suite does not currently have. First: a sheet opened with `n` has
`animation-name: none` on entry and is unmounted within ~100ms of Escape — instancy is a
feature, and nothing in this plan may animate it. Second: under reduced motion the
`4602-4607` cross-fade is the applied rule.

Add a third guarding KTD6: no rule matching `.nb-nav-*` changed across this work. A
grep-level assertion is enough; the point is that a later unit cannot quietly drift into
the drawer.

---

## Verification Contract

| Gate | Command |
|---|---|
| Unit | `npm test` |
| Browser | `npx playwright test` |
| Fade inventory | Re-run the parser in Sources and diff against this document's tables |

**Kill the preview server before any full run.** `playwright.config.js` sets
`reuseExistingServer: !CI` with `npm run build && vite preview`, so a server already on port
4321 makes Playwright skip the build and test a stale bundle. Three runs were lost to this.

Visual confirmation at 390, 768 and 1280, light and dark, reduced motion on and off. Every
unit that changes a surface gets a before/after screenshot pair.

---

## Definition of Done

- Groups A (except A2), B and C are converted (R1, R3, R4).
- Every converted surface grows from a control or slides from an edge (R2).
- Semantic dimming is byte-for-byte unchanged (R5).
- `4602-4607` unchanged; reduced motion still cross-fades (R6).
- `reveal-without-paint.spec.js` passes with rAF neutralised (R7).
- Nothing added animates a layout property (R8).
- Keyboard opens are instant in and out, asserted (R9).
- No `.nb-nav-*` rule differs from baseline (R10).
- Both suites green on a freshly built bundle.

---

## Risks

**Reduced motion is the trap.** Most of these units would be an accessibility regression if
applied globally. Scope each to the full-motion path and assert the fallback.

**Group E mixes meaning and motion in one property.** The audit in U6 is the riskiest part
of this plan — riskier than any animation in it.

**U4 contradicts a live plan.** Reconcile with Codex's framer-fidelity plan before coding.

**A clip can cost more than a fade on a large surface.** `clip-path` composites, but a
full-height sweep over a dense timeline repaints more than an opacity change. Measure on the
6× CPU throttle harness already used for the pill A/B before assuming the swap is free.

**Restraint is the hard part.** The failure mode for "award-worthy" is more motion, not
better motion. The most-seen surface in this plan (U1) gets the smallest gesture, and the
two protected paths in U8 get none at all. If a unit ends up with more animation than the
thing it replaced, it is probably wrong.

---

## Sources & Research

Inventory parsed from `src/Planner.jsx`; origin behaviour and first-run audited in a running
build at 1280×900 and 390×844; surfaces reviewed as screenshots. `src/index.css` has no
animation.

```bash
node -e 'const s=require("fs").readFileSync("src/Planner.jsx","utf8");const re=/@keyframes\s+([A-Za-z0-9_-]+)\s*\{/g;let m;while((m=re.exec(s))){let i=re.lastIndex,d=1;while(i<s.length&&d>0){if(s[i]==="{")d++;else if(s[i]==="}")d--;i++;}const b=s.slice(re.lastIndex,i-1);const o=b.match(/opacity\s*:\s*[^;}]+/g);if(o&&new Set(o).size>1)console.log(m[1],"::",o.join(" | "));}'
```

At baseline this prints 15 keyframes. **It undercounts by one:** it requires two distinct
opacity values, so `nbtoastout` — which declares only `opacity: 0` and fades from an implicit
`1` — does not appear. Treat it as a regression check against this document's tables, not as
their source; it does not cover the transition-level, JSX-level, or Group D/E fades at all.
