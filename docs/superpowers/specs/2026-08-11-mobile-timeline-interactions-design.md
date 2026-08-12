# Mobile Timeline Interaction Repair

**Date:** 2026-08-11

**Status:** Approved for implementation

**Scope:** Mobile day timeline interaction, Action completion feedback, and timeline density

## Outcome

The mobile timeline should prioritize intentional scrolling, make completing a scheduled Action immediate, and devote more of the viewport to the day once the user begins navigating it. Existing event movement, resizing, Action blockers, undo, rewards, recurrence behavior, desktop interactions, Agenda behavior, and saved data must remain unchanged.

## Established Causes

1. Empty timeline space and draggable cards share the same 300 ms lift threshold. The delegated touch handler cancels only after more than 12 px of touch movement and does not cancel from a stream scroll event. A slow scroll or a finger resting during scroll can therefore mature into a draft-creation gesture.
2. The haptic regression test replaces `navigator.vibrate` and verifies only that `[8, 30, 14]` was requested. Those very short pulses can fall below a physical phone motor's perceptible range, so the test proves code execution but not useful tactile feedback.
3. Scheduled Actions are rendered as a single button that only opens inspection. There is no independent completion target and no timeline swipe completion path.
4. The HUD, calendar navigator, fourteen-day ribbon, date heading, notices, and mobile Actions handle all consume vertical space before the timeline. The date heading is already structurally independent, so other top chrome can collapse without removing date context.
5. Standalone `FREE` labels are painted into suggested empty timeline hours even though open space already communicates availability.

## Interaction Design

### 1. Touch-intent arbitration

- A press on empty timeline space creates a draft only after 650 ms of stationary contact.
- A card or resize handle keeps the existing 300 ms lift threshold so moving and resizing do not become sluggish.
- Any stream scroll event, vertical movement beyond the existing tolerance, multi-touch gesture, touch cancellation, or horizontal Action swipe cancels pending empty-space creation.
- After scrolling, empty-space creation remains disarmed until the current touch sequence has ended. Resting a finger during the same scroll must never create an item.
- A normal tap on empty space retains the existing quick-create behavior.

### 2. Scheduled Action completion

- Every open Action in the day timeline exposes a real check button with an accessible label.
- Tapping the Action body still opens its inspector. Tapping the check control cannot open the inspector or begin a move/resize gesture.
- Swiping an Action card to the right reveals a completion treatment behind the card. Crossing a deliberate horizontal threshold commits completion; releasing below it returns the card smoothly to rest.
- Vertical intent always yields to timeline scrolling. Horizontal swiping on an Action cannot turn the day page.
- Check, swipe, inspector completion, checklist auto-completion, and Actions-panel completion all call the same existing completion command. Blocker confirmation, recurrence handling, rewards, celebration, persistence, undo, and feedback therefore remain consistent.

### 3. Completion haptics

- Completion uses a named, stronger Android-suitable vibration pattern rather than inline sub-threshold numbers.
- Haptics remain governed by the existing preference. Unsupported browsers fail quietly and never block completion.
- Other feedback patterns do not change unless a regression test demonstrates the same physical threshold issue.
- Automated coverage verifies preference gating and the completion request. Final acceptance includes a manual completion check on the Samsung device because browser automation cannot prove what a physical motor feels like.

### 4. Mobile timeline focus mode

- Focus mode applies only to the mobile day timeline. Desktop, Agenda, Actions, week, and month layouts do not change.
- Initial programmatic positioning near the current time does not activate focus mode.
- After the user establishes intentional vertical timeline scrolling, the HUD and calendar-navigation region, including the fourteen-day ribbon, collapse upward as one connected transition.
- The active date number and its briefing remain visible in a compact sticky heading.
- Returning to the first portion of the day near 12 AM expands the chrome automatically.
- A visible chevron in the date heading provides a discoverable manual expand/collapse override. The date number does not use a hidden vertical swipe because that gesture would compete with page and timeline scrolling.
- Motion uses the app's existing non-bouncy easing and respects both OS and in-app reduced-motion preferences.
- Focus state resets when leaving the day timeline or changing the active date.

### 5. Timeline availability labels

- Remove standalone `FREE` labels from suggested empty hours in the day timeline.
- Preserve the slot-suggestion calculation, clickable suggestions, month availability projections, and factual date briefing. This is a presentation cleanup, not a scheduling-domain change.
- Empty space remains the availability signal; no replacement badge is added.

## Component Boundaries

- Extend the pure timeline gesture module with intent thresholds and small decision helpers so scroll/create/swipe rules are unit-testable without the DOM.
- Introduce a focused timeline Action-card component to own check and swipe presentation while receiving existing open, complete, move, and resize callbacks.
- Keep focus-mode state in the Planner screen because it coordinates separate HUD, navigator, heading, and stream regions.
- Keep all task mutation logic in the existing `completeTask` path. The new controls are input surfaces, not new commands.

## Verification

1. Unit tests prove different lift thresholds for empty space and cards, cancellation after scrolling, horizontal-versus-vertical intent, and swipe completion threshold behavior.
2. Mobile browser tests prove that a slow/resting timeline scroll cannot open the composer, while a deliberate stationary hold still can.
3. Browser tests prove that the timeline check and right swipe complete through the standard flow, blocker confirmation still intervenes, and card-body taps still inspect.
4. Layout tests prove that intentional scrolling increases the timeline viewport, date context stays visible, initial auto-positioning does not collapse chrome, near-midnight scrolling restores it, and other views remain unchanged.
5. Presentation tests prove no standalone `FREE` label is rendered in the day timeline.
6. The full unit and browser suites, production build, reduced-motion checks, and existing overlap/morph tests must pass before publishing.
7. The deployed build receives mobile-size interaction QA. Physical haptic acceptance is completed on the Samsung phone.

## Non-goals

- No change to stored event or Action schemas.
- No rewrite of the timeline, recurrence, lane-packing, or free-slot engines.
- No automatic Action completion from drag-and-drop.
- No collapse behavior outside mobile day view.
- No removal of the word “free” from product documentation or non-timeline explanatory copy.
