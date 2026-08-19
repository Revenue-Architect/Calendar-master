# Handoff — Calendar-master, 18 Aug 2026

Written at the end of a long session. Read this, then
`docs/plans/2026-08-18-001-refactor-planner-ui-extraction-plan.md`.

---

## State

- `main` at **`f631f77`** (this document's own commit), clean, pushed.
- **599 unit / 0 fail.** **295 browser / 6 fail** — all six are established, listed below.
- `Planner.jsx` is **9,184 lines**, down from 9,616 at the start of the session.
- Two ratchets in `src/architecture.test.js` enforce that: a line ceiling, and a rule
  that no module under `src/features/` is left unimported. Both must only move down.

---

## Do this first: Phase 2

Fully scoped already — the exploration is done, so this is a short job.

Move the `<style>` block out of `Planner.jsx` into `features/motion/plannerStyles.js`.

- The block is **lines 3975–4620, 646 lines**, `<style>{` to `</style>`.
- Signature: `plannerStyles({ T, preferences })`.
- **Move three one-line constants first** (same pattern as `MONO` in Phase 1.3):

  | Constant | Line | Goes to |
  | --- | --- | --- |
  | `VIEW_SLIDE_MS` | 319 | `features/motion/morphTiming.js` |
  | `NOW_RED` | 324 | `design/themes.js` |
  | `DISPLAY` | 375 | `design/typography.js`, beside `MONO` |

- Then import `MONO`, `MORPH_MS`, `MORPH_LEAD`, `MORPH_STEP`, `MORPH_FADE` into the new file.
- **Move it with a script, not by hand.** The plan's old "highest typo risk" warning
  assumed retyping. A byte-exact programmatic move of a known line range has none.
- **Verify by comparing parsed CSS**, not by eye:
  ```js
  [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
    .map(r => r.cssText).join("\n").length
  ```
  Same length and rule count before/after is the proof.
- Coordinate with Codex — `features/motion` is their active area.
- Expected: 9,184 → ~8,540. Lower the ceiling in the same commit.

After that: Phase 3 (icons + constants), 4 (leaf components), 5 (composite surfaces).
**Phase 5 is also the fix for the nav stutter** — see below.

---

## Test baseline — memorise these six

Do not treat the suite as green, and do not attribute these to your own work:

| Spec | Note |
| --- | --- |
| `planning.spec.js:64` | long-standing |
| `timeline-chrome-scroll.spec.js:34` ×4 | **degraded from 2 to 4 during recent merges — not mine, unowned** |
| `navigation-shell.spec.js:298` | timing-sensitive; **went from ~1-in-3 to consistent — also unowned** |

Both degradations were verified with all my work stashed. Someone should look.

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
composition root in Codex's area while the nav probes are flaking.

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
- Motion in the app lives in **one `<style>` block inside `Planner.jsx`**;
  `src/index.css` has no animation at all.

---

## Working agreements that earned their place today

- **Look, don't just measure.** Every real defect this session was found by putting a
  paused frame on screen. Measurements twice said a morph was fine while a screenshot
  showed it broken.
- **Baseline before blaming.** `git stash` and re-run. Three "regressions" were
  pre-existing.
- **Watch every new guard fail** against the behaviour it replaces before trusting it.
- **Prefer reverting to patching under uncertainty.** One revert-diagnose-reland cycle
  produced a better result than a speculative patch would have.
- **Profile before optimising.** Eight CSS guesses cost more than one LoAF trace, which
  answered it immediately.
- The commit messages are the real design document here — `git log` is worth reading.
