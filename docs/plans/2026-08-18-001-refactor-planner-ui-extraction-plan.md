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

1. **`Planner.jsx` does not grow.** Ceiling 8,513 (lowered by 1.1, 1.2, 1.3 and both halves of 2). `structure.md` said "do not grow
   Planner.jsx" and nothing enforced it; had this existed, `9470 → 9470` on a commit
   named "extract Sheet from Planner" would have been a visible non-event and
   `9470 → 9616` a hard failure.
2. **No module under `src/features/` is left unimported.** Carries an explicit
   `UNWIRED` allowlist, now down to `Sheet.jsx` alone. The list may only shrink;
   wiring one up and forgetting to remove it from the list also fails.

The second ratchet has already paid for itself: it corrected a hand-written grep
that reported five dead modules when only three are. The grep was line-based and
these are multi-line imports.

**Every phase below ends by lowering a ratchet in the same commit.**

---

## Phase 1 — finish the motion extraction *(complete)*

One module per commit, smallest first. Each commit: delete Planner's copy → add the
import → run the guarding spec → lower the ratchet.

| # | Module | Moves out of Planner | Guarded by |
| --- | --- | --- | --- |
| ~~1.1~~ | ~~`morphTiming.js`~~ **done** | 4 constants + 2 stage fractions that were magic numbers | `motion.spec.js` |
| ~~1.2~~ | ~~`fluidTrigger.js`~~ **done** | state, both accessors, and the pointerdown/keydown listeners | `motion.spec.js` |
| ~~1.3~~ | ~~Sheet.jsx~~ **done** | the 370-line Sheet, merged forward from Planner | motion, editor-rows, composer |

**1.3 is not a move — it is a merge.** Planner's copy is *newer*: it gained
`heightMeasureFrame`, `lastSheetHeight` and first-paint sizing that the extracted
file never received. Port that forward into `features/motion/Sheet.jsx` first, verify
the two are equivalent, *then* swap the import and delete Planner's copy. Doing it in
the other direction silently reverts a fix.

Planner 9,616 → **9,184**. Phase 1 complete; UNWIRED is empty.

---

## Phase 2 — the stylesheet → `features/motion/plannerStyles.js` *(complete)*

The `<style>` block is ~670 lines living inside the render return, rebuilt on every
render. `structure.md` already names this file; it does not exist.

Not static — it interpolates `MORPH_MS`, the theme `T`, and
`preferences?.display.reducedMotion`. So it extracts as a **function**, not a constant:

```js
export function plannerStyles({ T, preferences }) { return `…`; }
```

### Recon (done — execute against these numbers)

- The block is **`Planner.jsx` lines 3975–4620, 646 lines**, from `<style>{` to `</style>`.
- It has **37 interpolations across only 12 roots**: `Array` and `n` (a local inside an
  `Array.from` callback, stays put), `T` and `preferences` (become parameters), and
  `MONO`, `MORPH_MS`, `MORPH_LEAD`, `MORPH_STEP`, `MORPH_FADE` (already shared, just
  import them), leaving exactly three that still live in Planner as one-liners:

  | Constant | Line | Value | Belongs in |
  | --- | --- | --- | --- |
  | `VIEW_SLIDE_MS` | 319 | `300` | `features/motion/morphTiming.js` |
  | `NOW_RED` | 324 | `"var(--now-red, #C43A56)"` | `design/themes.js` (a colour token) |
  | `DISPLAY` | 375 | `"var(--font-display)"` | `design/typography.js`, beside `MONO` |

So the signature is `plannerStyles({ T, preferences })` with five imports, and the
three constants move first — exactly the way `MONO` moved during 1.3.

**Move it with a script, not by hand.** The typo warning below assumes retyping; a
byte-exact programmatic move of lines 3975–4620 has no typo risk at all, and that is
the difference between this being dangerous and being mechanical.

**Verify by comparing parsed CSS, not by eye.** Before and after, count and hash the
rules the browser actually parsed:

```js
[...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
  .map(r => r.cssText).join("\n").length
```

Identical length and rule count is the proof the move was faithful. This matters
because a stray `*/` can leave keyframes unparsed while the build still *succeeds* —
and because a missing import is invisible to Vite: during 1.3 a dropped `MONO` import
built cleanly and took out 46 e2e tests at runtime.

A backtick inside a CSS comment terminates the template literal and breaks the build.
That has happened three times; leave the comments byte-identical and it cannot recur.

Coordinate with Codex before starting — this is their active area.

Expected: Planner 9,184 → ~8,540.

### Outcome

Landed as two commits, the constants first exactly as scoped:

- `VIEW_SLIDE_MS` → `morphTiming.js`, `NOW_RED` → `themes.js`, `DISPLAY` →
  `typography.js` (which took the three-voices comment with it; `SERIF` stays in
  Planner). 9,184 → 9,165.
