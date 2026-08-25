# Calendar Master — Physical Planner Motion System PRD

**Status:** Canonical proposed product specification  
**Date:** 2026-08-24  
**Repository:** `Revenue-Architect/Calendar-master`  
**Grounding point:** PR #13 head `f8cdc60fc1e0c87c5ffaabae158cec3ce45be98a` was the last reviewed application state before this document was consolidated. Re-ground against current `main` and open PRs before implementation.  
**Normative behavioral reference:** `docs/reference/physical-planner-motion-lab.html`  
**Architecture:** `docs/spec/physical-planner-motion-ard.md`  
**Legacy reconciliation / blast radius:** `docs/spec/physical-planner-motion-reconciliation.md`  
**Execution plan:** `docs/superpowers/plans/2026-08-24-physical-planner-motion-system.md`

---

# 1. Executive decision

> **Rev C grounding (2026-08-25):** Re-grounded against current `main` `a8cf905b878e913256dc3e3518d133c2583cb443`
> and the docs-only branch `feat/sheet-presentation-physicality`, which is two commits ahead of that main.
> The branch contains Claude's 387-line plan, 7,840-line session log, raw JSONL session, and capture scripts; it
> contains no product-code implementation. Current code has moved beyond some assumptions in that plan:
> `anchoredFluidMorphFromRects()` and 25/50/75% interrupted Composer reversal tests already exist, and the
> current Planner architecture ceiling is 5531 (split-line count). Re-verify all counts at execution time.

Calendar Master will adopt a single physical interaction language:

> **Nothing important appears from nowhere. Objects expand, tools unfold, creation grows from its origin, navigation moves directionally, and editing reconfigures the same object in place.**

This is not a cosmetic animation pass. It replaces the product's conceptual model of “open a sheet” with a model of **persistent objects and spatially honest transformations**.

The interactive visual reference is the behavioral authority for the normal pointer/touch path. If an implementation technically “uses a morph” but does not visually read like the reference, it does not satisfy this PRD.

### The reference specifically establishes

- Event card → Event Inspector as the *same object*.
- Event Inspector → Event card as the exact semantic reverse.
- Empty timeline space → Composer → created Event.
- Composer Cancel → original empty space.
- Compact `+`, More, Search, Filter and bounded fields unfolding from their controls.
- Inspector → Edit as an in-place reconfiguration.
- Directional page/time travel rather than fade-led navigation.

### Two deliberate exceptions

1. **Keyboard-opened surfaces stay instant.** Existing audits verified keyboard `n` / `a` and command-style opens deliberately use no physical travel. Do not invent a fake source from whatever currently has focus.
2. **Reduced-motion retains the simpler accessible fallback.** Full-motion object travel is removed. Existing cross-fade behavior may remain where it is the product's reduced-motion fallback.

These are not deviations from the design. They are explicit modes.

---

# 2. Product intent

Calendar Master should feel like a notebook/planner made of persistent digital material.

The user should feel:

- “I expanded this Event,” not “a modal opened.”
- “I wrote into this empty time,” not “a form appeared.”
- “This tool unfolded,” not “a popover spawned.”
- “I moved to tomorrow,” not “the screen cross-faded.”
- “I switched this object into edit mode,” not “I opened another editor.”

Physicality comes from:

- source/destination continuity;
- geometry;
- direction;
- layering;
- reversibility;
- mass;
- stable identity;
- spatial memory.

It does **not** come from literal notebook decoration.

Do not add:

- fake paper textures;
- page curls;
- leather;
- spiral binding;
- heavy 3D;
- rubbery overshoot;
- whole-screen blur.

---

# 3. Authority and conflict rules

For this initiative:

1. The accepted ADR generated from this package is the repository architecture authority.
2. The **visual demo is normative for motion outcome and continuity**.
3. This PRD is normative for product semantics.
4. The ARD is normative for implementation boundaries and safety.
5. Existing interaction/domain/accessibility contracts remain protected unless explicitly amended.
6. Older motion plans are evidence. They do not override the approved visual behavior.
7. Existing code is a constraint and migration input, not the visual target.

### Conflict example

If an older plan says “reveal a separate inspector from the card” but the reference visibly shows “the card becomes the inspector,” the new reference wins.

However, an older finding that the current Sheet preserves scroll position, focus, reduced-motion behavior, or mobile keyboard geometry remains a required protection.

---

# 4. Motion grammar

Every meaningful transition maps to one of these verbs.

