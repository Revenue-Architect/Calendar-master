---
title: Finish the extraction out of Planner.jsx
type: refactor
status: active
date: 2026-08-18
revised: 2026-08-18 (rewritten against the tree after the motion extraction landed)
origin: docs/adr/0001-domain-oriented-modular-monolith.md
---

# Finish the extraction out of Planner.jsx

## What changed in this revision

The first draft of this plan targeted `src/ui/{primitives,patterns,themes}` straight
from ADR 0001, and assumed nothing was in flight. Both were wrong:

- **`structure.md` prescribes an interim step this plan skipped.** It says visible
  React surfaces go to `src/features/*/Foo.jsx` **"for now; later `src/ui/...` once
  that tree exists"**. The first draft quoted that line and then proposed jumping
  straight to `src/ui/`. The work that actually landed used `src/features/motion/`,
  which is what the spec asks for. **This plan now targets `src/features/*`.**
- **An extraction was already underway** and is half-finished. Phases below are
  reordered to finish it before starting anything new.

## The finding that reframes everything

Three commits titled *"extract X from Planner"* removed **zero** lines from Planner:

```
9470   4ee3222  (before)
9470   1bbabf7  refactor(motion): extract morph timing, fluid trigger, stylesheet, and Sheet
9470   7548c11  refactor(motion): extract Sheet from Planner
...
9616   HEAD     (now)
```

They copied code into new files and never deleted the originals or added the
imports. Planner has since grown to 9,616 — **net +146 during a refactor meant to
shrink it.**

The second half of an extraction — *delete the original, wire the import* — is the
half that produces the benefit, and it is the half that was skipped.

### Current wiring state

| Module | Imported outside its folder? | Planner still has its own | Tests |
| --- | --- | --- | --- |
| `features/motion/fluidGeometry.js` | **yes** | — | 5 |
| `features/motion/viewPills.js` | **yes** | — | 8 |
| `features/motion/navPageFit.js` | **yes** | — | ✓ |
| `features/motion/progressGeometry.js` | **yes** | — | ✓ |
| `features/motion/morphTiming.js` | **no** | `MORPH_MS`, `MORPH_LEAD`, `MORPH_STEP`, `MORPH_FADE` | 3 |
| `features/motion/fluidTrigger.js` | **no** | `recentFluidTriggerRect` + helpers | 6 |
| `features/motion/Sheet.jsx` | **no** | 370-line `Sheet`, **drifted 134 lines** | 0 |

Nine unit tests currently pass against code the app never runs. That is worse than
dead code, because it reads as coverage. `Sheet.jsx` is the live hazard: a fix
applied to it changed nothing until an e2e test caught the mistake.

`docs/spec/structure.md:22` already points at `src/features/motion/` as the home for
the sheet morph, fluid trigger and planner stylesheet — so the spec currently
describes code that does not run. It also names `plannerStyles.js`, which was never
created.

---

## Phase 0 — the ratchets *(done — `src/architecture.test.js`)*

Two executable rules, both allowed to move one direction only:

1. **`Planner.jsx` does not grow.** Ceiling 9,616. `structure.md` said "do not grow
   Planner.jsx" and nothing enforced it; had this existed, `9470 → 9470` on a commit
   named "extract Sheet from Planner" would have been a visible non-event and
   `9470 → 9616` a hard failure.
2. **No module under `src/features/` is left unimported.** Carries an explicit
   `UNWIRED` allowlist of the three known-dead modules. The list may only shrink;
   wiring one up and forgetting to remove it from the list also fails.

The second ratchet has already paid for itself: it corrected a hand-written grep
that reported five dead modules when only three are. The grep was line-based and
these are multi-line imports.

**Every phase below ends by lowering a ratchet in the same commit.**

---

## Phase 1 — finish the motion extraction *(in progress)*

One module per commit, smallest first. Each commit: delete Planner's copy → add the
import → run the guarding spec → lower the ratchet.

| # | Module | Moves out of Planner | Guarded by |
| --- | --- | --- | --- |
| 1.1 | `morphTiming.js` | 4 constants, no logic | `motion.spec.js` |
| 1.2 | `fluidTrigger.js` | `recentFluidTriggerRect` + radius/fill helpers | `motion.spec.js` |
| 1.3 | `Sheet.jsx` | the 370-line `Sheet` | `motion.spec.js`, `editor-rows.spec.js`, `composer.spec.js` |

**1.3 is not a move — it is a merge.** Planner's copy is *newer*: it gained
`heightMeasureFrame`, `lastSheetHeight` and first-paint sizing that the extracted
file never received. Port that forward into `features/motion/Sheet.jsx` first, verify
the two are equivalent, *then* swap the import and delete Planner's copy. Doing it in
the other direction silently reverts a fix.

Expected: Planner 9,616 → ~9,150.

---

## Phase 2 — the stylesheet → `features/motion/plannerStyles.js`

The `<style>` block is ~670 lines living inside the render return, rebuilt on every
render. `structure.md` already names this file; it does not exist.

Not static — it interpolates `MORPH_MS`, the theme `T`, and
`preferences?.display.reducedMotion`. So it extracts as a **function**, not a constant:

```js
export function plannerStyles({ T, preferences }) { return `…`; }
```