- The block itself, 646 lines, moved by script. 9,165 → **8,513**, past the estimate
  because six imports went with it: the four morph beats the stylesheet used, plus
  `MORPH_STAGE_CONTENT` and `MORPH_STAGE_REVEAL`, which had been dead since 1.3 moved
  the stage machine into `Sheet.jsx` and left Planner's import behind.

The recon numbers were exact — 646 lines, 37 interpolations, 12 roots, all three
constants where the plan said. Nothing was discovered mid-move.

Four checks, cheapest first, and the order is worth keeping:

1. The template came out at 51,909 bytes and went in at 51,909 bytes, compared
   programmatically. That is rule 2 satisfied mechanically rather than by reading.
2. The module run under `node` against a `Proxy` theme, both reduced-motion branches
   and with `preferences` absent. No undefined identifier — the 1.3 failure caught in
   a second, without a browser.
3. The parsed-CSS comparison the plan asks for: 214 rules / 89,403 characters across
   every sheet, 160 / 26,906 for this block, identical digests, identical rule lists.
4. Looked at: desktop, mobile, the open nav, the palette.

Check 2 is the one to add to the recipe. It is the fastest of the four and it closes
the exact hole that cost 46 e2e tests during 1.3.

---

## Phase 3 — icons and constants → `features/planner/` *(complete)*

- `icons.jsx` — ~24 pure SVG components, no props beyond size/colour, no state.
- `constants.js` — `CAT_COLOR`, `CATS`, `DAY_LETTERS`, `WD`, `WD1`, `MO`, `REPEATS`,
  `ALERT_CHOICES`, `SHORTCUTS`, `VIEW_ORDER`.

Zero behaviour surface. Expected: 8,513 → ~8,250.

### Outcome — 8,513 → **8,389**, not ~8,250

Two move commits plus one de-duplication. The estimate was optimistic in two ways
worth carrying into Phase 4's number:

- **There are 21 icons, not ~24 — but they are 106 lines**, because each carries the
  comment that says why it is drawn rather than typed. Counting components
  underestimates a block that is mostly prose.
- **Imports cost lines back.** 158 lines left Planner; 35 returned as two multi-line
  import blocks, for a net 124. The house style puts long import lists one name per
  line (see the three-name `taskCompleteUndo` import), so this is not recoverable by
  reformatting, and Phase 4's ~820-line estimate should expect the same ~20% haircut.

Both moves were byte-exact and verified as such: icons 4,790 bytes and constants
3,069 bytes across six separate ranges, same sha256 either side.

`catColor` moved with `CAT_COLOR` — one name beyond the list above. It is the only
reader of that table, so leaving it would have meant importing a colour map into
Planner to define a one-line accessor over it. `CARD_R`, `HOUR_H`, the `RIBBON_*`
window, `SNAP`, `HOLD_MS` and `SWIPE_SOFT_LIMIT` stayed: they are Planner's own layout
and gesture numbers, not vocabulary.

`constants.js` is not the mechanism bucket ADR 0001 rejects. That rejection names
top-level `components`/`hooks`/`services`/`utils` folders, whose problem is having no
owner. This file sits inside `features/planner/` and has one.

### A trap this phase found: generated files and CRLF

The working tree is a CRLF checkout. A move script that joins lines with `"\n"` after
`split("\n")` will emit a **lone `\r`** wherever it adds a blank line, and it happened
at two different boundaries here. `sed` and `awk` in this Git Bash silently normalise
CRLF, so the corrupted file *looks* correct in every obvious check.

Assert on the bytes instead, in any script that writes a file:

```js
const loneCR = (text.match(/\r(?!\n)/g) || []).length;   // must be 0
```

### Duplicates found, and what was decided

- **`Sheet.jsx`'s own `CloseIcon`** — hand-inlined, same path and attributes.
  **Removed**; Sheet now imports the shared one. That introduces the first
  `features/motion` → `features/planner` import, taken deliberately: the alternative
  was keeping a second copy of a visual primitive in the one file whose header already
  records what a second copy cost last time.
- **`DAY_LETTERS` in `eventToIcs.js`** — identical values, **left alone on purpose.**
  That one is the RFC 5545 `BYDAY` token set; ours is a row of UI labels. They match
  today by coincidence, they have different reasons to change, and merging them would
  point `domains/` at `features/` and invert the layering.
- **`MINUTE_MS = 60_000`** in both `shared/time/localDateTime.js` and `timezone.js` —
  **left alone.** A third module to share one stable literal costs more than it saves.

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

### Recon (done — execute against these numbers)

**The 23 components are 515 lines, not ~820.** With import blocks costing lines back
at the Phase 3 rate, the realistic landing is **8,389 → ~7,900**, not ~7,400. Set the
ratchet by what actually lands; do not chase the old figure by moving something that
should stay.