| Verb | Meaning | Examples |
|---|---|---|
| **Object Morph** | This object became its expanded form. | Event → Inspector, Action → Inspector, Note → Editor, Month day → Day Peek |
| **Creation Morph** | A new object grows from this exact place. | Empty slot → Composer → Event; Add Action → Action Composer |
| **Control Morph** | This tool unfolded into the controls it contains. | `+`, More, Search, Filter, Repeat, Calendar, alerts |
| **Spatial Slide** | I moved somewhere else in the planner. | previous/next date, view movement, settings/navigation |
| **Reconfigure** | Same object, another state. | Inspector → Edit, field → expanded field editor |
| **Neutral Dialog** | Global/system interruption with no honest object source. | destructive confirmation, recovery, auth/system prompt |

Do not invent a new motion idiom simply because an animation is attractive.

---

# 5. Core product rule

> **Opacity may support a transition, but it may not be the primary explanation for where a major surface came from or where it went.**

Exceptions:

- scrim/background dimming;
- reduced-motion fallback;
- semantic dimming such as completed/past/drag-held states;
- minor secondary-content reveal after the physical shell is established.

---

# 6. Frequency budget

Motion frequency controls motion budget.

| Frequency | Product budget |
|---|---|
| Every keystroke | Instant; no travel |
| Every page load | ≤200ms and extremely restrained |
| Many times/day | ~150–280ms |
| A few times/day | ~260–480ms |
| Rare/first-run | may be more generous, still restrained |

The “fortieth-time test” wins. If a motion becomes annoying after repeated use, it is wrong even if it is impressive in isolation.

---

# 7. Event → Event Inspector

## 7.1 Trigger ownership

The current gesture classifier remains authoritative.

A tap may open the Inspector only after it is classified as a tap.

The motion layer must not steal:

- drag;
- resize;
- hold;
- JOIN;
- direct Event controls;
- click suppression after manipulation.

## 7.2 Open behavior

The Event must visibly preserve identity.

Continuity targets:

- shell;
- title;
- time/duration;
- accent/category marker;
- source location;
- corner/material identity.

Destination-only content reveals *after* enough physical space exists.

The user should be able to pause a mid-frame and still identify the exact Event that is becoming the Inspector.

## 7.3 Open state

No capabilities may disappear.

Protect:

- title;
- date;
- start/end;
- duration;
- all-day;
- recurrence;
- occurrence/series choice;
- alerts;
- calendar/category;
- location;
- meeting link;
- notes;
- duplicate;
- delete;
- current live/ended semantics.

## 7.4 Inspector → Edit

Edit uses **Reconfigure**.

Do not open a second Edit sheet.

The same Inspector changes in place.

The Inspector entrance must not replay.

## 7.5 Close

Close reverses into the latest live geometry for the semantic Event if it exists.

If it no longer exists, use the source-fallback rules in the ARD.

Never fly into an unrelated focused element.

---

# 8. Action → Action Inspector

Use the same Object Morph language.

Protect:

- complete/reopen;
- subtasks;
- checklist;
- Add Step;
- planning;
- estimate;
- recurrence;
- deadline;
- tags/list/category;
- blockers/dependencies;
- notes;
- delete;
- parent/subtask navigation.

Action-specific direct controls remain directly usable where they are currently intentionally available outside Edit.

---

# 9. Empty Day timeline space → Composer → Event

This is one of the feature's defining flows.

## 9.1 Tap

Existing tap semantics compute the date/start/default duration.

The **visible time region is the source**, not merely a button that opens a separate sheet.

Desired perception:

`empty time → draft material → Composer`

## 9.2 Hold-and-size

Existing hold threshold and sizing gesture remain authoritative.

After the creation gesture produces a sized draft rectangle, that draft geometry becomes the Composer origin.

Do not fall back to the raw pointer coordinate.

## 9.3 Cancel

Desired perception:

`Composer → empty time`

No persistence write.

## 9.4 Save

Desired perception:

`Composer → newly committed Event`

Required sequence:

1. validate;
2. perform the existing domain write exactly once;
3. allow destination Event to render;
4. resolve its semantic motion key;
5. visually settle the Composer into that Event;
6. finish focus transition.

Do not delay persistence until animation completion.

---

# 10. Week creation

Same semantics as Day.

The Week grid owns its own geometry.

Do not duplicate Day math inside WeekGrid.

Preserve Week drag/gesture ownership.

---

# 11. Global Add

Pointer/touch path:

`+ → EVENT / ACTION / NOTE → Composer`

