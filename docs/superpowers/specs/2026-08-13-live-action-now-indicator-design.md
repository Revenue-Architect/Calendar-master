# Live Action NOW indicator

**Status:** Approved design pending spec review  
**Date:** 2026-08-13

## Problem

The Day timeline derives `liveEvent` from timed Events only. A scheduled Action
with an estimate is rendered in a separate timeline collection, so the NOW rule
treats it as empty grid. The rule crosses through its card, its time chip remains
at the right edge, and the card lacks the elapsed accent fill used by an active
Event.

## Decision

Define one display-only live timeline item:

1. A live Event has priority when any timed Event contains the current minute.
2. If no Event is live, the first estimated scheduled Action containing the
   current minute is the live item.
3. An unestimated Action is a point in time, not a time block, and never becomes
   the live item.
4. Completed Actions retain their existing completion presentation; the live
   treatment does not change completion, reopen, drag, swipe, resize, or gesture
   ownership.

When the live item is an Action, the NOW rule ends at the Action lane, its time
chip moves to the hour gutter, and the Action receives the same restrained elapsed
accent fill and leading edge as a live Event. The fill follows actual elapsed
minutes and uses the existing 260ms linear update. It is decorative and cannot
intercept input.

## Scope

This change is limited to Day timeline presentation and its regression coverage.
It does not change task scheduling, timeline lane packing, current-time storage,
calendar behavior, or Week/Agenda/Actions views.

## Verification

- A live estimated Action truncates the rule at its lane, places the time chip in
  the gutter, and renders a partial elapsed fill.
- A live Event remains the selected live item when it overlaps a live Action.
- An unestimated Action and a completed Action do not gain an elapsed fill.
- Existing Action completion, drag, swipe, resize, and Event NOW behavior remain
  covered by focused browser tests.
