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

No DPR-2 run was required for the chosen Option 2; the DPR-1/DPR-2 requirement
applies when Option 1 keeps an animated clip path. No physical Android or iOS
device was available.

**implementation complete; physical-device paint gate pending**