The `+` itself physically unfolds.

Selecting an option begins the next creation transaction.

Do not implement:

`button → generic dropdown → generic Sheet`

Keyboard add remains instant and source-less.

---

# 12. Actions quick capture

Preferred normal path:

`+ Action → compact inline Composer`

Simple title capture should remain fast.

Advanced fields may expand the same object further.

Actions remains calendar-context-free.

Do not reintroduce date ribbon chrome into Actions.

---

# 13. Notes

Standalone and entity-linked notes use Object Morph.

Protect:

- note identity;
- backlinks;
- entity context;
- pin/archive;
- history/revisions;
- checklist content;
- extraction;
- autosave/write semantics.

Close returns to the current semantic Note source when available.

---

# 14. Month Day → Day Peek

The Month day cell is a real source.

`Month day → Day Peek`

Opening an Event from Day Peek transfers source ownership to that Event.

OPEN DAY becomes a spatial view transition, not a second object morph.

---

# 15. Inline fields

Bounded values should edit from themselves.

Candidates:

- Repeat;
- Calendar;
- category;
- alerts;
- duration;
- planning state;
- deadline;
- list;
- tags.

Pattern:

`field value → expanded field → resolved value`

At most one inline field owner at a time unless an explicit product decision says otherwise.

Collapsed options must not remain in the tab order.

---

# 16. Search

Pointer/header Search:

`search icon → search field/results`

Keyboard Search:

instant neutral command surface.

Do not borrow the last pointer source.

---

# 17. Filters

Secondary filters may unfold from Filter.

Primary Smart Views remain visible and discoverable.

Do not hide Smart Views inside a Filter morph.

---

# 18. More/contextual commands

Use Control Morph for bounded commands:

- Duplicate;
- Move;
- Delete;
- contextual actions.

If deletion requires confirmation, confirmation is a Neutral Dialog.

---

# 19. Actions column / restore tab

Legacy visual audit found the collapsed Actions column already has a visible physical anchor: the `ACTIONS` restore tab.

If this interaction is retained in the current product, its motion should read as:

`ACTIONS tab ↔ Actions column`

not a dissolve.

This is subordinate to the current navigation shell. Do not rewrite hamburger/navigation motion as part of this feature.

---

# 20. Agenda/list reveal

Legacy visual audit found agenda cards visually attach to a day rail/spine.

If list-entry motion remains, prefer a restrained reveal from that rail rather than independent per-card fade.

Never replay entry motion on ordinary scroll.

---

# 21. Day/week temporal travel

Use Spatial Slide.

Forward in time and backward in time must have opposite directions.

Selection/state must be correct before the destination is considered settled.

Do not use a full-view fade as the main explanation.

---

# 22. Navigation and settings

Navigation remains a separate spatial owner.

Do not convert navigation to MorphSurface for architectural consistency.

Settings and other true destinations may slide from meaningful edges.

---

# 23. First-run/system surfaces

A surface with no honest physical source must not invent one.

For pointer-less first-run onboarding, use a restrained edge arrival or other explicitly neutral treatment.

Do not morph it from an arbitrary element.

---

# 24. Scrim

Scrim opacity is explicitly allowed.

A scrim is not a physical object. It communicates background de-emphasis.

Do not replace it with a moving dark wipe merely to eliminate opacity.

---

# 25. Semantic opacity

Keep opacity that means state rather than arrival.

Examples:

- completed;
- past;
- drag-held;
- disabled;
- contextual de-emphasis.

A “remove fades” audit must not destroy state meaning.

---

# 26. Reduced motion

Reduced motion is a separate motion mode.

Requirements:

- remove large geometry travel;
- no dependency on `animationend`;
- preserve final state and focus;
- existing short cross-fade fallback may remain;
- no hidden source skin after transition;
- direct press feedback may remain if current accessibility contract permits it.

The full-motion visual demo does not override this exception.

---

# 27. Keyboard motion

Keyboard hot paths remain instant.

Examples:

- keyboard new Event/Action;
- command surfaces;
- keyboard view changes where the current product defines instant motion.

This avoids both false spatial causality and repetitive latency.

---

# 28. Accessibility

Must preserve or improve current accessibility.

Required:

- real buttons/inputs remain real controls;
- visible focus;
- true focus trap only where modality requires it;
- inert background for modal expanded objects;
- Escape closes the current transaction;
- source focus restoration uses semantic source identity;
- disconnected/filtered sources use deliberate fallback;
- collapsed MorphControl content is not tabbable;
- touch-target rules remain intact;
- screen-reader labels describe state, not animation.

