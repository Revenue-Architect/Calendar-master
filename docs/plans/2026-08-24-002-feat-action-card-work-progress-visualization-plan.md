# Action Card Work Progress Visualization — Implementation Plan

**Date:** 2026-08-24
**Status:** Ready for implementation
**Base:** `04f6ccbe2d6021370ea20996fcce825cd31e4d81`
**Recommended branch:** `feat/action-card-work-progress`
**Scope:** Action-card progress only; no task-domain, persistence, Timeline-gesture, navigation, ribbon, Event-card, or motion-shell redesign.

## 1. Objective

Make unfinished work legible directly on every Action card that owns checklist
steps or promoted subtasks.

The experience should answer, at a glance:

- Does this Action contain smaller work?
- How much checklist work is complete?
- How much tracked subtask work is complete?
- Is the remaining work a lightweight step or a separately tracked subtask?

The implementation must reuse the existing segmented checklist language. It
must not invent a second generic percentage bar, merge unlike work into a
misleading percentage, or interfere with Timeline Action completion, body move,
estimate resize, scrolling, inspection, or recurrence behavior.

## 2. Current product truth

The feature is partly present but fragmented:

| Before | After | Why |
| --- | --- | --- |
| Full-screen Action cards show segmented checklist progress only. | Full-screen Action cards show separate, labeled checklist and subtask progress tracks when each exists. | Checklist steps and tracked subtasks are different work types and both need visible status. |
| The Action inspector shows checklist progress but only a textual subtask count. | The inspector uses the same two-track progress summary as the card. | A user should not have to relearn progress after opening the Action. |
| Timeline Action cards show a subtask count, but no checklist bar and no graphical subtask progress. | Timeline Action cards show compact, non-interactive progress rails inside the existing body lane. | Scheduled work needs progress without stealing drag, completion, or estimate-resize space. |
| Mixed checklist/subtask work has no coherent summary. | Mixed work shows two distinct tracks in a fixed order: `STEPS`, then `SUBTASKS`. | Domain rules intentionally report the two types separately. |
| Segment fill timing is inline, not independently reduced-motion normalized, and can accumulate an unbounded stagger. | Segment state changes use a bounded transform-only transition and both reduced-motion mechanisms resolve immediately. | Progress updates are frequent feedback, not a decorative cascade. |

Existing evidence that must remain authoritative:

- `SegmentedProgress.jsx` already expresses checklist progress as one segment per
  counted item.
- `progressGeometry.js` already fills segments by count rather than by which
  item happened to be completed.
- `taskProgress()` returns `checklist` and `subtasks` separately.
- `subtaskProgress()` excludes cancelled children from the denominator and
  counts waiting children as incomplete.
- Promoting a checklist item creates a real child task and preserves completion
  state.
- Completing a parent with unfinished subtasks requires the existing explicit
  choice; this feature must not bypass that rule.

## 3. Product contract

### 3.1 Progress remains two-dimensional

Do not add checklist and subtask counts together into one percentage.

```text
STEPS      2 / 4   [■■□□]
SUBTASKS   1 / 3   [■□□]
```

This is deliberate. A lightweight checklist item and a tracked child Action can
have different scheduling, deadline, reminder, dependency, and status
semantics. A parent with all checklist steps complete but open subtasks must not
look almost or fully done.

### 3.2 Visibility

- No checklist and no required subtasks: render no progress UI.
- Checklist only: render only the checklist track.
- Required subtasks only: render only the subtask track.
- Both: render both tracks, checklist first and subtasks second.
- Cancelled subtasks do not appear in the denominator.
- Waiting and in-progress subtasks remain incomplete.
- Completed promoted checklist items count as completed subtasks after
  promotion; they no longer count as checklist steps.
- A completed parent may still expose truthful child progress in detailed
  surfaces when existing override semantics left child work open. Do not force
  child completion to make the visual look tidy.

### 3.3 Surface hierarchy

