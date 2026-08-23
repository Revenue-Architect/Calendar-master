# Navigation shell motion performance QA

Date: 2026-08-23
Branch: `fix/navigation-shell-compositor-travel`
Authored base: `e5c243e5b7e5baeceae73dd9fed4dbb6e6d5cc4e`
Implementation source head: `fd4203e` (`fix(nav): move shell framing to browser transforms`)
Protection-test head: `253be84` (`test(nav): isolate progress telemetry from geometry`)
Corrective corner-geometry source head: `aa18cd0` (`fix(nav): scale in-flight corner masks`)

This record separates automated/headless evidence, headed Windows Chrome evidence,
and the still-pending physical-device gate. It does not claim that device paint
behavior has been verified without a device.

## Scope and contract

The navigation travel remains one 520 ms transaction on `--nav-ease`
(`cubic-bezier(.22,.61,.36,1)`). The planner surface is never scaled and no
layout dimension is animated. The existing desktop geometry is preserved:

| geometry | closed | open |
| --- | ---: | ---: |
| viewport top/right/bottom/left | 0 / 0 / 0 / 0 | 24 / 22 / 24 / 322 px |
| viewport radius | 0 px | 22 px |
| carrier x/y | 0 / 0 px | 322 / 20 px |

At 390 px width, both tested mobile heights use the existing mobile contract:
the final frame is top 14 px, right 0 px, bottom 14 px, left 346 px, radius
16 px; the carrier ends at x=390 px and the 44 px CALENDAR rail ends at x=390
px. The 390x844 and 390x601 checks confirm a <=1 px rail/surface seam.

## Environment

- Windows headed environment: Windows Chrome available through Playwright/CDP;
  Chromium executable `C:\Users\Kamran\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`.
- Node `v24.18.0`; npm `11.16.0`.
- Playwright `1.62.1`; browser product/file version `151.0.7922.34`.
- Automated runs used the `chromium` project, one worker, and isolated preview
  ports after fresh Vite builds (4353 for the corrective validation).
- Headed profile viewport sizes: 1280x900, 390x844, and 390x601. Observed
  device scale factor was approximately 1 (`0.9999999688656018`).

## Baseline evidence at the exact base

The baseline was checked from an isolated worktree at the exact authored base,
not from a stale local main. `npm test` passed 645/645. The five required
focused suites passed 79/79 with Chromium and one worker.

The direct mutation probe recorded distinct inline viewport `clip-path` values
while an active travel was observable. Normal open and close runs produced
52--63 distinct writes per travel. Mid-open and mid-close interruptions produced
roughly 100 or more writes across the interrupted phase. This is the RED
mechanism evidence; it is not inferred from a final style check.

Paint flashing was available in headed Windows Chrome through the DevTools
Overlay domain. At all three requested sizes the baseline flash showed broad
green coverage over the application surface. A controlled exact-base 1280x900
trace containing one open and one close recorded 557 `Paint` events, including
128 on the navigation viewport and 175 on `#document`; it also recorded 203
`PrePaint`, 187 `UpdateLayoutTree`, 300 `FunctionCall`, 134
`FireAnimationFrame`, 775 `RasterTask`, and 177 `Layerize` events. The longer
10-cycle trace showed the same relationship: viewport/document paints repeated
with each travel while scripting, prepaint, and paint work accumulated.

Therefore the current per-frame inline clip mutation and repeated broad surface
paint were sufficiently correlated to justify an implementation attempt. This
does not assert that every Chromium clip path is inherently uncompositable.

## Options investigated

### Option 1: WAAPI clip path

The first prototype moved the viewport clip path into a browser-owned WAAPI
animation while retaining compositor translations. It was rejected by evidence:
in headed Chromium the viewport still recorded 128 paints in the controlled
1280x900 trace, `#document` remained around 178 paints, and broad paint flashing
remained. The measured result did not satisfy the requirement to avoid
unacceptable repeated application-surface paint/prepaint.

