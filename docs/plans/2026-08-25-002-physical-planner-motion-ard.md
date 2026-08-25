# Calendar Master — Physical Planner Motion System ARD

**Status:** Canonical proposed architecture requirements  
**Date:** 2026-08-24  
**Behavioral authority:** `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`  
**Product authority:** `docs/plans/2026-08-25-001-physical-planner-motion-prd.md`  
**Evidence / blast radius:** `docs/plans/2026-08-25-003-physical-planner-motion-reconciliation.md`  
**Execution:** `docs/plans/2026-08-25-004-physical-planner-motion-implementation-plan.md`

---

# 1. Architecture decision

> **Rev C grounding (2026-08-25):** Re-grounded against current `main` `a8cf905b878e913256dc3e3518d133c2583cb443`
> and the docs-only branch `feat/sheet-presentation-physicality`, which is two commits ahead of that main.
> The branch contains Claude's 387-line plan, 7,840-line session log, raw JSONL session, and capture scripts; it
> contains no product-code implementation. Current code has moved beyond some assumptions in that plan:
> `anchoredFluidMorphFromRects()` and 25/50/75% interrupted Composer reversal tests already exist, and the
> current Planner architecture ceiling is 5531 (split-line count). Re-verify all counts at execution time.

Calendar Master will stop treating `Sheet` as the universal product-surface abstraction.

The motion layer will instead expose semantic primitives:

- `MorphSurface`
- `ComposerSurface`
- `MorphControl`
- `SlideSurface`
- `NeutralDialogSurface`
- `MorphRegistry`
- semantic motion keys
- transaction/state-machine utilities
- shared geometry/timing tokens

Legacy `Sheet.jsx` remains during migration.

It is not deleted until all call sites have been deliberately classified.

---

# 2. Repository realities that constrain the design

At the reviewed application state:

- React 19 / ReactDOM 19
- Vite
- Playwright
- custom CSS/WAAPI motion
- no required Framer Motion runtime
- no required shadcn/Base UI runtime
- `Planner.jsx` protected by an architecture ratchet
- significant motion logic already extracted under `src/features/motion`
- gesture ownership explicitly documented
- existing Inspector/Composer logic carries domain-facing behavior
- current Sheet carries focus, scroll, source-geometry, close and reduced-motion responsibilities

This is therefore a **surface-runtime migration**, not a form/domain rewrite.

---

# 3. Existing responsibilities that must not be lost

The current Sheet/system has accumulated hard-earned behavior.

An implementer must inventory and preserve:

1. dialog semantics;
2. focus capture;
3. focus trap;
4. focus restoration;
5. ancestor scroll snapshot;
6. ancestor scroll restoration;
7. body overflow locking;
8. source geometry;
9. source border radius/material;
10. reverse close;
11. in-flight interruption;
12. content handoff timing;
13. height cap;
14. ResizeObserver behavior;
15. software-keyboard protection;
16. reduced-motion mode;
17. dirty-close veto / `beforeClose`;
18. scrim;
19. sticky header;
20. internal scroll affordance.

Do not “replace Sheet” by only re-implementing its opening animation.

---

# 4. Proposed source tree

```text
src/features/motion/
  MorphSurface.jsx
  ComposerSurface.jsx
  MorphControl.jsx
  SlideSurface.jsx
  NeutralDialogSurface.jsx

  morphKeys.js
  morphKeys.test.js
  morphRegistry.js
  morphRegistry.test.js
  morphGeometry.js
  morphGeometry.test.js
  morphTransaction.js
  morphTransaction.test.js
  motionTokens.js

  useMorphSource.js
  useMorphDestination.js

  # legacy during migration
  Sheet.jsx
  fluidGeometry.js
  fluidTrigger.js
  morphTiming.js

src/features/planner/
  PlannerSurfaceHost.jsx
  EventInspectorSurface.jsx
  ActionInspectorSurface.jsx
  PlannerComposerSurface.jsx
  NoteEditorSurface.jsx
```

Names may vary. Boundaries may not.

