# Calendar Master — Physical Planner Motion Implementation Plan

**Status:** Canonical execution plan — Rev D  
**Original visual authority:** `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`  
**Extended examples:** `docs/plans/2026-08-27-007-physical-planner-motion-extended-visual-reference.html`  
**PRD:** `docs/plans/2026-08-25-001-physical-planner-motion-prd.md`  
**ARD:** `docs/plans/2026-08-25-002-physical-planner-motion-ard.md`  
**Reconciliation:** `docs/plans/2026-08-25-003-physical-planner-motion-reconciliation.md`  
**Rev D decision date:** 2026-08-27

---

# 1. Global execution rules

For every implementation phase:

1. Re-ground against current branch/main before editing.
2. Preserve user-owned/untracked files.
3. TDD: RED → minimal implementation → focused green → broader regression.
4. Negative-control every new critical invariant.
5. No new gesture owner.
6. Cancel never commits.
7. Keyboard source-less paths remain instant.
8. Reduced-motion remains a separate renderer for the same semantic transaction.
9. Planner architecture ceiling may only stay or decrease.
10. Do not push `main` unless explicitly instructed.
11. Automated green is necessary but not sufficient for visual phases.

Rev D hard visual gate:

> **Normal pointer/touch Object, Creation, and Control morphs must visually follow `006`/`007`: source-anchored expansion/unfolding, not centered modal/popover/dropdown presentation.**

---

# 2. Completed foundation — Phases 1–6

The following remain the accepted foundation unless a later concrete regression disproves them:

- inventory/reconciliation;
- semantic keys;
- `MorphRegistry`;
- source/destination hooks;
- transaction runtime/run IDs;
- `MorphSurface` shell/shared identity/interruption/focus foundation;
- `PlannerSurfaceHost` extraction;
- Event source registration across Day/Week timed/all-day;
- occurrence isolation;
- latest-source close infrastructure;
- architecture ratchet.

Do not re-audit these generally while correcting presentation behavior.

---

# 3. Phase 7 — Event Inspector Morph — Rev D corrective target

The Phase 7 checkpoint `0ea953b4dd570d896c97d7785bc4f97f3876e803` proved important mechanics but is not the final visual target because its centered/scrimmed destination can read as a modal.

## Required result

Event stays anchored to its exact source and visually expands like `006`.

- no visible object scrim;
- no whole-screen blur;
- no center flight;
- source layout/gesture truth remains frozen;
- Presentation Lens visually yields timeline/lane presentation below the object;
- real Inspector content lives inside the expanded Event;
- title/time/marker/material remain continuous;
- disclosure rotates/reverses;
- dynamic field height grows object + lens;
- close returns to latest semantic source;
- Day timed, Week timed, Day all-day, Week all-day all comply;
- recurring sibling remains painted;
- keyboard remains instant/no lens;
- reduced motion uses accessible non-travel state change.

## Negative controls

Prove tests fail if:

- destination is centered;
- visible object scrim opacity becomes material;
- backdrop blur is introduced;
- source logical top/height changes;
- lens displacement does not follow expanded height;
- Repeat options clip;
- recurring sibling is suppressed;
- pointer wrapper steals gesture ownership.

## Visual gate

Open and close at 0/25/50/75/100 for all four source forms plus Repeat open/close. Required perception: “I expanded this Event.”

Repeat open/close ×40 before Phase 7 PASS.

---

# 4. Phase 8 — Event Edit Reconfigure

Keep current edit draft/domain semantics.

Required visible behavior:

- press Edit inside expanded Event;
- same expanded Event stays anchored;
- Inspector content reconfigures in place;
- no second Sheet/editor;
- no entrance replay;
- fields may grow/shrink the same object;
- lens follows height changes;
- Save/Revert return same object to display state.

Tests:

- same Inspector identity/node remains connected where contract requires;
- negative control remount must fail;
- every existing Event edit capability individually verified;
- dirty close unchanged;
- field clipping absent.

---

# 5. Phase 9 — Day creation

## 9.1 Source

Register exact empty-slot or sized-draft semantic source. Do not use raw pointer coordinates after sizing.

## 9.2 Visual behavior

Match `006` creation:

`empty time → draft material → Composer`

The Composer grows at that exact time region. Presentation Lens visually yields later Day timeline content while logical minute geometry remains frozen.

Cancel reverses to the exact empty region with zero write.

Save performs exactly one write, waits for committed Event destination, then visually resolves Composer into that Event.

## Tests

- tap source;
- hold-and-size source;
- cancel zero write;
- save one write;
- destination wait/fallback;
- no logical time-geometry mutation;
- no clipping as Composer fields expand;
- tap/hold/cancel gesture contract;
- save/cancel ×20.

---

# 6. Phase 10 — Week creation

Repeat Day semantics with Week-owned geometry.

- source is exact Week slot/draft;
- narrow source may widen contextually but remains visibly anchored;
- Week presentation yields safely;
- Week logical day/time/drag math unchanged;
- no duplicated Day calculation;
- full Week gesture suite;
- save/cancel ×20.

---

# 7. Phase 11 — Action Inspector

