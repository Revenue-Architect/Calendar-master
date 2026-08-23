# Handoff — Calendar-master, 19 Aug 2026

> **Superseded for state by `docs/plans/HANDOFF-2026-08-23.md`.** The State,
> baseline and nav-stutter sections below describe a tree from four sessions ago
> — `Planner.jsx` is 5,545 lines now, and the stutter has since been re-profiled.
> Everything from "Read this before you move any code" down is still the
> reference for environment traps and working agreements.


Read this, then `docs/plans/2026-08-18-001-refactor-planner-ui-extraction-plan.md`.

---

## State

- **`main` is clean and pushed. Phase 5 is complete and on it.**
- `Planner.jsx` is **5,571 lines**, down from 9,616 four sessions ago and from
  7,625 at the start of this one.
- **Every React component is out of `Planner.jsx`.** What is left is the
  composition root `structure.md` describes: `Planner()` itself (4,925 lines,
  235 hook calls), four hooks and five helpers.
- **600 unit / 0 fail. 299 browser / 2 fail** — measured this session on this
  branch, against a `main` baseline of 298 / 3 measured the same day.
- **Three ratchets** in `src/architecture.test.js`, all one-directional. The line
  ceiling is **5,571**. Lower them; never raise one quietly.

**Phases 2, 3, 4 and 5 are done. Phase 6 is reassessed as "do not start" — see
the plan, and the nav stutter section below, which is the one question worth
answering before anyone reconsiders that.**

---

## Read this before you move any code

**A green build and a green unit suite do not mean an extraction worked.** This
project has had the same failure three times:

| When | What was lost | Cost |
| --- | --- | --- |
| Phase 1.3 | `MONO` import | 46 browser tests |
| Phase 4 | `parseInline`, `rowSpan` from `fields.jsx` | **133 browser tests — the app crashed on first render** |

Both built cleanly. Both passed every unit test. Vite bundles an undefined
identifier without complaint, and no unit test renders Planner.

### Three things that are now mandatory

**1. The scope ratchet** in `src/architecture.test.js` fails if a module under
`src/features/` uses a name from Planner's module scope without importing it.
Narrow by design: free identifiers only, not properties, not object keys, not
hyphenated CSS custom properties.

**Prove it against your own module before trusting it.** In this session that
meant deleting `navigation.jsx`'s `MONO` import, watching the ratchet fail with
`features/planner/navigation.jsx uses MONO`, and restoring it.

**2. Check the export *form*, not just the name.** Three modules moved this
session are **default** exports — `PillNav`, `SegmentedProgress`, `Reveal`. A
tool can tell you which names a module needs; it cannot tell you whether each is
default or named. **A named import of a default export builds green and is
`undefined` at runtime.** That is the Phase 4 crash exactly, and it nearly
recurred three times here. Open the module and look.

**3. Load the built app and read the console.** The only check that catches this
class. Build to a **separate `--outDir`** so it does not fight a suite run:

```bash
npx vite build --outDir dist-smoke --emptyOutDir
npx vite preview --outDir dist-smoke --port 4330 --strictPort
```

Then a throwaway Playwright script asserting `pageerror` and `console.error` are
empty, `document.body.innerText` lacks `SOMETHING BROKE`, and — the part that
matters — **that the specific thing you moved still paints**. This session's
probes read the hour-row pitch (68px = `HOUR_H`), `--accent-lit` / `--accent-deep`
(`mixHex`), the label colour on the accent (`isDark`), and the clock strings.

`vite preview` serves `dist/` from disk, so building into `dist/` while a suite
is running silently swaps the bundle under it. A separate directory is what lets
you smoke-test and run specs at the same time.

### If you write your own guard

**Never build a pattern inside a template literal.** Three separate bugs of this
one shape now:

- The scope ratchet's first version went through `node -e` and nested JS strings,
  which ate the backslashes: `[\w$]` became `[w$]`, matching identifiers one
  letter at a time. Deaf while appearing green.
- A browser probe's regexes arrived as `d{1,2}` instead of `\b\d{1,2}`, and
  reported the clock was not rendering. It was.