---

# 5. Three identities

Do not conflate:

### Business identity

Example: Event ID / Task ID / Note ID.

### Render identity

Example: recurring Event occurrence in Day vs Week.

### Motion identity

The concrete visual source/destination for a transaction.

Examples:

```js
eventMorphKey({ occurrenceId, view: "day", lane: "timeline" })
eventMorphKey({ occurrenceId, view: "week", dayKey })
taskMorphKey({ taskId, view: "actions" })
noteMorphKey({ noteId, context: "notebook" })
slotMorphKey({ view: "day", dateKey, startMinute })
```

Never use array index or current focus as motion identity.

---

# 6. MorphRegistry

The legacy “most recently pressed rectangle” model is not enough for the new behavior.

The registry must resolve semantic objects.

Conceptual API:

```js
registerMorphNode({
  key,
  node,
  kind,
  role,
  shared,
});

unregisterMorphNode(key, node);

resolveMorphNode(key);

snapshotMorphNode(key);
```

Snapshot:

```js
{
  key,
  rect,
  radius,
  paint,
  viewport,
  shared: {
    title,
    meta,
    marker,
  },
  capturedAt,
}
```

Requirements:

- live node resolution;
- immutable last-valid snapshot;
- stale-node-safe unregister;
- Strict Mode safe;
- no continuous geometry observers on every record;
- shared child slots optional;
- measurement only on transaction boundaries unless a specific flow proves otherwise.

---

# 7. Why production should not literally expand a timeline card in-flow

The visual reference expands a card in-place because that is the clearest behavioral demonstration.

Production Day/Week timelines are geometry-sensitive.

In-flow expansion risks:

- moving hour rows;
- changing overlap/lane packing;
- changing resize handle locations;
- changing scrollHeight;
- perturbing drag math;
- making source geometry change while opening.

Therefore production should use **overlay shared-object continuity**.

---

# 8. Object Morph renderer

Recommended structure:

```text
source record
   ↓ snapshot
source layout box remains
source paint suppressed
   ↓
isolated MorphSurface overlay
   ├─ ShellLayer
   ├─ SharedTitleLayer
   ├─ SharedMetaLayer
   ├─ SharedMarkerLayer
   └─ DestinationContentLayer
```

### Open

1. gesture classifier returns Tap;
2. capture source snapshot;
3. leave source layout box intact;
4. suppress source paint;
5. mount overlay at source geometry;
6. move/grow shell to destination;
7. move shared title/time/marker at 1x visual scale;
8. reveal destination-only content;
9. transfer modality/focus.

### Close

1. resolve semantic source again;
2. if found, capture latest geometry;
3. reverse shell/shared slots;
4. restore source paint;
5. unmount overlay;
6. restore focus.

This produces the demo's “same object” perception without destabilizing the timeline.

---

# 9. Do not scale a live form

Full-container `scale()` is not the primary mechanism.

Reasons:

- text distorts;
- border widths distort;
- controls magnify;
- hit regions become harder to reason about;
- it reads as zoom.

Shell geometry may use transform-based interpolation.

Shared title/meta/marker should remain visually 1x.

Destination-only form content should arrive after space exists.

---

# 10. Material continuity

Legacy shared-layout work already established an important principle:

**Geometry alone is not enough.**

If a card becomes a destination surface but destination paint appears immediately, it can still read as two objects.

Morph snapshots should capture source paint where feasible:

- background/material;
- accent marker;
- radius;
- key text color.

The surface can transition to destination material as it establishes the new state.

Close must reverse material coherently where doing so does not create a distracting flash.

---

# 11. ComposerSurface is a transaction, not a dialog

Composer has:

1. origin;
2. draft;
3. commit destination OR cancel origin.

Conceptual state:

```text
idle
→ measuring
→ opening
→ editing
→ validating
→ committing
→ destination-wait
→ settling
→ done
```

Cancel:

```text
editing → cancelling → origin → done
```

The motion state machine does not determine persistence validity.

---

# 12. Commit handshake

Critical rule:

