---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
title: "refactor: replace the app's fades with morphs, slides and reveals"
created: 2026-08-17
type: refactor
depth: deep
---

# refactor: Replace the app's fades with morphs, slides and reveals

**Baseline:** `9d38f75`. Every line reference is against that commit. All motion lives in
one `<style>` block inside `src/Planner.jsx` — `src/index.css` contains no animation at
all, which is worth knowing before hunting.

---

## Goal Capsule

Fifteen keyframes and thirteen CSS rules currently move opacity, plus about seventeen
React-driven opacity switches. Most are doing a job something else should do: telling the
eye where a surface came from. Replace those with the three idioms this app already owns —
a surface that grows from the control that opened it, a surface that slides in from an
edge, and the drawer's inset-and-scale reveal — and keep opacity only where it means
something other than "arriving".

---

## Problem Frame

### The complete fade inventory

Parsed from the source, not recalled. Keyframes whose opacity is declared but constant
(`nbnotchin`, `nbnotchout`, `nbfluidorigin`, `nbfluidoriginout`) are excluded — those pin
`opacity: 1` deliberately to *prevent* a fade, and must stay.

**Group A — a surface arrives or leaves by fading.** These are the real targets.

| # | Mechanism | Where | What it does |
|---|---|---|---|
| A1 | `nbfluid` / `nbfluidout` | `4366` / `4389` | **The big one.** Any sheet with no measurable trigger: `opacity 0→1` + `translateY(26px) scale(.965)`, and `1→0` out |
| A2 | `nbscrim` / `nbscrimout` | `4495` / `4497` | The dimming behind every sheet |
| A3 | `nbask` | `4485` | `.nb-composer-ask` |
| A4 | `nbrise` | `4518` | `.nb-detail-editor`, `.nb-rise` |
| A5 | `nbup` | `4322` | `.nb-up` |
| A6 | `nbtoastout` | `4508` | Toast exit |
| A7 | `.nb-actions-column` / `.nb-actions-restore` | `4174-4177` | Actions column collapse — opacity + translate + visibility |
| A8 | `.nb-nav-brand/-item/-membership` | `4130` | The nav drawer's own contents |

**Group B — content fades in *inside* a surface that already arrived.**

| # | Mechanism | Where | What it does |
|---|---|---|---|
| B1 | `nbnotchgroupin` | `4455` | The composer's staggered content cascade |
| B2 | `nb-list-enter` | `4327` | List items entering |
| B3 | `.nb-cell` | `4304` | Ribbon and month cells, gated on `mounted` |
| B4 | `.nb-timeline-chrome-inner` | `4590` | Chrome content while the header collapses |
| B5 | `.nb-app-surface>*` | `4148` | A blanket `opacity 150ms` on every child of the page surface |

**Group C — two states of one element cross-fade.**

| # | Mechanism | Where | What it does |
|---|---|---|---|
| C1 | `nbnotchlabelout` + `.nb-morph-source-label` | `4457`, `4456` | The trigger's label handing over to the sheet |
| C2 | `.nb-edit-face` | `4501` | Read face ↔ edit face |
| C3 | `.nb-chip-fill` | `4504` | Multi-select chip fill |

**Group D — opacity that is not an arrival, and should mostly stay.**

`turnnext` / `turnprev` (`4318`/`4320`, `.4→1` on a day turn — a dim, not an appearance);
`.nb-tap` (`4235`); the global pressable rule (`4543`); `.nb-timeline-lane` (`4551`);
`nbrw` / `nbp` / `nbb` (`4522`/`4520`/`4524`, reward and blink effects);
`.nb-action-complete-overlay` (`4360`, already clip-path led).

**Group E — React-driven opacity.** Seventeen sites. Two kinds, and the distinction
decides everything:

- **Semantic dimming — keep.** `status === "completed" ? 0.45 : 1`, `past ? 0.74 : 1`,
  `held && gesture.overDay ? 0.35 : 1`. These encode *state*, not motion. Removing them
  would delete meaning.
