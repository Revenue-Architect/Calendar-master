---
title: Navigation Shell Continuity, Reload Resilience, and Week Ribbon First-Paint Repair
type: bugfix
status: proposed
date: 2026-08-20
reviewed: 2026-08-20
baseline_commit: d646625
target_domains:
  - navigation
  - motion
  - planner
  - resilience
  - accessibility
  - quality
---

# Navigation Shell Continuity, Reload Resilience, and Week Ribbon First-Paint Repair

## 1. Decision and intended outcome

This plan repairs one system, not a collection of unrelated visual symptoms: the
planner does not currently have a single, observable contract for how its shell
moves, how a document boots, and when a virtualized header is considered ready.

The implementation must deliver these user-visible outcomes:

1. the desktop navigation frame exposes all four sides continuously, including the
   narrow right edge, on first open, repeated opens, reversals, and loaded frames;
2. the mobile calendar surface and its vertical return rail behave as one spatial
   object, with no black gap, early disappearance, late disappearance, or dead
   visible control;
3. ordinary planner actions never initiate a document reload;
4. an intentional or development-triggered reload never exposes a white page;
5. if a production document reload still occurs, local diagnostics identify the
   lifecycle reason rather than asking the team to infer it from a symptom;
6. the Week ribbon is visibly positioned before interaction and stays recoverable
   through reload, background restoration, late layout, and view changes.

This is a correctness phase. It does not add decorative motion or retune the app by
eye. Every change is tied to a geometric, lifecycle, interaction, or accessibility
invariant and must be proven at intermediate frames as well as at rest.

## 2. Investigation scope and evidence standard

The investigation reviewed the current `main` branch at `d646625`, including:

- `src/features/planner/navigation.jsx`;
- `src/features/motion/plannerStyles.js`;
- `src/features/motion/navPageFit.js`;
- the ribbon state, virtualization, scrolling, and edge-fade code in
  `src/Planner.jsx`;
- `src/main.jsx`, `src/app/ErrorBoundary.jsx`, `index.html`, and `vite.config.js`;
- navigation, error-boundary, and reveal-without-paint browser tests;
- the navigation-motion history from `013ad51` through `d646625`.

Evidence labels in this document mean:

- **Confirmed:** reproduced visually or measured at runtime and explained by a
  directly responsible code path.
- **High confidence:** the code path and symptom agree, but the intermittent failure
  was not captured in the exact reported form during this run.
- **Open until instrumented:** several code paths can produce the same symptom; the
  implementation must first capture which branch occurred.

That distinction is important for the white-screen report. The repository proves a
development reload path and a white boot window. It does not currently prove that
ordinary production actions reload the document, and this plan must not turn a guess
into a product fix.

## 3. Verified baseline

### 3.1 Commands and runtime checks

| Check | Result | Meaning |
|---|---:|---|
| `npm run build:artifact` | passed | current production bundle and single-file artifact build |
| error-boundary and reveal-without-paint browser tests, repeated three times | 24 passed, 0 failed | React render failures have a fallback; resting ribbon opacity no longer depends on a paint callback |
| navigation, error-boundary, and reveal suite | 21 passed, 1 failed in the combined run | the loaded reversal path is timing-sensitive |
| isolated reversal test repeated five times | 5 passed, 0 failed | the combined-run failure is load-sensitive rather than deterministic in isolation |
| normal initial-load sampling | 25/25 selected Week cells intersected the ribbon viewport | the reported ribbon defect is intermittent |
| hard-reload early sampling | 19/20 had a ribbon at 160 ms; one was still in the notebook-loading state | readiness time is variable; an early timestamp is not a valid ribbon-ready signal |

The combined navigation run recorded a 56.18 px reversal discontinuity against a
35 px limit. An isolated rerun passed, which demonstrates that the current test can
observe load sensitivity but cannot deterministically control or explain it.

### 3.2 Computer Use visual findings

The live app was inspected in Chrome at desktop and mobile breakpoints.

- On desktop, an early opening frame made the right edge appear at an advanced or
  discontinuous position while the frame was still moving, then the edge settled
  back to its final narrow margin. The other sides communicated their travel more
  clearly.
