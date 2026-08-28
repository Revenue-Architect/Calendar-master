# Calendar Master — Physical Planner Motion Reconciliation / Blast Radius

**Status:** Canonical Rev D reconciliation  
**Date:** 2026-08-27  
**Original reference:** `2026-08-25-006-physical-planner-motion-visual-reference.html`  
**Extended reference:** `2026-08-27-007-physical-planner-motion-extended-visual-reference.html`

---

# 1. Why Rev D exists

Phase 7 exposed a gap between architectural correctness and perceptual correctness.

The implementation could register the right semantic Event, animate a FLIP carrier, preserve title/time/marker identity, and still read as:

`Event → centered modal Sheet`

That fails the PRD even if automated geometry tests are green.

Rev D reconciles the product and architecture around one rule:

> **Freeze logical/interaction geometry where safety requires it, but let presentation geometry yield so the user sees the original reference behavior.**

---

# 2. Repository grounding at the Rev D decision

Known branch checkpoints when Rev D was authored:

- `main`: `a97bd9cbeeee92269399b38a913297f398940ac1`
- `feat/physical-planner-motion`: Phase 7 checkpoint `0ea953b4dd570d896c97d7785bc4f97f3876e803`

The Phase 7 checkpoint is valuable evidence but is not the final visual target. Its centered destination/scrim interpretation is superseded by Rev D.

Re-ground hashes and line-count ratchets at execution time.

---

# 3. What remains valid

Do not throw away correct foundation work merely because the destination choreography changes.

Retain:

- semantic motion keys;
- occurrence/view/lane identity;
- `MorphRegistry` live + last-valid resolution;
- stale unregister protection;
- source/destination hooks with no gesture ownership;
- transaction state machine/run IDs;
- interruption/reversal safeguards;
- latest-source close targeting;
- source paint suppression/restore discipline;
- shared title/meta/marker capture;
- `PlannerSurfaceHost` extraction;
- keyboard source-less/instant semantics;
- reduced-motion semantic separation;
- Sheet-derived focus/scroll/a11y behavior where still useful internally;
- architecture ratchet;
- full Day/Week gesture protection.

---

# 4. What Rev D supersedes

For normal pointer/touch persistent-object paths, do not carry forward:

- generic centered Sheet as the visible destination;
- dark object scrim by default;
- backdrop blur for Event/Action/Note object morphs;
- viewport-center travel as the default meaning of “morph”;
- keeping all surrounding presentation fixed when that makes an in-place expansion visually impossible;
- hiding the entire real destination until transaction `open` if the reference requires progressive internal reveal;
- fixed expanded heights that clip unfolded fields.

Also superseded is the overly broad reading of “do not animate timeline layout.” The protected rule is now:

> **Do not mutate logical calendar geometry; presentation-only displacement is allowed.**

---

# 5. New primitive: Presentation Lens

The lens visually creates space without changing domain/gesture truth.

Typical formula:

```js
extra = max(0, expandedVisualHeight - sourceVisualHeight + spacing)
```

Presentation elements below the source may transform by `extra` while:

- Event top/start/duration remain unchanged;
- lane packing remains unchanged;
- drag/resize math remains unchanged;
- source semantic geometry remains available for close and gestures.

Lens scope must be explicit per surface.

---

# 6. Blast-radius matrix

| Surface | Reference behavior | Presentation impact | Protected logical behavior |
|---|---|---|---|
| Day timed Event | card expands in place | later hour rules/records visibly yield | minute mapping, overlap, drag, resize, JOIN |
| Week timed Event | narrow card expands from exact source | relevant Week presentation yields/widens contextually | Week drag/day mapping, sibling occurrences |
| Day all-day | ribbon expands from lane | all-day/timeline presentation may yield | all-day identity and lane |
| Week all-day | compact ribbon expands from exact source | Week all-day presentation yields | occurrence/day identity |
| Event fields | field unfolds inside Event | parent height + lens displacement update | draft/domain semantics |
| Action | row/card expands in place | rows below yield | order, swipe, completion, drag/estimate |
| Empty Day slot | slot/draft grows into Composer | later timeline presentation yields | date/start/duration and gesture ownership |
| Week slot | same in Week column | column presentation yields | Week geometry math |
| Action quick capture | compact source grows | Actions list presentation yields | calendar-context-free state |
| Note | card grows into editor | Note/list neighbors yield | autosave, pin/archive/history |
| Month day | cell grows into Peek | Month presentation yields/overlays contextually | selected date/month grid identity |
| Add/Search/More/Filter | control unfolds | bounded local displacement | keyboard instant path |
| Spatial date/view travel | directional slide | view presentation moves | selected-date/view invariants |
| Neutral Dialog | modal interruption | scrim/dimming allowed | confirmation semantics |

