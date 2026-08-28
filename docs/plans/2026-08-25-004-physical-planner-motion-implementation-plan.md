# Calendar Master — Physical Planner Motion System Implementation Plan

> Execute task-by-task. Do not treat this as a single mega-PR.

**Goal:** Make Calendar Master behave like the approved Physical Planner reference while preserving domain, gesture, accessibility, performance and persistence contracts.

**Behavioral reference:** `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`  
**PRD:** `docs/plans/2026-08-25-001-physical-planner-motion-prd.md`  
**ARD:** `docs/plans/2026-08-25-002-physical-planner-motion-ard.md`  
**Reconciliation/blast radius:** `docs/plans/2026-08-25-003-physical-planner-motion-reconciliation.md`

---

# 0. Global rules

> **Rev C grounding (2026-08-25):** Re-grounded against current `main` `a8cf905b878e913256dc3e3518d133c2583cb443`
> and the docs-only branch `feat/sheet-presentation-physicality`, which is two commits ahead of that main.
> The branch contains Claude's 387-line plan, 7,840-line session log, raw JSONL session, and capture scripts; it
> contains no product-code implementation. Current code has moved beyond some assumptions in that plan:
> `anchoredFluidMorphFromRects()` and 25/50/75% interrupted Composer reversal tests already exist, and the
> current Planner architecture ceiling is 5531 (split-line count). Re-verify all counts at execution time.

- Re-ground before coding.
- Preserve dirty/user-owned files.
- No `git add -A`, `git add .`, `git reset --hard`, `git clean`.
- Work isolated.
- No mega-PR.
- Do not grow `Planner.jsx`.
- Domain/persistence semantics remain unchanged unless separately approved.
- Gesture ownership remains unchanged.
- Cancel performs zero write.
- Motion callbacks never decide whether a domain write is valid.
- Keyboard paths remain instant.
- Reduced motion remains protected.
- Scrim fade remains allowed.
- Semantic opacity remains.
- Navigation/hamburger compositor is not rewritten under this initiative.
- Every new acceptance test gets a real negative control.
- Exact base/head comparisons use identical environment.
- Physical Android/iOS gate before final completion.

---

# 1. Phase 0 — Re-ground

## Task 0.1 — record truth

- [ ] `git status --short`
- [ ] current HEAD
- [ ] current `origin/main`
- [ ] open PRs touching Planner/motion/Composer
- [ ] Node/npm/Playwright/Chromium
- [ ] repository worker config
- [ ] current Planner line count and ceiling
- [ ] `npm test`
- [ ] `npm run build`
- [ ] full Chromium
- [ ] current failures
- [ ] verify no stale preview server

Stop if current architecture materially differs from the ARD.

---

## Task 0.2 — install docs/reference

Add:

- `docs/plans/2026-08-25-001-physical-planner-motion-prd.md`
- `docs/plans/2026-08-25-002-physical-planner-motion-ard.md`
- `docs/plans/2026-08-25-003-physical-planner-motion-reconciliation.md`
- `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`
- this plan

Open the HTML and manually verify:

- Event open;
- Event close;
- empty-slot Composer;
- save to Event;
- cancel;
- Edit reconfigure;
- field unfold;
- Plus/More unfold.

Commit docs only.

---

## Task 0.3 — write binding ADR

ADR must state:

- visual reference is normative for full-motion pointer/touch behavior;
- keyboard instant exception;
- reduced-motion exception;
- semantic motion grammar;
- semantic source registry;
- overlay shared-object production strategy;
- Composer destination handshake;
- source-unavailable fallback;
- legacy Sheet migration;
- shadcn/Base UI non-prerequisite.

Update DESIGN and interaction contracts.

Do not leave conflicting old doctrine as current authority.

---

# 2. Phase 1 — blast-radius inventory

Before production work, copy the 134-item register into the PR/work log.

Mark every item:

- unchanged;
- migrated;
- intentionally changed;
- N/A.

Re-run source searches for:

