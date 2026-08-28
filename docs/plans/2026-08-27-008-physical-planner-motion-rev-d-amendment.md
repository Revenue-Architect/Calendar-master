# Calendar Master — Physical Planner Motion Rev D Amendment

**Status:** Binding amendment to the Physical Planner Motion package  
**Decision date:** 2026-08-27  
**Applies to:** Phases 7–19 and final certification  
**Original behavioral authority:** `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`  
**Extended behavioral examples:** `docs/plans/2026-08-27-007-physical-planner-motion-extended-visual-reference.html`

---

# 1. Authority

This amendment is intentionally additive. It preserves the full historical detail, evidence, negative controls, architecture reasoning, and task inventory in:

- `2026-08-25-001-physical-planner-motion-prd.md`
- `2026-08-25-002-physical-planner-motion-ard.md`
- `2026-08-25-003-physical-planner-motion-reconciliation.md`
- `2026-08-25-004-physical-planner-motion-implementation-plan.md`

Where this Rev D amendment conflicts with wording in those documents, **Rev D wins for the visual/product interpretation of Phases 7–19**.

`006` remains the original normative full-motion pointer/touch reference. `007` only extends that grammar to later phases; it does not replace or restyle `006`.

The existing domain, persistence, recurrence, gesture, accessibility, performance, and architecture protections remain binding unless Rev D explicitly changes their presentation interpretation.

---

# 2. Why Rev D exists

Phase 7 exposed a gap between technical morph correctness and product correctness.

A flow can:

- resolve the correct semantic Event;
- suppress the correct source;
- animate a FLIP/shared-element carrier;
- preserve title/time/marker identity;
- return to the latest source;
- pass geometry tests;

and still visibly read as:

`Event → centered modal Sheet`.

That fails the original product intent.

The canonical reference does not show the Event flying to viewport center behind a darkened environment. It shows the object staying where it belongs and becoming more of itself.

Rev D therefore establishes this hard rule:

> **For normal pointer/touch Object, Creation, and Control morphs, production must reproduce the source-anchored physical behavior of the original reference. Internal implementation safety mechanisms may differ, but they must be visually invisible.**

If a human describes the result as “a modal opened,” “a popover appeared,” or “a dropdown spawned” where `006`/`007` shows expansion/unfolding, the phase is HOLD.

---

# 3. The new distinction: logical geometry vs presentation geometry

The earlier ARD correctly warned against naïvely expanding a production timeline Event in-flow because doing so can disturb:

- minute/hour mapping;
- overlap/lane packing;
- drag math;
- resize handles;
- source geometry;
- scroll behavior;
- Week projection behavior.

Rev D changes the conclusion, not that evidence.

Do **not** solve those risks by sending the object to a centered Sheet.

Instead:

## Logical / interaction geometry

Remains authoritative and stable for:

- Event date;
- start minute;
- duration;
- lane/column assignment;
- overlap packing;
- drag origin;
- resize origin;
- occurrence identity;
- list/order identity;
- persistence truth;
- gesture hit-testing where existing contracts require stable source geometry.

## Presentation geometry

May temporarily:

- grow the visible Event/Action/Note/Composer;
- move visible hour rules/cards/rows below it;
- widen a narrow Week source contextually;
- create visual room for an expanded field;
- return all visual displacement to zero on close/cancel.

Presentation displacement is not a domain write, not a logical scroll, and not a second gesture owner.

---

# 4. Presentation Lens

Rev D names the safe visual-yielding concept **Presentation Lens**. `TimelineLens` is acceptable for a Day/Week-specific implementation, but the architectural boundary is the same.

Conceptual model:

```text
semantic source
    ↓
freeze logical interaction geometry
    ↓
source-anchored visual carrier grows
    ↓
Presentation Lens visually yields surrounding presentation
    ↓
real destination-only content reveals inside the expanded object
```

Conceptual displacement:

```js
const extra = Math.max(
  0,
  expandedVisualHeight - sourceVisualHeight + spacing,
);
```

Only explicitly presentation-owned elements receive displacement.

The lens must not mutate calendar/list truth.

The lens must be:

