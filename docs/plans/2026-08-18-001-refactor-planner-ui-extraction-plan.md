---
title: Finish ADR 0001 — extract the UI layer out of Planner.jsx
type: refactor
status: proposed
date: 2026-08-18
origin: docs/adr/0001-domain-oriented-modular-monolith.md
graph: graphify-out/graph.json (built from 4ee3222, 1394 nodes / 4587 edges)
---

# Finish ADR 0001 — extract the UI layer out of Planner.jsx

## The short version

The refactor does not need to be invented. **ADR 0001 is Accepted, its domain half
is essentially finished, and its `ui/` half has not been started.** This plan
sequences the remaining half by risk. Nothing here proposes a new architecture.

---

## 1. Diagnosis (from the knowledge graph, not from impressions)

### The concentration

| Measure | Value |
| --- | --- |
| `src/Planner.jsx` | **9,470 lines** |
| Next largest file in the repo | 452 lines (`features/planner/quickAdd.js`) |
| Total `src/` | 27,252 lines across 210 modules |
| Planner's share of all source | **35%** |
| Other 209 modules, average | ~85 lines |

One file is 21× the next largest. Every other module in the repo is already small.

### Inside the file

| Region | Lines | Contents |
| --- | --- | --- |
| L1–828 | 828 | 55 imports, ~24 icon components, constants, small helpers |
| L829–6504 | **5,675** | `Planner()` — a single React function |
| └ L4115–4784 | 670 | the entire motion `<style>` block, *inside* the render return |
| L6504–9470 | 2,966 | ~40 further React components |

`Planner()` contains **224 hook calls in one function**:

```
79 useState · 53 useRef · 36 useEffect · 26 useMemo · 25 useCallback · 5 useLayoutEffect
```

### Graph evidence

- `Planner()` is the top god node at **189 edges** — the next is 90 (`addDaysToKey`).
- BFS depth 2 from `Planner()` reaches **597 of 1394 nodes (43% of the graph)**.
- The graph identifies **109 definitions inside `Planner.jsx`**, ~63 of them React
  components.
- **Zero import cycles detected** across the whole repo.

### What is already healthy — do not touch it

The domain layer is done and well-tested. Against the ADR's target tree:

```
OK       app, domains/{calendar,tasks,notes,planner,reminders,gamification,search}
OK       platform/persistence, shared/time
MISSING  ui/{primitives,patterns,themes}          ← the entire remaining gap
MISSING  platform/{notifications,integrations,telemetry}   ← deferred provider work, not in scope
MISSING  shared/{recurrence,validation,types}     ← content lives elsewhere and works; not in scope
```

`src/features/planner/` holds 19 extracted modules and **every single one has a
paired `.test.js`**. That is the proven pattern. But only **2 of them are `.jsx`**
(`SegmentedProgress`, `TimelineActionCard`) — the extraction so far has been
logic-only. **No presentational component has ever been moved out.** That is
precisely the work remaining.

### The governing instructions already on disk

`docs/spec/structure.md`:

- "Do not grow `Planner.jsx`."
- "Visible React surface → `src/features/*/Foo.jsx` **for now; later `src/ui/...`
  once that tree exists**."
- "Do not put markup in the 8k-line Planner composition root."
- **"Planner remains the composition root: state, wiring, and existing surfaces."**

That last line is a constraint, not an aspiration: **the plan must not try to
dissolve `Planner()`.** State and wiring are supposed to live there.

ADR 0001 also **explicitly rejected** a "technical-layer split" into
`components/hooks/services/utils`. Extraction must stay organised by domain and
surface, never by mechanism. There must be no `src/hooks/` folder.

### Two facts that make this unusually safe

1. **`Planner.jsx` has exactly one importer** — `src/main.jsx`, a default import.
   Its public surface is one symbol, so internal restructuring cannot break a caller.
2. **No import cycles.** Extractions cannot create tangles that are not visible.

---

## 2. Phase 0 — Build the safety rig first

Do not move a single line before this phase is complete.

### 0.1 Record the real baseline

The suite is **not** all-green, and treating it as green is how a refactor gets
blamed for pre-existing failures.

```bash
npm test && npx playwright test
```