- At the mobile breakpoint, the navigation settled with the planner content already
  fully transparent and a separately rendered calendar rail visible over an
  otherwise blank dark area. The rail and planner did not read as one surface.
- The Week ribbon was visible on the observed fresh load, consistent with an
  intermittent first-paint/positioning defect rather than a permanent hidden style.

### 3.3 Runtime geometry findings

At a controlled `1280 × 900` desktop viewport, the final navigation geometry was:

- surface translation: `322px, 20px`;
- clip insets: `4px 344px 44px 0`;
- visible frame: `24px` top, `22px` right, `24px` bottom, `322px` left.

The right margin is not animated directly. It is the residual of two large values:

```text
visual right gap = clip-right - translate-x
                 = 344p - 322p
                 = 22p
```

where `p` is transition progress. Transform is normally compositor-driven while
`clip-path` requires clipping/paint work. A missed first frame, first-use layer
promotion, or a mid-run geometry retarget can therefore consume a large portion of
the visible 22 px result even when both computed values eventually agree.

At a controlled `390 × 844` mobile viewport:

- open state: the surface and rail both began at `x = 341.28px`, but the surface's
  first child had `opacity: 0`;
- 340 ms into close: the rail was fully offscreen at `x = -44px`, while the surface
  still had `13.62px` of horizontal travel remaining;
- during that same visible closing phase, the rail had `pointer-events: none`;
- the surface uses `520ms`, the rail close uses `320ms`, and surface content opacity
  uses `150ms`.

This exactly reproduces the reported black gap, disappearance, and intermittently
dead rail.

### 3.4 Reload-path findings

There is no automatic production `location.reload()` call in an ordinary action
path. The three production reload calls are explicit buttons in:

- `src/app/ErrorBoundary.jsx`;
- the slow notebook-loading recovery view in `src/Planner.jsx`.

A running Vite server did emit:

```text
[vite] (client) page reload artifact/planner.html
```

when `npm run build:artifact` rewrote the generated artifact. Source changes also
participate in Vite HMR while development validation is in progress.

`index.html` provides an empty `#root`, but its dark page background arrives through
`src/index.css`, which is imported from the JavaScript entry. Before that dependency
loads in development, Chrome is free to paint its default white document. The React
error boundary cannot protect the interval before the entry module executes, a
failed module import, or a document-level reload.

### 3.5 Existing tests that encode or miss the defects

- The mobile navigation test explicitly requires the rail to leave the viewport
  **before** the surface finishes closing. The test currently codifies the reported
  bug as success.
- Desktop navigation assertions prove final geometry, not the continuity or
  monotonicity of each visible edge through the full transition.
- The reversal test samples frames but is not clock-controlled, and its combined-run
  failure is flaky under load.
- The reveal-without-paint test checks mounted cell opacity. It does not prove that
  the selected cell intersects the ribbon viewport or that the masked scroller
  produced pixels.
- The error-boundary tests begin after React is running. They do not cover entry
  failure, HMR/full reload, a missing JavaScript chunk, or the pre-CSS boot frame.

## 4. Root-cause register

