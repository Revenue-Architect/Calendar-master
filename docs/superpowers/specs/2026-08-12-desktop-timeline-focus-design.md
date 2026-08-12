# Desktop Timeline Focus Toggle

**Date:** 2026-08-12

**Status:** Approved for implementation

**Scope:** Desktop day-timeline density and focus-mode access

## Outcome

The desktop day Timeline should give the actual schedule more vertical room without removing date context or changing the behavior of other views. The existing mobile timeline-focus interaction becomes available on desktop through the same state, measured chrome region, easing, and accessibility semantics.

## Root Cause

The focus button is already rendered for day Timeline, but its `lg:hidden` class prevents desktop users from reaching it. The collapsed styling for the timeline chrome and compact date heading is also limited to viewports below 1024px. Separately, the desktop `.nb-main` rule hard-codes `padding-bottom: 2rem`, leaving unnecessary space below the timeline and overriding the normal sheet-spacing token.

## Interaction Design

- Show the existing `timeline-focus-toggle` at every viewport width when `viewMode === "timeline"` and `zoom === "day"`.
- Keep the date number, weekday/date details, and briefing visible in both expanded and focused states.
- Focus mode collapses the existing measured HUD/calendar-navigation region as one connected height transition. It does not alter event/action geometry, recurrence, drag behavior, or scroll position.
- Use the existing non-overshooting navigation easing and reduced-motion rules for both directions.
- Keep focus state reset behavior when the date, view mode, or zoom changes.
- Add `F` as the keyboard toggle for Focus timeline. It follows the existing global shortcut guard: it is ignored while typing or while a sheet/modal is open, and it only changes state in day Timeline view.
- Reduce only desktop main-content bottom padding from `2rem` to `0.75rem`. Mobile sheet padding and non-Timeline views retain their current values.
- The toggle remains absent from Agenda, week/month views, and full-screen Actions mode.

## Component and CSS Boundaries

- Reuse `timelineFocused`, `dayTimelineFocused`, `timelineChromeHeight`, and the existing chrome measurement/ref wiring in `src/Planner.jsx`.
- Remove the desktop-hiding utility from the existing toggle rather than introducing a second desktop control or a second state variable.
- Add the shortcut to the shared `SHORTCUTS` list and existing keydown handler so the shortcut sheet, behavior, and accessibility metadata stay aligned. The toggle advertises `F` through `aria-keyshortcuts`.
- Move the focused chrome pointer/inner-transform and focused date-heading rules out of the mobile-only media query so the same state renders consistently on desktop.
- Keep the desktop Actions-column collapse/restore control unchanged; it is a separate surface and is not the timeline focus toggle.

## Verification

1. Add desktop browser coverage for the day Timeline toggle: visible on load, correct `aria-label`/`aria-expanded` values, chrome height collapses and restores, and the date heading remains visible.
2. Assert the toggle is not rendered in Agenda, week/month, or Actions modes.
3. Verify `F` toggles focus in day Timeline, is listed in the shortcut sheet, and does not fire while typing or while a sheet/modal is open.
4. Retain and run the existing mobile focus tests to verify no change to mobile behavior.
5. Verify the desktop main padding is reduced while mobile sheet spacing and Actions mode remain unchanged.
6. Run the full unit/browser test suite and production build, then manually check desktop and mobile Timeline, Agenda, and Actions layouts at the responsive breakpoint.

## Acceptance Criteria

- A desktop user can collapse and restore Timeline navigation with the same visible control used on mobile.
- A user can toggle the same state with `F` when the day Timeline is active.
- The collapse/restore motion is smooth in both directions and respects reduced motion.
- The date heading remains usable and legible while focused.
- The Timeline receives the reclaimed bottom space without clipped cards, changed interaction thresholds, or regressions in other views.
- All existing tests pass and new desktop coverage passes.

## Non-goals

- No automatic desktop collapse based on scrolling.
- No change to the timeline event/action layout, lane packing, gestures, recurrence, persistence, or card animations.
- No change to the existing Actions-column collapse behavior.
- No framework, navigation, or responsive-layout rewrite.
