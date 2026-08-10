# Calendar Master

A dependency-free React + CSS day planner ("Not Boring"-style) with a timeline/agenda view, actions (tasks), notes, and local-only storage.

## Overview
- **Stack**: React 19 + Vite 7 + Tailwind 4. No animation or state libraries — motion is hand-rolled CSS + small hooks.
- **Entry**: `src/Planner.jsx` is the main (monolithic) app component. Pure helpers live in `src/features/` (e.g. `motion/fluidGeometry.js`, `planner/detailDraft.js`, `planner/quickAdd.js`) with `node --test` unit tests (`npm test`).
- **Run**: workflow "Start application" → `npm run dev -- --host 0.0.0.0 --port 5000`.
- **Browser tests**: `npm run test:e2e` (Playwright, `tests/e2e/`) against the built bundle. It covers what unit tests structurally cannot — sheet resizing, field-in-view while editing, collapse state surviving a reload, and press-and-hold drags. Hooks are `data-test` attributes; keep them when moving markup. Add a case here whenever a change is only observable in a real layout.

## Capture
- `⌘K` / `/` opens one palette over search results, commands, and a natural-language quick add (`features/planner/quickAdd.js` parses the line; `commandPalette.js` ranks the commands). Both are pure and unit-tested — keep parsing and ranking out of `Planner.jsx`.
- Quick add and the composer submit the *same* payload shape (`quickAddToEntry` → `saveEntry`), so they share one write path. Do not fork it.
- `?` renders the cheat sheet from the `SHORTCUTS` constant; add a shortcut there and in the keydown handler together, or the sheet lies.

## Motion language (keep consistent)
- Sheets/modals morph open from the control that opened them (`Sheet` + `fluidMorphFromRects`; last pointerdown trigger is captured globally because iOS Safari never focuses tapped buttons) and morph back on close.
- Single-select pill groups use the sliding liquid indicator (`useLiquidPill` + `LiquidPillIndicator`); multi-select pills use a grow-in fill (`LiquidFill`) since there is no single selection to slide.
- Toasts and inline confirmations animate out via `usePresence` / `Reveal` rather than unmounting instantly.
- All motion must respect `prefers-reduced-motion` and the in-app "Reduce motion" preference (global CSS kill-switch in the `<style>` block of `Planner.jsx`).

## Detail view editing
- Tapping any field on an event/action starts editing in place immediately (fields call `onBeginEdit` → `detailEditing`); edits are held as a draft (`detailDraft.js`) until Save, Revert discards. The Edit ↔ Save/Revert pill (`FluidEditActions`) morphs between states with one traveling accent surface.

## Planner reads
- Undated actions carry: `features/planner/carryForward.js` folds the undated, undeadlined backlog into every day from today forward. It is a projection — nothing is stored — so completing a carried action on any day completes the one task.
- Dropping an action on the timeline plans it for the day in view *and* sets the minute; the domain refuses a time without a day, so do not call `scheduleTask` alone on an undated task.
- Calendar reads go through the projections named in `.agents/memory/calendar-read-projections.md`. Week and month already comply; the agenda and `dayAggregate` still use the raw query (harmless with one calendar, wrong as soon as there are two).

## User preferences
- (none recorded yet)