---

# 7. Gesture risks

Presentation work must not introduce:

- wrapper pointer ownership;
- changed pointer capture target;
- transformed hit geometry used as drag truth;
- click activation after drag/resize;
- touch-scroll regression;
- JOIN interception;
- estimate/check/swipe interception on Actions.

Required negative control: intentionally intercept source pointer ownership and prove the gesture suite catches it.

---

# 8. Layout/overflow risks

Rev D introduces visual yielding, so explicitly test:

- ancestor `overflow:hidden` clipping expanded objects;
- internal field options clipping;
- sticky headers covering source-anchored expansion;
- z-index crossing Day/Week rails;
- narrow Week columns;
- bottom-of-viewport expansion;
- software keyboard height changes;
- nested scroll creation;
- transformed children creating containing blocks unexpectedly.

Prefer one transaction-owned presentation layer over scattered local transforms.

---

# 9. Accessibility risks

A visually embedded expanded object can still require dialog-like focus protection.

Do not equate “no visible scrim” with “no inert/focus rules.”

Test:

- Tab/Shift+Tab;
- Escape;
- opener restore;
- dirty-close veto;
- source disconnected fallback;
- scrollTop stability;
- keyboard instant path;
- reduced-motion path.

---

# 10. Recurrence risks

Only the clicked occurrence transfers paint/identity. Siblings stay visible and unaffected by the lens unless they are merely visually below the expanded source and need presentation displacement.

Displacement is not suppression.

Occurrence edits may re-key/remount source; close re-resolves latest semantics.

---

# 11. Dynamic-height risks

Repeat/Calendar/alerts/edit controls can increase expanded content height after the object is already open.

The lens must follow that height without:

- moving the logical source;
- clipping options;
- replaying entrance;
- resetting scroll/focus;
- creating a second modal.

At least Repeat plus one other expandable field must be tested end-to-end.

---

# 12. Phase implications

- **Phase 7:** replace centered Event destination with reference-faithful source-anchored expansion + lens.
- **Phase 8:** Edit reconfigures the same expanded Event.
- **Phases 9–10:** Day/Week creation grows from actual slot/draft geometry and visually yields timeline presentation.
- **Phase 11:** Action expands where it lives and yields Actions/Timeline presentation.
- **Phase 12:** compact Action capture expands in place.
- **Phase 13:** fields unfold from themselves and resize parent/lens.
- **Phase 14:** Notes grow from their card/list source.
- **Phase 15:** compact tools unfold; no generic dropdown/Sheet presentation.
- **Phase 16:** Month day grows into Peek.
- **Phase 17:** spatial travel remains directional slide.
- **Phase 18:** fades are reclassified under the stricter “opacity cannot explain arrival” rule.
- **Phase 19:** visible Sheet presentation retires from persistent-object paths; hardened internals may be retained/re-homed.

---

# 13. Verification consequences

Automated geometry alone is insufficient.

Every physical phase needs:

1. focused RED/green contract tests;
2. negative control;
3. exact-base regression comparison for unrelated failures;
4. full browser suite;
5. 0/25/50/75/100 visual inspection and reverse;
6. repeated-use gate;
7. phone + desktop checks;
8. physical Android/iOS final certification.

A test that proves “overlay reached destination rect” does not prove “same object expanded.”

---

# 14. Rev D acceptance sentence

When evaluating a migrated pointer/touch flow, ask one question first:

> **If the user did not know the implementation, would they describe what happened using the intended verb — expanded, unfolded, grew, slid, or reconfigured?**

If the answer is “a modal/popover/dropdown opened,” hold the phase.