> **Never delay the domain write until animation completes.**

Recommended sequence:

```js
const result = commitDraft(payload); // existing domain semantics

const destinationKey = result.motionKey ?? deriveMotionKey(result);
beginDestinationWait(destinationKey);
```

Then:

1. React/domain state commits;
2. record renders;
3. destination registers;
4. Composer resolves into destination;
5. visual transaction settles.

Destination wait is bounded.

If destination is filtered/unmounted:

- use last valid semantic destination snapshot if available;
- otherwise neutral settle;
- never fabricate a destination.

---

# 13. Creation origin types

```js
{ type: "timeline-slot", sourceKey, dateKey, startMinute }
{ type: "week-slot", sourceKey, dateKey, startMinute }
{ type: "global-add", sourceKey }
{ type: "actions-add", sourceKey }
{ type: "keyboard", sourceKey: null }
```

Keyboard origin is intentionally null.

---

# 14. MorphControl

Use width/height expansion only for **compact controls** where the surrounding layout can tolerate it.

Good:

- Add;
- More;
- Search;
- Filter;
- inline Repeat/Calendar/etc.

Not good:

- Event → Inspector;
- Composer;
- large Notes editor.

Requirements:

- same shell where practical;
- collapsed content removed from tab order;
- Escape;
- outside press if semantics require;
- reduced-motion mode;
- no whole-control blur requirement;
- no large bounce.

---

# 15. Reconfigure

Inspector Edit does not create a new surface.

Existing edit draft state remains the state owner.

Rules:

- no remount;
- no re-entrance animation;
- Save/Revert semantics unchanged;
- one expanded field owner;
- field morph local to Inspector.

A browser test should assert node identity survives Edit.

---

# 16. SlideSurface

Use only for actual movement:

- date/page travel;
- view destination travel;
- settings/global destination.

Do not rewrite already-correct navigation compositor work merely to standardize component names.

Navigation is a separate motion owner.

---

# 17. NeutralDialogSurface

Use when no honest object source exists:

- destructive confirmation;
- recovery;
- permissions/auth;
- critical system error;
- import/export confirmation.

This is the best candidate for a future Base UI/shadcn-derived primitive.

---

# 18. Keyboard mode

Legacy audits verified keyboard new/command surfaces are instant.

Protect that deliberately.

Rules:

- no stale source rectangle;
- no “last clicked control” morph;
- no fake origin from activeElement;
- close instant if current product contract says instant;
- state/focus correctness remains required.

---

# 19. Reduced-motion mode

Full-motion state machine remains the semantic owner.

Renderer changes.

Reduced motion:

- skips large travel;
- may use short cross-fade;
- never waits on CSS animation to commit state;
- leaves no source skin;
- preserves focus/scroll.

Do not globally remove opacity rules without checking reduced-motion overrides.

---

# 20. Scrim

Scrim remains allowed to fade.

Treat scrim as environmental lighting, not an object.

---

# 21. Semantic opacity

Do not touch opacity that encodes:

- completed;
- past;
- held;
- disabled;
- de-emphasis.

Any opacity cleanup must classify state vs arrival first.

---

# 22. Reveal-without-paint invariant

Legacy regression history proves visibility must never depend on an animation callback, rAF, or first paint occurring.

This is particularly important for:

- ribbon;
- month cells;
- any load reveal;
- newly registered morph destinations.

Resting DOM/CSS state must be valid without animation.

Motion is enhancement.

---

# 23. Focus

Priority on close:

1. live semantic source;
2. semantically equivalent replacement;
3. deliberate view-level fallback.

Never:

- disconnected source;
- hidden source;
- arbitrary focused control.

On open:

- background becomes inert if truly modal;
- focus transfer occurs only when destination can receive it;
- scroll position must remain stable.

---

# 24. Scroll

Preserve current protections.

Decide per surface:

- body lock?
- ancestor freeze?
- internal surface scroll?
- source timeline still visible?
- scroll restoration target?

Assert before/after scrollTop in E2E.

---