- `Sheet`
- `nbfluid`
- `nbnotch`
- opacity transitions
- `mounted ? 1 : 0`
- `animation`
- Composer call sites
- Inspector call sites
- focus helpers
- source geometry
- data test IDs used by motion specs

Re-measure historical “~58 assertion sites”; do not copy the old number.

Commit no product code in this phase.

---

# 3. Phase 2 — semantic identity foundation

## Task 2.1 — morph keys

Create:

- `morphKeys.js`
- unit tests

Cover:

- Event occurrence;
- Event series collision prevention;
- Day/Week render identity;
- Task;
- Note;
- Day slot;
- Week slot;
- controls.

Negative control: deliberately remove occurrence/view component and prove collision test fails.

---

## Task 2.2 — MorphRegistry

Create registry + tests.

Required:

- live registration;
- exact-node unregister;
- stale unregister protection;
- immutable snapshot;
- shared title/meta/marker;
- disconnected node handling;
- Strict Mode tolerance.

Negative control each critical invariant.

---

## Task 2.3 — source/destination hooks

Hooks register refs only.

No click/pointer logic.

Prove gesture handlers remain unchanged.

---

# 4. Phase 3 — transaction runtime

## Task 3.1 — transaction reducer

States:

```text
idle
measuring
opening
open
reconfiguring
validating
committing
destination-wait
closing
cancelling
settled
```

Required:

- run ID;
- stale completion ignored;
- reverse opening;
- reduced-motion same semantic transition;
- commit/cancel distinct.

---

## Task 3.2 — motion tokens

Centralize:

- object open/close;
- create open/commit/cancel;
- control;
- field;
- page.

Retain existing tokens during migration until callers are moved.

Do not copy reference milliseconds blindly; measure fortieth-time behavior.

---

# 5. Phase 4 — MorphSurface

## Task 4.1 — RED fixture

Before implementation, create a deterministic fixture.

Assert:

- overlay starts at source rect;
- source layout rect remains unchanged;
- title/meta/marker start at source positions;
- destination settles to target;
- close reaches latest source.

Break source geometry and prove failure.

---

## Task 4.2 — implement shell

Build:

- shell layer;
- shared 1x title;
- shared 1x meta;
- shared marker;
- destination content layer.

No per-frame React state.

No scale on live form content.

---

## Task 4.3 — focus/scroll

Migrate/reuse existing Sheet focus/scroll behavior.

Tests:

- inert;
- real Tab;
- Shift+Tab;
- Escape;
- focus restore;
- source disconnected fallback;
- scrollTop before/after.

Negative-control focus logic.

---

## Task 4.4 — interruption

Test:

- close at 20%;
- close at 50%;
- rapid reopen;
- stale completion;
- resize/orientation boundary if supported.

---

# 6. Phase 5 — PlannerSurfaceHost extraction

Create `PlannerSurfaceHost.jsx`.

Move existing surface composition out of Planner before adding new behavior.

Planner line count must decrease or remain below current ceiling.

Lower ceiling if it shrinks.

Run complete baseline comparison.

---

# 7. Phase 6 — Event source registration

## Day

Register Event semantic source without touching pointer ownership.

Run all Event drag/resize/JOIN tests.

## Week

Register source in WeekGrid.

Run Week gesture tests.

Negative control: wrapper intercepts pointer → existing gesture test must catch it.

---

# 8. Phase 7 — Event Inspector Morph

Create `EventInspectorSurface`.

Wire to MorphSurface.

Acceptance:

- card visibly becomes Inspector;
- source layout does not move;
- title/time/marker continuity;
- material continuity;
- destination content waits for space;
- close returns to latest Event geometry;
- focus restore;
- no scroll jump.

Test desktop and phone.

Repeat open/close ×40.

---

# 9. Phase 8 — Event Edit Reconfigure

Keep current edit draft semantics.

Assert same Inspector DOM node remains connected before/after Edit.

Negative control: key/remount Inspector; test fails.

Verify every Event edit capability individually.

---

# 10. Phase 9 — Day creation