| ID | Symptom | Root cause | Confidence |
|---|---|---|---|
| NAV-01 | desktop right edge snaps or appears late | the visible 22 px edge is the cancellation of a 344 px clip and 322 px transform on different rendering paths; the first run is not pre-promoted, resize mutates destination variables during motion, and tests only verify rest state | confirmed architecture; intermittent severity is load-dependent |
| NAV-02 | mobile app disappears instead of moving as one surface | every immediate child of `.nb-app-surface` fades to zero in 150 ms while spatial motion lasts 520 ms | confirmed |
| NAV-03 | mobile rail outruns the surface and exposes a dark gap | commit `965607b` moved the rail to a shell-level sibling with an independent 320 ms close while the surface keeps closing for 520 ms | confirmed |
| NAV-04 | visible rail sometimes does nothing | the closing rail remains `visibility: visible` while base CSS gives it `pointer-events: none`; `closeNavigation()` also ignores commands during `closing` | confirmed |
| NAV-05 | open/close reversal can jump under load | phase is reduced to `open` versus not-open CSS targets, transitions are retargeted rather than controlled from one timeline, and completion depends only on the surface transform event | confirmed by code; load-sensitive test observation |
| BOOT-01 | screen goes blank/white and appears to refresh | development full reload/HMR can replace the document, while the HTML has no inline critical paint or persistent boot fallback | confirmed for development |
| BOOT-02 | possible production refresh during random action | no automatic action-triggered production reload was found; the app has no lifecycle trail capable of distinguishing reload, renderer loss, module failure, or host restart | open until instrumented |
| RIBBON-01 | Week ribbon is empty until an arrow causes work | initial positioning is a one-shot side effect: the caller marks it positioned without verifying width, scroll application, or selected-cell intersection; callback-ref node changes are not effect dependencies | high confidence |
| RIBBON-02 | Week ribbon can fail to paint until interaction | `mask-image` is applied directly to a horizontally virtualized scroller whose observed scroll width was about 70,368 px; a scroll or date action forces a new compositor/paint pass | high confidence; exact intermittent branch needs capture |
| RIBBON-03 | tests pass while ribbon can still look empty | tests assert opacity but not viewport intersection, settled positioning, or rendered pixels | confirmed |

## 5. Product and interaction contracts

### 5.1 Navigation state contract

Replace the implicit `open`/not-open CSS interpretation with an explicit state
machine:

```text
closed <-> opening <-> open <-> closing
```

Commands must be reversible:

| Current state | Toggle command | Calendar-rail command | Outside/Escape |
|---|---|---|---|
| `closed` | start opening | unavailable | no-op |
| `opening` | reverse to closing | reverse to closing when visible | reverse to closing |
| `open` | start closing | start closing | start closing |
| `closing` | reverse to opening | reverse to opening while visible | continue closing |

Rules:

- one monotonically increasing motion-run ID owns every animation in a command;
- a stale animation completion cannot settle a newer run;
- focus enters the drawer only at `open` and returns to the toggle at `closed`;
- the drawer is inert outside `open`, but a visible rail must either remain actionable
  or be visually clipped below the hit-target threshold;
- reduced motion jumps directly between rest states while preserving the same focus,
  `aria-expanded`, `aria-hidden`, and `inert` results;
- no close command may be silently ignored merely because a close is already in
  progress; an opposite command reverses from current progress.

### 5.2 Spatial continuity contract

The navigation must have two geometric layers:

```text
NavigationFrame
├── NavigationShell
└── NavigationMotionViewport   # owns the visible frame/mask in viewport coordinates
    ├── NavigationMotionCarrier # owns planner translation
    │   └── PlannerSurface
    └── MobileCalendarRail      # shares viewport progress; never owns a timeline
```

The outer motion viewport exposes the final borders directly:

- desktop final mask: `24px 22px 24px 322px`;
- desktop carrier translation: `322px 20px`;
- mobile final mask: the configured 44 px rail at the configured 5 px edge gap;
- mobile carrier translation: the measured rail position.

The desktop right border must no longer be derived from `344px - 322px`. It is a
direct `0px -> 22px` viewport-coordinate inset. The carrier can move independently
inside that mask without defining the border's location.

The viewport, carrier, drawer, labels, and rail belong to one logical `MotionRun`:

- common start time;
- common normalized progress;
- common 520 ms duration and navigation ease unless reduced motion is active;
- common reversal point;
- completion only when the current run's full animation group settles.

Web Animations API is preferred for this controller because it can reverse from the
current time and gives the code a real completion primitive. If implementation
testing proves that grouped WAAPI animations cannot keep the mask and carrier within
the tolerances below, use one frame clock that writes a normalized progress value;
do not return to unrelated CSS transition lifecycles.

### 5.3 Mobile rail contract

- The rail is a child of `NavigationMotionViewport`, beside the carrier, rather than
  a shell-level motion owner. It is clipped by the same visible frame and controlled
  by the same `MotionRun`.
- It has no independent `transition-duration`, delay, easing, or fallback timer.
- Its position is derived from shared progress `p`: on a 390 px viewport its example
  horizontal track is `-44px + 385px * p`, while the frame's left edge is `341px * p`.
  The frame therefore reveals `44px * p` of the rail—44 px when open and zero when
  closed—without a discrete visibility cut or a separate finish time.
