# Handoff — Calendar-master, 19 Aug 2026

Read this, then `docs/plans/2026-08-18-001-refactor-planner-ui-extraction-plan.md`.

---

## State

- **`main` clean and pushed.** Phases 2, 3 and 4 are all on it; the
  `claude/phase-2-…` branch was merged and deleted.
- **600 unit / 0 fail. 301 browser / 2 fail** — measured this session, not inherited.
- `Planner.jsx` is **7,625 lines**, down from 9,616 three sessions ago.
- **Three ratchets** in `src/architecture.test.js`, all one-directional: a line
  ceiling, a rule that no module under `src/features/` is left unimported, and a scope
  check described below. Lower them; never raise one quietly.

---

## Read this before you move any code

**A green build and a green unit suite do not mean an extraction worked.** This
project has now had the same failure three times:

| When | What was lost | Cost |
| --- | --- | --- |
| Phase 1.3 | `MONO` import | 46 browser tests |
| Phase 4 | `parseInline`, `rowSpan` from `fields.jsx` | **133 browser tests — the app crashed on first render** |

Both built cleanly. Both passed every unit test. Vite bundles an undefined identifier
without complaint, and no unit test renders Planner, so nothing between the edit and
the browser can see it.

The third occurrence is the instructive one, because it happened *while following a
document that warned about the first two*. Byte-exactness was proven, the ratchet was
lowered, the commit message was careful — and the app was dead. Every check that
passed was incapable of catching it.

### Two things are now mandatory after any move

**1. The scope ratchet.** `src/architecture.test.js` fails if a module under
`src/features/` uses a name from Planner's module scope without importing it. It
covers both halves of that scope: the ~292 names Planner *imports* and the ~69 it
*declares*. Losing either looks identical at runtime.

It is narrow by design. It matches free identifiers only — not properties
(`item.dur`), not object keys (`dur:`), not hyphenated strings such as the CSS custom
property `--nb-morph-dur`. All three produced false positives on entirely correct
modules the first time it ran.

**2. Load the built app and read the console.** Fifteen seconds, and the only check
that actually catches this class:

```bash
npm run build && npx vite preview --port 4322 --strictPort
```

Then, in a throwaway Playwright script, assert that `pageerror` and `console.error`
are both empty and that `document.body.innerText` does not contain `SOMETHING BROKE` —
the ErrorBoundary's copy. Do this **before** committing, not after.

### If you write your own guard

The first version of that ratchet was written through `node -e` and nested JS string
literals, which ate the backslashes: `[\w$]` silently became `[w$]`, so it matched
identifiers one letter at a time. It was deaf while appearing green, and shipped in
one commit before being caught.

Write generated code through a **quoted shell heredoc**, never through nested string
escaping. And prove a new guard fails against the bug it is meant to catch before
trusting it — remove the import again and watch it go red. A guard that has only ever
been seen passing has not been tested.

---

## Phases 2, 3 and 4 are done. Phase 5 is next.

- **Phase 2** — the stylesheet is `features/motion/plannerStyles.js`. 9,184 → 8,513.
- **Phase 3** — 21 icons in `features/planner/icons.jsx`, ten constants in
  `features/planner/constants.js`. 8,513 → 8,389.
- **Phase 4** — all 23 leaf components out. 8,389 → **7,625**.

### What Phase 4 actually taught

**Do the dependency recon before moving anything.** Three things had to move first —
`SERIF` → `design/typography.js`, `CARD_R` → `features/planner/constants.js`,
`useLiquidPill` → `features/motion/liquidPill.js`. Knowing that up front meant
twenty-two components then moved with no mid-move discoveries at all.

**Group by concept; do not make one file per component.** Twenty-two components became
five modules — `rows.jsx`, `fields.jsx`, `liquid.jsx`, `gooey.jsx`, and
`motion/Reveal.jsx` — because that is how Planner already grouped them. A directory of
twenty-two eight-line files would be worse than the monolith.

**Scope recon to the whole file, not to the thing you are moving.** `dur` looked like
`DurationPicker`'s private helper when the search was scoped to leaf components. It has
14 call sites across Planner and now lives in `shared/time/duration.js`. An earlier
draft of this document claimed 131 uses — that counted `.dur`, the duration property on
an event, which is a different thing entirely.

**Estimates in the plan run ~20% optimistic.** They count components, but the lines are
mostly the comments explaining them, and import blocks give lines back.

### CRLF, which will bite any script that writes a file

This is a CRLF checkout. A `split("\n")` / `join("\n")` move script emits a **lone
`\r`** wherever it adds a blank line, and removing the *last* block in a file leaves a
trailing one. `sed` and `awk` in this Git Bash silently normalise CRLF, so the damage
is invisible to every obvious check. It happened at three separate boundaries.

Assert on the bytes in any script that writes a file:

```js
(text.match(/\r(?!\n)/g) || []).length   // must be 0
```

`sed -i` also rewrites a whole file's endings to LF. Harmless — git stores LF either
way — but it makes anchor matching in later scripts fail confusingly.

---

## Phase 5 — composite surfaces

`TaskCard` (206), `ActionsPanel` (232), `Composer` (287), `WeekGrid` (587), then
`Agenda`, `NoteEditor`, `NoteBlock`, `CommandPalette`, `ShortcutSheet`,
`NotebookPanel`, `EventScheduleEditor`, `SubComposer`, `PromotedSubtasks`,
`EntityNotes`, `NoteHistory`, `NavigationShell`, `FluidEditActions`.