## Task 9.1 — register empty-slot/sized-draft source

Do not use raw pointer position after sizing.

Protect tap/hold/cancel interaction contract.

## Task 9.2 — make Composer surface-agnostic

Preserve form/domain logic.

## Task 9.3 — ComposerSurface Day flow

RED first:

`slot → Composer → Event`

Assert:

- one write;
- destination mounts;
- destination key resolves;
- final Event exists;
- settle reaches destination.

Cancel:

- zero write;
- return to empty source.

Repeat save/cancel ×20 each.

---

# 11. Phase 10 — Week creation

Repeat Day architecture with Week-owned geometry.

No duplicated Day calculation.

Run Week gesture suite.

---

# 12. Phase 11 — Action Inspector

Register Action sources:

- Day timeline;
- ActionsPanel;
- Week where applicable.

Migrate to ActionInspectorSurface.

Protect:

- check;
- swipe;
- hold/drag;
- estimate resize.

Repeat open/close ×40.

---

# 13. Phase 12 — Actions quick capture

`+ Action → compact Composer`

Advanced options expand same surface.

Actions remains calendar-context-free.

Do not open ribbon/date context.

---

# 14. Phase 13 — inline fields

Migrate in small PRs.

Recommended order:

1. Repeat
2. Calendar/category
3. alerts
4. duration
5. planning
6. deadline
7. tags/list

Every PR proves:

- one owner;
- collapsed controls not tabbable;
- parent Inspector not remounted;
- Escape behavior.

---

# 15. Phase 14 — Notes

Register Note sources.

Migrate Note editor.

Test:

- autosave;
- pin/archive;
- history;
- backlinks;
- source disappearance after archive/filter;
- focus fallback.

---

# 16. Phase 15 — compact tools

Separate PRs:

- global Add;
- Search;
- More;
- secondary Filter.

Keyboard versions remain instant.

Do not hide Smart Views.

---

# 17. Phase 16 — Month Peek

Register Month day source.

`day cell → Day Peek`

Nested Event transfer source ownership correctly.

OPEN DAY becomes spatial navigation.

---

# 18. Phase 17 — spatial date/view travel

Only after object/creation grammar is stable.

Do not rewrite navigation compositor.

Protect ribbon re-entry and selected-date invariants.

---

# 19. Phase 18 — legacy fade audit

Re-run the old classification, but against current source.

Classify every opacity use:

- arrival;
- semantic;
- scrim;
- reduced-motion;
- feedback;
- other.

Do not blindly delete fades.

Potential cleanup only after migrated surfaces are stable.

---

# 20. Phase 19 — legacy Sheet retirement

Inventory every Sheet caller.

Classify as:

- MorphSurface;
- ComposerSurface;
- MorphControl;
- SlideSurface;
- NeutralDialog;
- intentionally legacy.

Delete obsolete paths only after zero callers and full suite/device gates.

---

# 21. Optional shadcn/Base UI pilot

Separate PR.

Use only a true commodity primitive such as AlertDialog or Tooltip.

Do not mix with core MorphSurface migration.

---

# 22. Verification contract

## Unit

`npm test`

## Build

`npm run build`

## Focused browser

At minimum:

- motion
- composer
- editor rows
- actions
- gesture isolation
- accessibility quality
- notes
- timeline
- ribbon readiness
- navigation shell regression

## Full Chromium

Use repo workers.

Kill/verify preview server first.

Any failure:

1. focused reproduce;
2. exact base checkout/worktree;
3. same Node/npm/Playwright/Chromium/workers/port;
4. classify only after comparison.

## Negative control

Mandatory for every new acceptance claim.

## Repeat

- Event open/close ×40
- Action open/close ×40
- Event interrupted close ×20
- create/save ×20
- create/cancel ×20
- real Tab ×20
- reduced motion ×10

No retries for repeat evidence.

---

# 23. Visual parity gate

Compare production behavior to reference at:

- initial source;
- 25%;
- 50%;
- 75%;
- open;
- reverse;
- closed;
- creation open;
- creation commit.

Required visual truths:

- same object;
- title/time continuity;
- source does not duplicate visibly;
- destination content waits for space;
- close is reverse;
- empty space becomes Composer;
- Composer becomes Event;
- Edit reconfigures.

If those do not read correctly to a human, a green geometry test is not sufficient.

---

# 24. Physical device gate

Android Chrome and iOS Safari.

Test:

- Event;
- Action;
- creation;
- Edit;
- Add;
- Search;
- scroll;
- keyboard;
- orientation;
- interruption;
- reduced motion.

Inspect paint/frame behavior.

Do not call the initiative complete without this.

---

# 25. PR sequence

Recommended:

1. Docs + ADR
2. Blast-radius inventory
3. keys + registry
4. transaction + tokens
5. MorphSurface
6. focus/scroll
7. PlannerSurfaceHost
8. Event Inspector
9. Event Edit
10. Day creation
11. Week creation
12. Action Inspector
13. Actions quick capture
14. fields
15. Notes
16. Add/Search/More/Filter
17. Month Peek
18. temporal travel
19. fade audit
20. legacy retirement
21. optional Base UI pilot

Every PR independently releasable.

---

# 26. Review questions for every PR

## Product

- Which motion verb?
- Is the source honest?
- Does close return to the same object?
- Does it match the visual reference?
- Is it still good on the fortieth use?

## Gesture

- Did tap/drag/resize/swipe ownership change?
- Any new pointer wrapper?

## Domain

- Did write count change?
- Is cancel still zero-write?
- Can animation callbacks affect persistence?

## Accessibility

- real Tab?
- hidden controls?
- inert?
- focus fallback?
- reduced motion?

## Layout

- source box stable?
- timeline geometry stable?
- scroll stable?
- keyboard stable?

## Performance

- narrow subtree?
- no per-frame React?
- no duplicate property owner?
- paint profiled?

## Tests

- exact negative control?
- same-env base/head?
- no stale preview?

---

# Rev C — mandatory integration of `feat/sheet-presentation-physicality`

This section is not optional. It updates the execution plan after reading Claude's actual remote branch, plan, raw
session artifact and current code.

## Priority rule

The **approved visual reference wins**.

Do not implement Claude's earlier half-sheet Event/Action editor as a substitute.

Required:

```text
Event card → Event Inspector → Event card
Action card → Action Inspector → Action card
empty/sized time → Composer → committed Event
Composer cancel → empty/sized time
Inspector → Edit = same object reconfigures
```

The branch's half-sheet proposal is useful only as evidence for geometry, viewport ownership, modality and keyboard
risks.

---

# Phase 0C — current-truth reconciliation before any feature code

## Task 0C.1 — freeze exact baseline

Record:

- `main` SHA;
- branch/head SHA used for work;
- `PLANNER_CEILING`;
- current Planner line count;
- current `Sheet.jsx` signature and responsibilities;
- current `fluidGeometry.js` exports;
- current `morphTiming.js` tokens;
- current motion test count;
- every current `Sheet` consumer;
- every current Event/Action Inspector opening path;
- all current visible creation triggers.

Historical branch numbers are not accepted as current truth.

## Task 0C.2 — mark Claude units as DONE / STALE / REUSED / REPLACED

At minimum:

- anchored geometry implementation → **REUSED / already present**;
- 25/50/75 interruption tests → **REUSED / already present**;
- half-sheet Event/Action product direction → **REPLACED by visual reference**;
- bottom-edge ownership → **IMPORT**;
- transformed-carrier coordinate hazard → **IMPORT**;
- stage cancellation → **IMPORT into transaction runtime**;
- paint negative control → **IMPORT, generalized**;
- visualViewport keyboard idea → **EXPERIMENT**;
- legacy blur expectation → **MIGRATION COUPLING**.

Commit this reconciliation with docs/ADR, not product behavior.

---

# Phase 1C — coordinate-space spike (new hard gate)