- The planner content remains visible through spatial movement. Remove the blanket
  `.nb-app-surface > * { opacity }` gate. If a dimming treatment remains desirable,
  it must be a non-blocking overlay and may never make the surface disappear.
- The maximum rail-to-visible-surface gap is 1 CSS px at every sampled frame.
- A rail with more than 2 visible CSS px is either actionable or marked and rendered
  noninteractive in a way that cannot be mistaken for a button.
- The rail's accessible name remains `Return to calendar`; in a closing reversal it
  may change to `Reopen navigation` only if the visible action actually changes.

### 5.4 Boot and reload contract

- `html`, `body`, and `#root` receive an inline critical dark background in
  `index.html`; first document paint cannot be white even if CSS or JavaScript is
  delayed or fails.
- Static boot markup exists before React and says `OPENING THE NOTEBOOK`. React
  replaces it only when the root commits.
- A small DOM-only bootstrap failure view remains available when the entry import or
  root creation fails. It must not depend on Planner modules or user state.
- React render crashes continue to use `ErrorBoundary` and preserve notebook export.
- Ordinary actions never call reload, assign, replace, or set `location`.
- Vite ignores generated `artifact`, `dist`, test-result, report, and screenshot
  directories for development watch purposes. Building an artifact must not reload
  the root app or the artifact currently being inspected.
- QA for shipped behavior uses the production preview/artifact, not the development
  server.
- A bounded, local-only lifecycle trail records:
  - build/version ID;
  - boot session ID and timestamp;
  - `PerformanceNavigationTiming.type` when available;
  - `pageshow`, `pagehide`, `visibilitychange`, and `freeze`/`resume` when supported;
  - a development `vite:beforeFullReload` marker;
  - bootstrap failure, React boundary failure, and successful root commit.
- The trail stores no task, event, note, title, search, or personal content. It is
  exposed through existing diagnostics and can be cleared locally.
- No global error listener may automatically reload the app.

### 5.5 Week ribbon readiness contract

The ribbon is ready only when all of the following are true:

1. the ribbon node is connected and has nonzero width;
2. the selected day node is connected;
3. the selected day intersects the ribbon's visible content box with at least 24 px
   of usable inset where viewport width permits;
4. the active programmatic scroll transaction has ended;
5. the rendered cell opacity is 1 and no CSS mask can erase the scroll layer.

Implementation requirements:

- hold the callback-ref node in state so node replacement is an effect dependency;
- replace `ribbonPositionedRef`'s unchecked boolean with a run-scoped status such as
  `idle`, `positioning`, `settled`, or `blocked-zero-width`;
- make `revealRibbonCell` return a structured result and never report success until
  an intersection check passes;
- lock `onRibbonScroll` before programmatic `scrollTo`; release the lock on
  `scrollend` with a two-animation-frame fallback for browsers without it;
- ignore virtual-window recalculation caused by the current programmatic positioning
  transaction;
- retry after the first nonzero `ResizeObserver` measurement, font readiness,
  `visibilitychange` to visible, view remount, or a failed post-scroll intersection;
- do not loop indefinitely: cap retries per run, record the last reason, and leave
  the existing arrow/date actions functional;
- replace `mask-image` on the scroller with pointer-events-none edge overlays owned
  by a positioned wrapper. The scroll layer itself must remain unmasked;
- retain bounded virtualization and stable date identity;
- do not use opacity, display, visibility, or clip as a prerequisite for content to
  become visible.

## 6. Detailed implementation design

### 6.1 Navigation controller

Create `src/features/planner/useNavigationMotion.js` or an equivalently focused
module. It owns:

```js
{
  phase,
  progress,
  runId,
  open(),
  close(),
  toggle(),
  reverse(),
  registerPart(name, element),
}
```

Responsibilities:

1. snapshot `navPageFit()` geometry at the start of a run;
2. create the viewport, carrier, drawer, label, and rail keyframes from that snapshot;
3. start every animation against the same document timeline timestamp;
4. reverse active animations rather than creating transitions from guessed rest
   classes;
