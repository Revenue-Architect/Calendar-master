# Calendar Master — Physical Planner Motion System PRD

**Status:** Canonical product specification — Rev D  
**Original behavioral authority:** `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`  
**Extended behavioral examples:** `docs/plans/2026-08-27-007-physical-planner-motion-extended-visual-reference.html`  
**Architecture:** `docs/plans/2026-08-25-002-physical-planner-motion-ard.md`  
**Blast radius / reconciliation:** `docs/plans/2026-08-25-003-physical-planner-motion-reconciliation.md`  
**Execution:** `docs/plans/2026-08-25-004-physical-planner-motion-implementation-plan.md`  
**Rev D decision date:** 2026-08-27

---

# 1. Executive decision

Calendar Master uses one physical interaction language:

> **Nothing important appears from nowhere. Objects expand, tools unfold, creation grows from its origin, navigation moves directionally, and editing reconfigures the same object in place.**

Rev D removes an ambiguity discovered during Phase 7. A technically correct FLIP/shared-element animation is not sufficient if the result still reads as a centered modal, popover, dropdown, or detached surface.

For the normal pointer/touch path, the original visual reference is normative for **perceived spatial behavior**, not merely inspiration.

The user should feel:

- “I expanded this Event,” not “a modal opened.”
- “This Action opened where it lives,” not “a details panel appeared.”
- “I wrote into this time,” not “a form opened elsewhere.”
- “This control unfolded,” not “a dropdown spawned.”
- “I edited this same object,” not “I opened another editor.”

Production may use isolated overlays, frozen logical geometry, or presentation-only displacement to protect calendar math. Those mechanisms must be visually invisible.

---

# 2. Authority and conflict rules

1. `006` is the original normative reference for full-motion pointer/touch behavior.
2. `007` extends the same grammar to later phases; it supplements but never overrides `006`.
3. This PRD controls product semantics.
4. The ARD controls implementation safety.
5. Existing domain, gesture, accessibility, persistence, and recurrence contracts remain protected.
6. If architecture and reference appear to conflict, preserve the architecture internally while reproducing the reference visually.
7. Existing code is migration input, not the visual target.

Hard conflict rule:

> If an implementation uses `MorphSurface` but visually reads as a modal/popover where the reference shows an object expanding/unfolding, the implementation fails.

---

# 3. Motion grammar

| Verb | Meaning | Examples |
|---|---|---|
| **Object Morph** | This object became its expanded form. | Event → Inspector, Action → Inspector, Note → Editor, Month day → Day Peek |
| **Creation Morph** | New material grows from the exact creation origin. | Empty slot → Composer → Event, Add Action → compact Composer |
| **Control Morph** | The control unfolds into the controls it contains. | `+`, More, Search, Filter, Repeat, Calendar, alerts |
| **Spatial Slide** | The user moved through planner space. | previous/next date, view travel, OPEN DAY |
| **Reconfigure** | Same open object, another state. | Inspector → Edit, field → expanded field |
| **Neutral Dialog** | True interruption with no honest source object. | destructive confirmation, recovery, auth/system prompt |

Do not invent another grammar because a generic UI primitive is convenient.

---

# 4. Source-anchored physicality

For Object, Creation, and Control morphs on pointer/touch:

- source position remains the dominant spatial anchor;
- major content does not fly to viewport center unless the reference explicitly does so;
- the surrounding planner remains visually legible;
- destination-only content appears inside the material that grew from the source;
- close is the semantic reverse;
- fields may grow the parent object further;
- presentation may visually yield around the expanded object.

A source-anchored object may widen contextually to remain usable, especially in Week or Month, but the user must still be able to identify where it came from at every mid-frame.

---

# 5. Presentation Lens product rule

Calendar layout and visible physical layout are allowed to diverge temporarily during an expansion.

The product may visually make room around an expanded object while keeping the underlying interaction geometry frozen.

Desired perception:

```text
closed object
    ↓
same object grows in place
    ↓
visible surrounding content yields
    ↓
object contains more controls/content
```

The user must never see or care that this can be implemented with overlays/transforms rather than real calendar reflow.

---

# 6. Event → Event Inspector

## 6.1 Trigger ownership

Existing gesture classification remains authoritative. Motion never steals drag, resize, hold, JOIN, direct controls, touch scroll, or post-manipulation click suppression.

## 6.2 Open

The Event remains visually anchored to the exact Day/Week/all-day source.

Continuity targets:

- shell/material;
- title;
- time/duration;
- accent/category marker;
- source location;
- corner identity;
- disclosure affordance.

Normal pointer/touch Event open must not use a visible centered modal presentation.

No dark Event scrim. No whole-screen blur. No center flight.

The Event grows downward/outward like `006`. The visible timeline/lane may yield around it through presentation-only displacement.

Destination-only content reveals only after enough visible space exists.

## 6.3 Open state

Preserve every current Event capability:

- title;
- date;
- start/end;
- duration;
- all-day;
- recurrence and occurrence/series semantics;
- alerts;
- calendar/category;
- location;
- meeting link;
- notes;
- duplicate;
- delete;
- live/ended semantics;
- validation and dirty-close behavior.

## 6.4 Internal fields

Repeat, Calendar/category, alerts, duration, and other bounded fields expand from themselves. If a field needs more vertical space, the expanded Event grows and the Presentation Lens displacement grows with it. No clipping.