They are not a contiguous block — they run from line 6001 (`Inline`) to 8348
(`Chips`), interleaved with composites that belong to Phase 5. Five are big enough to
deserve their own commit: `GooeySearch` (70), `InlineChoice` (56), `InlineText` (54),
`InlineChoiceRow` (52), `Chips` (41). The other eighteen average 12 lines.

**Four of them are not free-standing. Move these first, or the components cannot go:**

| Blocker | Needed by | Where it should go |
| --- | --- | --- |
| `CARD_R` | `Pill`, `RowWithJoin`, `InlineField`, `InlineChoice` | `features/planner/constants.js` — but note 48 uses across Planner |
| `useLiquidPill` (L7342) | `Chips`, `InlineChoice`, `InlineChoiceRow`, `LiquidPillIndicator` | beside its consumers in `features/planner/`. **Not** a `hooks/` bucket — ADR 0001 rejects that |
| `SERIF` (L336) | `QuickAddHint` | `design/typography.js`, beside `DISPLAY` and `MONO`. Planner's own comment already says the three belong together |
| `dur` (L372) | `DurationPicker` | a duration formatter; goes with the component or to `shared/` |

**`DurationPicker` should move in Phase 5, not Phase 4.** It renders `PillNav`, which
is a Phase 5 composite, so it is not a leaf. Moving it now would either drag `PillNav`
along early or create a forward dependency on a component still sitting in Planner.

`CARD_R` is the one to think about rather than reflex. It was deliberately left in
Planner during Phase 3 as a layout number rather than vocabulary, and 48 uses is a
wide blast radius. Promoting it is still probably right — a card's corner radius is a
shared design fact, and four leaf components now need it — but it is a decision, and
it belongs in its own commit before any component moves.

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

**599 unit / 0 fail. 301 browser / 2 fail**, measured either side of Phase 2 on the
same machine rather than remembered:

| Spec | Full run | Alone | Reading |
| --- | --- | --- | --- |
| `interaction-feedback.spec.js:41` | fails | — | pre-existing; **not in any earlier list** |
| `planning.spec.js:64` | fails | fails | pre-existing, long-standing |
| `planning.spec.js:132` | varies | passes | the localStorage bleed below |
| `view-pills.spec.js:145` | varies | **fails** | pre-existing, order-sensitive |

`timeline-chrome-scroll.spec.js:34` and `navigation-shell.spec.js:298` — previously
recorded as five of six known failures — **passed in both full runs.** The older list
was wrong in both directions, which is the argument for measuring a baseline at the
start of a session rather than inheriting one.

Two order effects, and they run in opposite directions, so neither "it passed alone"
nor "it passed in the suite" is on its own evidence of anything:

- **`planning.spec.js` has cross-spec localStorage bleed.** A different case fails in
  full runs each time and passes alone. Re-run the file alone before believing a new
  failure in it.
- **`view-pills.spec.js:145` fails alone and passes in some full-suite orderings.** It
  samples `transition-timing-function` on `.nb-view-track` while the class that sets
  it is transiently applied, so it is racing a 340ms window. Confirmed unrelated to
  Phase 2 by checking it out at the commit before the move, where it fails the same
  way. Unowned.

---

## The nav stutter is a symptom of the monolith

Profiled with the Long Animation Frame API rather than guessed at. The expensive
first frame of a mobile nav open is **not paint and not CSS** — it is ~85ms of
JavaScript:

| frame | duration | script | style+layout | named invoker |
| --- | --- | --- | --- | --- |
| 1 | 86ms | **79ms** | 2ms | `MessagePort.onmessage` — React's concurrent scheduler |
| 2 | 91ms | **86ms** | 0ms | `DIV#root.onclick` |
| 3 | 97ms | 13ms | 78ms | rAF |

Toggling the nav re-renders the whole of `Planner()`. At 9,553 lines with 224
hook calls in one function there are no child component boundaries, so the entire
render function re-runs for a state change that visually affects a drawer and one
class. React's scheduler splits it across two frames; both are ~85ms of script.

This is why every CSS lever failed. Measured and rejected, so nobody repeats them:
`will-change` on the rail and on the surface, `contain: layout paint` on both,
the clip-path transition off, the content opacity fade off, the drawer and label
motion off, **all surface motion off**, resting clip pre-rounded, and no rounded
corner when open. Every one stayed inside the same 73–127ms band.

**The fix is Phase 5.** Extracting composite surfaces creates the component
boundaries that `React.memo` needs; today there is nothing to memoise because
there are no components. Until then a nav toggle will always pay for re-rendering
the timeline, the actions panel and everything else that did not change.

A cheaper interim exists — apply the open class imperatively via `navShellRef` so
the animation starts on the next frame while React's render happens behind it, or
wrap `setPhase` in `startTransition` so the render yields. Both are real changes
to the composition root in Codex's active area, and the nav e2e probes are
currently flaking, so neither should be attempted casually.