`PillNav` already moved, so the composites that render it are unblocked.

These are far larger than Phase 4's leaves and will have more blockers. Find them the
same way: for each component, list the Planner-scope names it references, move those
first, and only then move the component.

**Phase 5 is also the fix for the nav stutter** — see below.

---

## Test baseline — measure it, never inherit it

**301 browser tests, 2 failures per full run.** But *which* two varies, and every
version of this document that listed a fixed set has been wrong.

| Spec | Behaviour |
| --- | --- |
| `planning.spec.js:64` | fails in every run measured; fails alone too |
| `view-pills.spec.js:145` | failed 3 runs, passed 1; fails alone; races a 340ms window |
| `navigation-shell.spec.js:298` | passed 3 runs, failed 1 — but **fails 4 of 5 in isolation** |
| `interaction-feedback.spec.js:41` | failed on an earlier machine's runs, passed on all of this session's |
| `planning.spec.js:132` | cross-spec localStorage bleed; passes alone |

`navigation-shell.spec.js:298` is worth understanding before blaming yourself for it.
It asserts an animation delta **< 35ms**, sitting directly on top of the documented
~85ms React re-render stall. Measured either side of Phase 4 with `--repeat-each=5`:
**4 of 5 failures on both**, so it is pre-existing and load-sensitive. It behaves
*opposite* to `planning.spec.js` — isolation makes it worse, not better.

### Traps that produce false readings

- **Kill port 4321 before a full run.** `reuseExistingServer` otherwise serves a stale
  bundle. A 5.4s "test run" once reused a background server and nearly got a working
  fix filed as broken.
- **`test-results/` is your early warning.** With `trace: retain-on-failure`, one
  directory per failure appears *while the run is still going*. 133 of them is how the
  Phase 4 crash was noticed before the run finished — check it early rather than
  waiting ten minutes for a summary.
- **A hidden Chrome tab freezes animation clocks** (`currentTime` never advances,
  `setTimeout` still fires). Check the clock moved before believing a stalled frame.
- **The in-app browser pane may not composite**, so `screenshot` times out. Drive
  Playwright directly and write PNGs to disk instead.
- **Dismiss the welcome modal first** in any script that drives the app. A fresh
  browser context has no localStorage, the modal is up, and every click you think you
  are making lands on the scrim. Three "verification" screenshots turned out to be the
  same frame before this was noticed.
- Outside the Playwright config, call `selectors.setTestIdAttribute("data-test")` —
  `getByTestId` otherwise looks for `data-testid` and silently matches nothing.

---

## The nav stutter — diagnosed, not fixed

```
frame 1   86ms   script 79ms   style+layout  2ms   MessagePort.onmessage  (React scheduler)
frame 2   91ms   script 86ms   style+layout  0ms   DIV#root.onclick
```

**~85ms of React re-render, not CSS.** Toggling the nav re-renders all of `Planner()`.

Do not retry these; all measured, all inside the same 73–127ms band: `will-change` on
the rail and the surface, `contain: layout paint` on both, each animation disabled in
turn, all surface motion disabled, resting clip pre-rounded, no rounded corner open.

**The fix is Phase 5** — composite boundaries are what `React.memo` needs. Phase 4 did
not create them: extracting leaves gives Planner things to render, not fewer renders.
Nothing measurable changed, and nothing was expected to.

A cheaper interim was deliberately not attempted: apply the open class imperatively via
`navShellRef`, or wrap `setPhase` in `startTransition`.

---

## Constraints

- **`docs/adr/0001`** (Accepted) owns the target tree. **`docs/spec/structure.md`** is
  the ownership map and outranks any plan: visible surfaces go to `src/features/*`
  *"for now; later `src/ui/...` once that tree exists"*.
- ADR 0001 **rejected** a `components/hooks/services/utils` split — but it rejects
  mechanism-named *folders with no owner*. `features/planner/constants.js` is fine: it
  sits inside a folder that has one.
- **Planner stays the composition root.** Phase 6 is optional and probably unnecessary.
- **Codex, the Replit Agent, and commits authored as `Revenue-Architect` all land in
  this repo.** `git fetch` before assuming your push will go through.
- Two duplicates were found and **deliberately kept**: `DAY_LETTERS` in
  `eventToIcs.js` is the RFC 5545 `BYDAY` token set that only coincidentally equals a
  row of UI labels, and merging it would point `domains/` at `features/`; `MINUTE_MS`
  is one stable literal in two neighbouring files.
- `build-artifact.mjs` now creates `artifact/` itself; it used to do the whole build
  and then die with ENOENT on its last line in any fresh clone.

---

## Working agreements that earned their place

- **Look, don't just measure.** Every real defect this month was found by putting a
  frame on screen.
- **Baseline before blaming, and measure it yourself.** Check out the commit before
  yours and re-run. Every "regression" so far has been pre-existing — including both
  of Phase 4's.
- **Watch every new guard fail** against the behaviour it replaces. One shipped deaf
  because it had only ever been seen passing.
- **A move commit moves. It never edits.** Prove it: extract the removed text and the
  added text and compare sha256 in code. Doing that caught a comment that had been
  silently rewritten rather than moved.
- **Prefer reverting to patching under uncertainty.**
- **Profile before optimising.** Eight CSS guesses cost more than one LoAF trace.
- The commit messages are the real design document here — `git log` is worth reading.