- **Arrival gates — replace.** `mounted ? 1 : 0` (`4304`-driven ribbon/month/now-line),
  `expanded ? 1 : 0` (the ⌘K hint), `more ? 1 : 0`, `editing ? 1 : 0` / `? 0 : 1`,
  `overdueReviewOpen ? 1 : 0`, `dx > 20 ? 1 : 0` (swipe affordances), `on ? 1 : 0`.

### Why A1 is the whole game

`nbfluid` is not a design choice — it is the fallback the morph system falls into. The
sheet grows from its trigger only when `recentFluidTriggerRect()` (`453`) returns a rect,
which requires a `pointerdown` within `FLUID_TRIGGER_MAX_AGE_MS` (900ms) on something
matching `button,[role='button'],summary,label,[data-event-id],[data-task-chip]`, and any
`keydown` clears it (`451`).

So every sheet opened by keyboard, by command palette, by a timer, by first run, or from a
control outside that selector list gets the generic fade. **Widening how an origin is
established removes more fades than rewriting any single animation**, because it converts
A1 from a common path into a rare one.

### The dependency that constrains everything

`4602-4607` — under `prefers-reduced-motion` *and* the in-app reduced-motion preference,
the app **deliberately replaces movement with a fade**:

```
.nb-fluid,.nb-msheet,.nb-timeline-chrome-inner,.nb-morph-source-label{transition:opacity 160ms ease!important}
```

That is correct and must survive. WCAG's non-animation fallback is a cross-fade; a user who
asked for less motion must not be given a sliding card instead. **Every replacement below
is scoped to the full-motion path only.** If a de-fade lands globally, reduced motion loses
its only fallback and the change becomes an accessibility regression.

### Test coupling

Roughly 58 assertion sites reference the fades, concentrated in two files:

| Spec | Sites |
|---|---|
| `tests/e2e/motion.spec.js` | 28 |
| `tests/e2e/actions.spec.js` | 15 |
| `tests/e2e/timeline-polish.spec.js` | 8 |
| `tests/e2e/reveal-without-paint.spec.js` | 3 |
| `tests/e2e/note-templates.spec.js` | 2 |
| `tests/e2e/audit-harden.spec.js`, `interaction-feedback.spec.js` | 1 each |

`reveal-without-paint.spec.js` is the sharp one: it pins the `mounted` gate (E) and exists
because a paint-callback-gated reveal once left the ribbon permanently blank. Any change to
B3 must keep that guarantee — content must be *visible* without depending on an animation
having run.

---

## Requirements

| ID | Requirement |
|---|---|
| R1 | No surface arrives or departs by changing opacity on the full-motion path. |
| R2 | Every surface that has a measurable origin grows from it; every surface without one enters from a screen edge. |
| R3 | Content inside an arriving surface is revealed by clip, not by fading. |
| R4 | Cross-fades between two states of one element become wipes. |
| R5 | Semantic dimming (completed, past, drag-held) is untouched. |
| R6 | The reduced-motion fade fallback still applies, and still fades. |
| R7 | Nothing's *visibility* depends on an animation having run. |
| R8 | No layout property is animated (shared-layout PRD §7.2). |

---

## Key Technical Decisions

**KTD1 — Widen origin capture before rewriting any animation.**
A1 is a fallback, not a style. Every sheet that gains a real origin stops fading for free,
and the morph it gets instead is the one already built and tested. This is the highest
leverage change in the plan and it touches ~15 lines.

**KTD2 — Three replacement idioms, chosen by what the surface knows about itself.**

| The surface… | Gets | Mechanism that already exists |
|---|---|---|
| …was opened by a pressable with a rect | **Morph from trigger** | `fluidMorphFromRects` + `clip-path: inset()` + `data-fluid-origin="notch"\|"trigger"` |
| …has no origin (keyboard, palette, first run, system) | **Edge slide** | `translateY(100%)` off its own edge — percentage, so it adapts to height |
| …is a persistent region toggling in place | **Inset reveal** | The drawer's `--nav-page-scale` / `.nb-app-surface` transform |

