/* The goo, and the one control that uses it.
 *
 * A blur followed by a steep alpha curve, so neighbouring shapes bleed into
 * each other and snap back to hard edges as one surface. The filter is
 * expensive, so it mounts only where it is used — which is here, in the search
 * control that grows out of its collapsed state.
 */
import React, { useRef, useState } from "react";

import { MONO } from "../../design/typography.js";
import { SearchIcon } from "./icons.jsx";

/* The goo.
 *
 * A blur followed by a steep alpha curve: neighbouring shapes bleed into each
 * other's blur, the curve snaps the result back to hard edges, and what was two
 * separate elements becomes one surface with a meniscus between them. It is the
 * whole effect, and it is four lines of SVG — which is why it is written here
 * rather than pulled in. This app has no animation library on purpose.
 *
 * The filter is expensive enough to matter, so it is only mounted where it is
 * used, and never while motion is reduced — under `prefers-reduced-motion` the
 * elements simply do not travel, and a filter over stationary shapes is cost
 * with no picture. */
function GooeyFilter({ id, blur = 5 }) {
  return (
    <svg aria-hidden="true" className="absolute w-0 h-0" style={{ position: "absolute" }}>
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

/* Search, as a control that says what it is.
 *
 * It was a bare ⌕ with no label and no hint that ⌘K reaches it — the fastest way
 * into the app, and the least legible thing in the header. On hover or focus the
 * glyph's bubble separates, travels, and merges into a pill carrying the word and
 * the shortcut; the goo filter is what makes those two shapes read as one
 * material stretching rather than two divs moving.
 *
 * The flourish never delays anything: the click opens the palette on the way
 * down, whatever the animation is doing. Reduced motion gets the label without
 * the travel. */
function GooeySearch({ T, surface, reduced, onOpen }) {
  const [open, setOpen] = useState(false);
  const filterId = useRef(`goo-search-${Math.random().toString(36).slice(2, 9)}`).current;
  const coarse = typeof window !== "undefined" && Boolean(
    window.matchMedia?.("(pointer: coarse)").matches
    || window.matchMedia?.("(max-width: 639.98px)").matches
  );
  const expanded = coarse || (open && !reduced);

  return (
    /* The expanded width is reserved at rest and the control is right-aligned
       inside it. Growing a flex child on hover would otherwise shove TODAY and
       NOTES sideways every time the pointer crossed this corner — a flourish
       that moves other people's buttons is a bug. */
    <div className="nb-search-wrap relative flex items-center justify-end" style={{ width: 104 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {/* Mounted for as long as the control is, and applied unconditionally.
          Switching `filter` on and off around a transition re-rasterises the
          element at both ends, which reads as a snap at the start and another at
          the finish — the thing it is decorating is the thing it was ruining.
          Over two static shapes it costs nothing visible. */}
      {!reduced && <GooeyFilter id={filterId} blur={4} />}
      <div className="flex items-center justify-end" style={{ filter: reduced ? "none" : `url(#${filterId})` }}>
        {/* The bubble is a second shape that exists only to merge with the pill.
            It sits under the label and shares its surface, so the goo has two
            like-coloured things to join. */}
        <span aria-hidden="true" className="absolute rounded-full" style={{
          width: 26, height: 26, right: expanded ? 74 : 3, background: surface,
          opacity: expanded ? 1 : 0,
           transition: reduced ? "none" : "right 300ms cubic-bezier(.23,1,.32,1), opacity 180ms ease",
          pointerEvents: "none",
        }} />
        <button
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => { setOpen(false); onOpen(); }}
          data-test="search-control"
          aria-label="Search, or run a command"
          aria-keyshortcuts="Meta+K Control+K"
          className="nb-tap relative flex items-center justify-center h-8 overflow-hidden"
          style={{
            width: expanded ? 104 : 32,
            borderRadius: 999,
            background: expanded ? surface : "transparent",
            color: T.dimText,
             transition: reduced ? "none" : "width 300ms cubic-bezier(.23,1,.32,1), background 180ms ease",
          }}>
          <SearchIcon />
          {/* Collapsed, the shortcut takes no room at all — not zero opacity in a
              space it still occupies. At full width it needed 37px inside a 32px
              button, so `justify-center` was centring 37px of content in a 32px
              box and the magnifier sat a couple of pixels left of true. The gap
              moved onto the label for the same reason: a flex `gap` is charged
              between items whatever their size, so a zero-width label still
              pushed the icon off centre by the gap alone. Both collapse now, and
              both animate, so the expansion is unchanged. */}
          <span style={{
            fontFamily: MONO, color: T.dimText,
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 48 : 0,
            marginLeft: expanded ? 6 : 0,
            overflow: "hidden",
            transition: reduced ? "none"
              : "opacity 180ms ease 120ms, max-width 300ms cubic-bezier(.23,1,.32,1), margin-left 300ms cubic-bezier(.23,1,.32,1)",
          }} className="nb-data whitespace-nowrap">{coarse ? "SEARCH" : "⌘K"}</span>
        </button>
      </div>
    </div>
  );
}

export {
  GooeyFilter,
  GooeySearch,
};
