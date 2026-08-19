# Handoff — Calendar-master, 19 Aug 2026

Read this, then `docs/plans/2026-08-18-001-refactor-planner-ui-extraction-plan.md`.

---

## State

- Branch `claude/phase-2-nav-stutter-handoff-iczhu9` at **`5ae6890`**, clean, pushed.
  `main` is at `f631f77`; these two commits are not on it yet.
- **599 unit / 0 fail. 301 browser / 2 fail** — measured, not remembered. See below.
- `Planner.jsx` is **8,513 lines**, down from 9,616 two sessions ago.
- Two ratchets in `src/architecture.test.js` enforce that: a line ceiling, and a rule
  that no module under `src/features/` is left unimported. Both must only move down.

---

## Phase 2 is done. Do Phase 3 next.

The stylesheet now lives in `features/motion/plannerStyles.js` as
`plannerStyles({ T, preferences })`, and the three constants it needed went to
`morphTiming.js`, `themes.js` and `typography.js` first. 9,184 → 8,513.

Next: Phase 3 (icons + constants), 4 (leaf components), 5 (composite surfaces).
**Phase 5 is also the fix for the nav stutter** — see below.

### The verification order that worked, in cost order

Reuse this for Phases 3–5. The second one is the cheap discovery:

1. **Diff the moved bytes programmatically.** Extract the old text and the new text and
   compare them in code. 51,909 bytes both sides is a fact; "looks right" is not.
2. **Run the extracted module under `node` before touching a browser.** A `Proxy`
   theme records every key it reads and a missing import raises immediately. Seconds,
   no build. This is the check that would have caught the dropped `MONO` in 1.3, which
   built cleanly and took out 46 e2e tests.
3. **Compare parsed CSS**, both digest and rule list:
   ```js
   [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
     .map(r => r.cssText).join("\n").length
   ```
4. **Look at it.** Desktop, mobile, nav open, a sheet.

Two notes for whoever writes the next standalone Playwright script: pass
`executablePath` from `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (the image's Chromium is a
build behind what Playwright expects), and call
`selectors.setTestIdAttribute("data-test")` — outside the config, `getByTestId` looks
for `data-testid` and silently matches nothing.

---

## Test baseline — measure it, do not inherit it

**301 browser tests, 2 failures in a full run.** The previous version of this document
listed six known failures. Four of them do not fail here, and one that does was not on
the list. Re-measure at the start of a session; the numbers below are from 19 Aug.

| Spec | Full run | Alone | Reading |
| --- | --- | --- | --- |
| `interaction-feedback.spec.js:41` | fails | — | pre-existing; **was on no earlier list** |
| `planning.spec.js:64` | fails | fails | long-standing |
| `planning.spec.js:132` | varies | passes | localStorage bleed |
| `view-pills.spec.js:145` | varies | **fails** | pre-existing, order-sensitive, unowned |

`timeline-chrome-scroll.spec.js:34` and `navigation-shell.spec.js:298`, previously
recorded as five of the six and flagged as recently degraded, **passed in both full
runs.** Whatever that degradation was, it is not visible here.

`view-pills.spec.js:145` is the one worth someone's time: it samples
`transition-timing-function` on `.nb-view-track` while `.is-sliding` is transiently
applied, so it races a 340ms window and reads `ease` when it loses. Confirmed
unrelated to Phase 2 by checking out the commit before the move and watching it fail
there too.

### Traps that produce false readings

- **`planning.spec.js` has cross-spec localStorage bleed.** A different case fails in
  full runs each time and passes in isolation. Re-run that file alone before believing
  any new failure in it.
- **Kill port 4321 before a full run.** `reuseExistingServer` will otherwise serve a
  stale bundle. I lost a measurement to this: a 5.4s "test run" was reusing a server
  from a background job and I nearly filed a working fix as broken.
- **A green build is not a completed move.** Vite bundles an undefined identifier
  happily. A dropped `MONO` import built cleanly and took out 46 e2e tests at runtime.
- **A hidden Chrome tab freezes animation clocks** (`currentTime` never advances,
  `setTimeout` still fires). I misread this as a product bug twice. Check the clock
  actually moved before believing a stalled frame.

---

## The nav stutter — diagnosed, not fixed

Profiled with the Long Animation Frame API after eight CSS interventions all failed.

```
frame 1   86ms   script 79ms   style+layout  2ms   MessagePort.onmessage  (React scheduler)
frame 2   91ms   script 86ms   style+layout  0ms   DIV#root.onclick
```

**It is ~85ms of React re-render, not CSS.** Toggling the nav re-renders all of
`Planner()` — no component boundaries, so the whole render function runs for a change
that affects a drawer and one class.

Do not retry these; all measured, all inside the same 73–127ms band: `will-change` on
the rail and on the surface, `contain: layout paint` on both, each animation disabled
in turn, **all** surface motion disabled, resting clip pre-rounded, no rounded corner
when open.

**The fix is Phase 5** — extracting composite surfaces creates the boundaries
`React.memo` needs. There is nothing to memoise today.

A cheaper interim exists and was deliberately not attempted: apply the open class
imperatively via `navShellRef`, or wrap `setPhase` in `startTransition`. Both touch the
composition root in Codex's area. The stated reason for holding off — that the nav
probes were flaking — no longer holds: `navigation-shell.spec.js` passed clean in both
full runs on 19 Aug. If Phase 5 stays far off, this is worth reconsidering.

---

## Constraints

- **`docs/adr/0001`** (Accepted) owns the target tree. **`docs/spec/structure.md`** is
  the ownership map and outranks any plan: visible surfaces go to `src/features/*`
  *"for now; later `src/ui/...` once that tree exists"* — target `features/*`, not `ui/`.
- ADR 0001 **explicitly rejected** a `components/hooks/services/utils` split. Organise
  by domain, never by mechanism. No `src/hooks/`.
- **Planner stays the composition root** — state and wiring belong there. Do not try to
  dissolve it. Phase 6 is optional and probably unnecessary.
- **Codex, the Replit Agent, and commits authored as `Revenue-Architect` all land in
  this repo.** Twelve commits appeared mid-session. `git fetch` before assuming your
  push will go through, and check authorship before blaming anyone.
- Motion in the app lives in **one template literal**, now
  `features/motion/plannerStyles.js` rather than inside `Planner.jsx`;
  `src/index.css` still has no animation at all. Do not reflow that CSS — it moved
  byte-exact so the commit reads as a relocation, and a backtick in a CSS comment
  ends the template literal and breaks the build.

---

## Working agreements that earned their place

- **Look, don't just measure.** Every real defect that session was found by putting a
  paused frame on screen. Measurements twice said a morph was fine while a screenshot
  showed it broken.
- **Baseline before blaming, and measure the baseline yourself.** `git stash`, or check
  out the commit before yours, and re-run. Every "regression" so far has been
  pre-existing — including the two that appeared during Phase 2, one of which fails
  identically on the commit before the move. An inherited list of known failures is
  not a baseline; the first version of this document got four of six wrong.
- **Watch every new guard fail** against the behaviour it replaces before trusting it.
- **Prefer reverting to patching under uncertainty.** One revert-diagnose-reland cycle
  produced a better result than a speculative patch would have.
- **Profile before optimising.** Eight CSS guesses cost more than one LoAF trace, which
  answered it immediately.
- The commit messages are the real design document here — `git log` is worth reading.