Tests must use real Tab traversal where Tab behavior is claimed.

---

# 29. Performance

Motion quality is correctness.

Do not:

- animate the entire app subtree;
- scale a full live form;
- animate timeline layout geometry in-flow;
- run per-frame React state;
- continuously measure every card;
- use a JS read/write loop every rAF;
- use broad paint-bound clipping without profiling;
- remeasure on every software-keyboard height change.

Prefer:

- boundary measurement;
- isolated overlay surfaces;
- compositor-friendly travel;
- shared-element layers that remain 1x;
- narrow clip/reveal regions;
- CSS/WAAPI interpolation.

Physical Android/iOS validation is mandatory before final completion.

---

# 30. Shadcn / Base UI

May be introduced later for commodity accessibility primitives:

- AlertDialog;
- Tooltip;
- Dropdown/Menu semantics;
- Popover semantics;
- Switch;
- Checkbox;
- Select/Combobox.

It is **not** the motion architecture.

Do not replace core Event/Action/Composer surfaces with stock shadcn Sheet.

Desired layering:

`accessible primitive → Calendar Master component → Calendar Master motion`

---

# 31. Explicit non-goals

No changes to:

- Event/task/note domain schemas;
- recurrence engine;
- persistence/import/export format;
- provider sync architecture;
- drag/resize thresholds;
- Action calendar-context rules;
- themes;
- typography;
- current navigation compositor unless separately scoped;
- literal notebook decoration.

---

# 32. Success criteria

The project succeeds when:

1. Event/Action/Note expansion looks like the reference: source object becomes destination.
2. close visibly returns to the same semantic source.
3. empty time visibly becomes Composer.
4. save visibly resolves Composer into the new record.
5. cancel visibly returns to the origin with zero write.
6. Edit reconfigures the same Inspector.
7. field editors unfold in place.
8. compact tools unfold coherently.
9. time/view movement is directional.
10. keyboard paths remain instant.
11. reduced motion remains correct.
12. semantic dimming remains correct.
13. gesture ownership is unchanged.
14. persistence/domain semantics are unchanged.
15. Android and iOS device gates pass.
16. the fortieth repetition still feels fast.

---

# 33. Canonical interaction statement

> **Tap an object → it expands.**  
> **Tap a tool → it unfolds.**  
> **Create something → it grows from where it is created.**  
> **Move somewhere → the page slides.**  
> **Edit something → it reconfigures in place.**  
> **Finish → it returns or becomes the committed object.**

---

# Rev C — explicit supersession of Claude's 2026-08-24 half-sheet direction

The recovered `feat/sheet-presentation-physicality` plan proposed:

- create control → Composer morph;
- Event/Action edit → side/bottom half-sheet;
- Settings/palette → half-sheet;
- rect-less creation → half-sheet.

That was a coherent earlier direction, but it is **not the approved target anymore**.

The later approved Physical Planner visual reference supersedes it:

- Event card → **the Event itself becomes the Inspector**.
- Action card → **the Action itself becomes the Inspector**.
- empty Day/Week time → **that exact region becomes the Composer**.
- sized creation draft → **that exact draft becomes the Composer**.
- Composer Save → **the Composer becomes the committed record**.
- Edit → **the open object reconfigures in place**.
- compact tools → **the tool itself unfolds**.

A half-sheet may still be appropriate for a true destination/system surface, but it may not be used as a shortcut
for Event/Action/Note object morphs or timeline creation. An implementation that ships Claude's half-sheet edit
behavior instead of the reference behavior fails this PRD even if it is otherwise technically polished.

## What is imported from Claude's work

Claude's branch is authoritative evidence for blast-radius risks, not interaction outcome. The following findings
are adopted:

- source geometry must match at frame zero;
- anchor selection comes from geometry, not source IDs;
- true-size large surfaces should not scale their live contents;
- no animated blur is required for core physical continuity;
- source identity may never disappear before destination identity exists;
- close must reverse from the rendered intermediate state;
- current Sheet responsibilities around focus, scroll, backdrop, early-close guards and keyboard behavior are load-bearing;
- narrow viewports need one explicit bottom-edge owner;
- transformed navigation ancestors create a coordinate-space hazard for fixed overlays;
- performance assertions need a negative control;
- visual QA must include multiple desktop/mobile viewports and multiple themes;
- current create/Sheet behavior has existing tests that intentionally sample intermediate frames and must be migrated deliberately.