**Full-screen Actions card**

- Use labeled rows: `STEPS` and `SUBTASKS`.
- Keep the existing one-segment-per-item geometry.
- Place the summary directly under the metadata row and before the editable
  checklist/subtask bodies.
- Do not add another card or inset panel around the progress.

**Action inspector/edit sheet**

- Reuse the same component and labels.
- Draft checklist changes update the checklist track immediately without
  persisting until the existing Save transaction.
- Subtask progress continues to reflect stored child records; editing the parent
  draft must not clone or mutate them.

**Timeline Action card**

- Render a compact variant as an absolutely positioned, `pointer-events:none`
  sibling of the interactive owners.
- Horizontal bounds are the existing Action body lane: after the 44 px complete
  owner and before the 48 px estimate owner when estimate resize is exposed.
- A single track uses one quiet rail near the bottom of the body lane.
- Two tracks stack with a small fixed gap; neither changes the Action card's
  height.
- Preserve the existing `↳ N` short-card subtask marker and tall-card subtask
  text until visual tests prove they are redundant. The progress rail adds
  completion state; it does not silently remove hierarchy context.
- The COMPLETE overlay remains above all progress content.
- The live Action elapsed fill remains behind the progress rails and must remain
  visually distinguishable from work completion.

### 3.4 Density rules

- Keep one segment per item; do not collapse the progress into a fractional
  continuous bar on narrow cards.
- Segments may become narrower as the count grows, but their gap must compress
  before the segment itself becomes visually discontinuous.
- Do not truncate the denominator or display `8+`; the accessible value and the
  visual number of segments must agree.
- On a 44 px Timeline Action, title, complete owner, estimate owner, and body
  drag surface remain the priority. Progress uses the existing unused lower
  visual band and may not create a new row in layout.

## 4. Visual specification

### 4.1 Full and inspector variants

Each progress row contains:

1. a mono micro-label (`STEPS` or `SUBTASKS`);
2. a mono count (`done / total`);
3. the segmented rail taking the remaining width.

Use existing theme tokens only:

- filled: `T.accent`;
- empty: `T.faint`;
- labels/counts: `T.dimText`;
- no new gradient, shadow, glow, or success color.

The checklist and subtask tracks share color but remain distinguishable through
their labels and fixed row order. Do not create a competing color legend.

### 4.2 Timeline compact variant

- Track height: 2–3 px, matching the current quiet checklist bar rather than a
  prominent status banner.
- Track ends remain softly rounded.
- Empty track remains visible at rest so `0 / N` does not look like missing UI.
- Progress rails never cover the title baseline, completion checkmark, estimate
  value, estimate cue, time label, or subtask marker.
- At 390 px mobile widths, test the narrowest packed lane produced by two
  adjacent Timeline items; no segment may spill into another lane.

## 5. Motion contract

Progress changes are frequent feedback. They should feel responsive and quiet,
not celebratory.

- Initial mount renders at the current value without replaying from zero.
- Completing one step/subtask grows exactly one additional segment from its
  left edge using `transform: scaleX()`.
- Reopening one step/subtask shrinks exactly one segment.
- Use the existing `--motion-enter`/`--motion-settle` vocabulary rather than
  importing another global motion-token system.
- Target duration: 150–250 ms, with immediate visible response and no bounce.
- A bulk state change may stagger only the newly changed segments, with a bounded
  total delay of at most 160 ms. Never use `60ms × item count` without a cap.
- Reordering checklist steps or child task ranks does not replay progress.
- Promotion moves one unit from the checklist track to the subtask track without
  a card-height animation and without a momentary double count.
- Animate only the inner segment's transform. Do not animate width, height,
  margin, gap, card top, or card height.
- Do not add a number pop, shimmer, particle burst, or success-check animation.
  The Action's existing completion interaction already owns the completion
  moment.