Expected, and verified by stash-comparison on 2026-08-18:

- **583 unit / 0 fail**
- **292 browser / 4 fail**, and the four are always:
  - `planning.spec.js:64` — untimed actions, dragged onto the timeline
  - `timeline-chrome-scroll.spec.js:34` — phone projection
  - `timeline-chrome-scroll.spec.js:34` — desktop projection
  - `view-pills.spec.js:145` — page slide / compact pill curve

### 0.2 Know the two traps that produce false results

- **`planning.spec.js` has cross-spec localStorage bleed.** In full runs a *fifth*
  failure appears and rotates (`:30` and `:198` both seen); it passes in isolation.
  **Never accept a new `planning.spec.js` failure without re-running that file alone.**
- **Playwright's `reuseExistingServer: !CI`** means a live server on port 4321 makes
  it skip the build and test a *stale bundle*. Kill 4321 before any full run. A dev
  server on another port is fine.

### 0.3 Add the size ratchet — make `structure.md` executable

`structure.md` says "do not grow `Planner.jsx`" but nothing enforces it. Add a unit
test that fails if the file grows:

```js
// src/Planner.size.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* structure.md says "do not grow Planner.jsx". This makes that executable.
   Ratchet only downwards: when an extraction lands, lower CEILING to the new
   count. Raising it requires deleting this test and arguing for it in review. */
const CEILING = 9470;

test("Planner.jsx does not grow", () => {
  const lines = readFileSync(new URL("./Planner.jsx", import.meta.url), "utf8").split("\n").length;
  assert.ok(lines <= CEILING, `Planner.jsx is ${lines} lines, ceiling is ${CEILING}`);
});
```

This is the single highest-value artefact in the plan: it converts a written rule
into a gate, and it makes every subsequent phase self-verifying.

### 0.4 Coordinate with Codex

Codex works in this repo and owns
`docs/superpowers/plans/2026-08-17-framer-fidelity-motion.md`. **Phase 3 (the motion
style block) collides with that work directly.** Agree ownership before starting
Phase 3, or defer Phase 3 until Codex's motion work has landed.

---

## 3. The rules that keep this from breaking anything

These are non-negotiable and matter more than the sequence.

1. **A move commit moves. It never edits.** Never rename, reformat, "tidy while
   I'm here", or change a prop signature in the same commit as a relocation. If the
   diff shows anything but relocated lines plus import/export lines, split it.
2. **Verify purity mechanically.** After each extraction, the moved text should be
   identical to the deleted text. Check it, do not eyeball it:
   ```bash
   git show HEAD --unified=0 -- src/Planner.jsx | grep '^-' | grep -v '^---' | sed 's/^-//' > /tmp/removed.txt
   git show HEAD --unified=0 -- src/ui/ | grep '^+' | grep -v '^+++' | sed 's/^+//' > /tmp/added.txt
   diff <(sed 's/[[:space:]]//g' /tmp/removed.txt) <(sed 's/[[:space:]]//g' /tmp/added.txt)
   ```
   Only import lines and the export statement should differ.
3. **One component per commit** in Phases 2 and 4. Not batches. A 40-component
   batch that goes red tells you nothing about which one did it.
4. **Full suite between commits, compared to the Phase 0 baseline** — not to zero.
5. **Lower the ratchet in the same commit** as the extraction that earned it.
6. **Motion surfaces get a visual check, not just a green suite.** The motion work
   this month produced two regressions that every test passed through. For anything
   touching `Sheet`, `Composer`, the style block, or the morph: open it in a browser
   and look before pushing.

### The build traps specific to this file

- **Backticks inside a CSS comment break the build.** The style block is a JS
  template literal; a backtick in a comment terminates it. This has broken the build
  **three times**. Phase 3 is where it will happen again.
- **A stray `*/` from an incomplete comment edit is worse than a build error** — it
  can leave keyframes silently unparsed while the build *succeeds*. If an animation
  mysteriously does nothing, enumerate `document.styleSheets` and confirm the rule
  parsed.
- **JSX comments inside `return (`** produce a white screen. Comments go above the
  `return` as ordinary JS comments.

---

## 4. Phases, ordered by ascending risk