- transaction-owned;
- reversible;
- cleared on settle/cancel/unmount;
- scoped deliberately rather than “all DOM siblings after this node”;
- non-owning for pointer/gesture semantics.

---

# 5. Object Morph — revised production target

The safe overlay/shared-object architecture remains valid, but its destination behavior changes.

Required normal pointer/touch model:

```text
source record
    ↓ snapshot
source logical layout box remains
visual carrier established at exact source
source paint suppressed only after carrier exists
    ↓
carrier grows from source anchor
shared identity remains recognizable
visible surroundings yield through Presentation Lens
    ↓
destination-only content appears inside the expanded object
```

Do not default to viewport center.

Do not scale a live form.

Do not let a generic Sheet's visual geometry define a persistent object's resting state.

---

# 6. Scrim and modality — revised rule

The original package allowed scrim opacity in general. Rev D narrows its use.

Scrims remain appropriate for:

- true Neutral Dialogs;
- destructive confirmations;
- recovery/system interruptions;
- other genuine modal states with no honest physical object source.

For normal pointer/touch Object, Creation, and Control morphs:

- no visible dark modal scrim by default;
- no whole-screen blur;
- no environmental dimming that makes the transition read as a modal;
- no visible center-flight treatment.

Semantic modality is separate from visual modality. An expanded Event may still use:

- inert background;
- focus trap;
- outside-click guard;
- body/ancestor scroll protection;
- dirty-close veto;

without visible darkening.

---

# 7. Dynamic content height

Expanded persistent objects are content-driven.

A fixed modal-height shell may not clip Repeat, Calendar, alerts, Edit, checklist, Note content, or other internal controls.

When an internal field unfolds:

1. the field grows from itself;
2. the parent expanded object may grow further;
3. Presentation Lens displacement follows the new visual height;
4. logical source geometry stays frozen;
5. collapsed options leave the tab order;
6. closing the field shrinks the parent/lens without replaying the parent entrance.

At least Repeat plus one additional expandable field must be validated end-to-end on Event Inspector work.

---

# 8. Phase 7 — Event Inspector Morph

The Phase 7 checkpoint `0ea953b4dd570d896c97d7785bc4f97f3876e803` is retained as implementation evidence, not as final visual authority.

Its semantic-source, shared-element, close-target, keyboard, recurrence, and regression work remains useful.

Its centered/scrimmed destination interpretation is superseded.

Required result:

- Day timed Event expands from exact card;
- Week timed Event expands from exact card;
- Day all-day Event expands from exact ribbon;
- Week all-day Event expands from exact ribbon;
- no visible object scrim;
- no whole-screen blur;
- no flight to screen center;
- title/time/marker/material continuity;
- Event disclosure visually opens/reverses;
- timeline/lane presentation below may yield through Presentation Lens;
- logical source geometry remains unchanged;
- Inspector content reveals only after enough visible space exists;
- Repeat/other fields can grow object further without clipping;
- close reverses to latest live semantic source;
- recurring siblings remain painted;
- keyboard stays instant/source-less and does not activate lens travel;
- reduced motion preserves semantics without large travel.

Negative controls must prove tests fail if:

- destination becomes centered;
- object scrim becomes materially visible;
- backdrop blur appears;
- logical source top/height changes because of the lens;
- lens fails to update with field height;
- options clip;
- recurrence sibling gets suppressed;
- a wrapper steals pointer ownership.

Visual gate: open 0/25/50/75/100 and reverse for all four Event forms, plus dynamic field expansion. Repeat open/close ×40 remains required.

---

# 9. Phase 8 — Event Edit Reconfigure

Edit remains a Reconfigure operation inside the already-expanded Event.

Required:

- same spatial anchor;
- same expanded object;
- no second Sheet/editor;
- no entrance replay;
- current draft/Save/Revert semantics preserved;
- same Inspector identity/node where the existing continuity contract requires it;
- parent can grow/shrink as edit fields change;
- lens follows presentation height;
- every existing Event edit capability remains available.

Negative control: deliberately remount/key the Inspector and prove the continuity test fails.

---