- The move tool's own "is this name declared here?" check used
  ``new RegExp(`… ${name}\b`)``, where **`\b` in a template literal is a
  backspace character, not a word boundary**. It matched nothing, and looked
  correct.

Use **regex literals** (`/\r(?!\n)/`), which are safe, or plain string
containment. Then **`grep` the written file for the pattern before running it** —
that is what caught all three. And give every probe a **control assertion** that
proves it can still fail, in the same run.

**When a new probe goes red, suspect the probe first — then prove which it was.**
Three probes failed in this session and all three were the probe: a mangled
regex, an `isDark` threshold picked too tight, and an hour-pitch check that read
`gaps[0]` when the first row sits against the scroll boundary. None was the app.
Do not wave a red probe through, and do not assume the worst either.

### CRLF, which will bite any script that writes a file

This is a CRLF checkout (`core.autocrlf=true`; git stores LF, so the "LF will be
replaced by CRLF" warning on every commit is normal). A `split("\n")` /
`join("\n")` move script emits a **lone `\r`** wherever it adds a blank line, and
`sed`/`awk` in this Git Bash silently normalise CRLF, so the damage is invisible
to every obvious check.

Split and join on `\r\n` explicitly, and assert on the bytes:

```js
(text.match(/\r(?!\n)/g) || []).length   // must be 0
```

**Splice multiple ranges highest-first** so the lower range keeps its indices.

Also: `node` here reads `/c/Users/...` as `C:\c\Users\...` — use `C:/Users/...`
in Node paths. And a script in a scratchpad **cannot resolve `@playwright/test`**;
copy it into the repo to run, then delete it.

### An `export` block beats an `export` keyword

Several modules keep their moved lines **byte-identical** and add a trailing
`export { … };` block, the way `constants.js` already did. Editing `export` onto
each declaration makes every moved line differ and destroys the sha256 proof for
no gain.

### Prove the move mechanically

Extract the removed text and the added text and compare sha256 — and read the
removed text back out of **`git show HEAD:file`**, not out of your own script's
memory, so the proof does not depend on the thing it is proving.

---

## What Phase 5 moved

Eighteen commits, each browser-verified **before** it was committed.

| Module | Contents | Lines |
| --- | --- | --- |
| `features/planner/navigation.jsx` | the whole nav cluster | 223 |
| `features/planner/WeekGrid.jsx` | `WeekGrid` | 578 |
| `features/planner/Composer.jsx` | `Composer` | 284 |
| `features/planner/ActionsPanel.jsx` | `ActionsPanel` | 229 |
| `features/planner/notes.jsx` | five notebook surfaces + 2 helpers | 207 |
| `features/planner/TaskCard.jsx` | `TaskCard` | 203 |
| `features/planner/commandSurfaces.jsx` | `CommandPalette`, `ShortcutSheet` | 96 |
| `features/planner/detailEditor.jsx` | `EventScheduleEditor`, `FluidEditActions` | 68 |
| `features/planner/Agenda.jsx` | `Agenda` | 59 |
| `features/planner/subtasks.jsx` | `PromotedSubtasks`, `SubComposer` | 51 |

Plus six blocker groups that had to go first: `shared/time/clockFormat.js`,
`shared/time/snap.js`, `design/colorMix.js`, `features/planner/dateLabels.js`,
five geometry constants into `features/planner/constants.js`, and `uid` into
`shared/ids.js`.

### The lessons worth carrying

**Do the blockers first and the composites stop being interesting.** `WeekGrid`
is the largest component in the app and it moved in one cut with no mid-move
discoveries, because six of its ten imports had already been relocated. The
blocker work *is* the phase.

**Recon what the blockers themselves need**, not just what the composites
reference: `startSlot` needs `snapTo` needs `SNAP`; `fmtDay` needs `WD`, `MO`
and `pad`; `uid` is `createId`.

**Two of the plan's own groupings were wrong.** `fmtDay` cannot live in
`shared/time/` — it formats through label arrays in `features/`, and `shared`
must not import from `features`. And `design/colorMix.js` must **not** be merged
into `contrast.js` next door: `isDark` is not `luminance()` with a threshold, it
applies Rec.709 coefficients to raw sRGB bytes where `luminance` gamma-corrects
first, so the two disagree in the midtones and swapping them would repaint text
on some of the fifteen themes. That reasoning is recorded in the module header.

**Orphaned comments are a compounding cost of extraction.** Four were found and
repaired: one whose constant (`NOW_LABEL_CLEARANCE_MIN`) was deleted in August,
and three describing `Pill`, `DetailRow` and `Agenda` left behind by Phase 4.
Each was traced to the commit that introduced it and read off the declaration
that followed it there, then reunited with its component or removed. **A comment
left behind does not stay neutral; it silently re-attaches to whatever follows
it.** Check above and below every cut.

### Tools worth rebuilding

The scripts were throwaway, but two earned their keep: a spec-driven mover that
proves byte-equality and refuses to leave a declaration behind, and an
"imports-for-these-line-ranges" tool that traces every free identifier back to
the Planner import statement that provides it. The second is what made
`WeekGrid` a single sitting — but it reports **names, not export forms**.

---

## The nav stutter — the plan's claim is now testable, and its premise moved

The plan says Phase 5 is the fix for the nav stutter: ~85ms of script per frame,
profiled with the Long Animation Frame API, because toggling the nav re-renders
the whole of `Planner()`.

**Two things changed and neither has been re-measured.**

1. Phase 5 is done, so the component boundaries that argument depended on exist.
2. **The mechanism the original diagnosis blamed is already gone.** That profile
   was taken when Planner was ~9,553 lines and owned the nav phase. On 18 Aug,
   commit `72b5ee8` ("Synchronize navigation drawer motion", from the Replit
   Agent) introduced `NavigationFrame`, which owns `phase` itself and takes the
   planner as `children`. React does not re-render `children` passed by a parent
   when only the wrapper's state changes, and the one other thing the toggle
   calls — `onPress={() => beep("click")}` — is a `useCallback` over Web Audio
   that sets no state.

**Do not record the stutter as fixed. Nobody has re-profiled it.** What is
established is that the old numbers were taken against a different component
tree and cannot be compared to anything measured today. Re-run the LoAF trace
before claiming a fix or attempting one.

One weak positive signal, offered as a signal only: `navigation-shell.spec.js:298`
asserts an animation delta under 35ms, sits directly on top of the documented
stall, and **passed** in this branch's final run — having failed on the `main`
baseline measured the same day. It is load-sensitive, so one run proves nothing.

Note also that **`React.memo` was never blocked by file layout.**
`NavigationShell` was already its own component before it moved; extracting to a
module does not create a boundary that did not exist. What *would* defeat `memo`
there is the call site, which builds six inline arrow props on every render.

Still true, still not worth repeating: every CSS lever was measured and
rejected — `will-change` on the rail and the surface, `contain: layout paint` on
both, each animation disabled in turn, all surface motion off, resting clip
pre-rounded, no rounded corner when open. Every one stayed inside the same
73-127ms band.

---

## Test baseline — measure it, never inherit it

Measured this session, same machine, same day:

| | passed | failed | wall clock |
| --- | --- | --- | --- |
| `main` at `e5d161d` | 298 | 3 | 10.7m |
| this branch, final | **299** | **2** | 9.8m |

The branch's two are `planning.spec.js:64` and `view-pills.spec.js:145`, both
from the pool below. `navigation-shell.spec.js:298` failed on the baseline and
passed here.

**Both the count and which ones vary. Treat the pool as the baseline, not a
number.** Every version of this document that listed a fixed set has been wrong.

| Spec | Behaviour |
| --- | --- |
| `planning.spec.js:64` | fails in every full run measured; fails alone too |
| `view-pills.spec.js:145` | fails alone; races a 340ms window |
| `navigation-shell.spec.js:298` | varies; **fails 4 of 5 in isolation** |
| `interaction-feedback.spec.js:41` | failed on an earlier machine's runs; passed here |
| `planning.spec.js:132` | cross-spec localStorage bleed; passes alone |
| `actions.spec.js:708` | **new to this list.** Failed once, in one full run: a toast from an earlier spec intercepted the click on the ACTIONS tab. Passes alone, passes its whole file, passes the exact two-spec ordering that produced it, and passed the final run. Cross-spec bleed, same family as `planning.spec.js:132` |

### Load contaminates this suite, badly

One branch run reported **8 failures**, including four `view-pills` cases and a
`typography` case that are in nobody's pool. That run took **14.0m against a
10.7m baseline** — 32% slower — because two `vite build`s and several Chromium
instances were running alongside it. Re-run clean, they all passed.

**Before believing any new failure, check the wall-clock time of the run.** If it
is materially slower than the run you are comparing against, you measured the
machine, not the code. This is the cheapest lie-detector this suite has.

### Other traps that produce false readings

- **Kill port 4321 before a full run.** `reuseExistingServer` otherwise serves a
  stale bundle.
- **Do not pipe the run through `tail`.** It buffers, so the log stays empty for
  ten minutes and you cannot watch progress. Redirect to a file instead.
- **`test-results/` is your early warning** — one directory per failure appears
  while the run is still going. 133 of them is how Phase 4's crash was caught
  before its run finished.
- **A hidden Chrome tab freezes animation clocks** (`currentTime` never
  advances, `setTimeout` still fires).
- **The in-app browser pane may not composite**, so `screenshot` times out.
  Drive Playwright directly and write PNGs to disk.
- **Dismiss the welcome sheet first**:
  `[data-test="sheet"][data-sheet-title="Welcome"]`, button `START EMPTY`, then
  the `gesture-hint` if present. `tests/e2e/helpers.js` has the canonical flow —
  copy it rather than guessing at button names.
- Outside the Playwright config, call `selectors.setTestIdAttribute("data-test")`
  or `getByTestId` looks for `data-testid` and silently matches nothing.

---

## Constraints

- **`docs/adr/0001`** (Accepted) owns the target tree. **`docs/spec/structure.md`**
  is the ownership map and outranks any plan. It already covered every
  destination this phase used; no update was needed.
- ADR 0001 **rejected** a `components/hooks/services/utils` split — but it
  rejects mechanism-named *folders with no owner*. `features/planner/constants.js`
  is fine: it sits inside a folder that has one.
- **Planner stays the composition root.** It is now 4,925 lines of exactly the
  state and wiring `structure.md` assigns to it.
- **Codex, the Replit Agent, and commits authored as `Revenue-Architect` all
  land in this repo.** `git fetch` before assuming your push will go through —
  and see the nav stutter section for what happens when you do not check whether
  someone else already fixed the thing your plan is built around.
- Duplicates deliberately kept: `DAY_LETTERS` in `eventToIcs.js`; `MINUTE_MS` in
  two neighbouring files; and now `hexToRgb`/`isDark` against `contrast.js`'s
  `parseHex`/`luminance`, for the reason given above.

---

## Working agreements that earned their place

- **Look, don't just measure.** Every real defect this month was found by
  putting a frame on screen. The Composer move was verified by opening the sheet
  and reading it: one screenshot exercised `PillNav`, `fmtDay`, `fmtTime`, `dur`,
  `DurationPicker`, `Chips`, `catColor` and `startSlot` at once.
- **Baseline before blaming, and measure it yourself.** Every "regression" so
  far has been pre-existing, load, or a broken probe.
- **Watch every new guard fail** against the behaviour it is meant to catch,
  with the tree left untouched.
- **A move commit moves. It never edits.** Prove it by sha256, reading the
  removed text out of `git show HEAD:file`.
- **Prefer reverting to patching under uncertainty.**
- **Profile before optimising — and re-profile before trusting a profile.**
- The commit messages are the real design document here. `git log` is worth
  reading; this phase's eighteen messages carry the reasoning that did not fit
  in the code.
