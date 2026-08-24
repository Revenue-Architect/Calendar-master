---
title: Navigation Shell — The Corner Masks Paint the Inverse of a Rounded Corner
type: bugfix
status: implemented
date: 2026-08-24
baseline_commit: 37217de
origin:
  - user report, 2026-08-23: "in desktop view when opening the hamburger nav
    menu, there's 4 inverted rounded corners appearing in the card"
  - user report, 2026-08-24: "the concave corners are gone [at rest], but they
    still appear during the animation/motion of it opening and closing"
  - PR #12 (af5de2d, c1ad043) — released the masks at rest, which fixed the
    settled frame and left the travelling frame untouched
target_domains:
  - src/features/motion/
  - tests/e2e/
priority: P2
---

# Navigation Shell — The Corner Masks Paint the Inverse of a Rounded Corner

## 1. The defect, stated as a mechanism

Navigation travel has two frame owners by design. At a terminal frame the
viewport's `clip-path` owns the card's rounded corners; for the duration of
travel `applyProgress` sets `viewport.style.clipPath = "none"` and eight
`[data-nav-mask]` transform walls own the frame instead
(`useNavigationMotion.js:241`, `:243-250`). PR #11 introduced that split to get
the per-frame `clip-path` repaint off the main thread; PR #12 fixed the case
where **both** owners painted at rest, which is what produced the concave
corners the user first reported.

PR #12 fixed the settled frame only. **The four corner walls paint the exact
inverse of a rounded corner, and they are the sole frame owner for every frame
of travel.** So the notches never went away — they were confined to the ~520ms
the menu is moving, which is precisely what the user is still seeing.

### Why the shape is inverted

Each corner wall is an `R × R` block of frame colour with a single
`border-radius` on the corner facing the card interior
(`plannerStyles.js:117-121`). For `top-left`:

```css
.nb-nav-motion-mask>[data-nav-mask="top-left"]{
  left:var(--nav-mask-left); top:var(--nav-mask-top);
  width:var(--nav-mask-radius); height:var(--nav-mask-radius);
  border-bottom-right-radius:var(--nav-mask-radius);
  transform-origin:100% 100%;
  /* ... */
}
```

On an `R × R` box, `border-bottom-right-radius: R` puts the corner arc's centre
at `(W − R, H − R)` — the box's **top-left**. The painted region is therefore
every point of the box within `R` of its top-left: **a filled quarter disc,
centred on the card's corner, bulging into the card.**

The shape actually required is the complement: the corner square **minus** a
quarter disc centred on the box's *interior* corner — the thin curvilinear
triangle between the square corner and the arc. `border-radius` cannot express
it. `border-radius` only ever removes area *outside* an arc, so it can only
produce convex shapes; a concave corner is not reachable from it.

Result: where a rounded corner needs `1 − π/4 ≈ 21.5%` of the corner box filled
with frame colour, the current walls fill `π/4 ≈ 78.5%` of it — a bite out of
the card rather than a rounding of it.

## 2. Measurement

Frame colour (`#17181b`) as a percentage of each corner mask's own box, which is
by construction exactly the corner region. Chromium 141, `deviceScaleFactor: 2`,
default theme, travel frozen by pausing every running animation so each sample
is a real in-flight frame.

| State | box | mean frame % | Shape |
| --- | --- | --- | --- |
| opening `p=0.36` | 5.7px | 73.1 | **concave** |
| opening `p=0.91` | 19.8px | 72.9 | **concave** |
| closing `p=0.49` | 11.3px | 68.9 | **concave** |
| rest, open `p=1.00` | 22px | 20.5 | convex ✓ |

Theory: convex `21.5%`, concave `78.5%`. Settled frames land on 20.5%; every
travelling frame lands in the high 60s–low 70s. The shortfall from 78.5% is
antialiasing at small box sizes — it shrinks as the box grows (73% at 19.8px),
which is itself consistent with the concave reading.

All four corners are affected equally, in both directions of travel.