# 10. Phase 9 — Day creation

The original reference's creation behavior is normative.

```text
empty Day time
    ↓
visible draft material grows there
    ↓
Composer exists inside that material
    ↓ save
same transaction resolves to committed Event
```

Tap uses exact computed Day slot geometry.

Hold-and-size uses the final sized draft rectangle, not the raw pointer coordinate.

Presentation Lens may yield later Day presentation while logical minute mapping remains unchanged.

Cancel returns to exact empty source with zero writes.

Save performs exactly one domain write, waits for the semantic Event destination, then visually settles into it.

No generic centered Composer Sheet on the normal pointer/touch path.

---

# 11. Phase 10 — Week creation

Same semantics as Day, with Week-owned geometry.

A narrow Week source may widen contextually to remain usable, but every mid-frame must still identify the exact selected Week slot as the origin.

Week drag/day/time mapping remains unchanged.

No duplicated Day calculation.

---

# 12. Phase 11 — Action Inspector

Actions use the same Object Morph grammar as Events.

Required:

- Action expands where it lives;
- rows/cards below may visually yield;
- logical order and gesture truth remain unchanged;
- no centered details modal;
- title/check/category/list identity remains recognizable;
- Inspector-only content reveals after room exists;
- close returns to latest semantic Action source.

Protect:

- complete/reopen;
- swipe;
- hold/drag;
- estimate resize;
- checklist/Add Step;
- planning;
- recurrence;
- deadline;
- tags/list/category;
- blockers/dependencies;
- notes;
- parent/subtask navigation;
- delete.

Repeat open/close ×40.

---

# 13. Phase 12 — Actions quick capture

Normal pointer/touch behavior:

`+ Action → compact inline Composer`

The source/compact composer expands in place. Advanced options grow the same surface further. Actions remains calendar-context-free.

No generic Sheet and no date-ribbon context.

Keyboard path stays instant.

---

# 14. Phase 13 — inline fields

Migrate in the existing planned order unless current code requires a justified adjustment:

1. Repeat
2. Calendar/category
3. alerts
4. duration
5. planning
6. deadline
7. tags/list

Each field follows:

`field value → expanded field → resolved value`

Every field PR must prove:

- one owner;
- source-anchored unfold;
- parent does not remount;
- parent/lens height follows when applicable;
- no clipping;
- collapsed options not tabbable;
- Escape behavior;
- keyboard/reduced-motion correctness.

---

# 15. Phase 14 — Notes

A Note grows from its current Note card/list source into the editor.

Surrounding Note/list presentation may yield.

Preserve:

- autosave;
- backlinks/entity context;
- pin/archive;
- history/revisions;
- checklist/extraction;
- source disappearance fallback;
- focus restoration.

Do not use a centered generic Sheet visual as the normal Note object morph.

---

# 16. Phase 15 — compact tools

Global Add, pointer/header Search, More, and secondary Filter use Control Morph.

The control itself unfolds into its bounded options, as demonstrated by `006`/`007`.

Forbidden normal pointer/touch replacement:

`control → generic dropdown/popover → generic Sheet`

Keyboard Search/Add remain instant/source-less.

Primary Smart Views remain visible.

---

# 17. Phase 16 — Month Peek

Month day cell is the source.

`day cell → Day Peek`

Required:

- exact cell remains dominant origin;
- cell grows/contextually expands into Peek;
- Month presentation may yield/overlay safely;
- no center-flight Sheet;
- nested Event transfers source ownership to that Event;
- OPEN DAY is Spatial Slide/navigation, not a second object morph.

---

# 18. Phase 17 — spatial date/view travel

No conceptual change from the prior plan.

Forward/backward dates and view movement use directional Spatial Slide. Opposite temporal directions use opposite visual directions. Full-view fade is not the primary explanation.

Do not rewrite an already-correct navigation compositor merely for consistency of naming.

---

# 19. Phase 18 — legacy fade/surface audit

Re-run the prior audit against current source, but apply the stricter Rev D classification.

Classify each significant opacity/surface arrival as:

- secondary reveal inside physical motion;
- semantic state;
- Neutral Dialog scrim;
- reduced-motion fallback;
- feedback;
- obsolete arrival explanation.

Explicitly flag any remaining centered Sheet/popover/dropdown visual used for a flow that should be Object/Creation/Control Morph.

Do not blindly delete semantic fades.

---

# 20. Phase 19 — legacy Sheet retirement

Inventory every Sheet caller as originally planned.

Persistent-object paths must no longer inherit generic Sheet visual geometry.

Hardened Sheet behavior may be extracted/reused for:

- focus;
- inert/background handling;
- scroll preservation;
- software keyboard protection;
- dirty-close veto;
- other proven accessibility behavior.

Delete obsolete paths only after zero callers and full browser/device gates.

---

# 21. Gesture isolation remains non-negotiable

Presentation Lens, carrier, registry, and destination content do not become gesture owners.

Preserve:

- Day Event tap/drag/resize/JOIN;
- Week Event touch/drag/JOIN;
- Action complete/swipe/hold/estimate controls;
- empty-space tap/hold-size/cancel;
- click suppression after manipulation.

No wrapper may intercept pointer ownership to make the animation easier.

---

# 22. Recurrence/source fallback remains non-negotiable

Only the concrete clicked occurrence transfers paint/identity.

Sibling occurrences stay visible unless ordinary presentation displacement affects their visible position; displacement is not suppression.

Close source order remains:

1. latest live semantic source;
2. last valid semantic source snapshot;
3. deliberate neutral fallback.

Never `activeElement` geometry.

---

# 23. Keyboard and reduced motion remain explicit exceptions

Keyboard hot paths:

- source-less;
- instant where currently specified;
- no Presentation Lens travel;
- no borrowed focused-element geometry.

Reduced motion:

- same semantic transaction;
- no large source travel/lens animation;
- final state/focus/scroll/functionality preserved;
- no dependency on `animationend` for valid state.

---

# 24. Accessibility

A visually embedded expanded object can retain dialog-like semantic protections when appropriate.

Preserve:

- real controls;
- real Tab/Shift+Tab testing;
- Escape;
- focus restore;
- inert/background semantics where required;
- dirty-close veto;
- source-disconnected fallback;
- scroll preservation;
- touch targets;
- software-keyboard protections.

No visible scrim is required merely because semantic modality is active.

---

# 25. Performance

Do not:

- animate the whole app subtree;
- continuously observe every record;
- scale a full live form;
- run per-frame React state;
- rewrite the calendar layout engine;
- let multiple animation systems own the same property.

Prefer:

- semantic boundary measurement;
- isolated carrier;
- explicit Presentation Lens scope;
- compositor-friendly transforms;
- true-scale destination content;
- one controlled expanded-surface size observer only when dynamic content requires it.

---

# 26. Verification contract added by Rev D

Existing unit/build/browser/negative-control/repeat gates remain.

Additionally, every physical phase must visually inspect:

## Open

- 0%
- 25%
- 50%
- 75%
- 100%

## Close

- 100%
- 75%
- 50%
- 25%
- 0%

At minimum on desktop and phone.

For dynamic fields, inspect parent/lens size before, during, and after field expansion.

A green test proving destination coordinates is not proof of physical continuity.

Final certification still requires physical Android Chrome and iOS Safari.

---

# 27. Architecture ratchet

`Planner.jsx` ceiling may never increase for this initiative.

Re-measure at each phase and lower the ratchet whenever extraction shrinks Planner.

Presentation Lens logic belongs in focused planner/motion modules, not as new Planner monolith code.

No new motion dependency is required.

---

# 28. Review question for every remaining phase

Before PASS, ask:

> **If the user did not know the implementation, would they describe what happened using the intended physical verb: expanded, unfolded, grew, slid, or reconfigured?**

If the answer is “a modal opened,” “a popover appeared,” “a dropdown spawned,” or “a separate form arrived,” the phase is HOLD.

---

# 29. Binding completion rule

The exact original visual reference remains the target language.

> **The thing the user touches should become more of itself. The implementation may freeze logical geometry underneath, but it may not visually substitute a generic surface for that physical relationship.**
