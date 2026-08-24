# Timeline Gesture Ownership Reliability Plan

## Objective

Restore a predictable direct-manipulation grammar for Day Timeline Events and scheduled Actions without replacing the existing gesture engine, changing domain writes, or regressing Timeline scrolling, completion, JOIN, recurrence, Week, navigation, or motion.

The release contract is:

- desktop mouse/pen: a 3px movement activates move or resize immediately;
- touch Event/Action body: tap opens, a stationary 300ms hold lifts, pre-lift vertical movement scrolls, and a lifted object follows the finger until release;
- touch Event edges and Action estimate affordances: explicit resize ownership without stealing the card body;
- one input sequence has one owner, cancellation writes nothing, and ownership ends with the sequence;
- holding longer than the lift threshold never creates a dead interaction.

Base: `c966c79c67a7b61144448be07c863154f9171c89` (PR #14 merge).

## Evidence and root causes

Browser characterization on the exact base established five failures and six controls:

1. A stationary 1000ms Event hold writes nothing but releases without opening its inspector.
2. A stationary 1000ms scheduled-Action hold has the same dead release.
3. Every touchstart begins a Timeline scroll session, but touchend/touchcancel never closes it; a later programmatic scroll is therefore misclassified as user scroll and can collapse Timeline chrome.
4. A 10-minute Event's visual centre resolves to the bottom resize strip, so a body drag extends the Event instead of moving it.
5. A 15-minute Event fails identically.

The following already work and must remain unchanged:

- Event and Action moves after both 600ms and 1000ms holds;
- pre-lift vertical touch physically scrolls the Day without a write or inspector;
- a 30-minute Event has a working body move surface;
- desktop direct move/resize, Action completion, JOIN, recurrence and persistence routes.

The defects come from three independent ownership leaks:

- the active touch gesture does not degrade back to its tap outcome when it was lifted but never manipulated;
- scroll authorization begins on contact instead of observable scrolling and outlives the touch;
- full-width Event edge overlays are also used as coarse touch targets, leaving almost no move surface on short Events.

## Implementation boundaries

Expected production scope:

- `src/Planner.jsx`
- `src/features/planner/TimelineEventResizeControls.jsx`
- `src/features/planner/timelineTouchTarget.js` and focused unit coverage if its pure contract changes
- `src/features/planner/timelineTouchScrollLock.js` only if active-drag scroll mechanics require it

Expected regression scope:

- `tests/e2e/timeline-touch.spec.js`

Do not modify Week, navigation, ribbon, motion, Composer, Sheet, calendar/task domains, recurrence, persistence, themes, or Timeline chrome policy. Do not add dnd-kit or another gesture framework.

## Corrective design

### 1. Release semantics

An Event/Action touch is a tap candidate until it produces meaningful manipulation. Reaching the 300ms lift threshold changes visual/gesture readiness, but elapsed time alone must not erase the tap outcome.

On release:

- armed and unmoved: open inspector;
- lifted and never meaningfully changed: abort live gesture, clear ownership, then open inspector;
- meaningfully moved/resized: commit through the existing finish path and suppress inspection;
- cancelled: clear visual and semantic ownership and write nothing;
- moved and returned to origin: write nothing and do not reinterpret the completed manipulation as a tap when activation history proves movement occurred.

### 2. Scroll ownership

Touch contact alone does not authorize Timeline scroll behavior.

- begin/refresh the scroll session only after real vertical intent or a native scroll event;
- end/expire it on touchend, touchcancel, and surface cleanup;
- keep wheel sessions bounded as today;
- while object manipulation owns the sequence, prevent incidental native scrolling and keep the active proposal coherent.

### 3. Event hit grammar

Mouse/pen keep the full-width top and bottom resize strips.

Touch resize ownership is limited to centred, visible semantic cue regions:

- maximum width 44px;
- maximum height 22px per edge;
- each edge is capped at 50% of the rendered Event height, preventing overlap on short Events;
- outside those cue regions the Event remains body-owned, including the centre of 10-, 15-, and 30-minute cards;
- the top cue changes start while preserving end; the bottom cue preserves start while changing end.

No Event card geometry, resting position, or domain arithmetic changes.

### 4. Action grammar

Preserve completion as the highest-priority explicit control, JOIN/link priority, the existing wide estimate rail, and body hold-to-move. If narrow estimated Actions lack a discoverable resize path after the core fixes, add a compact bottom-edge affordance without consuming the move body or completion lane; verify it separately before shipping.

## Test-first sequence

1. Add real-CDP regressions for 600/1000ms Event and Action moves, stationary long-hold release, pre-lift physical scrolling, post-sequence scroll authorization, and 10/15/30-minute Event ownership.
2. Observe the five causal failures on the exact base.
3. Correct release and scroll-session ownership; rerun focused tests.
4. Split desktop Event edge overlays from centred touch semantic zones; rerun focused and full touch specs.
5. Run negative controls by locally restoring each old behavior and proving the corresponding regression returns. Do not commit sabotage.

## Verification gates

Focused units:

```text
node --test src/features/planner/timelineGesture.test.js src/features/planner/timelineInteractionState.test.js src/features/planner/timelineTouchTarget.test.js src/features/planner/timelineTouchScrollLock.test.js
```

Focused browser suites:

```text
npx playwright test tests/e2e/timeline-touch.spec.js --project=chromium --workers=1
npx playwright test tests/e2e/timeline-gestures.spec.js --project=chromium --workers=1
npx playwright test tests/e2e/actions.spec.js --project=chromium --workers=1 --grep "drag|resize|timeline|complete"
npx playwright test tests/e2e/gesture-isolation.spec.js --project=chromium --workers=1
npx playwright test tests/e2e/interaction-contracts.spec.js --project=chromium --workers=1
npx playwright test tests/e2e/week-drag.spec.js --project=chromium --workers=1
npx playwright test tests/e2e/recurring.spec.js tests/e2e/join.spec.js tests/e2e/timeline-chrome-scroll.spec.js --project=chromium --workers=1
```

Repeat the new dwell/ownership cases ten times without retries. Then run `npm test`, `npm run build`, and the full Chromium suite with one worker and an isolated preview port.

## Product and visual QA

Use visible Windows Chrome at 1280x900, 390x844, and 390x601.

Verify Event tap, long tap, move, top resize, bottom resize, short-card move, cancellation, and scroll-from-card. Verify Action tap, long tap, move, resize, completion swipe, cancellation, and scroll-from-card. Confirm Timeline movement stops once a card owns the gesture, chrome does not react to later programmatic scroll, JOIN remains direct, and no card jumps, lags, or changes resting geometry.

Physical Android Chrome and iOS Safari remain release gates if they are not available in this environment; automated CDP touch is not a substitute for those device passes.

## Stop conditions

Stop rather than improvise if the fix requires sacrificing touch scroll, duplicating Event/Action gesture algorithms, changing domain APIs, bypassing recurrence, modifying Week/motion/navigation/ribbon, adding long waits, weakening assertions, or replacing real touch input with mouse simulation.