## 6.5 Close

Inspector-only content leaves first. Shared Event identity remains, the visible lens collapses, and the Event contracts to the latest live semantic source geometry. Never close to an unrelated focused element.

---

# 7. Event Inspector → Edit

Edit is **Reconfigure**.

- same expanded Event;
- same spatial anchor;
- same connected Inspector node where architecture permits;
- no second Sheet;
- no replay of entrance motion;
- Save/Revert semantics unchanged;
- object may grow/shrink as edit controls reconfigure.

---

# 8. Action → Action Inspector

Use the same source-anchored Object Morph language.

An Action row/card grows where it lives. Visible rows below may yield through a Presentation Lens while list/order/gesture truth remains unchanged.

Protect complete/reopen, checklist, Add Step, planning, estimate, recurrence, deadline, tags/list/category, blockers/dependencies, notes, delete, parent/subtask navigation, swipe, hold/drag, and estimate resize.

---

# 9. Empty Day timeline space → Composer → Event

The visible time region is the source.

Tap:

`empty time → draft material → Composer`

Hold-and-size:

`sized draft rectangle → Composer`

Cancel:

`Composer → exact empty source`, zero write.

Save:

`Composer → newly committed Event`, exactly one domain write.

The visible timeline may yield around the Composer while logical date/minute geometry remains unchanged.

---

# 10. Week creation

Same semantics as Day. Week owns its own source geometry. Narrow sources may widen contextually, but the Composer must visibly originate from the selected Week slot rather than jumping to a generic panel.

---

# 11. Global Add

Pointer/touch:

`+ → EVENT / ACTION / NOTE`

The `+` physically unfolds. Selecting an option begins the next creation transaction.

Forbidden normal path:

`button → generic dropdown → generic Sheet`

Keyboard Add remains instant/source-less.

---

# 12. Actions quick capture

`+ Action → compact inline Composer`

Advanced options expand the same object further. Actions remains calendar-context-free.

---

# 13. Notes

Standalone and linked Notes use Object Morph. A Note grows from its current card/list source into its editor. Nearby presentation may yield. Close returns to the current semantic Note source or deliberate fallback.

Protect backlinks, entity context, pin/archive, history/revisions, checklist content, extraction, autosave, and source disappearance.

---

# 14. Month day → Day Peek

A Month day cell is a real source and grows contextually into Day Peek. It does not fly to a generic centered Sheet.

Opening an Event inside Day Peek transfers source ownership to that Event. OPEN DAY is Spatial Slide/navigation, not another object morph.

---

# 15. Inline fields

Pattern:

`field value → expanded field → resolved value`

Candidates include Repeat, Calendar, category, alerts, duration, planning, deadline, list, and tags.

Rules:

- field grows from itself;
- parent grows if needed;
- content below yields;
- no clipping;
- one field owner at a time unless explicitly decided otherwise;
- collapsed options leave the tab order;
- Escape restores collapsed state without remounting the parent.

---

# 16. Search, Filter, More

Pointer/header Search unfolds from Search. Keyboard Search is an instant neutral command surface.

Secondary Filter and More/contextual commands use Control Morph. Primary Smart Views remain visible.

A destructive confirmation may be a Neutral Dialog; the bounded command menu itself is not.

---

# 17. Spatial travel

Day/week/date/view travel uses direction. Forward and backward have opposite spatial directions. Full-view fade is not the primary explanation.

---

# 18. Scrim rule — Rev D

Scrims remain valid for Neutral Dialogs and genuine modal interruptions.

Object Morph, Creation Morph, and Control Morph do **not** receive a visible modal scrim by default.

A scrim must never cause a persistent-object transition to read as “a modal opened.”

Whole-screen blur is prohibited for the normal physical-object path.

Semantic modality may still use inert/background interaction blocking without visible dimming.

---

# 19. Keyboard and reduced motion

Keyboard hot paths remain instant and source-less. Never borrow `activeElement` or the last pointer source as fake geometry.

Reduced motion removes large travel/lens displacement animation while preserving final state, focus, scroll, and functionality. A short accessible state change/cross-fade may remain.

---

# 20. Accessibility

Preserve or improve:

- real native controls;
- visible focus;
- true focus trap only where semantics require;
- inert background where required without requiring a visible scrim;
- Escape;
- semantic source focus restoration;
- disconnected-source fallback;
- collapsed content removed from tab order;
- touch targets;
- dirty-close veto;
- mobile keyboard protections.

Visual embedding does not remove accessibility obligations.

---

# 21. Performance and frequency

The fortieth-time test wins.

Do not animate the app subtree, scale live forms, continuously measure every card, or drive motion through per-frame React state.

Production may use isolated overlays and compositor transforms to reproduce reference behavior safely.

Physical Android Chrome and iOS Safari remain final gates.

---

# 22. Visual acceptance

For every migrated pointer/touch surface, inspect 0/25/50/75/100% open and reverse.

A human must still identify the exact source object mid-frame.

Reject if it reads as:

- modal opened;
- popover appeared;
- dropdown spawned;
- separate form slid in;
- source disappeared before continuity existed.

Accept only when it reads as the corresponding verb in the grammar.

> **The implementation mechanism may be sophisticated. The visible explanation must remain simple: the thing I touched became more of itself.**
