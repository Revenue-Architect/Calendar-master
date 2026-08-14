# Subtask Hierarchy Design

**Status:** Approved for implementation
**Owner:** Product and design
**Created:** 2026-08-14

## Problem and user need

Calendar Master currently renders a promoted checklist item beneath its parent, but the child row and the checklist row share the same rail, checkbox language, and minimal metadata. An empty checklist composer remains visible even when a parent contains only subtasks. In the inspector, a child is labelled `ACTION`, so people cannot tell whether they are editing the parent or a child.

Users need to scan a parent Action and immediately distinguish quick steps from tracked child work, then edit either one without losing orientation.

## Decisions

1. A **checklist item** is a lightweight, binary quick step. It has a title and done state only.
2. A **subtask** is tracked child work. It has a status and may expose only meaningful metadata. Calendar Master supports one visible child level.
3. A parent with subtasks but no checklist must not show an empty checklist composer or its matching rail. A quiet `+ QUICK STEP` affordance reveals the composer on demand.
4. A parent with neither group continues to expose `Add a step` immediately. A parent with checklist items continues to expose that composer before the checklist rows.
5. A subtask inspector is labelled `SUBTASK` and names its parent with a control that returns to the parent inspector.
6. A subtask can retain a lightweight checklist, but its checklist items cannot be converted again: conversion from a child would create a sibling under the one-level hierarchy and is therefore hidden.
7. Until independent child scheduling has a dedicated product design, child tasks are parent-scoped in the UI. Timeline and smart views remain parent-only; no new child card appears on the Timeline.
8. Every Timeline parent Action with children exposes a compact child marker. Tall cards may show the richer count already used today.

## Visual and interaction specification

### Parent card

- Render separate `CHECKLIST` and `SUBTASKS` groups when both exist.
- `CHECKLIST` uses the existing square check treatment and segmented progress.
- `SUBTASKS` uses a distinct labelled group and round child-status control. Each row shows title and a compact status/fact string only when it conveys information, for example `WAITING` or `DUE TODAY`.
- Use a branch rail for subtasks, not a second checklist rail. Do not imitate a nested form field.
- When no checklist items exist and subtasks do, show a text action labelled `+ QUICK STEP`; selecting it replaces that affordance with the existing inline composer and keeps keyboard focus in the composer.
- Rename the existing action and accessible label from “Promote step to a subtask” to “Convert to subtask”. Its title is “Turn this checklist item into tracked child work”.

### Inspector

- Parent Sheet title: `ACTION`.
- Child Sheet title: `SUBTASK`.
- Child context row: `PART OF · {parent title}`. It is a button with accessible name `Open parent action {parent title}`.
- A child has an explicit `CHECKLIST` heading when it has items or its add field is open. It omits the conversion control.
- The parent inspector uses the same labelled groups as the card, so the relationship does not change between entry points.

### Timeline

- A parent Timeline Action with one or more children shows a compact marker in the title line regardless of card height, e.g. `↳ 2` exposed to assistive technology as `2 subtasks`.
- Existing rich `2 SUBTASKS · 1 DONE` text remains available only where card height permits it.
- The marker is informational; it does not alter drag, resize, swipe completion, live-progress, or COMPLETE-overlay layers.

## Motion, accessibility, and constraints

- Conversion is an occasional state change: use only opacity and a 4px vertical transition (160–180ms, existing settle curve). No layout spring, bounce, or animation for keyboard-triggered conversion.
- Respect reduced motion by retaining opacity feedback without translation.
- Preserve current 44px effective targets; small visual controls may use an enlarged hit area.
- Group labels and progress counts must be programmatically exposed. Completion controls identify the child title and whether they complete or reopen it.
- No data migration, domain schema change, provider behavior, or Timeline gesture contract change is included.

## Edge cases

- Long parent/child titles truncate visually but retain their full accessible name.
- A completed child remains visible in its parent group and can be reopened.
- Cancelling a child excludes it from progress as existing domain rules require.
- Parent completion behavior remains unchanged: open child work continues to require the existing explicit choice.
- If a child’s parent is missing due to corrupted legacy state, show `PARENT ACTION UNAVAILABLE`, disable the breadcrumb, and preserve edit access.

## Deliberately not included

- Independent child scheduling, recurring child tasks, nested grandchildren, automatic parent completion, or child Timeline cards.
- A broad visual redesign of Action cards or changes to the existing COMPLETE overlay.

## Verification and success criteria

- A parent with only children has no empty checklist rail or visible `Add a step` field until `+ QUICK STEP` is chosen.
- Parent cards and inspectors expose separately labelled checklist and subtask groups.
- A child inspector identifies itself and provides a working return-to-parent control.
- No conversion action appears within a child checklist.
- Timeline parent cards retain a child-count affordance at short and tall heights.
- Existing completion/reopen, segmented progress, Timeline drag/resize/swipe, haptics, and COMPLETE overlay tests remain green.

## Ethical review

This design clarifies state ownership and keeps all work visible. It does not conceal irreversible changes, manufacture urgency, or use motion to steer completion. Conversion remains reversible through normal task management rather than pretending the data did not change.