### Phase 1 — Constants and icons → `src/ui/primitives/` *(risk: none)*

Creates the `ui/` tree the ADR calls for.

- `src/ui/primitives/icons.jsx` — the ~24 icon components (`CalendarIcon`,
  `CheckIcon`, `ChevronIcon`, `ClockIcon`, `CloseIcon`, `BellIcon`, `BlockIcon`,
  `GripIcon`, `LinkIcon`, `ListIcon`, `LocationIcon`, `MenuIcon`, `MoreIcon`,
  `PinIcon`, `RepeatIcon`, `SearchIcon`, `WarningIcon`, `ArrowRightIcon`,
  `ArrowUpIcon`, `ExternalLinkIcon`, `UiIcon`, …). Pure SVG, no props beyond size
  and colour, no state, no imports from Planner.
- `src/ui/primitives/constants.js` — `CAT_COLOR`, `CATS`, `DAY_LETTERS`, `WD`,
  `WD1`, `MO`, `REPEATS`, `ALERT_CHOICES`, `SHORTCUTS`, `VIEW_ORDER`.

**Expected reduction: ~260 lines. Behaviour surface: zero.**

Move `src/design/` under `src/ui/themes/` **only if** you want the ADR tree exactly;
`design/` already does that job and the move touches 4 files plus their importers
for no functional gain. Recommended: leave it, and note the alias in `structure.md`.

---

### Phase 2 — Leaf presentational components → `src/ui/primitives/` *(risk: low)*

Props in, JSX out. No hooks beyond local `useState` for their own field.

`Pill`, `Chips`, `Row`, `RowWithJoin`, `DetailRow`, `InlineField`, `InlineChoice`,
`InlineChoiceRow`, `Inline`, `InlineText`, `InlineNative`, `InlineStamp`,
`InlineAdd`, `LabeledNative`, `TagField`, `NewListField`, `Reveal`, `LiquidFill`,
`LiquidPillIndicator`, `GooeyFilter`, `GooeySearch`, `QuickAddHint`, `DurationPicker`.

One per commit. `Pill` already has a tested collaborator in
`features/planner/editorRowSpan.js` — extract `Pill` first and let it prove the
pattern, since `editor-rows.spec.js` already covers its geometry.

**Expected reduction: ~700–900 lines.**

---

### Phase 3 — The motion style block → `src/ui/themes/plannerMotion.js` *(risk: medium — coordinate with Codex)*

670 lines (L4115–4784) currently sit inside the render return, so the whole CSS
string is rebuilt on every render.

It is **not** static — it interpolates `MORPH_MS`, `MORPH_LEAD`, `MORPH_STEP`,
`MORPH_FADE`, the theme `T`, and `preferences?.display.reducedMotion`. So it
extracts as a **function**, not a constant:

```js
export function plannerMotionCss({ T, preferences }) { return `…`; }
```

Do this as its own commit, and:

- run the full `motion.spec.js` (36 tests) plus `reveal-without-paint.spec.js`,
- **look at the composer morph in a browser** — this is the surface that produced
  two regressions this month that a green suite did not catch,
- verify the keyframes actually parsed:
  ```js
  [...document.styleSheets].flatMap(s=>{try{return[...s.cssRules]}catch{return[]}}).filter(r=>r.name?.startsWith('nb')).length
  ```

**Expected reduction: ~670 lines, and one render-cost win.**

---

### Phase 4 — Composite surfaces → `src/ui/patterns/` *(risk: medium)*

These own local state and take substantial props. Ordered smallest-blast-radius
first, with the spec that guards each:

| Component | Lines | Guarded by |
| --- | --- | --- |
| `TaskCard` | 206 | `actions.spec.js`, `checklist.spec.js` |
| `ActionsPanel` | 232 | `actions.spec.js` |
| `Composer` | 287 | `composer.spec.js`, `hud-create.spec.js`, `motion.spec.js` |
| `Sheet` | 308 | `motion.spec.js`, `editor-rows.spec.js` |
| `WeekGrid` | 587 | `week-drag.spec.js`, `timeline-*.spec.js` |
| `Agenda`, `NoteEditor`, `NoteBlock`, `CommandPalette`, `ShortcutSheet`, `NotebookPanel`, `EventScheduleEditor`, `SubComposer`, `PromotedSubtasks`, `EntityNotes`, `NoteHistory`, `PillNav`, `NavigationShell`, `FluidEditActions` | ~1,300 total | various |