5. derive semantic phase from direction and progress;
6. settle only the current run after every required animation resolves or a
   run-scoped recovery timeout fires;
7. cancel and discard animation objects on unmount;
8. publish test-only data attributes for phase, run ID, and rounded progress without
   exposing them as product state.

Resize policy:

- while `closed`, update the next geometry snapshot immediately;
- while `open`, recompute the resting frame once and apply it without replaying;
- during motion, either finish against the frozen snapshot or retarget from current
  visual geometry with duration proportional to remaining progress;
- never rewrite destination CSS variables underneath an uncontrolled transition.

Promotion policy:

- add `will-change`/containment to the small motion viewport and carrier one frame
  before first travel;
- remove temporary promotion after settlement;
- do not permanently promote the full planner unless performance traces prove that
  memory and raster cost are acceptable.

### 6.2 Navigation markup and styles

Update `src/features/planner/navigation.jsx` to render the motion viewport and carrier.
Move the rail into the viewport as the carrier's sibling. Planner children remain
mounted exactly once.

Update `src/features/motion/plannerStyles.js` to:

- remove the desktop `clip-right = travel-x + margin-right` geometry;
- move visible-frame clipping to `NavigationMotionViewport`;
- remove surface-child opacity transitions;
- remove rail-specific open/closing transition declarations and
  `--nav-rail-exit-duration`;
- keep the rail's color/theme ownership and vertical writing mode;
- ensure shell background and frame geometry never reveal a black seam;
- retain the reduced-motion override for every new animation part.

Update `src/features/motion/navPageFit.js` so it returns explicit visual-frame insets
and carrier travel rather than a pre-cancelled clip value:

```js
{
  frame: { top, right, bottom, left, radius },
  carrier: { x, y },
  mobile: { railWidth, edgeGap, x },
}
```

Keep it pure and unit tested across phone, tablet, desktop, short-height, and resized
viewport cases.

### 6.3 Boot resilience and diagnostics

Update `index.html` with minimal critical paint and boot markup. Do not duplicate the
full design system or inline the application bundle.

Add focused bootstrap helpers under `src/app/`, for example:

- `bootLifecycle.js`: lifecycle trail, build ID, and commit marker;
- `bootFallback.js`: DOM-only bootstrap-failure presentation.

Update `src/main.jsx` so the sequence is explicit:

```text
document paint -> lifecycle start -> create root -> render boundary/planner
               -> root commit marker -> static boot shell removed
```

The successful-commit marker should be a tiny component/effect inside the boundary,
not a timeout that assumes render succeeded.

Update `vite.config.js` watch exclusions for generated outputs. The artifact build
must continue to include fonts and pass its current CSP/offline constraints.

Extend the diagnostics surface without mixing lifecycle records into the canonical
notebook. Session storage or a separate bounded supporting store is preferred. A
malformed diagnostics record must never block boot.

### 6.4 Ribbon viewport controller

Extract the ribbon positioning/virtualization coordination from `Planner.jsx` into a
focused hook only if doing so reduces composition-root state and does not move domain
decisions into presentation code. Suggested API:

```js
const ribbon = useRibbonViewport({
  selectedDateKey,
  range,
  windowStart,
  setWindowStart,
  enabled,
});
```

The hook returns node refs, scroll handler, edge state, and test diagnostics. It does
not own planner dates or persistence.

Wrap the scroller in a positioned edge-fade owner:

```text
RibbonViewport
├── RibbonScroller
│   └── virtual spacers and date cells
├── StartFade (paint-only, pointer-events none)
└── EndFade   (paint-only, pointer-events none)
```

Edge fades are shown from measured overflow state, but a bad fade measurement can no
longer make the date cells transparent.

## 7. Test specification

### 7.1 Unit tests

Add or update tests for:

- navigation state-machine transitions and reversals from every phase;
- stale-run completion rejection;
- geometry snapshots and resize policy;
- direct desktop frame insets;
- shared mobile progress and rail offset;
- ribbon positioning result states;
- programmatic-scroll lock and virtual-window suppression;
- zero-width, late-width, disconnected-node, and visibility-restoration retries;
- lifecycle trail bounds, privacy, corruption recovery, and navigation-type mapping.