- OS reduced motion and the in-app Reduce motion preference both make the fill
  state immediate (`transition:none`) while retaining the visible final state.

This deliberately does not install a transitions.dev catalog animation. None of
the catalog patterns is a closer semantic match than the existing segmented
fill; the useful transitions.dev guidance here is the shared timing vocabulary,
transform-only implementation, bounded response, and reduced-motion contract.

## 6. Accessibility contract

Each visible track is an independent progressbar:

- Checklist: `aria-label="<Action title>: 2 of 4 checklist steps complete"`.
- Subtasks: `aria-label="<Action title>: 1 of 3 subtasks complete"`.
- `aria-valuemin="0"`.
- `aria-valuenow` equals the displayed completed count.
- `aria-valuemax` equals the displayed required total.

Do not expose one combined progressbar. Do not make either rail focusable or
clickable. Screen-reader semantics must remain outside the nested Action body
button so the progressbars are not flattened into button content.

Color is not the only signal: labels, counts, segment geometry, and accessible
values all communicate state. Verify filled/empty contrast in all 15 themes on
both card grounds.

## 7. Architecture and data flow

Use the existing domain selectors; progress is derived, never persisted.

```text
task.checklist ───────────────→ checklistProgress()
db.tasks + parent task id ───→ subtaskProgress()
                                      │
                                      ▼
                         { checklist, subtasks }
                                      │
             ┌────────────────────────┼──────────────────────┐
             ▼                        ▼                      ▼
        TaskCard              TimelineActionCard       Action inspector
        labeled rows          compact rails            labeled rows
```

Recommended component boundary:

- Add `src/features/planner/ActionProgress.jsx` for the shared two-track visual.
- Keep `SegmentedProgress.jsx` as the single-track primitive and extend it only
  with semantic kind/density/reduced-motion hooks required by the wrapper.
- Use `taskProgress()`/`checklistProgress()`/`subtaskProgress()` rather than
  duplicating status rules in React components.
- Replace `subtaskProgressByParent` with a progress view model that contains both
  dimensions for Timeline parents, or pass the checklist and existing aggregate
  separately if that keeps the diff smaller.
- Do not store progress fields in task records, localStorage, recurrence
  exceptions, or persistence migrations.
- Do not add React state for progress. Render directly from the current task and
  child records.

`Planner.jsx` is at an architecture ratchet. The implementation must not raise
its 5,544-line ceiling. Extract the current inspector progress markup into the
shared component and replace more Planner lines than are added. If the feature
cannot be wired without growing Planner, stop and make the component boundary
smaller rather than raising the ceiling.

## 8. Expected file scope

Expected:

- `src/features/planner/ActionProgress.jsx` (new)
- `src/features/planner/SegmentedProgress.jsx`
- `src/features/planner/TaskCard.jsx`
- `src/features/planner/TimelineActionCard.jsx`
- `src/features/motion/plannerStyles.js` only for scoped reduced-motion and
  compact-track styling
- `src/Planner.jsx` only as a net-shrinking wiring change
- `src/features/motion/progressGeometry.js` and its test only if a pure bounded
  transition-state helper is justified
- `tests/e2e/timeline-polish.spec.js`
- `tests/e2e/actions.spec.js`
- `docs/qa/2026-08-24-action-card-work-progress-visualization.md`

Do not modify:

- Timeline gesture ownership or touch-target modules
- Event cards or Event resize controls
- Action completion/swipe arithmetic
- task commands, status transitions, hierarchy rules, recurrence, or persistence
- navigation, ribbon, Sheet, Composer morph, themes, notes, or Week Action parity
- Planner architecture ceiling

## 9. Test-first implementation order

### Task A — Pin the domain/view-model contract

Before UI changes, add the smallest pure tests needed to prove:

1. checklist and subtask progress remain separate;
2. cancelled children are excluded;
3. waiting children remain incomplete;
4. promoting an incomplete step moves one incomplete unit between tracks;
5. promoting a completed step moves one completed unit between tracks;
6. no stored aggregate is introduced.

