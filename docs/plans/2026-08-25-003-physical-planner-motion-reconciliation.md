# Calendar Master — Physical Planner Legacy Reconciliation & Blast-Radius Register

**Purpose:** Preserve useful findings from prior Claude/Codex motion work without allowing older implementation plans to override the newly approved Physical Planner visual behavior.

**Canonical visual behavior:** `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`

---

# 1. Legacy sources reconciled

> **Rev C grounding (2026-08-25):** Re-grounded against current `main` `a8cf905b878e913256dc3e3518d133c2583cb443`
> and the docs-only branch `feat/sheet-presentation-physicality`, which is two commits ahead of that main.
> The branch contains Claude's 387-line plan, 7,840-line session log, raw JSONL session, and capture scripts; it
> contains no product-code implementation. Current code has moved beyond some assumptions in that plan:
> `anchoredFluidMorphFromRects()` and 25/50/75% interrupted Composer reversal tests already exist, and the
> current Planner architecture ceiling is 5531 (split-line count). Re-verify all counts at execution time.

The consolidation specifically incorporates findings from:

1. `docs/superpowers/specs/2026-08-15-shared-layout-motion-prd.md`
2. `docs/superpowers/plans/2026-08-15-shared-layout-motion.md`
3. `docs/plans/2026-08-17-002-refactor-defade-motion-plan.md`
4. `docs/superpowers/plans/2026-08-17-framer-fidelity-motion.md`
5. subsequent motion fixes and review history up through the PR #13 review cycle

These older documents remain historical evidence.

They are not the interaction authority after the new ADR is accepted.

---

# 2. What the old work already proved

## 2.1 “Every surface comes from somewhere”

Legacy plan thesis:

> arrival opacity was often being asked to explain spatial causality.

This is adopted and strengthened.

New rule:

> a major pointer/touch surface either morphs from a semantic object/control, slides from a meaningful edge, or deliberately stays neutral/instant.

---

## 2.2 The current generic fade was already uncommon

A live audit found most pointer-opened surfaces already received `notch` or `trigger` origins.

Keyboard surfaces used `origin="none"`.

First-run was the primary generic-fade case.

Implication:

**Do not spend the new project merely “making existing Sheet morph more often.”**

The new target is deeper:

- Event should become Inspector.
- timeline space should become Composer.
- Composer should become destination Event.
- Inspector should reconfigure in place.

---

## 2.3 Keyboard instancy is deliberate

Adopt.

Keyboard `n`, `a`, command-style surfaces, and keyboard view hot paths remain instant where currently defined.

Do not give them fake object origins.

---

## 2.4 Reduced-motion fade is deliberate

Adopt as an accessibility exception.

Do not globally remove opacity/fades and accidentally remove reduced-motion fallback.

---

## 2.5 Scrim fade is deliberate

Adopt.

Scrim is environmental dimming, not an object.

---

## 2.6 Semantic dimming is not motion

Adopt.

Do not remove:

- completed dimming;
- past dimming;
- drag-held dimming;
- other state-opacity signals.

---

## 2.7 Visibility may not depend on animation

Strongly adopt.

A prior paint-gated reveal left ribbon content permanently invisible.

New motion must remain enhancement over a valid resting state.

---

## 2.8 Test coupling was broad

Legacy audit estimated roughly 58 assertion sites around the old fade/motion mechanisms, concentrated in:

- `motion.spec.js`
- `actions.spec.js`
- `timeline-polish.spec.js`
- `reveal-without-paint.spec.js`
- `note-templates.spec.js`
- `audit-harden.spec.js`
- `interaction-feedback.spec.js`

These exact counts must be re-measured on the implementation baseline.

Do not copy historical numbers into a new PR as current facts.

---

## 2.9 Current NEW/Composer already had shared-material lessons

Older shared-layout work established:

- source trigger should disappear visually while preserving layout;
- destination should carry source material initially;
- full form contents should not be scaled;
- reverse close matters;
- keyboard open has no morph;
- the “same object” picture matters more than copying a library mechanism.

Adopt.

The new demo extends that logic from NEW/Composer to Event, Action, Note and empty-space creation.

---

## 2.10 Existing mechanism is not the target

Older plans often tried to improve the existing true-size Sheet + clip-path approach.

