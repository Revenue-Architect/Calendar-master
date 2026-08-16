# Motion Regression Repair Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the gesture and motion regressions introduced on 2026-08-16, and deliver the page slide that was specified but not built.

**Cause, stated plainly:** the great majority of what is wrong came from one commit — `8ddfa3b`, mine. It rewired a catch-all touch handler to switch views without checking what the touch was actually for, and it shipped a 27-pixel nudge in place of a slide. Everything in Findings 1–3 follows from that single change.

**Reported symptoms:** no smooth slide between the views and the pill nav; the timeline feels very sensitive to all gestures; everything feels weird.

All findings below were reproduced in the running app at 390×844 and are quoted from measurement, not inspection.

---

## Commit audit — 2026-08-16

| Commit | Author | Change | Verdict |
| --- | --- | --- | --- |
| `712a010` | Codex | Accent wash on the clip's own timeline | Clean. No interaction surface. |
| `e2f66fc` | Codex | Computed compact view-pill track | Clean, and the geometry is correct. |
| `c3a1992` | Codex | One expanded word at compact width | Clean. |
| `a0b332f` | Codex | Keyboard / reduced-motion instant | Clean, and load-bearing — see Finding 4. |
| `93ee3b9` | Claude | Morph to 667ms + content cascade | Suspect on feel only. Finding 5. |
| `e159a85` | Claude | Pill plate on transform | **Introduced a 120ms dead beat.** Finding 4. |
| `8ddfa3b` | Claude | Swipe between views + travel | **Cause of Findings 1, 2 and 3.** |
| `9e66852` | Claude | Nav pushes the page aside | Suspect on feel only. Finding 6. |
| `09543cb` | Claude | Dark-ground elevation | Clean, and a genuine fix. |

**None of Codex's four commits contribute to the reported symptoms.** Three of my five do.

---

## Finding 1 — any horizontal drag anywhere switches the view

**Severity: critical. This is the "sensitive to all gestures" report.**

`8ddfa3b` redirected `onSwipeEnd` from `goDay` to `selectViewMode`. The handler sits on the `<section>` wrapping all main content and accepts *any* touch that travelled more than 64px horizontally. It does not ask what the touch was for. Every horizontal gesture inside that subtree now navigates.

Reproduced:

- **Swipe an Action card right to complete it.** Task status stayed `open`; the view jumped from ACTIONS to AGENDA. The gesture is entirely hijacked — the user's intent is discarded *and* they are thrown to another screen.
- **Drag the ANY TIME chip row sideways.** It is a horizontal scroller (`scrollWidth 549` against `clientWidth 342`, `touch-action: auto`). Dragging it to see the chips past the edge switched TIMELINE → AGENDA.

Why the card case slips through: the card handles its swipe with `onPointerDown/Move/Up` (`Planner.jsx:6403`). A finger on a touchscreen emits **both** pointer and touch streams. The card consumes the pointer stream and never stops the touch stream, so the same finger drives the card's swipe and the section's view switch simultaneously. The existing `gestureRef` guard does not help — the card tracks its own `sw.current` and never calls `startGesture`.

This was latent before `8ddfa3b`: the same conflict existed when the handler called `goDay`. It was survivable then because the cost of a false positive was one day step. The cost is now a whole-screen change, which is why it reads as the app being broken.

- [ ] Reject any touch whose target sits inside an element that owns a horizontal gesture of its own. A `closest()` test in `onSwipeStart` against a `[data-owns-swipe]` attribute is enough, and it is explicit rather than a heuristic on `overflow-x`.
- [ ] Mark the Actions card, the ANY TIME row, the Actions tab row, and the day ribbon with that attribute.
- [ ] Have the Actions card stop touch propagation as well as handling pointers, so the two streams cannot both act on one finger.
- [ ] Add an e2e test that swipes a card right and asserts **both** that it completed **and** that `viewMode` did not change. That assertion pair is the regression guard.

## Finding 2 — the slide is 27 pixels

**Severity: high. This is the "no smooth slide" report.**

`8ddfa3b` gave the arriving view a 7% directional travel. Measured on a real click at 390px: the pane moves **27.3px → 0 over 200ms**. On a 390px screen that is a nudge, not a slide — roughly a fourteenth of the distance a page slide implies.

The outgoing view has no animation at all. It is unmounted in the same commit the new one mounts, so what actually happens is a hard cut followed by a small settle on the replacement. Nothing travels *between* the two views, which is precisely the thing the user is asking for.