Prefer existing domain tests when they already prove a rule. Add no duplicate
test merely to improve the count.

### Task B — RED: full Action card parity

Add browser tests for:

- checklist-only Action: checklist track present, subtask track absent;
- subtask-only Action: subtask track present, checklist track absent;
- mixed Action: both tracks present in `STEPS`, `SUBTASKS` order;
- cancelled subtask absent from denominator;
- each progressbar exposes exact accessible values;
- no child work: no progressbar.

The subtask-only and mixed tests must fail on the current base because the full
Action card has no graphical subtask progress.

### Task C — RED: Timeline Action progress

Add tests for scheduled Actions at 15, 30, 60, and 120 minutes:

- checklist progress is visible as a compact rail;
- subtask progress is visible as a compact rail;
- mixed progress renders two rails without changing card height;
- the compact rails stay between the completion and estimate owners;
- `document.elementFromPoint()` across the rails still resolves to the Action
  body owner, never a progress target;
- the COMPLETE and estimate centers remain their current owners;
- adjacent packed lanes do not overlap.

These tests must be RED on the current base for checklist Timeline progress and
graphical subtask progress.

### Task D — Build the shared visual

Implement `ActionProgress` and wire the full card first. Keep the single-track
primitive dumb: counts in, segments out. Keep task hierarchy knowledge in domain
selectors/view-model wiring.

### Task E — Wire Timeline without changing interactions

Place the compact progress sibling inside the card face but outside the body
button, completion button, and estimate resize span. Add `pointer-events:none`
and no pointer/touch handlers.

Run Action completion, body drag, estimate resize, Timeline scroll, and tap-to-
inspect after this task before touching the inspector.

### Task F — Unify inspector and draft behavior

Replace its bespoke checklist-only summary with `ActionProgress`. Draft checklist
ticks update the draft track; child task status continues using stored records.
Keep Save/Revert ownership unchanged.

### Task G — Motion and reduced motion

Convert segment transitions to a named/scoped class so both OS and in-app
reduced-motion CSS can independently normalize them. Prove initial mount does
not replay and only changed segments move.

## 10. Negative controls

Perform locally; do not commit sabotage.

1. Remove Timeline `pointer-events:none`: the ownership/elementFromPoint test must
   fail if the progress layer can intercept input.
2. Feed a combined checklist+subtask total into one bar: the separate-role/count
   tests must fail.
3. Count a cancelled subtask: the denominator test must fail.
4. Remove the segment transform update: the one-step visual transition test must
   fail.
5. Re-enable transition under reduced motion: both independent reduced-motion
   tests must fail.
6. Restore an unbounded per-item stagger: a many-item timing bound test must fail.

## 11. Regression gates

The following behaviors are adjacent and mandatory:

- Action COMPLETE click and horizontal swipe.
- Partial completion swipe returns without writing.
- Action body direct mouse drag and touch hold-drag.
- Action estimate mouse/touch resize.
- Timeline vertical scroll from Action body before lift.
- Tap and 1–2 px tremor inspect without writing.
- Drag/resize never opens the inspector afterward.
- Promoting a checklist item preserves completion state.
- Parent completion with open children retains its existing confirmation.
- Checklist last-step auto-completion behavior remains unchanged.
- Recurring Action occurrence behavior remains unchanged.
- Week still does not advertise unsupported Action gestures.
- Event card geometry and hit regions remain unchanged.
- `ANY TIME`, Timeline chrome, ribbon, navigation, and Composer remain unchanged.

## 12. Required verification

Run cheapest first:

```powershell
node --test `
  src/features/motion/progressGeometry.test.js `
  src/domains/tasks/tests/hierarchy.test.js

npx playwright test tests/e2e/timeline-polish.spec.js `
  --project=chromium --workers=1 --grep "checklist progress|Action progress"