**Highest-risk-of-typo step in the plan.** A backtick inside a CSS comment terminates
the template literal and breaks the build — that has happened three times. Worse, a
stray `*/` can leave keyframes silently unparsed while the build *succeeds*; if an
animation mysteriously does nothing, enumerate `document.styleSheets` and confirm the
rule parsed.

Coordinate with Codex before starting — this is their active area.

Expected: Planner ~9,150 → ~8,480.

---

## Phase 3 — icons and constants → `features/planner/`

- `icons.jsx` — ~24 pure SVG components, no props beyond size/colour, no state.
- `constants.js` — `CAT_COLOR`, `CATS`, `DAY_LETTERS`, `WD`, `WD1`, `MO`, `REPEATS`,
  `ALERT_CHOICES`, `SHORTCUTS`, `VIEW_ORDER`.

Zero behaviour surface. Expected: ~8,480 → ~8,220.

---

## Phase 4 — leaf presentational components → `features/planner/`

Props in, JSX out, no hooks beyond their own field state: `Pill`, `Chips`, `Row`,
`RowWithJoin`, `DetailRow`, `InlineField`, `InlineChoice`, `InlineChoiceRow`,
`Inline`, `InlineText`, `InlineNative`, `InlineStamp`, `InlineAdd`, `LabeledNative`,
`TagField`, `NewListField`, `Reveal`, `LiquidFill`, `LiquidPillIndicator`,
`GooeyFilter`, `GooeySearch`, `QuickAddHint`, `DurationPicker`.

Start with `Pill` — `editor-rows.spec.js` already covers its geometry via
`editorRowSpan.js`, so the first one is guarded before it moves.

Expected: ~8,220 → ~7,400.

---

## Phase 5 — composite surfaces → `features/planner/`

Smallest blast radius first: `TaskCard` (206), `ActionsPanel` (232), `Composer`
(287), `WeekGrid` (587), then `Agenda`, `NoteEditor`, `NoteBlock`, `CommandPalette`,
`ShortcutSheet`, `NotebookPanel`, `EventScheduleEditor`, `SubComposer`,
`PromotedSubtasks`, `EntityNotes`, `NoteHistory`, `PillNav`, `NavigationShell`,
`FluidEditActions`.

Expected: ~7,400 → ~4,600.

---

## Phase 6 — `Planner()`'s own state *(reassess before starting)*

**Recommendation: stop after Phase 5.** `structure.md` says Planner *remains the
composition root: state, wiring, and existing surfaces*. After Phase 5 it is ~4,600
lines of exactly that.

If pain justifies it later, the 79 `useState`s group along domain lines — and must be
extracted **per domain**, never into a `hooks/` bucket, which ADR 0001 explicitly
rejected. The **view & motion** group is the most self-contained; start there or not
at all.

---

## Phase 7 — `src/ui/` *(deferred, and possibly never)*

ADR 0001's target tree names `ui/{primitives,patterns,themes}`. `structure.md` makes
`features/*` the interim home "until `src/ui/` exists". Once Phases 3–5 are done,
decide whether renaming `features/planner/*` to `ui/*` buys anything beyond ADR
literalism. It is a pure move with a large diff and no behaviour change — cheap to do
late, pointless to do early.

`src/design/` (themes, typography, contrast) already does `ui/themes`' job. Leave it.

---

## The rules that keep this from breaking anything

1. **A move commit moves. It never edits.** No renaming, reformatting, or "tidy while
   I'm here" in the same commit as a relocation.
2. **Verify purity mechanically** — diff the removed text against the added text;
   only imports and the export line should differ.
3. **One module per commit.** A batch that goes red tells you nothing.
4. **Compare to the real baseline, not to zero.** The suite is not all-green.
5. **Lower the ratchet in the same commit** as the extraction that earned it.
6. **Motion surfaces get looked at, not just measured.** Two regressions this month
   passed a green suite. For anything touching `Sheet`, `Composer`, the stylesheet or
   the morph: open it in a browser.
7. **Kill port 4321 before a full run** — `reuseExistingServer` will otherwise test a
   stale bundle.

### Test baseline

597 unit / 0 fail. ~297 browser / 2–4 fail, all from a known set:
`planning.spec.js:64`, `timeline-chrome-scroll.spec.js:34` (both projections), and
`navigation-shell.spec.js:298`, which is timing-sensitive and flakes roughly one run
in three. `planning.spec.js` also has cross-spec localStorage bleed — re-run that file
alone before believing any new failure in it.

---

## Known open item, not in scope here

**Mobile nav first-frame cost.** Opening the nav costs ~100ms on the first frame at
6× CPU throttle (~60ms on later opens), and it is *not* any of the animations:
measured with the clip transition off, the content fade off, the drawer motion off,
and with all surface motion off, the cost stays in the same 91–127ms band. React
render is 2ms. `will-change` on the rail and on the surface both failed to move it,
as did `contain`. It is the style recalc and repaint triggered by the nav-open state
change propagating across the whole app subtree — `data-nav-state` lives on
`.nb-nav-shell`, which wraps both the drawer and the entire app, so every selector
keyed off it invalidates everything.

The plausible fix is to scope that invalidation (move the open-state flag off the
shared ancestor), which collides with Codex's nav work and with tests that read
`data-nav-state`. Needs its own plan.
