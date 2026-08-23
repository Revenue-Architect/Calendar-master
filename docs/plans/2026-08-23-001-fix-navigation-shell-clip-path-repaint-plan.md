---
title: Navigation Shell — Retire the Per-Frame clip-path Repaint
type: bugfix
status: implemented
date: 2026-08-23
baseline_commit: e5c243e
implemented_by:
  - PR #11 (44933b0) — compositor-owned travel, approach C/A hybrid: transform
    walls frame an unclipped stage; the viewport clip owns only terminal frames
  - PR #12 (af5de2d) — released the walls at rest, closing the concave-corner
    regression that #11 shipped
outcome: |
  Approach A as written was not taken. The walls-plus-static-clip design is
  closer to B, and it introduced exactly the failure mode §5 warns about —
  two frame owners disagreeing — which shipped as four concave corner notches
  and was caught by a user, not by the suite. The §3 device paint gate is
  still open; nothing has measured this on a phone.
origin:
  - DESIGN.md
  - docs/spec/structure.md
  - docs/plans/HANDOFF.md
  - user report, 2026-08-23: "when it opens up and sometimes closes it stutters,
    not a smooth swipe or sliding motion, it feels like it's getting dragged"
target_domains:
  - src/features/motion/
  - tests/e2e/
priority: P2
---

# Navigation Shell — Retire the Per-Frame clip-path Repaint

## 1. The defect, stated as a mechanism

The navigation open/close is one 520ms clock driving **two halves that run on
different cost models**:

| Half | Element | Property | Where it runs |
| --- | --- | --- | --- |
| Content travel | `.nb-nav-motion-carrier` | `transform: translate3d(…)` | Compositor. Effectively free. |
| Frame reveal | `.nb-nav-motion-viewport` | `clip-path: inset(…)` | **Main thread. Repaints the clipped subtree every frame.** |

`clip-path` is not a compositor-animatable property in Chromium. Writing it as
an inline style from a `requestAnimationFrame` clock — which is what
`useNavigationMotion.js` does, by design and by its own header comment — forces
a paint of the clipped subtree on every frame of the animation.

The clipped subtree is the entire application:

```
.nb-nav-motion-viewport   ← clip-path animated here
  └─ .nb-nav-motion-carrier
       └─ .nb-app-surface  ← the whole planner
```

Measured on an empty notebook at 390×844: **1,375 DOM nodes, 182 buttons, 56
date-ribbon cells**. All of it is repainted roughly 31 times per open and again
per close.

**Why it reads as "dragged" rather than "slow".** The two halves share a clock
but not a budget. The carrier keeps pace on the compositor; the mask misses
frames whenever the main thread is busy. The user sees the panel *edge* lagging
the content it is supposed to be clipping — a shear, not a uniform slowdown.
That is the specific perceptual signature reported.

### Evidence on hand

Source, at `e5c243e`:

- `src/features/motion/useNavigationMotion.js:32-34` — "Both desktop and mobile
  use a small requestAnimationFrame clock rather than separate CSS transition
  lifecycles."
- `useNavigationMotion.js:128-130` — `viewport.style.transition = "none"`,
  same for carrier and drawer. CSS transitions are explicitly disabled.
- `useNavigationMotion.js:136` — `viewport.style.clipPath = "inset(…)"`, written
  per frame.
- `useNavigationMotion.js:104` — `will-change: clip-path`. This promotes the
  layer; it does **not** make `clip-path` compositable.

Runtime capture, mid-flight at 390×844:

```
viewport: inlineClip "inset(7.69px 0px 7.69px 190.043px round 8.788px)"
          transition: none   willChange: clip-path   running animations: []
carrier:  inlineTransform "translate3d(214.21px, 0px, 0px)"
          transition: none   willChange: transform   running animations: []
```

### What the headless measurement does and does not say

Three open/close rounds at 390×844, rAF frame pacing plus Long Animation Frame
observer:

| Run | median | worst | frames >33ms | effective fps | LoAF entries |
| --- | --- | --- | --- | --- | --- |
| nav open ×3 | 16.7ms | 16.8ms | 0 | 60 | 0 |
| nav close ×3 | 16.7ms | 16.8ms | 0 | 60 | 0 |
| idle baseline | 16.7ms | 16.8ms | 0 | 60 | 0 |
| sheet morph (control) | 16.7ms | **50.0ms** | **3** | 55 | 0 |

**The nav is clean in headless.** The instrument is not lying — the same
recorder caught real jank in the sheet morph in the same session, which is the
control that proves it can fail.

Headless Chromium has no display pipeline and charges almost nothing for paint,
which makes it structurally blind to a paint-bound defect. **This plan therefore
treats the on-device measurement in §3 as the gate, and the headless suite as a
non-regression check only.** Do not close this plan on a green headless run.

`docs/plans/HANDOFF.md` records an earlier profile of ~85ms of script per frame
and states plainly that nobody has re-profiled it since the component tree
changed. The numbers above are that re-profile. They retire the *script* half of
the old diagnosis — there is no measurable JS cost here any more — and leave the
*paint* half untested, because this instrument cannot test it.

## 2. Outcome required

A navigation open or close holds a single cost model end to end. Specifically:

1. No layout or paint-inducing property is animated per frame during nav travel.
2. The frame reveal and the content travel cannot desynchronise, because they
   are no longer two independently-budgeted animations.
3. The 520ms cadence, `--nav-ease`, the staggered item entrance, and every
   existing close affordance (rail tap, `Escape`, choosing a destination)
   behave exactly as they do today.

## 3. The gate — on device, because headless cannot see this

Run before and after, on the physical Android device and one iOS Safari device:

1. Remote-debug the running preview.
2. DevTools → Rendering → **Paint flashing**. Open and close the nav.
   - **Before** (expected): the whole app surface flashes on every frame of the
     travel.
   - **After** (required): no repaint of the app surface during travel. Only the
     nav panel's own item entrance may flash.
3. DevTools → Performance, record one open and one close.
   - **Before** (expected): Paint / "Update Layer Tree" bars spanning the full
     520ms.
   - **After** (required): a compositor-only strip; no Paint bar attributable to
     the surface for the duration of travel.
4. By hand, at 390×844 and on the real phone: open and close ten times, twice
   interrupting mid-travel by tapping the rail. No shear between the panel edge
   and the content; no visible lag of the frame behind the page.

Record both captures in `docs/qa/2026-08-23-navigation-shell-repaint.md`.
Screenshots of the Performance panel are the artifact; the prose claim is not.

## 4. Approach

Ordered by preference. Take the first that survives §5.

### A. The surface's own border-box does the masking — recommended

The dominant travel is `--nav-frame-left: 0 → 322px` on the clip, exactly
compensated by `translate3d(322px, …)` on the carrier. That pairing exists to
make the page's left edge move right while its content slides with it. A
border-box with `overflow: clip` and a static `border-radius` already produces
that result without any clip animation: translate the carrier, and the surface's
own edge does the cutting.

`.nb-app-surface` already carries `overflow: clip`. The work is to make its
radius and its top/right/bottom insets **static** across the whole run, so the
only animated property is `transform` on the carrier.

Cost: the rounded corners stop *growing* into place and are simply present. This
is a real visual change and needs a decision, not an assumption — see §5.

### B. Establish the final clip once, animate only transform

Set the destination `clip-path` in a single write at the start of the run, then
animate the carrier alone. One paint instead of thirty-one. Corners appear at
the start of travel rather than interpolating.

Weaker than A only because it keeps a `clip-path` write on the critical path.

### C. Move the clip to WAAPI

`viewport.animate([{ clipPath: from }, { clipPath: to }], …)` instead of a rAF
write loop. Removes the per-frame JS and style recalc; **does not remove the
paint**, since Chromium still cannot composite `clip-path`.

This is a partial fix. Adopt it only if A and B are both rejected on design
grounds, and say so explicitly in the QA record rather than presenting it as a
resolution.

### Rejected

