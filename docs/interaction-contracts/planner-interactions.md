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
| Day Event | start/end edge | Open details below movement threshold | Resize the matching boundary after stationary lift; movement before lift scrolls | Full-width desktop/pen edge activates from deliberate movement | None | Abort and restore |
| Day Event | JOIN | Open meeting directly | None | None | None | No Event inspector |
| Day Action | check | Complete or reopen | None | None | None | No inspector |
| Day Action | body | Open details | Move in time after stationary lift; movement before lift scrolls | None | Complete only from body | Abort and restore |
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

---

## Rev D physical-presentation contract

The normal pointer/touch physical grammar is defined by:

- `docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html`
- `docs/plans/2026-08-27-007-physical-planner-motion-extended-visual-reference.html`
- the Rev D PRD/ARD.

Motion begins only after the existing gesture classifier has resolved Tap. The
registry, visual carrier, and Presentation Lens are never gesture owners.

### Logical vs presentation geometry

A physical expansion may visually make room around an object while the geometry
that owns interaction semantics stays unchanged.

Logical/interaction geometry owns date/minute mapping, Event/Action source
bounds used by drag/resize, overlap/lane packing, drag/resize origin, list/order
identity, and persisted values.

Presentation geometry may temporarily grow the visible object and transform
visible hour rules/cards/rows below it. Presentation displacement is not a write,
not a scroll, and not a second gesture owner.

### Source ownership

A source-anchored overlay/lens must not add a wrapper that intercepts pointer
ownership. It must not alter source gesture handlers or use transformed visual
bounds as drag/resize truth.

Pointer/touch Event, Action, Note, Month Peek and creation paths must visually
remain anchored to their semantic source. Keyboard source-less paths remain
instant and do not activate Presentation Lens travel.

### Expanded fields

Opening Repeat/Calendar/alerts/etc. may increase the current expanded object's
presentation height. The parent/lens may follow that height, but logical source
geometry remains unchanged. Options must not clip and collapsed options must
leave the tab order.

### Cancel/close

`pointercancel` / `touchcancel` additionally clear any transaction-owned physical
carrier and Presentation Lens displacement.

Closing an expanded object resolves the latest semantic source and restores
focus there when possible. Never use unrelated current focus as geometry.

### Semantic modality

A visually embedded expanded object may retain inert/focus/scroll protections
when semantics require them. No visible modal scrim is required merely because
those protections are active.

### Required negative controls

For each critical migrated path, deliberately prove tests fail when:

- a wrapper steals source pointer ownership;
- Presentation Lens mutates logical source geometry;
- lens displacement survives cancel/close;
- keyboard activation borrows a spatial source;
- recurring sibling suppression occurs;
- expanded field options remain tabbable after collapse.