### 7.2 Browser behavior tests

Replace the test that requires the rail to exit early with the opposite contract.

For both `1280 × 900` and `390 × 844`:

1. open, close, and reverse navigation 50 times;
2. issue reversals at 10%, 25%, 50%, 75%, and 90% progress;
3. sample frame, carrier, drawer, label, and rail geometry on a controlled animation
   clock;
4. repeat with a 24 ms main-thread busy period before command dispatch;
5. repeat the first-ever open in a fresh browser context;
6. repeat with reduced motion.

Assertions:

- each visible frame edge is monotonic toward its target;
- no edge moves opposite its command direction;
- desktop right-edge discontinuity between adjacent 60 Hz samples is at most
  1.5 CSS px;
- rail-to-surface gap is at most 1 CSS px;
- normalized progress of required parts differs by at most 0.02;
- no visible navigation control has `pointer-events: none` unless it is also
  non-visible and removed from accessibility;
- planner children keep the same sentinel DOM node across open/close/reversal;
- final geometry remains within 1 CSS px of `navPageFit()`;
- there is no fallback-timer settlement in the normal visible path.

### 7.3 Reload and blank-screen tests

Add a production-preview soak that performs at least 500 safe actions across dates,
views, navigation, actions filters, sheets, and setup controls.

Track main-frame navigations and assert:

- exactly one initial document navigation;
- no empty `#root` after the initial commit;
- no white computed background at any sampled boot frame;
- no action dispatch changes `location`;
- no uncaught page error leaves the static or React fallback absent.

Fault cases:

- delay the application stylesheet and JavaScript entry;
- fail the JavaScript entry/chunk;
- inject a Planner render failure;
- inject an async supporting-store failure;
- reload while the page is hidden, then restore it;
- run `npm run build:artifact` while the development root and artifact routes are
  open.

Expected results:

- delayed or failed entry remains dark and shows the static boot/failure surface;
- render failure shows `ErrorBoundary` and notebook recovery;
- supporting-store failure leaves the planner usable;
- generated output does not reload the development document;
- lifecycle diagnostics classify every intentional test navigation.

### 7.4 Week ribbon tests

Run at desktop, mobile, and narrow short-height viewports:

- 50 hard reloads with a fresh context;
- 50 hard reloads with populated notebook storage;
- background-tab boot with rAF delayed;
- zero-width ancestor followed by reveal;
- delayed font readiness and delayed `ResizeObserver` delivery;
- browser scroll restoration to a stale horizontal position;
- Timeline -> Actions -> Timeline remount;
- day/week/month/day changes;
- navigation open/close/reversal while the ribbon is present;
- manual scroll near both virtual range edges.

On the first stable planner paint, assert:

- selected cell exists and intersects the viewport;
- selected cell has opacity 1;
- at least one date label produces a nonempty bounding box;
- the scroller has no CSS mask;
- edge overlays do not intercept pointer input;
- no arrow click is required to reach `settled`;
- the positioning run remains bounded and does not oscillate the virtual window.

The test must fail if cells are mounted far behind a spacer. Merely finding 56
visible-style buttons is insufficient.

### 7.5 Visual validation

Before the implementation commit and again before push, perform Computer Use checks
in Chrome at:

- desktop `1280 × 900` or larger;
- mobile `390 × 844`;
- mobile `390 × 601` short height;
- the current theme and at least one red-accent theme matching the reported rail.

Record opening, closing, and a mid-flight reversal at normal speed and 0.25× playback.
Inspect:

- all four desktop frame edges;
- first-ever open after hard reload;
- rail/surface attachment through the whole mobile run;
- rail exit and click response during reversal;
- Week ribbon before any interaction after reload;
- delayed boot and injected-failure surfaces;
- reduced-motion behavior.

Visual approval is blocked by any single-frame black seam, white document paint,
early content disappearance, edge direction reversal, or visible dead rail.

## 8. Implementation phases and gates

### Phase 0 — instrument and make failures deterministic

Deliver:

- lifecycle trail and build ID;
- navigation frame sampler and clock-controlled harness;
- selected-cell intersection diagnostics;
- failing tests for early rail exit, dead closing rail, direct right-edge continuity,
  and pre-React dark boot.