**KTD3 — Clip is the reveal, everywhere.**
`clip-path: inset()` is already the app's idiom (`nbnotchin`, `.nb-action-complete-overlay`).
It composites, it never animates layout, and it reads as material being uncovered rather
than material appearing. Group B and Group C both become clips.

**KTD4 — Keep the scrim's fade (A2).**
A scrim is not a surface; it is an absence of light. There is nowhere for it to slide from,
and wiping darkness across the screen reads as a shutter, not a dimming. This is the one
Group A item that keeps its opacity, and the exception should be written down so it is not
"fixed" later.

**KTD5 — Reduced motion keeps every fade.**
Scope all changes under the full-motion path. `4602-4607` stays exactly as it is.

---

## High-Level Technical Design

```
                       does the surface know where it came from?
                                        │
                  ┌─────────────────────┴─────────────────────┐
                 yes                                          no
                  │                                            │
        a pressable rect within 900ms                  keyboard / palette /
        (recentFluidTriggerRect)                       first-run / system
                  │                                            │
        ┌─────────┴─────────┐                                  │
   is it accent-filled?     │                                  │
        │                   │                                  │
       yes                 no                                  │
        │                   │                                  │
   NOTCH morph        TRIGGER morph                       EDGE SLIDE
   clip + wash        clip from rect                 translateY(100%) → 0
   + label handover                                   no opacity at all
        └─────────┬─────────┘                                  │
                  └──────────────────┬───────────────────────-─┘
                                     │
                        content revealed by clip sweep
                        (replaces nbnotchgroupin)
```

Reduced motion short-circuits the whole diagram to the existing 160ms opacity rule.

---

## Scope Boundaries

**In scope:** Groups A (except A2), B, C, and the arrival-gate half of E.

**Not in scope:** Group D, semantic dimming in E, the scrim (KTD4), and the reduced-motion
block. `turnnext`/`turnprev` stay — a day turn dimming to `.4` and back is a state change on
a surface that never left.

### Deferred to Follow-Up Work

- `.nb-app-surface>*` (B5) is a blanket rule over every child of the page surface; auditing
  what actually depends on it is its own change.
- The flaky `view-pills.spec.js:145` and the desktop chrome regression at
  `timeline-chrome-scroll.spec.js:34` are separate live issues, not part of this.

---

## Implementation Units

### U1. Give more sheets an origin so the fallback stops firing

**Goal:** Cut how often A1 runs, without touching A1 itself.

**Requirements:** R1, R2. Implements KTD1.

**Files:** `src/Planner.jsx` (`437-462`), `tests/e2e/motion.spec.js`

**Approach:**
1. Widen the `closest()` selector at `443` to include the controls that currently miss —
   anything with `data-morph-source`, and the palette rows.
2. Keep the 900ms window and the keyboard clear (`451`): a keyboard-opened sheet *should*
   have no origin. That is deliberate, documented, and correct — it is why the command
   palette does not fly out of whatever was last clicked.
3. Add a **declared** origin for sheets that have a sensible anchor but no press: let a
   caller pass an explicit origin rect rather than relying on the global snapshot.

**Verification:** count the sheets that still land on `data-fluid-origin` unset. Each
remaining one is either keyboard-opened (correct) or a candidate for U2.

### U2. Replace the generic fade with an edge slide

**Goal:** A sheet with genuinely no origin slides from its own edge instead of fading up.

**Requirements:** R1, R2. Implements KTD2.

**Dependencies:** U1.

**Files:** `src/Planner.jsx` (`4366`, `4389`), `tests/e2e/motion.spec.js`

