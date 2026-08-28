# Calendar Master — Physical Planner Motion System ARD

**Status:** Canonical architecture requirements — Rev D  
**Original behavioral authority:** `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`  
**Extended behavioral examples:** `docs/plans/2026-08-27-007-physical-planner-motion-extended-visual-reference.html`  
**Product authority:** `docs/plans/2026-08-25-001-physical-planner-motion-prd.md`  
**Evidence / blast radius:** `docs/plans/2026-08-25-003-physical-planner-motion-reconciliation.md`  
**Execution:** `docs/plans/2026-08-25-004-physical-planner-motion-implementation-plan.md`  
**Rev D decision date:** 2026-08-27

---

# 1. Architecture decision

Calendar Master stops treating `Sheet` as the universal product-surface abstraction.

Rev D adds one critical architectural distinction:

> **Logical/interaction geometry remains authoritative and frozen during physical expansion; presentation geometry may temporarily yield so the visible result matches the source-anchored reference.**

This resolves the false choice between unsafe literal timeline reflow and visually detached centered modals.

The motion layer may expose:

- `MorphSurface`
- `ComposerSurface`
- `MorphControl`
- `SlideSurface`
- `NeutralDialogSurface`
- `PresentationLens` / `TimelineLens` (name may vary; boundary may not)
- `MorphRegistry`
- semantic motion keys
- transaction/state-machine utilities
- shared geometry/timing tokens

Legacy `Sheet.jsx` may remain internally during migration for hardened accessibility/scroll behavior, but it must not dictate a generic visual destination for persistent objects.

---

# 2. Frozen logical geometry invariant

For Event/Action/slot sources, domain and gesture truth may not change merely because an object is visually expanded.

Examples that remain unchanged during an Event expansion:

- Event date;
- start minute;
- duration;
- lane/column assignment;
- overlap packing;
- source layout rect used by drag/resize;
- drag origin;
- resize origin;
- recurrence identity;
- persistence state.

Presentation may visually displace hour rules, later cards, list rows, or neighboring decoration without mutating these values.

A presentation transform is not a domain update.

---

# 3. Three identities

Never conflate:

- **business identity** — Event/Task/Note;
- **render identity** — occurrence + view + lane/date projection;
- **motion identity** — concrete semantic source/destination for this transaction.

Never use array index, current focus, or “last clicked rectangle” as identity.

---

# 4. MorphRegistry

Registry requirements remain:

- live source/destination registration;
- exact-node unregister;
- stale unregister protection;
- immutable last-valid snapshots;
- Strict Mode tolerance;
- source/destination roles;
- shared title/meta/marker snapshots;
- no continuous observer per card;
- measurement at transaction boundaries unless a proven flow requires otherwise.

Close source order:

1. latest live semantic source;
2. last valid semantic source snapshot;
3. deliberate neutral fallback.

Never `activeElement` geometry.

---

# 5. Presentation Lens

`PresentationLens` is the Rev D safety primitive that allows reference-faithful visible yielding without rewriting the calendar layout engine.

Conceptual input:

```js
{
  ownerKey,
  sourceRect,
  sourceVisualHeight,
  expandedVisualHeight,
  axis: "block",
  scope,
}
```

Conceptual displacement:

```js
const extra = Math.max(0, expandedVisualHeight - sourceVisualHeight + spacing);
```

Presentation-owned elements visually below the source may receive a transform derived from `extra`.

The lens must not mutate the values used for:

- time mapping;
- overlap/lane calculation;
- drag/resize hit-testing;
- record start/end;
- persisted layout/order.

The lens is temporary, transaction-owned, reversible, and cleared on settle/cancel/unmount.

---

# 6. Lens scope

Lens scope is explicit, not “transform everything after this DOM node.”

Examples:

- Day timeline: hour rules/decorations and visible record presentation below the source;
- Week: the relevant visual column/lane presentation, with careful cross-column behavior;
- Actions: visual rows below the Action;
- Notes: visual list/card neighbors;
- Month: neighboring cell presentation if needed;
- inline fields: content below the field within its current expanded object.