# 25. Mobile keyboard

Software keyboard is a known geometry hazard.

Do not treat every viewport-height change as a layout-mode change.

Prefer:

- width-sensitive remeasure;
- stable destination cap;
- no continuous height chasing while input is focused.

Opening Composer must not visibly jump when keyboard appears.

---

# 26. Gesture isolation

The morph registry is not a gesture owner.

Event:

- tap → open;
- drag → move;
- resize edge → resize;
- JOIN → direct.

Action:

- check → complete;
- swipe remains swipe;
- hold/drag remains current behavior;
- estimate resize remains direct.

Empty space:

- tap → standard-duration Composer;
- hold → sized draft;
- cancel → no write.

---

# 27. Recurrence

A recurring Event's motion identity must distinguish the concrete occurrence from the series/business Event identity where the UI distinguishes them.

An occurrence edit can replace/re-key a rendered source.

Close must re-resolve.

---

# 28. Source disappearance

Possible causes:

- view changes;
- filter;
- virtualization;
- recurrence replacement;
- record deletion;
- mobile responsive reflow;
- scroll/unmount;
- Month Peek close.

Fallback order:

1. latest live source;
2. last semantic source snapshot;
3. neutral close.

Never unrelated source.

---

# 29. Destination disappearance

Creation destination may not appear because:

- filter excludes it;
- selected date changes;
- sort puts it outside mounted window;
- domain update fails;
- projection delays render.

The Composer may not stay forever.

Use bounded destination wait plus explicit fallback.

---

# 30. Z-index

Define semantic layers centrally.

Example ordering:

- normal app;
- dragged record;
- morph source/destination overlay;
- modal neutral dialog;
- toast/system notice.

Do not introduce arbitrary local `z-50` escalation.

---

# 31. Animation ownership

One owner per property.

Rules:

- no CSS transition and WAAPI writing same property simultaneously;
- no React state per frame;
- JS measures at transaction boundaries;
- CSS/WAAPI interpolate;
- stale animation completions ignored by run ID;
- closing can reverse from current rendered state.

---

# 32. Clip-path caveat

Do not assume clip-path is free.

Prior navigation work demonstrated browser-owned/composited capability does not guarantee cheap paint on a given subtree.

If clip is used:

- keep subtree small;
- profile target Chromium;
- profile iOS Safari;
- use paint flashing where available.

Do not apply a full-screen clip because “the browser composites clip-path.”

---

# 33. CSS/layout property rule

Do not animate large layout-sensitive properties in core planner surfaces.

Avoid:

- `left`;
- `top`;
- `width`;
- `height`;
- margin;
- padding;
- grid tracks.

Exception:

small contained MorphControl width/height transitions may be acceptable after measuring because they are local and explicitly product-owned.

---

# 34. Planner composition boundary

`Planner.jsx` must not grow.

Create/extract:

`src/features/planner/PlannerSurfaceHost.jsx`

Responsibilities:

- current Inspector state → Event/Action surface;
- Composer state → ComposerSurface;
- Month Peek;
- Notes surface;
- close callbacks;
- commit result → motion destination key.

Planner provides state/callbacks.

Planner does not implement morph geometry.

If extraction shrinks Planner, lower the architecture ceiling.

---

# 35. Composer content boundary

Do not rewrite the form/domain logic just to change its container.

Composer should become surface-agnostic.

Protect:

- title;
- kind;
- date/time;
- all-day;
- duration;
- recurrence;
- time zone;
- category;
- links;
- alerts;
- notes;
- estimate/due;
- validation;
- submit payload.

---

# 36. Shadcn/Base UI decision

Core motion migration does not depend on it.

Optional later pilot:

- AlertDialog;
- Tooltip;
- menu semantics;
- Popover semantics.

Do not adopt stock shadcn visual language.

Do not replace MorphSurface or ComposerSurface with shadcn Sheet.

---

# 37. Test architecture

## Unit

Cover:

- keys;
- registry;
- stale unregister;
- snapshot fallback;
- transaction reducer;
- run IDs;
- destination wait;
- reduced motion;
- geometry.