- **Scaling the surface.** DESIGN.md §5 is explicit: "Reveal, do not stretch…
  Animating a container's scale magnifies everything inside it", with the
  argument and measurements in `src/features/motion/fluidGeometry.js`. A
  `scale()`-driven drawer would be the same mistake in a new place. Not
  available, regardless of how cheap it is.
- **Raising `will-change` coverage.** Already set on both elements. It promotes;
  it does not make `clip-path` compositable.
- **Shortening the animation.** Hides the shear, does not remove it, and spends
  the one thing the interaction has going for it.

## 5. Constraints this must not break

- **DESIGN.md §5** — reveal, never stretch. Any approach that scales the page is
  rejected before it is measured.
- **DESIGN.md §7, the fortieth-time test** — this interaction runs many times a
  day. A change that reads better once and worse by lunch has failed.
- **`docs/spec/structure.md`** — motion lives in `src/features/motion/`. Do not
  add lines to `src/Planner.jsx`: it sits at **5,571 lines against a
  `PLANNER_CEILING` of 5,571** (`src/architecture.test.js`). There is zero
  headroom; any line added there fails `npm test`.
- **`prefers-reduced-motion`** — currently skips travel entirely
  (`useNavigationMotion.js:301-307`). Must continue to.
- **Close affordances** — rail tap (`nb-mobile-calendar-return`), `Escape`, and
  choosing a destination all close today. All three must survive; they are
  covered by `navigation-shell.spec.js`.
- **Clock ownership** — `useNavigationMotion.js:277-285` deliberately refuses to
  let a child `transitionend` settle a run. If any approach reintroduces CSS
  transitions on the animated elements, that guard must be re-proven, not
  assumed.

## 6. Regression surface

Green before and after, same machine, same session:

```
npx playwright test tests/e2e/navigation-shell.spec.js
npx playwright test tests/e2e/motion.spec.js
npx playwright test tests/e2e/mobile.spec.js tests/e2e/shell.spec.js
npx playwright test tests/e2e/reveal-without-paint.spec.js
npm test
```

**Known-red at this baseline — do not attribute these to this change:**

| Spec | State |
| --- | --- |
| `motion.spec.js:503` "a stalled Composer body is repaired…" | Fails 3/3 isolated. Has never passed — fails at `65072e4`, the commit that introduced it. |
| `motion.spec.js:727` "an interrupted entry can unmount and reopen…" | Fails 3/3 isolated. Has never passed — fails at `7d3adb6`, the commit that introduced it. Timing-fragile: it reads the source label after two `toHaveAttribute` polls, by which point `nbnotchlabelout` has started. |
| `interaction-feedback.spec.js:41` "focus remains visible…" | Fails 3/3 isolated. Asserts a focus ring after a bare `.focus()`, which Chromium correctly does not treat as `:focus-visible`. The control does get its 2px ring under real keyboard focus. |

Full suite at `b5b67ce`: **352 passed, 3 failed, 13.8m.**

## 7. Negative control

Required before the change is trusted, per DESIGN.md §8:

1. Land the fix. Confirm Paint flashing is clean during travel.
2. Reintroduce the per-frame `clip-path` write behind a temporary flag.
3. Confirm the flashing returns and the Performance capture shows Paint bars
   again.
4. Remove the flag.

A guard nobody has watched fail is not a guard.

## 8. Rollback

Revert the motion commit. The nav has no persistence, no schema, and no domain
coupling, so a revert is complete and carries no data risk.

Stop and reopen the design question — do not push a second attempt — if:

- Paint flashing is still dirty after the change, or
- the rounded frame reads as popped-in rather than revealed at 100% zoom on the
  real phone, or
- any close affordance in §5 changes behaviour.

## 9. Out of scope

- The three known-red specs in §6. They are real and separately actionable, and
  fixing them inside this change would make the before/after unreadable.
- The desktop nav, unless the same capture shows the same repaint there. Measure
  before widening.
- `docs/plans/HANDOFF.md`'s Phase 6 question. This plan re-profiles the stutter;
  it does not reopen the extraction argument built on the old numbers.