Gesture owners and source nodes themselves remain stable.

No wrapper may intercept pointer ownership just to implement the lens.

---

# 7. Object Morph renderer — Rev D

Recommended model:

```text
semantic source node
    ↓ snapshot
logical source layout remains frozen
source paint suppressed only after carrier exists
    ↓
source-anchored visual carrier
    ├─ ShellLayer
    ├─ SharedTitleLayer
    ├─ SharedMetaLayer
    ├─ SharedMarkerLayer
    └─ real destination-only content
    ↓
PresentationLens visually yields surrounding presentation
```

Open:

1. gesture classifier returns Tap;
2. capture semantic source;
3. establish carrier at exact source geometry;
4. suppress source paint;
5. grow carrier from the source anchor — do not default to viewport center;
6. grow Presentation Lens displacement with carrier height;
7. shared title/time/marker remain identifiable and visually 1x where scaling would distort them;
8. reveal destination-only content after enough space exists;
9. transfer focus/semantics when the destination is usable.

Close is the semantic reverse and re-resolves latest source geometry first.

---

# 8. Do not literally reflow calendar truth

The original reference uses real in-flow expansion because it is a behavioral demonstration.

Production must reproduce that **visual result**, but may not naïvely change core timeline layout if doing so changes:

- hour mapping;
- overlap packing;
- drag math;
- resize handles;
- logical scroll positions used by gesture code;
- source geometry during the transaction.

The correct conclusion is not “therefore fly to a centered Sheet.”

The correct conclusion is “freeze logical geometry and create a visually indistinguishable presentation expansion.”

---

# 9. Content-driven expanded size

Persistent-object surfaces are content-driven.

Do not lock Event/Action/Note expanded forms to a fixed modal height that clips internal controls.

When Repeat/Calendar/alerts/etc. unfold:

- measure at a controlled boundary or observe the single expanded surface;
- update carrier presentation height;
- update lens displacement;
- keep logical source geometry unchanged;
- avoid nested scroll until viewport constraints genuinely require it.

No per-card global ResizeObserver network.

---

# 10. Live form rule

Do not scale a live form as the primary explanation.

Shell geometry may use transform interpolation. Shared identity may be rendered in dedicated layers. Real form content arrives at true scale after enough space exists.

No text magnification, warped borders, or scaled hit targets.

---

# 11. Material continuity

Capture source material where feasible:

- background;
- radius;
- marker/accent;
- key text color.

Destination material evolves from the source rather than replacing it in the first frame.

---

# 12. ComposerSurface

Composer is a transaction, not a dialog.

Day/Week pointer creation uses exact slot/sized-draft geometry. The Composer visually grows there, can use a Presentation Lens, and on save resolves into the committed Event. Cancel reverses to the exact source with zero write.

Never delay the domain write until animation completion.

Keyboard origin remains null/instant.

---

# 13. MorphControl

Use local width/height/grid expansion where the control's own layout safely owns it:

- Add;
- More;
- Search;
- Filter;
- bounded inline fields.

Controls unfold from themselves. Collapsed content leaves the tab order. Parent persistent objects may grow and update their lens when a field expands.

---

# 14. Reconfigure

Inspector Edit does not create another surface.

- same open object;
- no remount where identity contract requires continuity;
- no re-entrance;
- Save/Revert unchanged;
- field morphs local to the object;
- parent height/lens may update.

---

# 15. SlideSurface and NeutralDialog

`SlideSurface` is for real destination travel: date/view/settings navigation.

`NeutralDialogSurface` is for true interruptions with no honest object source: destructive confirmation, recovery, auth/permission, system error, import/export confirmation.

Only Neutral Dialogs get modal visual treatment by default.

---

# 16. Scrim / modality separation

Semantic modality and visual dimming are independent.

A persistent object may use:

- inert background;
- focus trap;
- outside-click guard;
- body/ancestor scroll protections;

without a visible scrim.