**Approach:**
Rewrite `nbfluid` to `translateY(100%) → 0` with no opacity term, and `nbfluidout` as its
exact reverse. Percentages, not pixels, so the distance is the sheet's own height at any
size. The scrim (A2) continues to fade underneath, which is what makes an opaque slide read
as arrival rather than as a jump.

**Test scenarios:**
- A palette-opened sheet has `opacity: 1` on its first frame.
- Its transform starts at a full self-height offset and ends at zero.
- Under reduced motion it still fades, per `4602`.

### U3. Reveal composer content by clip instead of cascade

**Goal:** Retire `nbnotchgroupin` (B1) in favour of a clip sweep.

**Requirements:** R3, R7, R8. Implements KTD3.

**Dependencies:** U2.

**Files:** `src/Planner.jsx` (`4455`, the `--nb-stage` block), `tests/e2e/motion.spec.js`

**Approach:**
Replace the per-group opacity stagger with a single `clip-path: inset(0 0 100% 0) → inset(0)`
sweep down the body, on the morph's own clock. One animation instead of eight, no element
ever below full opacity, and the content is revealed by the same mechanism as the container.

**Execution note:** this unit directly contradicts a live constraint in
`docs/superpowers/plans/2026-08-17-framer-fidelity-motion.md` ("do not delete
`nbnotchgroupin`"). That constraint was written to stop content being made *opaque from
frame 0*, which is not what this does — a clip still withholds the content until the shape
has somewhere to land. **Reconcile with that plan before starting**; do not simply overrule it.

**Test scenarios:**
- No element inside the sheet is below full opacity at any point.
- Content is still not fully *visible* at 40% of the morph — the wait is preserved.
- `motion.spec.js`'s existing timing assertions are updated to measure the clip, and each
  is seen failing before it passes.

### U4. Wipe the label handover and the face swaps

**Goal:** C1, C2, C3 become clips.

**Requirements:** R4. Implements KTD3.

**Dependencies:** U3.

**Files:** `src/Planner.jsx` (`4456-4457`, `4501`, `4504`)

**Approach:**
The trigger label (C1) currently cross-fades with the sheet beneath it. Wipe it instead —
`inset()` from the side the sheet is growing toward, so the label is consumed by the surface
rather than dissolving over it. `.nb-edit-face` and `.nb-chip-fill` take the same treatment,
which is what `.nb-action-complete-overlay` (`4360`) already does successfully.

### U5. Slide the Actions column and the nav contents

**Goal:** A7 and A8 stop fading.

**Requirements:** R1, R2. Implements KTD2.

**Dependencies:** U2.

**Files:** `src/Planner.jsx` (`4130`, `4174-4177`)

**Approach:**
Both already translate; they simply also fade. Remove the opacity term and let the transform
plus `visibility` do the work — the column slides fully out past its own edge rather than
half-sliding and dissolving. `visibility` still needs its delayed toggle so the hidden
column cannot take focus.

The nav contents (A8) are the case the user pointed at: the drawer already exposes a dark
inset frame on all sides. Its items should ride that reveal, not fade in on top of it.

### U6. Make the load reveal a clip, and keep it fail-visible

**Goal:** B3 and the `mounted` gate stop being an opacity switch.

**Requirements:** R3, R7.

**Dependencies:** U3.

**Files:** `src/Planner.jsx` (`4304`, the `mounted` sites), `tests/e2e/reveal-without-paint.spec.js`

**Approach:**
Ribbon and month cells sweep in by clip. **The resting state must remain visible without any
animation having run** — that is the guarantee `reveal-without-paint.spec.js` exists to hold,
after a paint-gated reveal once left 56 cells permanently blank. Prefer `@starting-style` so
the entrance is an enhancement the browser applies, never a gate JavaScript must open.

**Test scenarios:**
- With `requestAnimationFrame` neutralised, every ribbon cell is fully visible.
- The same for the month grid.
- No cell's resting style depends on a class or flag set by JS.

### U7. Retire the remaining arrival fades

**Goal:** A3, A4, A5, A6, B2, B4 and the arrival gates in E.

**Requirements:** R1, R3, R5.

**Dependencies:** U2, U3.

**Files:** `src/Planner.jsx` (`4322`, `4327`, `4484`, `4507`, `4512`, `4517`, `4590`)

**Approach:**
Each takes whichever idiom fits: toasts slide out the edge they slid in from (symmetry is
what makes swipe-to-dismiss legible); list items (B2) wipe rather than fade; the chrome
inner (B4) is already inside a height collapse, so its opacity term is redundant and can
simply go.

**Leave every semantic dimming in E untouched.** Auditing that boundary is part of this unit,
not an afterthought: a completed task at `0.45` is information.

---

## Verification Contract

| Gate | Command |
|---|---|
| Unit | `npm test` |
| Browser | `npx playwright test` |
| No-fade sweep | Re-run the parser in "Sources" and diff the inventory against this document |

**Kill the preview server before any full run.** `playwright.config.js` sets
`reuseExistingServer: !CI` with `npm run build && vite preview` as the command, so a server
already on port 4321 makes Playwright skip the build and test a stale bundle. Three runs
were wasted on this during the analysis.

Visual confirmation at 390, 768 and 1280, in a light and a dark theme, with reduced motion
both off and on.

---

## Definition of Done

- Every Group A (except A2), B and C mechanism is gone or converted (R1, R3, R4).
- Each converted surface either grows from a trigger or slides from an edge (R2).
- Semantic dimming is byte-for-byte unchanged (R5).
- `4602-4607` is unchanged and reduced motion still cross-fades (R6).
- `reveal-without-paint.spec.js` passes with rAF neutralised (R7).
- No `transition` or `@keyframes` added by this work names a layout property (R8).
- Both suites green on a freshly built bundle.

---

## Risks

**Reduced motion is the trap.** Six of these units would be an accessibility regression if
applied globally. Every unit must land scoped to the full-motion path, and the reduced-motion
block should be asserted, not assumed.

**U3 contradicts a live plan.** Codex's `2026-08-17-framer-fidelity-motion.md` forbids
deleting `nbnotchgroupin`. The clip approach arguably satisfies that constraint's *intent*
while breaking its letter. That is a conversation to have before writing code, not after.

**Opacity is load-bearing in more places than it looks.** Group E mixes motion with meaning
in the same property. The audit in U7 is the risky part of this plan, not the animation work.

**A slide can cost more than a fade.** `translateY` composites, but a full-height opaque
sheet sliding over a busy timeline repaints more than a fade does. Measure on the 6× CPU
throttle harness already used for the pill A/B before assuming the swap is free.

---

## Sources & Research

Inventory produced by parsing `src/Planner.jsx` at `9d38f75` — brace-matched keyframe bodies
tested for `opacity:`, plus rule-level and JSX-level greps. `src/index.css` contains no
animation. Re-run to verify:

```bash
node -e 'const s=require("fs").readFileSync("src/Planner.jsx","utf8");const re=/@keyframes\s+([A-Za-z0-9_-]+)\s*\{/g;let m;while((m=re.exec(s))){let i=re.lastIndex,d=1;while(i<s.length&&d>0){if(s[i]==="{")d++;else if(s[i]==="}")d--;i++;}const b=s.slice(re.lastIndex,i-1);const o=b.match(/opacity\s*:\s*[^;}]+/g);if(o&&new Set(o).size>1)console.log(m[1],"::",o.join(" | "));}'
```

At `9d38f75` that prints 15 keyframes. **It undercounts by one:** it requires two distinct
opacity values, so `nbtoastout` — which declares only `opacity: 0` and fades from an implicit
`1` — does not appear even though it is a real fade. Treat the command as a regression check
against this document's table, not as the table's source. The transition-level and
JSX-level fades in Groups B, C, D and E are not covered by it at all.