Gate:

- each confirmed defect has a failing automated test before production behavior is
  changed;
- the production reload report is either captured with a classified lifecycle reason
  or remains explicitly open, never guessed.

### Phase 1 — replace navigation motion ownership

Deliver:

- explicit navigation state machine;
- grouped motion controller;
- viewport/carrier markup;
- direct frame geometry;
- frozen/retargeted resize behavior;
- normal and reduced-motion focus semantics.

Gate:

- desktop frame tests pass under first-run, repetition, load, and reversal;
- no Planner child remount is introduced.

### Phase 2 — reunify the mobile rail and surface

Deliver:

- rail moved into the shared motion viewport beside the carrier;
- independent rail duration removed;
- blanket content fade removed;
- visible-state interactivity aligned;
- old test contract replaced.

Gate:

- 1 px gap and 0.02 progress tolerances pass at both mobile heights;
- Computer Use shows one connected object through open, close, and reversal.

### Phase 3 — harden boot and reload behavior

Deliver:

- critical inline dark paint;
- static boot and bootstrap-failure surfaces;
- successful root commit marker;
- Vite generated-output watch exclusions;
- local lifecycle diagnostics;
- production navigation soak.

Gate:

- no white frame under delayed/failed resources;
- no document navigation from the 500-action corpus;
- artifact build no longer reloads watched pages.

### Phase 4 — make ribbon readiness verifiable

Deliver:

- node-aware ribbon positioning transaction;
- programmatic-scroll suppression;
- post-layout intersection verification and bounded retries;
- overlay edge fades instead of a scroller mask;
- expanded reload/remount/background tests.

Gate:

- all ribbon test scenarios settle without interaction;
- a captured intermittent failure, if any, is classified by diagnostics and covered
  by a regression test.

### Phase 5 — integrated proof and cleanup

Deliver:

- full unit/browser suite;
- first-run and loaded motion traces;
- Computer Use desktop/mobile/reduced-motion review;
- removal of superseded CSS variables, timers, tests, and comments;
- documentation updates for the navigation and boot contracts.

Gate:

- no known regression is accepted merely because the total pass count improved;
- all new acceptance criteria pass without retries hiding an initial failure;
- working tree contains only intended implementation and documentation changes.

## 9. File-level change map

| File or area | Intended change |
|---|---|
| `src/features/planner/navigation.jsx` | new viewport/carrier markup, explicit phases, unified semantics |
| `src/features/planner/useNavigationMotion.js` | grouped timeline, reversal, run ownership, completion |
| `src/features/motion/navPageFit.js` | direct frame/carrier geometry contract |
| `src/features/motion/plannerStyles.js` | direct frame mask, shared rail motion, no blanket fade/independent exit |
| `src/Planner.jsx` | integrate verified ribbon controller; remove superseded inline coordination |
| `src/features/planner/useRibbonViewport.js` | optional focused ribbon positioning and scroll transaction owner |
| `index.html` | critical dark paint and static boot markup |
| `src/main.jsx` | boot lifecycle and successful root-commit sequence |
| `src/app/ErrorBoundary.jsx` | attach classified React-failure lifecycle record without weakening recovery |
| `src/app/bootLifecycle.js` | local-only bounded lifecycle trail |
| `src/app/bootFallback.js` | dependency-light bootstrap failure UI |
| `vite.config.js` | ignore generated output in development watch |
| navigation browser/unit tests | intermediate-frame, reversal, rail attachment/interactivity |
| reveal/ribbon browser tests | viewport intersection, reload, background, zero-width, no mask |
| error/boot browser tests | entry failure, delayed assets, dark first paint, lifecycle classification |

Names for new modules may change to match repository conventions. Ownership and
separation of concerns may not.

## 10. Performance and accessibility budgets

### Performance

- no application-wide width reflow during navigation;
- no permanent full-planner compositing layer without trace evidence;
- no more than one navigation motion run alive at a time;
- no unbounded rAF, timeout, ResizeObserver, or scroll retry loop;
- navigation should sustain 60 Hz on the reference desktop and mobile emulation when
  the main thread is not intentionally blocked;
