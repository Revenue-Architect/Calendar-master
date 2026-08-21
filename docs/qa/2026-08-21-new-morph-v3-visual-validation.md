# NEW Morph v3 — remediation and perceptual validation report

Date: 2026-08-21
Branch: `feat/new-morph-v3-transitions-match` (PR #6)
PR URL: https://github.com/Revenue-Architect/Calendar-master/pull/6
HEAD before remediation: `71e4ed150c9d0b30ab7a036cbc27f476fd1d3782`
Code/test remediation head before this report: `3fc68eb`
Base used for comparison: `e3bca9f86cae2cdcb3b4ed4879a8d31d678c6914`

## Executive result

The remediation corrects the review findings without redesigning NEW Morph v3.
The accepted causal sequence remains:

```text
measured NEW / +ACTION trigger
  → true-size Sheet surface expands continuously
  → source identity exits left
  → Composer body arrives from the right
  → fast settle
  → reverse on close
```

The intentional `.985` Composer micro-scale, 350ms open cadence, 200ms
handoff, 32px handoff travel, asymmetric clip-path, ResizeObserver sizing,
in-flight reversal, reduced-motion semantics, and keyboard/focus behavior were
preserved. No Planner, Composer, Sheet markup, navigation, ribbon,
persistence, or domain files were changed by this remediation.

The motion, interaction, unit, build, and Composer gates are green. The final
fresh repository E2E run produced **323 passes and three failures** in the
existing timeline-chrome scroll cases (phone Day, desktop Day, and desktop
Week). The same three tests fail on the PR base in the same Chromium
environment. They are therefore documented as baseline failures, not
attributed to v3; the full suite is not described as an unqualified green run.

## Remediation scope

The remediation delta contains only these files:

- `src/features/motion/plannerStyles.js`
- `src/features/motion/morphTiming.js`
- `src/features/motion/morphTiming.test.js`
- `tests/e2e/motion.spec.js`
- `tests/e2e/interaction-feedback.spec.js`
- this report

The existing PR's earlier `Sheet.jsx` work remains unchanged. The real Sheet
is still true-size: no width/height animation, full-Sheet scale, animated blur,
second modal framework, or duplicated Composer DOM was introduced.

## Review findings and fixes

| Finding | RED evidence | Root cause | Remediation | GREEN evidence |
| --- | --- | --- | --- | --- |
| Interaction feedback geometry | Baseline interaction test failed with expected width `401.8800048828125` and received `408`. | The test sampled ADD TO TIMELINE while the intentional `.985` Composer entrance scale was still active, then compared it after the body settled. | `interaction-feedback.spec.js` now waits for the product state `[data-test="sheet"][data-morph-stage="open"]` before establishing the geometry baseline. No tolerance was changed and the `.985` scale remains. | The interaction suite passed 4/4 on three consecutive runs. |
| OS reduced motion | With the new body normalization temporarily removed, computed styles still reported a running `nbnotchbodyin` animation. | The original reduced-motion rule predated the independently animated `.nb-notch-body`. | Scoped OS selectors now force body animation/transition off, opacity 1, identity transform, and no filter; the source is hidden, identity-transformed, unblurred, and non-interactive. | OS reduced-motion assertions pass with no body travel/scale/blur and no `nbnotchbodyin`. |
| In-app reduced motion | With the generated preference selectors temporarily removed, the same body animation remained active. | The in-app `preferences?.display.reducedMotion` CSS path did not normalize the new body animation. | The generated preference CSS contains the same body and source rest-state normalization independently of the OS media query. | In-app reduced-motion assertions pass with an immediately readable body and cleaned source. |
| Stalled Composer body | With the open-stage body rule temporarily removed, pausing `nbnotchbodyin` near 10% left the body at opacity 0 when the wall-clock stage reached `open`. | The v2 wall-clock recovery normalized the source but v3 had not made the body rest state authoritative. | At `data-fluid-origin="notch"` + `data-morph-stage="open"`, the body is forced to animation none, opacity 1, identity transform, and no filter. This selector does not apply to source/content/closing stages. | The deterministic stalled-body test passes and verifies source cleanup as well. |
| Settled close cadence | Temporarily restoring the panel fold to 240ms made the close test report token 250ms vs actual 240ms. | `nbnotchout` retained a hard-coded 240ms while body, source, and unmount used `MORPH_CLOSE_MS`. | Notch panel fold now uses `var(--nb-morph-close, 250ms)`, sharing the production token with body/source/unmount. | Browser inspection reports fold, body, and label durations all equal the CSS close token; unit coverage pins `MORPH_CLOSE_MS` to 250ms. |
| Ordinary Sheet scope leak | Review identified the global scrim retime as a possible non-notch regression. | A notch-specific cadence had changed the generic scrim rule from 240ms to 250ms. | Generic `.nb-scrim.nb-fluid-closing` is restored to its baseline 240ms; the existing `.nb-scrim:has(> .nb-fluid[data-fluid-origin="notch"])` boundary applies the 250ms token only to notch scrims. | Settings, Event inspector, and Action inspector remain `data-fluid-origin="trigger"`, use generic animation names, and do not run notch body/label animations. |

No RED sabotage was committed. Each deliberate negative control was restored
before the corresponding implementation commit.

## Motion and reduced-motion contract

The final implementation preserves these v3 tokens:

- `MORPH_MS = 350`
- `MORPH_CLOSE_MS = 250`
- `MORPH_HANDOFF_MS = 200`
- `MORPH_HANDOFF_SLIDE_PX = 32`
- `MORPH_CONTENT_SCALE = .985`
- `MORPH_CONTENT_BLUR_PX = 1.5`

At rest, both reduced-motion paths produce the same effective state without
waiting for the staged morph: the Composer body is immediately readable at
identity transform and no blur, and the source clone is immediately hidden,
identity-transformed, unblurred, and non-interactive.

The wall-clock `open` stage is authoritative if a CSS animation clock stalls.
Closing is not affected by the open-only recovery selector, so the close path
can still reverse and fold normally.

## Automated verification

| Check | Result |
| --- | ---: |
| `node --test src/features/motion/morphTiming.test.js src/features/motion/fluidGeometry.test.js` | 17 passed |
| `npx playwright test tests/e2e/motion.spec.js --workers=1 --grep "notch\|reduced"` | 25 passed |
| `npx playwright test tests/e2e/motion.spec.js --workers=1 --grep "ordinary Settings"` | 1 passed |
| `npx playwright test tests/e2e/motion.spec.js --workers=1` | 48 passed |
| `npx playwright test tests/e2e/interaction-feedback.spec.js --workers=1` | 4 passed, repeated 3 consecutive times |
| `npx playwright test tests/e2e/composer.spec.js --workers=1` | 6 passed |
| `npm test` | 634 passed, 0 failed |
| `npm run build` | passed; only the existing large-chunk warning |
| Full `npx playwright test --workers=1` on final remediation tip | 323 passed, 3 failed |
| Same focused timeline suite on base `e3bca9f` | 1 passed, 3 failed — the same three failures |
| `npx playwright test tests/e2e/week-drag.spec.js --workers=1` on final tip | 8 passed |

The two residual failures are:

```text
tests/e2e/timeline-chrome-scroll.spec.js
  phone: gives day view its hours back on the way down, and the heading back at midnight
  desktop: gives day view its hours back on the way down, and the heading back at midnight
  desktop: gives week view its hours back on the way down, and the heading back at midnight
  Error: scrolling away from midnight must collapse the chrome
  Expected: true; Received: false
```

The three failures reproduced on the untouched PR base under the same Chromium
binary and test command. The phone Week case passes on both revisions. A
separate one-off Week drag failure appeared in an earlier full-suite run, but
the affected test passed in isolation on both revisions and the complete
Week-drag file passed 8/8 on the final tip; it was not reproducible and was not
treated as a v3 regression. No v3 remediation file is involved in the
timeline-chrome behavior, and no attempt was made to widen this PR into a
timeline-chrome fix.

## Chromium visual validation

Validation used the production bundle from the isolated PR worktree in real
Chrome at 100% browser zoom. The default `Obsidian / Acid` dark, high-chroma
theme was used for the frame matrix. Computed values below were read from the
live DOM at the shared 350ms clock; screenshots were also inspected at early,
midpoint, settled, and close states.

### Shared-clock observations

| Frame | Desktop 1280×900 — NEW | Mobile 390×844 — +ACTION |
| --- | --- | --- |
| 0% | Panel starts at the measured NEW bounds (`x≈764`, `y≈36`) with a true-size `448×505` surface translated from the trigger. Source opacity is 1; body opacity is 0, scaled `.985`, and blurred 1.5px. | Panel begins at the bottom +ACTION origin (`x≈−10`, `y≈377`) with the true-size `390×458` surface. Source remains fully present; body is hidden, scaled `.985`, and blurred 1.5px. |
| 20% | Panel has moved left/down (`x≈611`, `y≈107`); source is fading and has travelled about 23px left; body has begun entering at ~6% opacity from the right. | Panel has moved toward the bottom edge (`x≈−6`, `y≈381`); source is ~28% opaque and travelling left; body has begun entering at ~6% opacity. |
| 40% | Panel is near its destination (`x≈473`, `y≈172`); source is effectively gone; body is ~90% opaque, nearly identity scale, and its blur is effectively zero. | Panel is within about 2px of its destination; source is gone; body is ~90% opaque and nearly at identity. |
| 60% | Body is fully readable at identity with no blur; panel still completes its final ~32px physical travel; source stays left and non-readable. | Body is fully readable with no blur; the panel finishes its short bottom-edge travel without a gap. |
| 80% | Panel is at final bounds (`x≈416`, `y≈198`) and body is settled. The source cleanup is finishing its rest-state normalization. | Panel is flush to the viewport (`x≈0`, `y≈387`) and body is settled; no horizontal gap or white flash is visible. |
| 100% | `data-morph-stage="open"`; panel/body transforms are identity, body opacity is 1 and filter none, source opacity is 0 with identity transform/filter. | Same final contract; the full-width sheet is readable, source is hidden, and no residual transform/filter tail remains. |

The screenshots show a single continuous material handoff: the surface starts
moving before the Composer body is readable, the source exits left while the
body arrives from the right, and the physical Sheet settles without scaling.
There is no eight-group visible arrival, layout jump, or blank identity gap.

### Additional viewport and close checks

- **390×601:** settled +ACTION sheet measured `390×458` at `y≈143`; body
  opacity was 1, transform none, filter none, and source opacity was 0. The
  primary action remained inside the bounded sheet; the short viewport did not
  introduce page scrolling, clipping, or a white flash.
- **Close:** a live 390×601 close sample reported `data-morph-stage="closing"`,
  body opacity 0, body transform translating left by the handoff distance, and
  the panel and notch scrim still moving as one surface. The screenshot showed
  the underlying timeline returning without a stale scrim or snapped edge.
- **Desktop:** the settled NEW form was centered and fully readable; the
  source label was gone and the panel had no horizontal scrollbar.
- **Performance:** the first-open path was inspected at desktop and mobile.
  The 1.5px transient blur remained because no visible first-open stutter was
  observed. It is explicitly cleared at rest and under both reduced-motion
  paths.

## Ordinary Sheet verification

The Settings Sheet, Event inspector, and Action inspector were opened and
closed in Chromium and asserted in the motion suite. Each remains a generic
`data-fluid-origin="trigger"` surface with its existing `nbfluidorigin` entry
and 240ms generic scrim close. None uses `nbnotchbodyin`, `nbnotchlabelout`, or
the notch settled-close choreography. This remediation therefore does not
retime or redesign ordinary Sheets.

## Residual difference from Transitions.dev

The implementation intentionally does not copy Transitions.dev CSS. It keeps
the app's measured true-size Sheet, asymmetric clip-path geometry, source
identity handoff, ResizeObserver height path, app-specific timing tokens,
focus/scroll-lock semantics, in-flight reversal, and reduced-motion behavior.
The perceptual reference is the causal motion sequence, not a literal CSS or
modal-framework transplant.

## Suggestions

1. Track the two timeline-chrome scroll failures in their own regression PR;
   the same-environment comparison proves they predate this v3 remediation.
2. Keep the interaction baseline synchronized on `data-morph-stage="open"`;
   replacing it with a sleep would reintroduce the `.985` sampling race.
3. Keep the open-stage body recovery assertion next to future motion changes;
   it protects against a dead CSS animation clock without adding React
   per-frame state.
4. If first-open performance changes on lower-end devices, remove the transient
   body/source blur before changing translate, opacity, or the micro-scale.
