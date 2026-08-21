# NEW Morph v3 — perceptual validation report

Date: 2026-08-21  
Branch: `feat/new-morph-v3-transitions-match`  
Baseline: `e3bca9f86cae2cdcb3b4ed4879a8d31d678c6914` (`origin/main` at start)  
Implementation under review: `c47ef44`

## Executive result

NEW Morph v3 is implemented as a true-size, clip-path morph with a continuous
source-to-surface handoff. The Composer body enters from the right while the
NEW identity leaves left, then the sheet settles without scaling or horizontal
scrolling. The same path was visually checked in Chromium at desktop and both
required mobile heights, in the default dark/high-chroma theme and a light
theme.

The motion-specific verification is green. The repository-wide Playwright run
finished with 323 passing tests and one reproducible pre-existing failure in
`tests/e2e/interaction-feedback.spec.js`; none of the files changed by this
track are involved in that assertion.

## Scope and invariants

Changed files:

- `src/features/motion/morphTiming.js`
- `src/features/motion/morphTiming.test.js`
- `src/features/motion/plannerStyles.js`
- `src/features/motion/Sheet.jsx`
- `tests/e2e/motion.spec.js`
- this report

`Planner.jsx`, Composer ownership, ordinary trigger Sheets, persistence,
navigation, and business behavior were not changed. The implementation keeps:

- the measured true-size Sheet and `ResizeObserver` height path;
- asymmetric `clip-path` geometry rather than layout or full-sheet scale;
- compositor-only transient translation, opacity, scale (`.985` minimum), and
  blur (`1.5px` maximum);
- reduced-motion and keyboard/focus/scroll-lock behavior;
- in-flight reversal, including exact current-value handoff;
- Event ↔ Action and More Options behavior.

## Implementation summary

The cadence is now explicit in `morphTiming.js`:

- open shape: `350ms`;
- symmetric close: `250ms`;
- source/body handoff: `200ms`;
- handoff travel: `32px`;
- handoff scale: `.985`;
- handoff blur cap: `1.5px`.

`nbnotchin` travels continuously from the measured NEW bounds instead of
holding the panel at the trigger until a late snap. Its clip/radius sequence
keeps the physical source radius early, reaches the card radius by the first
third, and resolves to the full true-size panel before the final settle.

The old eight independent notch child reveals are disabled only for notch
Composer surfaces. The existing markup remains; one `.nb-notch-body` plane
arrives from the right and is readable before the shape completes. The source
label leaves to the left during the same handoff. On a settled `open` stage,
the hidden source label explicitly clears its animation fill, transform, and
filter so no transient blur remains in the resting DOM.

Close uses the same source/body identities in reverse. When close interrupts an
entry, `Sheet.jsx` freezes the current computed values and starts the close from
those values instead of restarting from either endpoint.

## Test-first evidence

The first implementation test was intentionally run against the baseline. The
baseline failed the new characterization because the panel was still pinned at
its source transform at the sampled midpoint, the source identity did not move
left, and the Composer body was already fully present rather than entering as a
destination plane. The implementation was then made green without weakening
the assertions.

The final motion contract now covers:

- 0/20/40/60/80/100% shared-clock samples;
- continuous panel travel and asymmetric clip geometry;
- source opacity plus leftward travel;
- body opacity plus rightward entry and settle;
- true-size width/height and body `scrollHeight` at every sample;
- no exposed horizontal scrolling;
- settled source cleanup after the actual `data-morph-stage="open"` transition;
- reduced motion;
- 25/50/75% Escape interruption;
- backdrop interruption;
- rapid close/reopen;
- interrupted unmount and fresh reopen;
- Event ↔ Action switching and More Options.

## Automated verification

| Check | Result |
| --- | ---: |
| `node --test src/features/motion/morphTiming.test.js src/features/motion/fluidGeometry.test.js` | 17 passed |
| `npx playwright test tests/e2e/motion.spec.js --workers=1` | 46 passed |
| `npx playwright test tests/e2e/composer.spec.js --workers=1` | 6 passed |
| `npm test` | 634 passed |
| `npm run build` | passed |
| full `npx playwright test --workers=1` | 323 passed, 1 known failure |

The build emitted only the repository's existing large-chunk warning.

## Chromium visual validation

The production bundle was served from the isolated worktree on
`127.0.0.1:4178` and checked in real Chrome at 100% browser zoom.

### 1280 × 900 — dark/high-chroma (`Obsidian / Acid`)

- Entry: the measured panel grows out of the NEW origin and travels toward its
  final position from the first visible beat; it does not hold and snap.
- Midpoint: the source identity is visibly moving left while the Composer body
  arrives from the right; the handoff has no blank identity gap.
- Settled: the Composer is centered and fully readable, with stable controls,
  no horizontal scrollbar, and the source label gone with no residual blur.
- Close: the underlying timeline returns cleanly and the NEW trigger remains
  available; no stale scrim or mounted sheet remained.

### 390 × 844 — dark/high-chroma (`Obsidian / Acid`)

- The sheet grows from the mobile NEW control and settles against the bottom
  viewport edge without clipping the Event/Action switcher, time controls,
  categories, More Options, or Add to Timeline.
- The source/body handoff remains one shared motion; the panel does not scale
  its form contents.
- More Options expands into the sheet's own scroll area and remains usable.
- Event → Action → Event switches correctly during the same session.

### 390 × 601 — dark/high-chroma (`Obsidian / Acid`)

- The shorter viewport uses the bounded sheet height and keeps the primary
  controls reachable; the content can scroll inside the sheet instead of
  moving the page.
- Entry and settled states show no white flash, blank sheet, or clipped primary
  action.

### Light-theme confirmation — `Cream / Terracotta`

The settings surface was opened through the mobile navigation, the light theme
was selected, and the NEW Composer was opened and visually checked. Accent
contrast, border/radius treatment, source/body handoff, and settled form
readability remained coherent. The browser session was then restored to the
default dark/high-chroma theme.

The same Chrome session also exercised the mobile navigation open state and its
calendar return rail; the rail was flush to the viewport edge and did not
introduce a gap while the app surface moved.

## Known remaining failure

The only full-suite failure is reproducible in isolation:

```text
tests/e2e/interaction-feedback.spec.js:41
focus remains visible and disabled primary actions stay inert
Expected width: 401.88006591796875
Received width: 408
```

The test failed both in the full run and in a dedicated rerun. The motion track
does not touch that test's implementation surface; the changed production
files are limited to motion timing, Sheet motion, and notch styles. This should
be handled as a separate interaction-feedback baseline investigation rather
than folded into the morph change.

## Follow-up suggestions

1. Establish a same-environment baseline for the interaction-feedback width
   assertion and decide whether its expected geometry should be tokenized or
   whether a responsive measurement is intended.
2. Keep the settled source cleanup assertion alongside future morph changes;
   without it, a hidden label can silently retain a blur/transform animation
   fill even when the screenshot looks correct.
3. If a future visual pass changes the handoff cadence, retain the shared-clock
   sampler and the 25/50/75% interruption matrix so a pleasing midpoint cannot
   regress reversal behavior.