Register Action sources across Day timeline, ActionsPanel, and Week where applicable.

Required visible behavior:

- Action row/card grows where it lives;
- surrounding presentation below yields;
- no centered details modal;
- same shell/check/title/list/category identity remains recognizable;
- Inspector-only content reveals after space exists;
- close reverses to latest Action source.

Protect check, swipe, hold/drag, estimate resize, checklist, planning, recurrence, deadline, tags/list/category, blockers, notes, parent/subtask navigation.

Repeat open/close ×40.

---

# 8. Phase 12 — Actions quick capture

`+ Action → compact inline Composer`

- source control/object expands in place;
- advanced options expand same surface further;
- list presentation yields when needed;
- no date ribbon/context introduced;
- no generic Sheet.

Keyboard quick capture remains instant.

---

# 9. Phase 13 — Inline fields

Migrate in small reviewable batches:

1. Repeat
2. Calendar/category
3. alerts
4. duration
5. planning
6. deadline
7. tags/list

Every field must follow:

`field value → expanded field → resolved value`

Every PR proves:

- one owner;
- options grow from field itself;
- parent object height updates;
- Presentation Lens updates if parent is physically expanded;
- no clipping;
- collapsed options not tabbable;
- parent Inspector not remounted;
- Escape behavior;
- keyboard/reduced-motion correctness.

---

# 10. Phase 14 — Notes

Register Note sources and migrate Note editor to source-anchored Object Morph.

- Note card/list item grows into editor where it lives;
- neighboring presentation yields;
- autosave remains authoritative;
- pin/archive/history/backlinks preserved;
- source disappearance after archive/filter uses semantic fallback;
- no centered generic Sheet visual;
- focus fallback verified.

---

# 11. Phase 15 — compact tools

Separate focused changes:

- global Add;
- Search;
- More;
- secondary Filter.

Pointer/touch controls unfold from themselves like `006`.

Forbidden: generic dropdown/popover visual for a bounded control morph when the reference shows the control becoming its options.

Keyboard Search/Add remain instant/source-less. Primary Smart Views stay visible.

---

# 12. Phase 16 — Month Peek

Register Month day source.

`day cell → Day Peek`

Required visible behavior:

- exact day cell is spatial anchor;
- cell grows/contextually expands into Peek;
- Month presentation yields or is safely overlaid while source identity stays obvious;
- no center-flight Sheet;
- Event opened from Peek transfers source ownership to that Event;
- OPEN DAY becomes Spatial Slide/navigation.

---

# 13. Phase 17 — spatial date/view travel

Only after object/creation/control grammar is stable.

- forward/backward use opposite directions;
- selected-date/view state correct before settle;
- do not use full-view fade as primary explanation;
- do not rewrite already-correct navigation compositor merely for naming consistency;
- protect ribbon re-entry and selected-date invariants.

---

# 14. Phase 18 — legacy fade/surface audit

Re-run classification against current source.

Classify every significant opacity/surface arrival as:

- physical secondary reveal;
- semantic state;
- Neutral Dialog scrim;
- reduced-motion fallback;
- feedback;
- obsolete arrival explanation.

Delete/replace only obsolete arrival explanations.

Explicitly flag any remaining centered Sheet/popover/dropdown used for a flow that should be Object/Creation/Control Morph.

---

# 15. Phase 19 — legacy Sheet retirement

Inventory every Sheet caller and classify:

- Object Morph surface;
- ComposerSurface;
- MorphControl;
- SlideSurface;
- NeutralDialog;
- intentionally legacy/internal accessibility helper.

Persistent-object paths must no longer inherit generic Sheet visual geometry.

Hardened focus/scroll/dirty-close logic may be extracted/reused rather than discarded.

Delete obsolete visual paths only after zero callers and full suite/device gates.

---

# 16. Verification contract

## Unit

`npm test`

## Build

`npm run build`

## Browser

Focused suites at minimum:

- motion;
- composer;
- editor rows;
- actions;
- gesture isolation;
- accessibility;
- notes;
- timeline;
- ribbon readiness;
- navigation shell regression.

Full Chromium:

`npm run test:e2e`

Any failure:

1. focused reproduce;
2. exact-base comparison using same environment;
3. classify only after comparison;
4. never weaken unrelated assertions without evidence.

## Visual

For every migrated physical interaction:

- open 0/25/50/75/100;
- close 100/75/50/25/0;
- desktop + phone;
- dynamic internal expansion where applicable;
- repeated-use gate.

## Physical final gate

Android Chrome + iOS Safari.

---

# 17. Architecture contract

- no new motion dependency required;
- no broad calendar-layout rewrite;
- Presentation Lens transforms presentation, not domain truth;
- no wrapper pointer owner;
- no per-frame React state;
- no continuous observer network over records;
- Planner line ceiling never rises;
- lower ceiling whenever extraction shrinks it.

---

# 18. Completion rule

Automated tests do not close a physical phase by themselves.

A phase is PASS only when the live interaction uses the intended physical verb from `006`/`007`.

> **If it still looks like a modal, popover, dropdown, or detached form where the reference shows expansion/unfolding, HOLD the phase.**
