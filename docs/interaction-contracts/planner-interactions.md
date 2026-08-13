# Planner interaction contracts

Living owner table for Day, Week, Actions, and inspector surfaces.
Handlers implement this document. They do not invent a second meaning for a
region.

Cancel is never commit. `pointercancel` and `touchcancel` restore the before
snapshot, clear lifted visuals, and open neither a composer nor a toast.

Actions is a calendar-context-free destination. The date ribbon, Week strip, and
Month grid are absent there at every zoom. Returning to Timeline or Agenda
restores the selected date and places its ribbon cell inside the visible strip
on the first painted frame.

## Region ownership

| Surface | Target | Tap/click | Hold + move | Edge drag | Horizontal swipe | Cancel |
| --- | --- | --- | --- | --- | --- | --- |
| Day Event | body | Open details | Move in time | Top changes start; bottom changes end, including 10/15/30-minute Events | None | Abort and restore |
| Day Event | JOIN | Open meeting directly | None | None | None | No Event inspector |
| Day Action | check | Complete or reopen | None | None | None | No inspector |
| Day Action | body | Open details | Move in time | None | Complete only from body | Abort and restore |
| Day Action | bottom edge | Ordinary tap may open | Resize estimate | Resize estimate | Never complete | Abort and restore |
| Empty Day/Week | space | Open one-hour composer | After 500ms, create and size draft | N/A | N/A | No composer and no write |
| Week Event | body | Open details | Move across day/time | Deferred; do not show a dead handle | None | Abort and restore |
| Week Event | JOIN | Open meeting directly | None | None | None | No Event inspector |
| Week Action | card | Open details | None in this plan | None | None | No implied move/resize/swipe |

## Lifecycle

`idle → armed → active → committed|cancelled`.

One sequence has one owner: `day-stream`, `captured-card`, `week-grid`, or
`external`. Document listeners are a safety fallback for an externally owned
active sequence. They are not a second owner.

Only a normal pointer/touch end may persist, and only when the proposal differs
from the before snapshot. The movement that crosses a resize activation
threshold is applied in that same frame.

A drag attempt, including a cancelled arm, suppresses the following click.

## Inspectors

`detailEditing` is the draft transaction. A separate `inspectField` key owns the
one expanded inline editor. Header Edit enters draft mode without fanning every
control open. Activating another field closes the previous editor and keeps the
draft. Save, Revert, close, and record change clear the active field. The sheet
node must not remount or replay its entrance.

Add a Step is visible first whenever an existing open Action is editable,
including an empty checklist. Visibility is derived from editability, not
checklist length.

## Focus

Focus source is `manual` or `auto`. Manual focus from `F` or the toggle survives
scrolling until the user restores it. Automatic focus may change only during an
active user scroll session.

## Week Action parity

Week Action move, resize, and swipe are deferred. Week Action cards must not
advertise those gestures.