The new approved direction changes the product architecture.

Therefore:

- preserve useful geometry/focus/material lessons;
- do not preserve Sheet as the universal surface abstraction merely because it already works.

---

# 3. Legacy conflicts explicitly superseded

| Legacy idea | New decision |
|---|---|
| Improve generic Sheet arrival everywhere | Replace universal Sheet model with semantic surface types |
| Event Inspector is a separate sheet revealed from card | Event must visibly become Inspector |
| Composer is a sheet opened from empty space | empty space must visibly become Composer |
| Save closes Composer | save resolves Composer into committed destination |
| Edit opens/morphs another editor surface | Inspector reconfigures in place |
| one morph technique for all surfaces | distinct Object / Creation / Control / Slide / Reconfigure / Neutral semantics |
| implementation plan can dictate behavior | visual reference dictates behavior; ARD chooses safe mechanism |
| in-flow card expansion | only demo mechanism; production timeline uses overlay continuity |

---

# 4. Protected legacy constraints

The new behavior does **not** authorize breaking:

- gesture ownership;
- drag/resize math;
- JOIN/direct controls;
- recurrence semantics;
- note/task/event domain logic;
- persistence;
- undo;
- focus;
- inert;
- scroll restoration;
- mobile keyboard behavior;
- reduced motion;
- navigation compositor;
- Planner architecture ceiling.

---

# 5. Blast-radius register

This is the minimum pre-implementation audit.

The implementer should mark each item:

`UNCHANGED / MIGRATED / INTENTIONALLY CHANGED / NOT APPLICABLE`

## Surface runtime

1. Current `Sheet.jsx` opening.
2. Current `Sheet.jsx` closing.
3. reverse from mid-open.
4. source-visibility handoff.
5. source-radius/material capture.
6. scrim.
7. body overflow lock.
8. modal inert.
9. focus trap.
10. focus restore.
11. scroll snapshot/restore.
12. height cap.
13. internal scroller.
14. ResizeObserver.
15. software-keyboard height changes.
16. viewport width/orientation changes.
17. reduced-motion path.
18. `beforeClose` / dirty veto.

## Trigger/source identity

19. pointer source detection.
20. keyboard source clearing.
21. Event semantic source key.
22. recurring occurrence source key.
23. Week Event source.
24. Action source in Day.
25. Action source in Actions.
26. Note source.
27. Month day source.
28. empty Day slot source.
29. sized Day creation draft source.
30. empty Week slot source.
31. global Add source.
32. Actions Add source.
33. search source.
34. inline field source.

## Gesture ownership

35. Event body tap.
36. Event drag.
37. Event top resize.
38. Event bottom resize.
39. JOIN.
40. Action check.
41. Action body swipe.
42. Action hold/drag.
43. Action estimate resize.
44. empty-space tap.
45. empty-space hold/sizing.
46. pointer cancel.
47. click suppression after manipulation.

## Domain writes

48. Event create write count.
49. Event update payload.
50. occurrence vs series update.
51. Event delete.
52. Action create.
53. Action edit.
54. complete/reopen.
55. Note create/edit/autosave.
56. cancel = zero write.
57. undo/restore.
58. persistence/import/export.

## Destination settlement

59. new Event mounts before visual completion.
60. destination semantic key.
61. destination filtered out.
62. destination outside current date.
63. destination sorted away.
64. destination render delayed.
65. failed domain write.
66. deleted source while open.
67. source filtered while open.
68. source virtualized while open.
69. source moved due responsive layout.

## Accessibility

70. source focusability while visually suppressed.
71. destination focus target.
72. real Tab traversal.
73. Shift+Tab.
74. Escape.
75. collapsed MorphControl tab order.
76. hidden field options.
77. screen-reader labels.
78. touch target size.
79. keyboard open = instant.
80. reduced-motion = non-travel fallback.

## Visual state

81. source background/material.
82. destination material.
83. title continuity.
84. time/meta continuity.
85. accent marker continuity.
86. radius transition.
87. dark theme.
88. light theme.
89. other existing themes.
90. high-contrast/contrast tokens.
91. semantic dimming remains.

## Layout/performance