`Sheet` and `Composer` carry the morph. Treat them like Phase 3: look, don't just measure.

**Expected reduction: ~2,800 lines.**

---

### Phase 5 — `Planner()`'s own state *(risk: high — reassess before starting)*

**Recommendation: stop after Phase 4 and re-evaluate.**

`structure.md` says Planner *remains the composition root: state, wiring, and
existing surfaces*. After Phases 1–4, Planner.jsx is ~4,000–4,800 lines of exactly
that, which is what the spec asks for. Phase 5 is optional and is the only phase
that can change behaviour by accident.

If pain justifies it, the 79 `useState`s group cleanly along domain lines — and
these must be extracted **per domain**, never into a `hooks/` bucket the ADR rejected:

| Group | State |
| --- | --- |
| Boot / persistence | `db`, `recoverySnapshot`, `ready`, `loadingSlow`, `mounted`, `notebookUnreadable`, `saveBlocked` |
| Time & navigation | `now`, `zoom`, `dateKey`, `ribbonRange`, `ribbonWindowStart`, `monthCursor`, `peekDay` |
| Sheets & editing | `sheet`, `inspect`, `inspectExitSnapshot`, `composer`, `sheetCloseSignals`, `noteEdit`, `noteHistory`, `detailEditing`, `inspectField`, `discardAsk`, `draft` |
| View & motion | `turn`, `swipe`, `viewDir`, `slide`, `slideProgress`, `sliding`, `taskSwipe`, `snapping`, `navPhase`, `viewMode`, `viewHandoff` |
| Timeline | `timelineFocused`, `timelineFocusSource`, `timelineChromeHeight`, `streamNode`, `dayHourHeight` |
| Feedback | `alertToast`, `reward`, `levelFlash`, `undo`, `undoShown`, `alertShown`, `levelShown` |
| Reminders | `reminderRecords`, `remindersReady`, `missedReport`, `missedSheet` |
| Ledgers & prefs | `preferences`, `motivationLedger`, `diagnostics`, the three `*SaveBlocked`, `storageFailures` |

The **View & motion** group is the most cohesive and the most self-contained — start
there if you start at all. Every one of these is guarded by an existing e2e spec,
which is the only reason Phase 5 is tractable at all.

---

## 5. Expected outcome

| After | `Planner.jsx` | Cumulative risk |
| --- | --- | --- |
| today | 9,470 | — |
| Phase 1 | ~9,200 | none |
| Phase 2 | ~8,400 | low |
| Phase 3 | ~7,700 | medium (motion) |
| Phase 4 | ~4,900 | medium |
| Phase 5 *(optional)* | ~2,000 | high |

**Phases 1–4 remove ~48% of the file and honour every constraint in `structure.md`
without touching a single hook.** That is the recommended stopping point.

---

## 6. What this plan deliberately does not do

- **Does not move `src/domains/`, `src/shared/`, or `src/platform/`.** They are done
  and healthy. Churning them buys nothing and risks a lot.
- **Does not create `src/hooks/`, `src/components/`, or `src/utils/`.** ADR 0001
  explicitly rejected the technical-layer split.
- **Does not add `platform/{notifications,integrations,telemetry}`.** Those are for
  provider work the ADR explicitly deferred; empty folders are not progress.
- **Does not dissolve `Planner()`.** `structure.md` says it stays the composition root.
- **Does not renumber, rename, or reorganise the e2e specs.** `structure.md`
  forbids it, and they are the safety net this entire plan rests on.

---

## 7. Open questions for the owner

1. **Codex coordination on Phase 3** — should the motion style block wait until the
   framer-fidelity work lands, or is that file free?
2. **`src/design/` → `src/ui/themes/`** — exact ADR compliance, or leave it and note
   the alias? (Recommendation: leave it.)
3. **Phase 5** — take it, or stop at Phase 4? (Recommendation: stop, reassess.)