- under the 24 ms load fixture, movement may skip a frame but cannot reverse,
  separate, reveal a seam, or settle components at different progress;
- ribbon virtualization remains bounded near the existing 56 rendered-day target.

### Accessibility

- `aria-expanded` reflects the actionable navigation state, not merely a CSS class;
- inert/hidden drawer content cannot receive focus;
- the visible rail has a truthful action and minimum 44 px touch width;
- focus restoration occurs once, after the current close run settles;
- Escape is idempotent and reversal-safe;
- reduced motion removes spatial interpolation without removing state feedback;
- the static boot and failure surfaces use status/alert semantics appropriately and
  do not create duplicate live announcements when React takes over;
- edge-fade overlays are ignored by accessibility and pointer input;
- ribbon selection remains keyboard reachable after programmatic positioning.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| WAAPI group parts drift or complete in a different order | shared start time/run ID, direct border geometry, clock-controlled conformance tests |
| moving the rail back under shared ownership reintroduces an abrupt clip | the rail is clipped by the outer viewport on purpose, and its shared-progress track makes the visible width decrease continuously from 44 px to zero |
| removing mobile content opacity makes the drawer look busy | rely on spatial mask and optional non-blocking dim overlay; do not hide the surface |
| direct frame mask increases paint cost | isolate the small viewport, promote only during motion, compare traces before/after |
| lifecycle trail becomes a second failure source | separate bounded store, corruption-tolerant reads, never block Planner boot |
| static boot markup causes hydration warnings | use `createRoot` replacement semantics and remove through an explicit commit marker; no hydration |
| ribbon retries fight manual scrolling | run IDs, programmatic-scroll lock, user-input cancellation, bounded retries |
| removing CSS mask weakens overflow affordance | equivalent positioned gradient overlays with visual regression coverage |
| Vite watch exclusions hide legitimate source changes | exclude generated directories only; keep `src`, `index.html`, and config watched |

## 12. Non-goals

- redesigning the primary navigation information architecture;
- changing themes, accent colors, typography, or the Week ribbon's date range;
- adding a service worker or network telemetry;
- auto-reloading after any error;
- replacing planner persistence;
- accepting a timer-only animation fix;
- solving the mobile rail by hiding it sooner;
- treating development HMR as a production product feature.

## 13. Definition of done

The phase is complete only when all of the following are true:

- [ ] all four desktop edges move continuously and monotonically on first use, under
  load, and through reversal;
- [ ] the desktop right margin is represented directly, not by large-value
  cancellation;
- [ ] surface, drawer, labels, and rail use one run and normalized timeline;
- [ ] mobile surface content does not disappear before spatial motion communicates
  where it went;
- [ ] rail-to-surface gap never exceeds 1 CSS px;
- [ ] a visible rail always performs the action it advertises;
- [ ] no ordinary planner action initiates a document navigation;
- [ ] first document paint and every failure path remain dark and informative;
- [ ] generated artifact/build output does not trigger an app reload in development;
- [ ] any remaining production reload is classified by local lifecycle diagnostics;
- [ ] the selected Week cell intersects the visible ribbon before first interaction;
- [ ] the ribbon scroller is not masked and positioning retries are bounded;
- [ ] unit, browser, load, reload, and reduced-motion matrices pass;
- [ ] Computer Use validation passes at desktop, both mobile heights, and a red-accent
  theme;
- [ ] obsolete rail timing, blanket opacity, fallback assumptions, and reversed test
  contracts are removed;
- [ ] implementation documentation and comments describe the new invariants rather
  than the superseded fixes.

## 14. Principal product and engineering recommendation

Implement this as one reliability milestone with the phased gates above. Do not ship
another duration adjustment to the mobile rail or another `clip-right` tweak on the
desktop card. Both defects come from split ownership, and parameter tuning will move
the seam without removing it.

Begin with instrumentation and failing temporal tests. The navigation defects can
then be repaired with high confidence. For the reload and ribbon reports, preserve the
same standard: fix the confirmed development/boot hazards immediately, but require a
classified production lifecycle record and a captured ribbon readiness branch before
claiming that an intermittent production root cause has been eliminated.