92. timeline row geometry.
93. overlap/lane packing.
94. drag placeholder geometry.
95. source layout box stays stable.
96. app scrollWidth.
97. app scrollHeight.
98. page overflow.
99. broad clip paint.
100. per-frame React updates.
101. duplicate property animation owners.
102. hardware compositor behavior.
103. iOS WebKit behavior.
104. Android Chrome behavior.
105. software keyboard frame pacing.

## Other moving systems

106. navigation drawer motion.
107. mobile calendar rail.
108. view pills.
109. day ribbon.
110. Actions collapse/restore.
111. agenda/list reveal.
112. timeline chrome collapse.
113. toasts.
114. first-run Welcome.
115. Smart View overflow fade cues.
116. command/search surfaces.

## Tests / environment

117. `npm test`.
118. build.
119. focused motion suite.
120. composer suite.
121. actions suite.
122. gesture suite.
123. accessibility suite.
124. notes suite.
125. ribbon readiness.
126. navigation regression.
127. full Chromium.
128. repo worker count.
129. stale preview server contamination.
130. exact base/head same toolchain comparison.
131. negative controls.
132. repeat gates.
133. first-frame/frozen-frame assertions where claimed.
134. physical device pass.

This list deliberately exceeds “~20”. The prior audits showed that motion changes can couple into surprisingly distant systems.

---

# 6. Specific old findings that must become tests or preflight checks

### A. Stale preview server

Older verification lost runs because Playwright could reuse a server on the expected port and test a stale build.

Preflight:

- kill/verify preview server;
- record served commit/build identity where possible.

### B. False-green test risk

Recent PR #13 review proved a keyboard test could report repeated green while pressing zero Tabs.

Rule:

- every new key acceptance assertion must have a negative control aimed at the exact action line.

### C. Browser-version variability

Animation sampling can change across Chromium builds.

Do not call a motion failure “baseline” or “flake” without exact same-environment base/head comparison.

### D. WebKit gap

Chromium-only E2E does not validate iOS animation behavior.

Physical iOS remains mandatory.

### E. Material continuity

A geometrically correct morph can still read as two objects if destination paint replaces source paint too early.

Test mid-frame material as well as geometry.

### F. Source measurement contamination

Never measure a destination after its own transform/animation has already changed `getBoundingClientRect`.

Measure true destination geometry before applying visual transform, or temporarily suppress entry animation during measurement.

### G. Focus can cause scroll

Opening focus on a transforming/shrunk object can make the browser scroll a transient box into view.

Use deliberate focus timing and `preventScroll`/scroll restoration as appropriate.

### H. software keyboard

Height-only viewport changes during focused input should not repeatedly recalculate the morph as if layout mode changed.

---

# 7. Reconciliation conclusion

The older work makes the new plan safer, but it does not reduce the target.

The required end state remains the visual reference:

- Event becomes Inspector.
- Action becomes Inspector.
- empty space becomes Composer.
- Composer becomes created record.
- Note becomes editor.
- tools unfold.
- Edit reconfigures.
- navigation/time moves spatially.

Any implementation that preserves the old universal Sheet model but only “removes fades” is incomplete.

---

# Rev C — recovered Claude branch reconciliation

## Source

Remote branch:

`feat/sheet-presentation-physicality`

Compared with current `main` `a8cf905b878e913256dc3e3518d133c2583cb443`, the branch is two commits ahead and
contains planning/evidence only:

- `docs/plans/2026-08-24-003-feat-sheet-presentation-physicality-plan.md`
- `docs/plans/2026-08-24-003-feat-sheet-presentation-physicality-session-log.md`
- `docs/plans/2026-08-24-003-feat-sheet-presentation-physicality-session-raw.jsonl`
- four temporary capture scripts

No product-code implementation from that plan is present on the branch.

## Branch design decisions: adopt / supersede

