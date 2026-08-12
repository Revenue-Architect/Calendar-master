# Timeline actions, date ribbon, and overdue planning polish

## Intent

Make the timeline's Action cards behave like Event cards under mouse and touch,
make date navigation preserve the user's spatial orientation, turn overdue
planning into an informed decision, and give the Actions view the same focused
use of space as the timeline.

## Current root causes

- `TimelineActionCard` renders a task chip and its resize/complete controls, but
  does not receive the desktop `pointerdown`/`pointerup` handlers that start the
  shared task gesture. The stream's delegated touch path can start a task gesture,
  but mouse dragging never reaches it. The task render also has no moving start or
  lifted visual state, so a gesture cannot make the actual card follow the pointer.
- The date ribbon scroll effect always positions the selected cell at
  `offsetLeft - 24` after `dateKey` changes. This pins the highlight instead of
  letting it travel through the visible cells.
- `PLAN TODAY` calls the complete overdue mutation immediately. There is no review
  state, detail surface, or per-entry choice between the button and the write.
- The Actions view leaves the calendar date ribbon expanded. The global HUD and
  pill navigation must remain available, but the calendar-specific ribbon does not
  need to consume vertical space while Actions owns the screen.

## Design

### 1. Action cards use the shared timeline gesture contract

Add task equivalents of the Event card's desktop handlers. A task press records its
start minute, estimated duration, and grab offset; after the existing hold delay it
enters `mode: "task"`. The shared movement calculation updates the task's proposed
start minute, and the rendered card uses that proposed position while the gesture
is active. On release, the existing task scheduling, cross-day move, reorder, and
undo paths remain authoritative.

The card gets a restrained lifted state: a small scale, accent outline, elevated
shadow, and raised z-index. The position itself follows the shared gesture state;
no second drag implementation or independent pointer math is introduced. The
complete control and resize handle stop propagation as they do today, so a
completion tap cannot become a move and a resize cannot open the card.

The interaction remains interruptible and touch-safe: pointer capture is used once
the desktop gesture is active where the element supports it, touch scrolling keeps
the delegated path, and reduced-motion removes the decorative scale/shadow motion
without changing the gesture semantics.

### 2. Ribbon navigation uses minimal edge reveal

The selected date is allowed to move naturally through the currently visible
cells. After a date change, the ribbon checks whether the selected cell is outside
the visible viewport (with a small 24px breathing inset). It scrolls only enough to
bring that cell back into view, using the existing smooth scroll path. It does not
recenter a cell that is already visible.

The virtual two-year range and its spacer cells remain unchanged. The range shifts
only when actual ribbon scrolling reaches the configured edge, preserving the
current screen-size-aware window behavior. A direct jump to a date outside the
virtual window still recenters the virtual window before applying minimal reveal.

### 3. Overdue planning becomes a review-and-confirm flow

Clicking `PLAN TODAY` opens an inline review surface rather than mutating state.
Each pullable overdue action shows its title, deadline, previous planned date/time,
and estimate. The review offers:

- `PLAN ALL TODAY`: runs the existing all-entry domain command once.
- A per-entry `PLAN`: plans only that action through the same command and undo path.
- `OPEN`: opens the existing Action inspection surface for details.
- `CANCEL`: closes the review without changing notebook state.

The review is local UI state. The domain remains the source of truth and receives
the selected entries only at confirmation time. A completed or already-today item
never appears in the pullable set. The review uses a short grid-row/opacity reveal
under 300ms with an ease-out curve; cancel is a fast reverse transition and no
keyboard shortcut is animated.

### 4. Actions view collapses calendar-specific ribbon chrome

When the top pill switches to Actions, the date ribbon region collapses smoothly
while the HUD, view pills, and date context remain mounted and usable. Returning to
Timeline restores the ribbon through the same interruptible height/opacity path.
This avoids hiding the only navigation control that can return the user to the
calendar while still giving the full-screen Actions list its vertical space.

## Verification

- Unit tests cover task gesture proposals and the overdue single-entry/all-entry
  selection contract without changing existing domain behavior.
- Browser tests verify a desktop Action card visibly follows a held drag and writes
  the new time, while a tap, completion control, resize handle, and touch scroll
  retain their existing meanings.
- Browser tests verify adjacent ribbon date changes move the highlighted cell
  without changing `scrollLeft` until the visible edge is reached, then reveal the
  next cell minimally.
- Browser tests verify `PLAN TODAY` opens details without changing stored state,
  supports per-entry and all-entry confirmation, and supports cancel/open.
- Browser tests verify the Actions pill collapses the date ribbon and returning to
  Timeline restores it.
- Run the focused suites, the full unit suite, production build, and a serial
  browser pass before pushing `main`.