npx playwright test tests/e2e/actions.spec.js `
  --project=chromium --workers=1 `
  --grep "progress|subtask|promot|complete|completion|drag|resize|timeline"
```

Then:

```powershell
npx playwright test tests/e2e/timeline-touch.spec.js --project=chromium --workers=1
npx playwright test tests/e2e/interaction-contracts.spec.js --project=chromium --workers=1
npx playwright test tests/e2e/recurring.spec.js --project=chromium --workers=1
npm test
npm run build
npx playwright test --project=chromium --workers=1
```

Run the mixed progress, Timeline compact, completion swipe, body drag, and
estimate resize cases at least 10 consecutive times without retries.

## 13. Visual QA matrix

Use production build in visible Windows Chrome. Reset fixtures before each
surface comparison.

### 1280 × 900

- Full Actions card: checklist only, subtasks only, mixed, zero work, all done.
- Timeline: 15, 30, 60, 120-minute Actions with one and two progress tracks.
- Confirm progress reads as quiet status, not another control.
- Complete, move, resize, and open the same card after progress is visible.
- Verify no card-height jump when a step/subtask changes state.

### 390 × 844 and 390 × 601

- Repeat short and mixed Timeline cards.
- Verify segments stay within the body lane.
- Scroll from the progress area before touch lift.
- Hold-drag from the progress area after lift.
- Swipe COMPLETE horizontally.
- Resize from the estimate rail.
- Open the Action and compare card/inspector progress language.

### Theme/contrast

- Inspect at least the default dark, light, and lowest-contrast accent themes.
- Run existing contrast tests across all themes.
- Empty and filled rails must remain distinguishable without becoming louder
  than Action title/time/estimate.

## 14. Acceptance checklist

- [ ] Checklist-only Actions show checklist progress on full and Timeline cards.
- [ ] Subtask-only Actions show subtask progress on full and Timeline cards.
- [ ] Mixed work shows two separate tracks, never one combined percentage.
- [ ] Cancelled children are excluded; waiting children remain incomplete.
- [ ] Promotion preserves state and never double-counts.
- [ ] Full card, Timeline card, and inspector share the same visual language.
- [ ] No-work Actions render no empty progress chrome.
- [ ] 15-minute Timeline Actions remain readable.
- [ ] Progress is non-interactive and does not reduce the body drag surface.
- [ ] Completion and estimate owners retain their exact geometry.
- [ ] Initial mount does not replay progress.
- [ ] One completion updates exactly one segment.
- [ ] Bulk delay is bounded.
- [ ] OS and in-app reduced motion are independently immediate.
- [ ] Planner.jsx does not grow and its ceiling is not raised.
- [ ] No persistence/domain schema change.
- [ ] Focused, full unit, build, and full Playwright gates pass.
- [ ] Visible QA passes at all three required viewports.

## 15. Stop conditions

Stop and report instead of improvising if:

- one combined percentage appears necessary;
- Timeline progress requires shrinking the complete, body, or estimate owner;
- a progress element must become interactive;
- the Timeline card must grow beyond its estimate-derived height;
- Planner.jsx must grow or its architecture ceiling must rise;
- task status, hierarchy, recurrence, or persistence semantics must change;
- completion swipe or estimate resize becomes less reliable;
- progress requires width/height animation;
- a new motion library or global token system appears necessary;
- accessibility requires nesting progressbars inside the body button;
- the feature cannot remain truthful for cancelled/waiting/promoted children;
- any test is made green by loosening hit-region or geometry assertions.

## 16. Suggested commits

1. `test(actions): define separate checklist and subtask progress`
2. `feat(actions): share work progress across Action surfaces`
3. `feat(timeline): show non-interactive Action progress rails`
4. `test(actions): protect progress motion and gesture ownership`
5. `docs(qa): record Action work progress validation`

Do not combine this feature with Timeline interaction fixes, navigation work, or
another card redesign.
