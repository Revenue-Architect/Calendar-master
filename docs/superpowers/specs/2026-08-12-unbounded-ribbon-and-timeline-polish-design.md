# Unbounded date ribbon and timeline interaction polish

## Intent

Remove the artificial 14-day limit from the day/week header without changing the
calendar model or the seven-column week projection. At the same time, preserve
the timeline's placement preview through composer opening, make empty-canvas
creation less sensitive, restore reliable scroll-driven header collapse, and keep
the inline Action subtask affordance visible for every open Action.

## Design

The header ribbon uses a rolling window of 733 day cells: 366 days before the
current anchor, the anchor day, and 366 days after it. The window is not a product
limit. When horizontal scrolling approaches either edge, the window shifts by 366
days and compensates `scrollLeft` by the exact width of the moved cells, so the
visible dates do not jump. If another surface jumps directly to a date outside the
window, the window recenters around that date and the selected cell is brought into
view. The seven-column week grid remains unchanged. Ribbon density is computed by
the existing range projection rather than one query per cell.

An empty timeline touch hold becomes a draft after 500ms. Scrolling still cancels
the press for the complete touch sequence. When a draft finishes, its final start
and duration are copied into a separate placement-preview state before the composer
opens; the preview remains mounted behind the composer and clears when the composer
closes. Existing event/action drag behavior is unchanged.

Timeline focus uses the stream's previous and next scroll positions. Moving away
from midnight past the small trigger collapses the chrome; moving toward midnight
within the restore boundary expands it. Programmatic initial positioning is
anchored so it cannot accidentally collapse the header.

Every open Action renders its inline `Add a step` composer, including Actions with
an empty checklist. Completed Actions retain their completion state and do not
invite new steps.

## Verification

- Unit coverage asserts the empty-canvas delay is 500ms and existing gesture
  arithmetic remains unchanged.
- Browser coverage verifies the ribbon spans more than two years, can shift beyond
  both initial edges, preserves the seven-column week view, and reaches dates past
  the old 14-day boundary.
- Browser coverage verifies the placement preview survives composer opening and
  the preview clears on close.
- Browser coverage verifies the empty Action exposes `Add a step` immediately.
- Existing unit, focused browser, full browser, and production-build checks must
  remain green.
