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

The final desktop review found one further, distinct RED case. The 44×44
semantic touch markers sit above the legacy full-width desktop resize zones. A
mouse drag in either marker's centred area therefore reached the Event body
when the marker had no pointer routing:

- the start-marker drag moved both endpoints rather than preserving the end;
- the end-marker drag moved both endpoints rather than preserving the start;
- a body drag outside the centred markers still moved the Event correctly.

This was reproduced by temporarily removing the marker callbacks: both edge
tests failed while the outside-body move test passed. The corrective routing is
intentionally narrow: marker `pointerdown` calls the existing `resizeDown` for
mouse and pen; `resizeDown` returns immediately for touch, leaving touch
classification to the delegated native Day-stream path.

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
- Initial full Chromium browser suite: 353/353 passed on isolated port 48842.
- Final desktop semantic-grip regression gate: 3/3 passed, then 9/9 across
  three consecutive runs on port 48898.
- Final combined Event, Action, and touch-ownership browser matrix: 85/85
  passed on isolated port 48900.
- Final full Chromium browser suite after the semantic-grip remediation:
  355/355 passed on isolated port 48905.

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
as source artifacts. The final marker callbacks change no geometry or style;
they restore the desktop resize route only and leave touch in the delegated
native classifier. The desktop grip regression is additionally covered by the
1280px browser matrix above.

## Final Windows Chrome review

At 100% Chrome zoom on the production preview, the Timeline ribbon, split
Timeline/Actions layout, navigation open/close, NEW Composer open/close, and
Event inspector all rendered without overlap or stranded visual state. A
desktop Event body drag visibly followed the pointer, persisted, and was
restored to its original 09:00–11:00 sample timing.

At compact Chrome zoom (150–175%), the responsive Actions rail and navigation
remained usable without visible collisions. This is a narrow-layout proxy, not
a substitute for the physical-device gate below.

The final desktop semantic-grip pass used a tall `Client review — Nordwell`
Event in real Windows Chrome. A vertical drag from the centred start marker
changed 15:00–16:30 to 14:20–16:30; from the centred end marker it changed
15:00–16:30 to 15:00–17:10. A drag just outside the centred marker moved the
whole Event to 16:00–18:10, preserving its 130-minute duration. The respective
resize/move toast feedback matched those persisted results.

One unrelated lifecycle observation remains open: after switching and
scrolling responsive states, the date ribbon temporarily rendered blank; a
full reload restored it. This remediation does not claim to fix that Week/ribbon
readiness issue and no ribbon code was changed here.

## Physical-device release gate

`implementation verified; physical-device release gate pending`

Representative iOS Safari and Android Chrome devices were not available during
implementation. Physical validation must cover Event/Action lift, pre-lift
scroll, post-lift ownership, semantic resize, cancellation, and the immediate
next interaction before public release. Desktop Chrome/CDP evidence is not a
substitute for that gate.