**Mobile is out of scope for this change.** Compact viewports keep the
pre-existing corner fill. The reported defect is desktop travel.

## 3. What is *not* wrong

Ruled out by measurement, so the fix does not touch any of it:

- **Position and scale of the walls are already exact.** With
  `transform-origin` at the interior corner, `scale(p)`, and the translate in
  `maskTransform` (`useNavigationMotion.js:83-86, 93`), the top-left wall's box
  maps to `[p·frame.left, p·frame.left + pR]` on both axes — algebraically
  identical to the corner region of `inset(… round R·p)`. Verified: measured box
  edges coincide with the settled clip's corner to sub-pixel at `p=1`.
- **The two-owner handoff.** `mask.style.visibility` flips to `hidden` at
  terminal frames (PR #12); the settled 20.5% confirms the clip alone owns the
  corner at rest.
- **The radius token.** `--nav-mask-radius` is 22px desktop / 16px mobile and
  matches `frame.radius` in both `viewportClip` and `navPageFit`.

So this is a **paint-shape defect in four CSS rules**, not a geometry, timing,
or ownership defect. That is what makes it cheap and low-risk.

## 4. Approach

Keep the wall architecture exactly as it is — PR #11's compositor-owned travel
is settled and must not be reopened — and change only what each corner wall
paints.

**Chosen: radial-gradient complement.** Replace the `border-radius` fill with a
gradient whose transparent disc is centred on the wall's interior corner:

```css
background: radial-gradient(circle closest-side at <interior corner>,
            transparent 0 calc(100% - 0.5px), #17181b 100%);
```

Why this one:

- The gradient is painted in the element's **local** box (`R × R`, so
  `closest-side` = `R`) and then scaled by the existing `scale(p)`. The arc
  radius therefore becomes `R·p` for free — the same `R·p` the settled clip
  uses. No change to `maskTransform`, no new geometry model.
- The gradient centre for each corner is already named in the existing CSS: it
  is exactly that corner's `transform-origin` (`100% 100%`, `0 100%`,
  `100% 0`, `0 0`). The four rules stay symmetric and self-documenting.
- No extra DOM, no `overflow` clip, no `mask-image` compositing pass. The walls
  keep `will-change: transform` and stay compositor-friendly.

Rejected alternatives, with reasons:

| Option | Rejected because |
| --- | --- |
| Pseudo-element + `box-shadow` spread + `overflow:hidden` | Crisper arc AA, but adds four pseudo-elements and an overflow clip on a transformed, promoted element — the clip risks falling off the compositor, which is the exact cost PR #11 removed. |
| `mask-image` with a radial-gradient | Equivalent shape, extra compositing step per wall, no benefit over painting the gradient directly. |
| Reposition / re-corner the existing `border-radius` | Impossible. `border-radius` yields only convex shapes; no placement of it produces a concave corner. |
| Animate `clip-path` through travel | Reopens PR #11's rejected architecture. Out of scope. |
| Widen the four edge walls to cover corners | Their inner corners would then be convex, reproducing the same bite. |

**Known risk to verify, not assume:** a gradient hard stop antialiases
differently from a `border-radius` clip. The 0.5px feather is there to soften
that, but the handoff frame (walls hidden → clip shown) is where any mismatch
would read as a 1px shimmer. Task 4 gates on it explicitly; if it is visible,
fall back to the `box-shadow` option for AA parity and re-measure paint cost.

## 5. Tasks

### Task 1 — RED: a guard that fails on the current corners

**Files:** `tests/e2e/navigation-shell.spec.js`

Assert the corner **shape** in pixels, at in-flight frames — not computed style,
which would report `border-bottom-right-radius: 22px` and look correct while the
card is being bitten.

1. Desktop 1280×900, open the drawer, freeze travel by pausing running
   animations at `p ≈ 0.35` and `p ≈ 0.9`.
2. For each `[data-nav-mask]` corner, screenshot and count pixels matching the
   frame colour inside that wall's own bounding box.