Before MorphSurface:

1. inspect the actual DOM ancestry of:
   - Day Event;
   - Week Event;
   - Action;
   - Composer source;
   - proposed overlay host;
   - navigation carrier;
2. freeze navigation closed and open states;
3. record `getBoundingClientRect()` and computed transforms;
4. prototype an untransformed body/root motion portal;
5. prove theme/material/focus/inert still work;
6. if the portal is viable, select it;
7. otherwise implement/test a pure client→host coordinate converter.

Acceptance:

- source overlay t=0 matches source rect with nav closed;
- same with nav open where interaction is permitted;
- no magic breakpoint offsets;
- sheet system does not transform `.nb-nav-motion-carrier` or `.nb-app-surface`.

Negative control:

- intentionally apply viewport coordinates inside a transformed carrier and prove the test catches the drift.

No Event/Action morph PR starts before this passes.

---

# Phase 1D — viewport/surface ownership (new hard gate)

Build the smallest owner primitive necessary for narrow viewports.

Inventory:

- Timeline;
- Actions full view;
- Composer;
- Inspector;
- navigation;
- keyboard/visual viewport.

Acceptance:

- one bottom-edge owner;
- second simultaneous claim is rejected or deliberately replaces through transaction logic;
- source remains reversible;
- ownership releases on close/unmount/interruption;
- no special-case “if Actions then...” buried in Sheet/MorphSurface.

Preserve exact breakpoint behavior; centralize the historical 639.98/640 predicate only after tests pin it.

---

# Phase 4C — large-morph geometry must reuse current primitives

Before adding geometry code, inspect current `anchoredFluidMorphFromRects()`.

Do not duplicate it.

For each large Object/Creation Morph:

- establish destination at true layout size;
- calculate source→destination asymmetric reveal;
- match visible frame-zero rect to source;
- preserve source effective radius;
- keep shared title/time/marker visually 1x;
- reveal destination content after shell room exists.

Add geometry cases:

- source inside destination;
- source partially outside destination;
- top-left/top-right/bottom-left/bottom-right;
- source wider than destination;
- source taller than destination;
- fractional/subpixel;
- nav-transformed host case if portal is rejected;
- mobile near keyboard/bottom edge.

---

# Phase 4D — radius/identity choreography

Add visual/e2e assertions for:

- no circular portal;
- no identity hole;
- no prolonged duplicate identity;
- source marker/title/time remain traceable through 25/50/75%;
- destination content does not trail after shell settle;
- close restores source identity before overlay disappears.

Do not animate blur to manufacture continuity.

Current legacy tests that expect `blur(1.5px)` are explicitly migration-coupled and may need product-authorized replacement.

---

# Phase 4E — transaction cancellation upgrade

Current interruption coverage is an asset, but the new runtime must own it generically.

Port/rewrite coverage so it proves the production transaction runtime:

- stall all visual animation clocks;
- stall stage timers if applicable;
- Escape at 25/50/75%;
- backdrop close;
- rapid open/close/open;
- unmount mid-open;
- source removal mid-open;
- destination replacement mid-commit;
- reduced motion;
- browser background/throttle simulation where deterministic.

A valid resting state may not require an animation callback to fire.

---

# Phase 8C — Event Inspector acceptance tightened to visual reference

The Event PR may not be approved merely because:

- source rect is correct;
- destination is positioned correctly;
- tests are green.

Human visual acceptance must answer **yes** to:

> Does this look like the exact Event card physically became the Inspector and then became the card again?

Reject if it reads as:

- card disappears + panel appears;
- card launches a half-sheet;
- panel scales/zooms out of the card;
- card duplicates while another panel grows;
- source title vanishes before destination title exists.

Capture paused frames at 0/25/50/75/100 and reverse.

---

# Phase 10C — creation acceptance tightened to visual reference

For Day and Week:

- tap empty region → that region is source;
- hold-and-size → sized draft is source;
- save → Composer resolves into committed Event;
- cancel → Composer resolves back into source space.

