# Mobile Timeline drag/scroll ownership QA

Date: 2026-08-22
Branch: `fix/mobile-timeline-drag-scroll-ownership`
Plan: `docs/plans/2026-08-22-1052-fix-mobile-timeline-drag-scroll-ownership-plan.md`

## Scope

This remediation separates touch body movement from explicit Event resize
grips, keeps the existing interaction transaction as the logical owner, and
locks only the active Day stream's DOM scroll position. Desktop pointer resize,
Action estimate resize, completion swipe, JOIN, recurrence, Week, navigation,
ribbon, Timeline chrome, and persistence contracts remain in scope for
regression verification.

## RED evidence on base

The U1 CDP characterizations were run against the plan base before the
production wiring:

- a 60-minute upper Event hold outside the centered grip resized the start
  instead of moving the Event;
- a lower Event hold outside the centered grip did not produce the expected
  move and duration-preserving result;
- semantic Event touch grips were absent;
- a forced Day-stream `scrollTop` change after Event lift remained applied;
- the supported external-origin Actions-column characterization remained green
  on base, documenting the existing fallback behavior rather than inventing a
  mobile-only sheet flow.

The follow-up review also produced three RED regressions before its production
changes:

- an immediate mouse drag from the centre of an eligible Event's semantic grip
  did not move the Event with its duration preserved, because the touch marker's
  pointer handler intercepted the desktop path;
- introducing a stationary second touch without another move left the active
  Event rendered and owned by the stream;
- ending a foreign touch identifier left the active Event rendered and locked
  when the compatibility pointer-up/cancel path was isolated, because the
  native terminal guard returned without cancelling the existing sequence.

## Automated evidence

All browser runs use an isolated Playwright preview port and Chromium CDP
`Input.dispatchTouchEvent` sequences.

- Focused gesture/ownership units plus architecture, target, and lock tests:
  55/55 passed.
- Focused Event/timeline browser suite (`timeline-touch.spec.js` and
  `timeline-gestures.spec.js`): 38/38 passed on port 48834.
- Full Action browser suite, including the external-origin characterization:
  45/45 passed on port 48835.
- Mobile ownership repeat gate: 4/4 passed three consecutive times on ports
  48836, 48837, and 48838.
- Adjacent gesture/contract suite: 17/17 passed on port 48839.
- Adjacent recurrence/JOIN suite: 15/15 passed on port 48840.
- Adjacent Week/chrome/navigation suite: 29/29 passed on port 48841.
- Full unit suite: 645/645 passed.
- Production build: passed (`vite`, 187 modules; existing chunk-size warning
  only).
- Full Chromium browser suite: 353/353 passed on isolated port 48842.

Covered behaviors include ordinary upper/lower Event moves, eligible semantic
start/end resize, short-card move-first classification, pre-lift scroll, forced
post-lift Event and Action scroll restoration, Action estimate resize, Action
completion swipe, JOIN, the base-green external-origin characterization, and
second-finger cancellation. The unsupported document-level touch fallback was
removed; the supported Actions-column path remains covered.

## Windows Chrome visual checklist

Status: passed by inspection in Windows Chrome at the local production preview
(`http://127.0.0.1:48818/`).

Required viewports:

- 390×844: inspected the phone layout, Timeline/Actions rail, backup and
  away-state banners, and card/ribbon spacing; no overlap or clipping was
  observed.
- 390×601: inspected compact geometry and the sticky Actions rail; no overlap
  or clipping was observed, and no Event touch grips were exposed for the short
  rendered geometry.
- 1280×900: inspected the desktop split Timeline/Actions layout, lane packing,
  event cards, and semantic grip presence; no overlap or clipping was observed.

The interaction assertions for Event/Action lift, pre-lift scroll, post-lift
lock, resize, completion, and cancellation are provided by the CDP browser
gates above; screenshots were temporary inspection captures and are not kept
as source artifacts. The follow-up removed handlers from semantic touch markers
only; it changed no geometry or style, and the existing Windows Chrome visual
pass remains applicable. The desktop grip regression is additionally covered
by the 1280px browser matrix above.

## Physical-device release gate

`implementation verified; physical-device release gate pending`

Representative iOS Safari and Android Chrome devices were not available during
implementation. Physical validation must cover Event/Action lift, pre-lift
scroll, post-lift ownership, semantic resize, cancellation, and the immediate
next interaction before public release. Desktop Chrome/CDP evidence is not a
substitute for that gate.