The design doc specified the fix (`2026-08-16-view-switching-motion-design.md` §5) and I did not build it, on the reasoning that a persistent three-pane track would mean mounting the timeline permanently. That reasoning was about implementation cost and it lost sight of the requirement.

- [ ] Build the real track: the three views in `grid-auto-flow: column; grid-auto-columns: 100%`, translated by `calc(var(--view-progress) * -100%)`.
- [ ] Mount the neighbouring pane only while a switch or drag is live, so the timeline is not permanently resident. This answers the cost objection without giving up the motion.
- [ ] `inert` on the panes that are not active, so a hidden view cannot take focus.
- [ ] Retire the 7% `nb-view-enter-a/b` travel; keep the classes as the reduced-motion fallback.

## Finding 3 — the gesture hint documents the wrong gesture

**Severity: medium, and it compounds Finding 1.**

`8ddfa3b` changed the hint to "swipe the page to change view", removing "swipe an Action right to complete". That gesture still exists, is now broken by Finding 1, and is no longer mentioned anywhere. A user who reads the hint learns the one gesture that misfires and is not told about the one that works.

- [ ] Restore the Action swipe to the hint and add the view swipe alongside it, once Finding 1 makes both true at the same time.

## Finding 4 — the pill plate starts 120ms late

**Severity: medium. Contributes to "the nav and the page feel disconnected".**

Measured across a real click: the plate holds still for ~120ms, then travels 30px over 300ms, settling at ~420ms. The page animation starts at 0ms and finishes at 200ms.

So on every view change the page has already arrived and settled before the plate is halfway. Two halves of one gesture running on different clocks is exactly the disconnection being reported.

The delay comes from `useLiquidPill`: `setSettled(false)` renders the indicator with `transition: none`, and only a `requestAnimationFrame` later does `setSettled(true)` restore it. `e159a85` did not introduce that round trip, but by moving travel onto `transform` it made the stall visible as a pause rather than hiding it inside a `left` transition.

- [ ] Drive the plate from the same progress value as the page (design doc §3) so the two cannot desynchronise by construction.
- [ ] Failing that as a first step, remove the `settled` round trip for index changes — it exists to suppress a first-mount animation, which a mount flag handles without costing every later transition 120ms.

## Finding 5 — the morph may simply be too slow

**Severity: to be judged in use, not by measurement.**

`93ee3b9` took the composer morph from 320ms to 667ms, with content still arriving until 1233ms. That is faithful to the reference, and the reference is a showcase piece authored to be watched once. `DESIGN.md`'s fortieth-time test is the relevant standard and I flagged the risk when landing it.

- [ ] Try `MORPH_MS` at 480. Every other beat derives from it, so the whole cascade compresses proportionally and nothing else needs touching. Judge in use; keep 667 if it earns its place.

## Finding 6 — the drawer scale is a large change

**Severity: to be judged in use.**

`9e66852` moved `--nav-page-scale` to `.80`, chosen while the page still had no visible edge. `09543cb` then gave it real elevation, which changes how the same scale reads.

- [ ] Re-judge `.80` against `.88` now that the page has a legible edge. The trade table is in `9e66852`'s message; one value changes it.

## Finding 7 — day-turn lost its gesture

**Severity: to be confirmed with the user.**

`8ddfa3b` moved day-turn from the body swipe to the ribbon. The rationale still holds, but it was argued rather than tested, and the swipe it replaced was a daily-use gesture.

- [ ] Confirm the ribbon is carrying it in practice. If not, the fallback is view-switching on an edge swipe with day-turn kept on the body — worse by the platform-convention argument, better if the habit turns out to be load-bearing.

---

## Order of work

1. **Finding 1** first and alone. It is the one making the app feel broken, and it is independent of everything else.
2. **Finding 4**, then **Finding 2** — the shared progress value from §3 is the foundation the real track sits on, and fixing the plate first proves it.
3. **Finding 3** once 1 is done.
4. **Findings 5, 6, 7** are single-value judgements. Make them together, in use, after the mechanics are right.

## Verification

- [ ] Card swipe completes the task and does not change the view.
- [ ] Dragging any horizontal scroller inside the body does not change the view.
- [ ] A vertical timeline scroll with a shallow diagonal component does not change the view.
- [ ] Page travel is a full pane width, and the outgoing view travels with the incoming.
- [ ] Plate and page start on the same frame and finish on the same frame.
- [ ] The whole suite green at 264, plus the new gesture-isolation tests.