### Option 2: transform-only framing (chosen)

The final implementation leaves the viewport un-clipped during active travel.
Four shell-coloured edge walls and four quarter-corner walls form the frame;
each wall is animated with a transform. The carrier, drawer, labels, walls,
and mobile rail are all sampled from one logical run and handed to WAAPI. The
terminal frame applies the exact static clip path once. The walls use
`pointer-events:none`; the drawer is above them and the mobile rail remains a
real interactive control.

This is not a silent acceptance of a different destination shape: the static
terminal clip and mask dimensions use the existing `navPageFit()` and
`navMobileMotion()` geometry, while the regression checks measure both mobile
heights and the rail/surface seam. `Planner.jsx`, drawer dimensions, typography,
IA, routing, and unrelated motion domains were not changed.

The four corner walls also scale from zero to their destination radius during
travel. Their transform origins face the interior corner (bottom-right,
bottom-left, top-right, top-left respectively), and the translation plus scale
algebra matches the old `inset(... round radius * progress)` boundary at every
sampled progress; the planner surface is never scaled.

## Clock, reversal, and accessibility behavior

- Each travel has one logical transaction containing run id, source progress,
  target progress, derived direction, start time, 520 ms duration, and phase
  state. Stale `onfinish` callbacks are ignored by run id; no child
  `transitionend` is used to complete a run.
- WAAPI owns visual interpolation. The requestAnimationFrame ticker only writes
  `data-nav-progress` for observability and interaction bookkeeping; it does not
  write clip, transform, mask, drawer, label, or rail geometry.
- A reversal samples the shared clock before cancellation, cancels every active
  animation, and starts all channels from that same source frame. If React has
  already cleared the clock during a completion handoff, the event-time sample
  reads the carrier's computed transform once to avoid returning to a terminal
  frame. This is not a per-frame geometry read.
- Reduced motion skips travel and applies the terminal geometry immediately.
  Escape, the open toggle, the mobile CALENDAR rail, destination close, surface
  close, focus routing/restoration, and existing interruption semantics remain
  covered by the existing suite.

## Regression evidence

The new mechanism test was run against the exact current base before production
changes and failed RED with 12 distinct inline clip values during an active
run. The final implementation passes GREEN with at most one distinct inline
value (the initial active `none` write). The test confirms an active opening
phase, a positive run id, and an in-flight progress sample; it does not use a
fixed sleep to manufacture a count.

The corner-geometry test was added against the current PR head before the
corrective change. It failed RED at an in-flight progress of about 0.2--0.8:
the fixed 22 px desktop corner was measured where approximately `22 * p` was
required. The final test reads `data-nav-progress`, bounds the sample to
0.2--0.8 with a 90-frame lifecycle cap, and passes for both desktop radius 22
px and mobile radius 16 px. A local negative control removing only the corner
scale failed again (16.28 px geometry error); the scale was restored before
the final build.

Additional protection tests verify that:

- active framing has no viewport clip animation and the edge/corner animations
  are browser-owned;
- progress telemetry can advance while the observed visual inline styles remain
  unchanged;
- mobile walls meet the final `navMobileMotion()` frame and rail at both 390 px
  heights, and all eight walls have `pointer-events:none`;
- reversal keeps the stage unclipped, restarts mask channels, and does not pop
  to the open destination wall;
- the existing focus, Escape, destination, surface-close, mobile rail, reduced
  motion, and Composer/ribbon protections remain intact.

For the required negative control, the old per-frame inline clip write was
temporarily restored in the ticker without committing it. The mechanism test
returned RED with 11 distinct values. That diagnostic write was removed, and
the same test returned GREEN. No sabotage remains in the branch.

## Automated verification