Do **not** route real timeline creation to Claude's rect-less half-sheet path simply because no button opened it.

Only genuinely source-less keyboard/command invocation stays source-less/instant.

---

# Phase 16C — settings/search/palette classification

Do not inherit Claude's “all secondary surfaces use half-sheet” rule.

Classify each using the motion grammar:

- pointer Search control → Control Morph;
- keyboard Search/command palette → instant neutral/command surface;
- Settings → Spatial Slide or deliberately neutral destination based on current navigation IA;
- destructive confirmation → NeutralDialog;
- visible create choice → Creation/Control Morph.

Write the classification into the Sheet migration inventory.

---

# Phase 18C — mobile software-keyboard experiment

Do not change viewport meta as an incidental Sheet fix.

Experiment A:
- current meta + current keyboard strategy.

Experiment B:
- `interactive-widget=overlays-content` + `visualViewport` transform correction.

Compare:

- focused field visibility;
- layout box stability;
- timeline source stability;
- keyboard open mid-morph;
- keyboard close;
- orientation;
- Android Chrome;
- iOS Safari.

Choose only after physical-device evidence.

---

# Phase 18D — performance harness upgrade

Historical evidence from Claude: one headless capture observed the legacy sheet morph at a 50ms worst frame with
three frames over 33ms. Re-measure current main first.

Build a harness that can fail:

1. trace/long-frame measurement;
2. active animation property inventory;
3. paint diagnostic;
4. negative control deliberately animating a known bad property;
5. first-open and warmed ×40 runs;
6. desktop + mobile;
7. physical device gate.

A CDP `LayerTree.layerPainted` assertion is allowed only as one signal. Do not make it the sole release gate.

---

# Phase 18E — visual QA matrix imported from Claude

Minimum desktop/mobile viewports:

```text
1280×900
1440×900
1024×768
390×844
390×601
```

Minimum theme coverage:

```text
one dark
one light
one high-chroma accent
```

Minimum transaction matrix:

```text
Event open / close / 25% reverse / 50% reverse / 75% reverse
Action open / close / interruption
empty-space create / cancel / save
sized-create / cancel / save
global Add / select / close / reopen
Actions create source at narrow width
pointer Search
keyboard Search
Edit reconfigure
inline field
nav closed
nav open where interaction is permitted
keyboard open/close
reduced motion
```

Inspect specifically for:

- source drift;
- portal/circle effect;
- text resampling;
- blur flicker;
- background flash;
- clipping;
- first-open stutter;
- close snap;
- stale hidden source;
- duplicate source;
- focus loss;
- scroll jump;
- bottom-edge overlap;
- nav-carrier coordinate drift.

---

# Phase 19C — migration inventory expanded

Before retiring Sheet, classify all current consumers, not Claude's historical 18.

For each record:

```text
consumer
openers
pointer source?
keyboard source?
motion verb
modal?
backdrop?
bottom-edge ownership?
focus trap?
scroll lock?
current width/cap
new surface
migration PR
tests
```

Historical branch evidence says fourteen consumers were outside Claude's narrower feature. That is not a permanent exemption
for this broader Physical Planner initiative; each must be deliberately classified.

---

# Added stop conditions

Stop the affected PR and report if:

1. the only way to match the visual reference appears to require scaling a full live form;
2. Event/Action begins reading as a half-sheet instead of an object morph;
3. real empty-time creation is being treated as source-less;
4. source/destination coordinate math differs depending on arbitrary nav magic offsets;
5. two surfaces can own the narrow bottom edge;
6. the new system needs to write geometry onto navigation carrier/app-surface nodes;
7. blur is being added to hide identity discontinuity;
8. destination content visibly finishes after the shell settles;
9. a stale animation/timer can mutate a new transaction;
10. a performance assertion has no proven-negative control;
11. an `interactive-widget` change is proposed without full app/mobile verification;
12. tests are changed to assert implementation details while losing the “same object” outcome;
13. physical-device behavior differs materially from the visual reference even when headless tests pass.
