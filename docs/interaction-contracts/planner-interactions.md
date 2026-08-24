# Planner interaction contracts

Living owner table for Day, Week, Actions, and inspector surfaces.
Handlers implement this document. They do not invent a second meaning for a
region.

Cancel is never commit. `pointercancel` and `touchcancel` restore the before
snapshot, clear lifted visuals, and open neither a composer nor a toast.

On the Day Timeline, a touch that begins on an Event or Action body remains a
vertical-pan candidate until the stationary hold threshold is met. Direct
manipulation instead begins from deliberate movement on a visible 44px move or
resize control. Those controls establish browser ownership at touch start; a
tap or 1–2px tremor still opens the inspector without writing. The broad
desktop resize overlays do not establish touch resize intent. An Event exposes
visibly marked, disjoint start, move, and end controls only when its live
geometry can reserve their lanes and readable body content.
Linked Events reserve a separate 56px JOIN lane (plus its existing 4px inset)
before the end control. Their title/body is padded into the remaining lane, so
the visible cue and the actual
touch owner cannot disagree. Short or narrow Events expose only the direct
controls their geometry can contain; precise start/end editing remains
available through the Event inspector. A scheduled Action reserves separate
completion, move, readable-body, and optional estimate lanes. Its move and
estimate controls are direct; its remaining body stays a scroll-safe hold
candidate. A horizontal swipe from that body continues to own completion.

After lift, the active Day sequence owns the initiating touch and freezes the
Day stream's physical `scrollTop` until normal end or cancellation. A forced
stream scroll is restored without notifying Timeline chrome. A document touch
fallback is not retained for the supported surfaces: the external-origin
characterization is green on the base and the supported Actions-column path is
handled by the existing pointer/stream wiring. Stream-originated movement is
handled once by the stream listener.

Actions is a calendar-context-free destination. The date ribbon, Week strip, and
Month grid are absent there at every zoom. Returning to Timeline or Agenda
restores the selected date and places its ribbon cell inside the visible strip
on the first painted frame.

## Region ownership

| Surface | Target | Tap/click | Hold + move | Edge drag | Horizontal swipe | Cancel |
| --- | --- | --- | --- | --- | --- | --- |
| Day Event | body | Open details | Move in time after stationary lift; movement before lift scrolls | Desktop/pen overlays resize | None | Abort and restore |
| Day Event | move control | Open details below movement threshold | Direct move from deliberate movement | None | None | Abort and restore |
| Day Event | start/end control | Open details below movement threshold | None | Directly resize the matching boundary | None | Abort and restore |
| Day Event | JOIN | Open meeting directly | None | None | None | No Event inspector |
| Day Action | check | Complete or reopen | None | None | None | No inspector |
| Day Action | body | Open details | Move in time after stationary lift; movement before lift scrolls | None | Complete only from body | Abort and restore |
| Day Action | move control | Open details below movement threshold | Direct move from deliberate movement | None | None | Abort and restore |
| Day Action | estimate | Open details below movement threshold | None | Directly resize estimate | Never complete | Abort and restore |
| Empty Day/Week | space | Open one-hour composer | After 500ms, create and size draft | N/A | N/A | No composer and no write |
| Week Event | body | Open details | Move across day/time | Deferred; do not show a dead handle | None | Abort and restore |
| Week Event | JOIN | Open meeting directly | None | None | None | No Event inspector |
| Week Action | card | Open details | None in this plan | None | None | No implied move/resize/swipe |

## Lifecycle

`idle → armed → active → committed|cancelled`.

One sequence has one owner: `day-stream`, `captured-card`, `week-grid`, or
`external`. A document touch fallback is not part of the supported touch path;
the base-green external-origin characterization remains to guard the existing
Actions-column behavior. It is not a second owner.

Only a normal pointer/touch end may persist, and only when the proposal differs
from the before snapshot. The movement that crosses a direct move or resize
activation threshold is applied in that same frame. A second finger, a non-owner end,
touch cancellation, stream remount, date/zoom change, or superseding
interaction cancels and restores the before snapshot without a write.

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