Object/Creation/Control morphs do not receive a dark/blurred scrim by default.

No whole-screen blur for normal object expansion.

---

# 17. Keyboard and reduced motion

Keyboard:

- instant/source-less where specified;
- no stale rectangle;
- no activeElement geometry;
- no Presentation Lens travel.

Reduced motion:

- same semantic transaction;
- skip large travel/lens animation;
- preserve final state/focus/scroll;
- never depend on animation completion to make state valid.

---

# 18. Focus and scroll

Preserve hardened behavior:

- focus capture/restore;
- real Tab trap where semantics require;
- inert restoration;
- ancestor scroll snapshot/restore;
- body overflow rules;
- software keyboard protection;
- dirty-close veto.

Opening focus only moves when the expanded destination can receive it.

Visual yielding must not masquerade as a logical scroll operation.

---

# 19. Gesture isolation

The registry, carrier, and Presentation Lens are not gesture owners.

Protect Event tap/drag/resize/JOIN, Action complete/swipe/hold/estimate resize, empty-space tap/hold-size/cancel, and Week gesture ownership.

A no-wrapper/no-pointer-ownership negative control remains mandatory for critical sources.

---

# 20. Recurrence and source disappearance

Recurring motion identity distinguishes occurrence from series/business identity and includes concrete render context.

Close re-resolves after recurrence edits/remounts.

Source fallback:

1. latest live semantic source;
2. last semantic source snapshot;
3. neutral settle.

Never unrelated source.

---

# 21. Destination disappearance

Creation destination wait is bounded. If a committed destination is filtered/unmounted/delayed, use an explicit semantic fallback rather than keeping Composer forever or fabricating a target.

---

# 22. Z-index and property ownership

Central semantic order:

- normal app presentation;
- drag/lift presentation;
- physical-object carrier;
- Neutral Dialog;
- toast/system notice.

One animation owner per property. No CSS transition and WAAPI fighting the same property. No per-frame React state.

---

# 23. CSS/layout rule — Rev D

The old prohibition on layout-sensitive animation is refined:

- do not animate core logical calendar layout as the source of truth;
- presentation-only transforms are allowed and preferred for visual yielding;
- small contained Control Morph layout expansion is allowed;
- a single isolated expanded surface may use content-driven height when its logical source remains frozen;
- do not force large planner reflow to achieve the visual effect.

---

# 24. Planner composition boundary

`Planner.jsx` must not grow beyond its ratchet.

Planner supplies state/callbacks. Focused planner/motion modules own:

- surface composition;
- semantic motion descriptor;
- carrier geometry;
- Presentation Lens;
- close targeting;
- destination handshake.

Lower the ratchet whenever extraction shrinks Planner.

---

# 25. Test architecture

Unit:

- keys/registry;
- transaction/run IDs;
- snapshot fallback;
- lens displacement calculation;
- dynamic expanded-height propagation;
- reduced motion;
- source/destination geometry.

Browser:

- Day/Week/all-day Event;
- Action;
- Composer;
- fields;
- Notes;
- Month Peek;
- controls;
- accessibility;
- gesture isolation;
- navigation regressions.

Negative controls must prove each critical invariant can fail.

Examples:

- allow Event destination to center;
- add visible object scrim;
- mutate logical Event top when lens opens;
- stop lens propagation on Repeat expansion;
- remount Inspector on Edit;
- suppress recurring sibling;
- borrow activeElement as source.

---

# 26. Visual verification

For every migrated surface compare 0/25/50/75/100% and reverse against `006`/`007`.

Required Event perception:

- source anchor does not change;
- visible planner remains present;
- surrounding presentation yields;
- internal fields do not clip;
- no modal/center-flight reading;
- reverse returns exactly.

Production styling remains Calendar Master styling. Behavioral geometry follows the reference.

---

# 27. Physical device gate

Final certification requires Android Chrome and iOS Safari for Event open/edit/fields, creation save/cancel, Action, Search/Add, keyboard, scroll, interruption, and reduced motion.