| check | result |
| --- | --- |
| `npm test` at exact base | 645 passed |
| exact-base focused nav/motion/mobile/shell/reveal, Chromium, 1 worker | 79 passed |
| corrective nav file (`navigation-shell.spec.js`), Chromium, 1 worker | 20 passed |
| final focused nav/motion/mobile/shell/reveal, Chromium, 1 worker | 85 passed |
| corrective full `npx playwright test --project=chromium --workers=1` | 363 passed, 1 transient `polish.spec.js` failure |

The focused run includes open/close, mid-open and mid-close reversal, mobile
rail, Escape, destination close, surface close, reduced motion, focus, and the
new compositor/mask protections. The full suite was run from the fresh final
build on the isolated preview port. Its one unrelated long-sheet failure passed
against the exact-base build with the same browser/worker strategy and passed
again when rerun on the corrective build, so it is recorded as a transient
baseline-equivalent failure rather than attributed to this PR.

The corrective repeat check completed without retries: 10 desktop open/close
cycles, 2 mid-open reversals, 2 mid-close reversals, 20 mobile CALENDAR-rail
cycles (10 each at 390x844 and 390x601), and one reduced-motion open/close.

## Headed Windows Chrome performance evidence

The requested 10 open/close cycles plus two mid-open and two mid-close
interruptions were exercised at each of 1280x900, 390x844, and 390x601. Paint
flashing and DevTools traces were captured with the visible Windows Chrome
browser. The final fresh-build trace showed terminal-only viewport/document
paint counts rather than per-frame surface repaint:

| viewport | Paint total | viewport Paint | `#document` Paint | PrePaint | UpdateLayoutTree |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1280x900 | 136 | 4 | 6 | 136 | 134 |
| 390x844 | 126 | 4 | 6 | 136 | 134 |
| 390x601 | 126 | 4 | 6 | 136 | 134 |

These paint counts are from the final transform-wall build immediately before
the narrow corner-scale correction. That correction changes only the eight
frame-mask transforms; it does not reintroduce a viewport clip animation,
surface scaling, or per-frame application-surface mutation. The corrective
geometry and interaction gates were rerun; a new physical-device paint trace
was not available.

The small mask elements accounted for 40 `I` paints on desktop and 35 on each
mobile trace. These traces support that the whole application surface no
longer repaints for every travel frame in this environment; they do not prove
that every physical GPU/device has identical behavior. Final screenshots and
trace artifacts are intentionally left untracked in the worktree.

Fractional-DPR seam validation is required for the chosen Option 2 as well; no
clip-path-specific exemption is assumed. The post-review probe at DPR 1, 1.25,
1.5, and 2 is recorded below. No physical Android or iOS device was available.

**implementation complete; physical-device paint gate pending**

## Post-review correction: fractional-DPR mask validation

This section was added after independent review of the prior branch head and
preserves the earlier profiling and paint-trace provenance above.

- Review start head: `4b732cd875467f2ed0e892b1cce437e75fa96d98`.
- Corrective test commit: `be2f32e5dea796c8936260a524216735592ab421`
  (`test(nav): tighten corner scale tolerance`).
- The final QA-evidence commit is the documentation commit immediately after
  that test commit in this branch.
- Production motion files are unchanged from the review start head; the final
  production diff against that head is empty.

### Assertion integrity

The corner-scale assertions now use explicit absolute error checks:
`Math.abs(actualScale - sample.progress) < 0.08` for both axes. Width and height
remain independently bounded at `< 1.5 px`.

Before accepting the assertion change, a local uncommitted negative control
removed only `scale(progress)` from the production corner-mask transform. The
command below ran only the corner-geometry test against a fresh negative-control
build:

```text
PLAYWRIGHT_PORT=4355 npx playwright test tests/e2e/navigation-shell.spec.js --project=chromium --workers=1 -g "active corner masks scale"
```

It returned RED: `1280px top-left width`, expected error `< 1.5`, observed
`16.5 px`. The production scale was restored immediately; the restored test
returned GREEN with `1 passed`. The temporary no-scale edit was not committed.

### Fractional-DPR probe and classifier controls