| Claude branch decision/finding | Rev C disposition |
|---|---|
| create control becomes Composer | **ADOPT**, generalized by visual reference |
| Event/Action edit opens half-sheet beside record | **SUPERSEDE** — Event/Action must become Inspector |
| rect-less timeline creation opens half-sheet | **SUPERSEDE** where real empty/sized source geometry exists |
| keyboard create has geometry but no transition | **ADOPT intent** — keyboard remains instant/source-less |
| Settings/palette share half-sheet geometry | **DO NOT GENERALIZE** — classify by motion grammar |
| one bottom-edge owner on narrow viewport | **ADOPT** |
| per-consumer backdrop/modality/anchor/size contract | **ADOPT** as new-surface responsibility |
| navigation shell untouched | **ADOPT** |
| transformed nav carrier affects fixed-coordinate math | **ADOPT — critical** |
| true-size large surface; no full-panel scale | **ADOPT** |
| source radius choreography | **ADOPT** |
| no identity hole | **ADOPT** |
| reverse from rendered intermediate frame | **ADOPT** |
| animated blur optional | **TIGHTEN** — avoid it for new core large morphs |
| CDP paint gate + deliberate negative control | **ADOPT as diagnostic**, not sole truth |
| `interactive-widget=overlays-content` | **EXPERIMENT ONLY**, because global blast radius |
| 18 Sheet consumers / 24 inspector call sites | **HISTORICAL COUNTS** — remeasure before work |

## Current-code discoveries that make Claude's plan stale in places

Current `fluidGeometry.js` already contains:

- `effectiveFluidSourceRadius()`;
- `anchoredFluidMorphFromRects()`;
- asymmetric clip insets;
- geometry-derived `anchorX`/`anchorY`.

Current `motion.spec.js` already contains:

- stalled animation/stage-machine regressions;
- in-flight reverse;
- 25/50/75% Escape reversal;
- backdrop reversal;
- quick close/reopen;
- current body-handoff timing;
- an explicit legacy blur expectation.

Current architecture test uses:

```text
PLANNER_CEILING = 5531
```

Execution must therefore start from current truth, not re-run Claude's old units literally.

## Additional blast-radius items: 135–169

Add these to the existing 134-item register:

135. remeasure all current `Sheet` consumers; preserve historical 18 only as evidence.  
136. remeasure every record-inspector open site; preserve historical 24 only as evidence.  
137. inventory per-consumer backdrop, modality, anchoring and size-cap semantics.  
138. identify every narrow viewport surface capable of owning the bottom edge.  
139. enforce exactly one bottom-edge owner during a physical-surface transaction.  
140. verify canonical wide/narrow breakpoint semantics, including the historical 639.98/640 boundary.  
141. identify every transformed ancestor of the proposed overlay host.  
142. verify source/destination coordinate conversion with navigation closed.  
143. verify source/destination coordinate conversion with navigation open/in-flight where allowed.  
144. ensure source geometry is captured before the source is visually transformed/suppressed.  
145. cancel all stage timers on close/reopen/unmount.  
146. cancel/ignore stale WAAPI/CSS animation completions by transaction/run identity.  
147. resting state must not depend on `animationend`, rAF, or timers advancing.  
148. reverse begins from actual rendered intermediate geometry.  
149. benchmark first open separately from warmed repeated opens.  
150. compare current performance with the historical 50ms/3×>33ms observation; do not assume it still holds.  
151. inventory tests that currently require blur/scale/handoff properties before changing them.  
152. assert no frame has neither source nor destination identity.  
153. assert no prolonged frame has duplicate competing identity.  
154. assert destination content finishes by shell settle.  
155. verify source-radius normalization and radius choreography.  
156. visual regression for circular/portal expansion.  
157. frame-zero visible overlay bounds match source rect within subpixel tolerance.  
158. anchor derives from live geometry, not hard-coded source kind.  
159. audit every visible create control, including Actions empty-state/add variants.  
160. distinguish pointer-opened command/palette/search paths from keyboard-opened paths.  
161. keyboard paths clear/ignore stale pointer source geometry.  
162. treat any `interactive-widget` meta change as a global app blast-radius item.  
163. verify focused inputs against real visualViewport keyboard occlusion.  
164. create contact-sheet/screenshot baseline before migration.  
165. validate at 1280×900, 1440×900, 1024×768, 390×844 and 390×601 at minimum.  
166. validate at least one dark, one light and one high-chroma theme.  
167. any paint/compositor assertion must have a deliberate negative control.  
168. do not treat one CDP event as universal compositor truth; pair with traces and physical devices.  
169. sheet/morph code may not write transforms or geometry onto navigation carrier/app-surface nodes.
