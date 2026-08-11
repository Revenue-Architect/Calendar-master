# Motion and Segmented Progress Stabilization Design

**Status:** Approved for implementation on 2026-08-10.

## Goal

Keep Calendar Master’s liquid and morphing visual language while removing the
flicker, bounce, disconnected travel, and identity-dependent progress behavior
introduced by the recent animation work.

## Problem

The current liquid-pill implementation measures the new active option after the
DOM has already changed, then renders both the pill and its extra “droplet” from
that new rectangle. The second shape therefore has no reliable origin and the
runtime goo filter is mounted and unmounted during the transition. Several
controls also use overshooting cubic-bezier curves, and pressed controls receive
both the legacy `.nb-tap` transform and the newer global `scale` response.

Checklist progress is rendered directly from each checklist item’s `done` state.
That makes segment position encode item identity instead of completion count, and
the segment itself changes only `background`, so a completion reads as a color
swap instead of a fill.

## Design

### One-material liquid controls

`useLiquidPill` will retain the measured active rectangle but animate from the
previous rectangle through a one-frame staging state. The indicator remains one
accent surface and uses a bounded horizontal stretch during travel. The droplet
and runtime SVG goo filters will be removed from pill, search, and weekday
controls; the liquid character will come from the stable surface’s movement,
stretch, and fill rather than a second shape with a lifecycle tied to timing.

Search keeps its reserved-width expanding pill and weekday chips keep their
animated selected fills. Both remain usable and visually expressive without
filter toggling. Reduced-motion behavior continues to remove movement and
transition effects while preserving the controls.

### Shared, restrained motion

Recent overshooting timing curves will be replaced with one monotonic ease for
layout movement and a short ease for opacity/color changes. The sheet notch keeps
its measured trigger-to-panel morph, but its entry and exit use the same restrained
timing and do not overshoot. Press feedback will have one source of truth: the
global standalone `scale` property; the overlapping `.nb-tap` transform response
will no longer compound it. Completion pops remain, but at a small scale and with
the same non-bouncy timing.

### Count-driven segmented progress

The checklist progress row will render `total` indexed track segments. The first
`done` segments are filled, regardless of which checklist item supplied the done
count. Each track contains an accent fill whose `transform: scaleX()` transitions
between `0` and `1` from the left edge. This makes both filling and draining
visible and keeps the visual sequence A-to-B even when a later step is completed
first. Existing progressbar semantics continue to expose `aria-valuenow` as the
count and `aria-valuemax` as the total.

## Scope and compatibility

- Preserve the existing component structure, React 19 runtime, CSS-in-JS style
  strings, reduced-motion preference, and keyboard/touch behavior.
- Change only motion presentation and checklist progress rendering; task,
  checklist, persistence, and scheduling semantics remain untouched.
- Keep the current accessible progressbar and control labels.

## Verification

- Add a regression test proving that completing checklist item B first fills only
  segment 1, then segment 2 on the next completion.
- Add motion regression assertions for the absence of idle/runtime goo filters,
  stable selection changes, reduced-motion behavior, and preserved sheet routes.
- Run all unit tests, the production build, and the complete Playwright suite when
  a Chromium binary is available. Inspect the final diff and status before pushing
  `main`.