The final reviewed implementation was built fresh to `dist-corner-final` and
served on isolated preview port 4356. The probe used Windows software Chromium
`151.0.7922.34` at a 1280x900 CSS viewport, opened navigation, waited for the
settled `data-nav-state="open"` frame, captured a PNG, and decoded physical
pixels. `deviceScaleFactor` was set per run and the browser reported the same
actual `window.devicePixelRatio`: 1, 1.25, 1.5, and 2 respectively.

The classifier was validated rather than treating zero as a default. The shell
reference was the known shell-mask interior at CSS `(10,10)`, RGB `(23,24,27)`;
the known planner-surface reference was the app-surface interior at CSS
`(800,40)`, RGB `(10,10,12)`. A pixel was classified as planner surface only
when its RGB distance to the planner reference was less than its distance to
the shell reference and no more than 18. Both controls passed at every DPR:
the shell positive classified as shell (`classifiedPlanner=false`), and the
surface positive classified as planner (`classifiedPlanner=true`).

For each rounded desktop junction, the probe tested the physical pixels in the
22x22 CSS corner box that should be shell outside the rounded boundary (the
quarter-circle condition outside radius 22), then counted planner-classified
pixels. The result was zero stray planner pixels at every requested DPR:

| actual DPR | PNG pixels | top-left tested/stray | top-right tested/stray | bottom-left tested/stray | bottom-right tested/stray |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1280x900 | 102 / 0 | 102 / 0 | 102 / 0 | 102 / 0 |
| 1.25 | 1600x1125 | 149 / 0 | 177 / 0 | 150 / 0 | 177 / 0 |
| 1.5 | 1920x1350 | 230 / 0 | 230 / 0 | 230 / 0 | 230 / 0 |
| 2 | 2560x1800 | 413 / 0 | 413 / 0 | 413 / 0 | 413 / 0 |

The probe therefore found no top/corner, left/corner, right/corner, or
bottom/corner seam in this software Chromium raster. This is a desktop
software-raster validation, not a claim about every physical GPU or device.

### Post-review verification and device gate

- `npx playwright test tests/e2e/navigation-shell.spec.js --project=chromium --workers=1`: **20 passed**.
- `npm test`: **645 passed, 0 failed**.
- `git diff --check`: clean.
- Exact environment: Node `v24.18.0`, npm `11.16.0`, Playwright `1.62.1`,
  Chromium `151.0.7922.34`.
- Physical Android/iOS devices were unavailable. **implementation complete;
  physical-device paint gate pending**.

## Post-integration correction: CALENDAR rail corner continuity

The mobile return rail is permanently rotated 180 degrees. The previous CSS
radius therefore rounded the wrong visual side during travel, and an initial
review attempt to switch radii at terminal boundaries introduced a visible
shape swap at open settle and close start.

The final correction removes imperative radius ownership and uses one static
CSS topology for every state: `border-radius: 0 16px 16px 0`. After the rail's
180-degree transform, its exposed outer corners remain rounded while the edge
adjacent to the Calendar surface remains square. The same topology now applies
to closed, opening, open, closing, reversal, and reduced-motion states.

Evidence:

- The regression test was first observed RED against the old settled topology:
  expected computed top-left `0px`, received `16px`.
- `navigation-shell.spec.js` — **22 passed** after the final correction.
- The combined focused integration suite — **156 passed**.
- The final full Chromium suite — **380 passed**.
- Connected Windows Chrome at 390x844 reported the same computed radii during
  opening, settled open, and closing: `0px 16px 16px 0px`. The rail retained its
  rounded exposed ends without a settle/close-start pop.
- At 1280x900, the in-flight desktop frame remained convex; settled open used
  `clip-path: inset(24px 22px 24px 322px round 22px)` and all eight temporary
  navigation masks were hidden, so the earlier double-framed concave corners
  did not return.

Physical Android/iOS devices were unavailable. **implementation complete;
physical-device paint gate pending**.
