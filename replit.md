# Calendar Master

A dependency-free React + CSS day planner ("Not Boring"-style) with a timeline/agenda view, actions (tasks), notes, and local-only storage.

## Overview
- **Stack**: React 19 + Vite 7 + Tailwind 4. No animation or state libraries — motion is hand-rolled CSS + small hooks.
- **Entry**: `src/Planner.jsx` is the main (monolithic) app component. Pure helpers live in `src/features/` (e.g. `motion/fluidGeometry.js`, `planner/detailDraft.js`) with `node --test` unit tests (`npm test`).
- **Run**: workflow "Start application" → `npm run dev -- --host 0.0.0.0 --port 5000`.

## Motion language (keep consistent)
- Sheets/modals morph open from the control that opened them (`Sheet` + `fluidMorphFromRects`; last pointerdown trigger is captured globally because iOS Safari never focuses tapped buttons) and morph back on close.
- Single-select pill groups use the sliding liquid indicator (`useLiquidPill` + `LiquidPillIndicator`); multi-select pills use a grow-in fill (`LiquidFill`) since there is no single selection to slide.
- Toasts and inline confirmations animate out via `usePresence` / `Reveal` rather than unmounting instantly.
- All motion must respect `prefers-reduced-motion` and the in-app "Reduce motion" preference (global CSS kill-switch in the `<style>` block of `Planner.jsx`).

## Detail view editing
- Tapping any field on an event/action starts editing in place immediately (fields call `onBeginEdit` → `detailEditing`); edits are held as a draft (`detailDraft.js`) until Save, Revert discards. The Edit ↔ Save/Revert pill (`FluidEditActions`) morphs between states with one traveling accent surface.

## User preferences
- (none recorded yet)