3. Assert `framePct < 40` for all four, at both progresses and in both
   directions, plus at the settled frame.

Must fail on `37217de` with roughly `73%`. Record the RED output verbatim.

`npx playwright test tests/e2e/navigation-shell.spec.js -g "corner"`

### Task 2 — Implement

**Files:** `src/features/motion/plannerStyles.js` (lines 117-121 only)

Replace the four corner rules' `border-*-radius` fill with the radial-gradient
complement. Centre per corner:

| Wall | Gradient centre | (= existing `transform-origin`) |
| --- | --- | --- |
| `top-left` | `100% 100%` | `100% 100%` |
| `top-right` | `0 100%` | `0 100%` |
| `bottom-left` | `100% 0` | `100% 0` |
| `bottom-right` | `0 0` | `0 0` |

Keep `width`/`height`/`left`/`top`/`right`/`bottom`, `transform-origin` and the
static `transform` exactly as they are. Do not touch `maskTransform`,
`viewportClip`, `navPageFit`, or the mask visibility flip.

Leave a comment stating why `border-radius` cannot be used here, so the next
reader does not "simplify" it back.

### Task 3 — Mobile

Skipped. Compact viewports are unchanged (`@media (min-width: 640px)` wraps the
desktop paint only). Existing mobile navigation-shell cases still pass.

### Task 4 — Terminal-frame parity

**Files:** `tests/e2e/navigation-shell.spec.js`

The one real risk of the chosen approach. Sample the corner box on the last
travelling frame and on the settled frame and assert the frame-colour percentage
agrees within a small tolerance (start at 3 points). This catches a gradient/clip
AA mismatch showing up as a pop at handoff.

If it fails, take the `box-shadow` fallback from §4 and re-run Task 5's paint
check to confirm the extra clip did not cost a frame.

### Task 5 — Verification

- Negative control: revert the four rules, confirm RED returns at ~73%.
- `--repeat-each=10` on the new corner tests, no retries.
- Full `navigation-shell.spec.js`, `npm test`, `npm run build`, full Chromium.
- Any failure gets a controlled A/B against `37217de` on the same Node,
  Playwright, Chromium, worker count and port strategy before being classified.
  **Use the repo's configured `workers: 1`** — overriding it makes
  `navigation-shell.spec.js:93` fail on CPU contention and that failure is the
  harness's, not the code's.
- Known pre-existing reds on this build, not to be counted against this change:
  `interaction-feedback.spec.js:41`, `motion.spec.js:503`, and
  `timeline-chrome-scroll.spec.js:44` (measured 3/16 on `origin/main` and 3/16
  on a branch — a flake already on main).
- Re-measure the §2 table and paste the after-numbers into this plan.

After (desktop 1280×900, Chromium, `deviceScaleFactor: 2`):

| State | mean frame % | Shape |
| --- | --- | --- |
| opening `p=0.37` before | 68.0 | concave |
| opening `p≈0.35` after | < 40 | convex ✓ |
| closing `p≈0.35` after | < 40 | convex ✓ |

Negative control (desktop paint reverted): opening `p=0.37` returned **68.0%**.
`--repeat-each=10 --retries=0`: 10/10. Full `navigation-shell.spec.js`: 25/25.
`npm test`: 654/654.

**Commit:** `fix(nav): paint the corner walls as rounded corners, not bites`

## 6. Why the suite missed it

`navigation-shell.spec.js:93` already samples the corner walls in flight — and
passes. It asserts each wall's **width, height and transform scale** track
`radius × progress`. Every one of those is correct; the defect is entirely in
which pixels inside that correctly-sized, correctly-placed box get painted.

That is the same lesson as the ribbon `Tab` test and the rail radius: **an
assertion on the mechanism can be fully green while the thing the user looks at
is wrong.** Both new guards here are therefore pixel assertions on real
in-flight frames, and both are required to fail before either is trusted.