## Browser

At minimum:

- motion;
- composer;
- editor rows;
- accessibility;
- actions;
- gesture isolation;
- notes;
- timeline;
- ribbon readiness;
- navigation regression.

## Negative control

Every new critical assertion must be seen failing against the exact invariant it claims.

Examples:

- remove source registration;
- neutralize shared title;
- remount Inspector on Edit;
- bypass real Tab;
- remove destination registration;
- null out run-ID guard.

A repeat count is not proof if the test cannot fail.

---

# 38. Visual verification

The standalone reference is used for behavioral parity.

Compare:

- first frame;
- ~25%;
- ~50%;
- settled open;
- reverse mid-frame;
- settled close;
- creation open;
- commit settle.

Measure geometry where possible rather than relying only on screenshots.

Production styling remains Calendar Master styling.

---

# 39. Physical device gate

Required:

### Android Chrome

- Event open/close;
- Event edit;
- timeline create/save/cancel;
- Action open/close;
- Search;
- Add;
- keyboard;
- scroll;
- interruption;
- reduced motion.

### iOS Safari

Same.

Observe:

- frame pacing;
- keyboard reflow;
- scroll ownership;
- touch ownership;
- paint behavior;
- source continuity.

Headless Chromium is non-regression evidence, not final compositor proof.

---

# 40. Architecture principle

> The motion system owns **where an object came from and where it goes**.  
> It does not own **what the object means, whether a write is valid, or which gesture wins**.

---

# Rev C architecture additions from `feat/sheet-presentation-physicality`

## A. Coordinate-space contract

Claude's branch surfaced a critical geometry fact: Sheets currently render inside
`.nb-nav-carrier.nb-nav-motion-carrier`, which can be transformed. A transformed ancestor becomes the containing
block for fixed descendants. Therefore a `getBoundingClientRect()` measured in viewport coordinates cannot be
blindly applied as local fixed coordinates inside that carrier.

The new motion system must have exactly one coordinate-space strategy.

### Preferred strategy: untransformed motion portal

Before building MorphSurface, prototype a dedicated motion host outside transformed planner/navigation carriers.

Requirements:

- source measurements remain viewport/client coordinates;
- destination measurements remain viewport/client coordinates;
- the overlay host itself is untransformed;
- theme tokens/materials are passed explicitly if CSS inheritance is lost;
- modal inert/focus behavior still targets the real app root;
- navigation open/close does not change the overlay's coordinate system.

### Fallback strategy: explicit coordinate conversion

If the portal cannot preserve required styling or modality without unacceptable duplication, keep the host in the
planner tree but add a pure client→host conversion helper. It must account for the host's live transform/rect and be
covered with nav closed, nav open, mobile and desktop cases.

### Forbidden

- mixing viewport source rects with carrier-local destination coordinates;
- hard-coding offsets for current nav geometry;
- fixing drift by adding magic pixels per breakpoint;
- writing sheet transforms onto the navigation carrier or `.nb-app-surface`.

A preflight experiment chooses one strategy. Do not implement Event/Action morphs before this is resolved.

## B. Surface/viewport ownership

The prior narrow Actions overlap is evidence that spatial ownership is a real product primitive.

Add one small owner service, naming may vary:

```text
surfaceOwnership / viewportOwnership
```

It answers at minimum:

- wide vs narrow using the canonical breakpoint contract;
- which surface owns the narrow viewport's bottom edge;
- whether a new surface may claim it;
- what presentation fallback is required when the region is already owned.

The historical raw query `"(max-width: 639.98px)"` existed in multiple places. Re-measure current usage; centralize
only if doing so does not alter the exact boundary behavior.

For the Physical Planner target, ownership does **not** imply half-sheet Event editing. It prevents two physical
surfaces from claiming the same space while an Object Morph or Creation Morph is active.

## C. Large-surface frame-zero contract

For Event/Action/Note/Composer large morphs:

