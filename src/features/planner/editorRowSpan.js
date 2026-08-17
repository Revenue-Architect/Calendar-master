/* How wide one attribute row sits in an editor band.
 *
 * The Event and Action editors used to be a column of identical full-width rows,
 * four of which carried a single bounded value and were given the same width as a
 * multiline note. Bounded fields now pair two-up; everything whose content has no
 * fixed length keeps the whole band.
 *
 * The split is a min-width floor inside a wrapping flex, not a breakpoint. A pair
 * becomes two full rows when its content stops fitting, rather than at a width
 * guessed in advance against English labels — which is the same reason the view
 * pills compute their slots instead of measuring them.
 *
 * Nothing here transitions. The shared-layout PRD §7.2 bans animating layout
 * properties, and the reflow is meant to be instant. */

/* Measured against the longest label a paired field currently produces — the
   reminder row's "When it starts, 10:30 AM" — at 390px, the narrowest width the
   editors are built for. Re-measure if a longer option is added or the labels are
   translated: the failure is silent, because the label span carries Tailwind's
   `truncate` and a pair that should have split will quietly ellipsise instead. */
export const ROW_HALF_MIN = 168;

/* The 4px is half of the band's 8px gap, so two halves plus the gap total the
   band's width exactly. A band without that gap lets flex-grow reclaim the
   difference, which hides the mistake until a row paints a background. */
export const ROW_HALF_BASIS = "calc(50% - 4px)";

/** Flex style for one row: `"half"` pairs, anything else takes the whole band.
 *
 * An open choice row always takes the full width regardless of its span. Its
 * options are wrapping chips and half a band shreds them across three lines; only
 * one row is ever open, so its partner simply drops below for as long as it lasts.
 *
 * Returns flex properties only, so the result is inert on a row whose parent is
 * not a flex container — that is what lets the same prop be threaded through rows
 * that sit in a grouped card and rows that sit in a wrapping band. */
export function rowSpan(span, open = false) {
  if (span !== "half" || open) return { flexBasis: "100%", flexGrow: 1, minWidth: 0 };
  return { flexBasis: ROW_HALF_BASIS, flexGrow: 1, minWidth: ROW_HALF_MIN };
}