1. destination live layout is established at true size;
2. source geometry is sampled;
3. visible overlay at transaction t=0 matches the source bounds within subpixel tolerance;
4. shared title/meta/marker occupy source geometry;
5. shell/reveal travels toward destination geometry;
6. destination-only content becomes readable only after physical space exists.

Do not use a full-container scale.

The existing `anchoredFluidMorphFromRects()` is an asset. Reuse or generalize it where its semantics match. Do not
re-implement its asymmetric clipping math in another component.

## D. Radius choreography

The source radius is identity.

For compact/pill sources, effective radius must be bounded by the source box. Avoid keeping a nominal `999px`
pill radius throughout most of a large expansion; that creates the circular-portal read.

Acceptance:

- early frames still read as the source;
- the shell becomes panel/card-like early enough that it never looks like a round portal;
- close reverses the same radius choreography.

## E. Identity continuity contract

At every sampled frame exactly one of these must be true:

- source identity is visibly dominant;
- source and destination are in a deliberate shared handoff;
- destination identity is visibly dominant.

Never allow:

- an identity hole where neither is readable;
- prolonged double identity where both compete;
- a hidden original source that remains independently keyboard reachable;
- an animated clone that is focusable or exposed to accessibility APIs.

## F. Content-timing contract

Destination content is subordinate to shell continuity.

For each large morph:

```text
last destination-content arrival <= shell/open transaction duration
```

No content animation may visibly trail after the object has settled.

Current `nb-notch-body`/legacy timing tests are migration evidence, not permanent selectors.

## G. Stage/animation cancellation contract

Current Sheet uses wall-clock stages plus CSS/WAAPI animations, and current tests already cover stalled clocks,
25/50/75% reversal, backdrop close and reopen.

The new transaction runtime must preserve the behavior while eliminating accidental timer ownership.

On close, reopen, unmount, source loss or destination replacement:

- cancel stale stage timers;
- cancel stale CSS/WAAPI animations owned by that transaction;
- ignore stale completion callbacks by run ID;
- reverse from current rendered geometry when reversible;
- leave a valid resting state even if no animation frame or animationend occurs.

## H. Mobile software-keyboard contract

Claude proposed `interactive-widget=overlays-content` plus `visualViewport` translation. Treat this as an experiment,
not an automatic global meta-tag change.

Gate it because changing viewport meta behavior has app-wide blast radius.

Required outcomes regardless of implementation:

- focused field remains above keyboard;
- sheet/morph layout box does not continuously relayout during keyboard animation;
- opening keyboard does not restart the morph;
- closing keyboard returns to the correct resting position;
- orientation/window-width changes still remeasure;
- physical iOS Safari and Android Chrome both pass.

Prefer a visualViewport-derived transform correction over height animation when needed.

## I. Performance evidence contract

Historical Claude capture recorded the existing sheet morph as the only tested surface with obvious jank in that
session (worst frame reported as 50ms with three frames over 33ms). Treat that as historical evidence, not a current
benchmark.

Before implementation capture current baseline.

The new performance harness should include:

- frame/long-task or trace evidence;
- animation property inventory;
- paint diagnostic;
- first-open and repeated-open measurements;
- negative control proving the paint/performance assertion can go red;
- physical device observation.

CDP `LayerTree.layerPainted` may be used as a diagnostic if available, but it is **not** the sole universal definition
of compositor safety.

## J. Current-code reconciliation

The recovered Claude plan is partially stale on the current branch:

- `anchoredFluidMorphFromRects()` already exists;
- source radius normalization already exists;
- current Sheet already uses anchored notch geometry for Composer;
- current motion tests already cover 25%, 50% and 75% interrupted Composer reversal;
- current architecture ceiling is 5531, not the older values in earlier handoffs;
- current tests explicitly assert a transient `blur(1.5px)` in the legacy Composer body handoff.

Therefore the new project must **characterize before replacing**. Do not create duplicate anchored geometry or duplicate
interruption coverage. When removing/replacing legacy blur or handoff selectors, update tests because the product
contract changed, not by weakening them.
