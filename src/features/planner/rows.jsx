/* The row shapes the planner lays information out in.
 *
 * Four presentational primitives: a Pill is an icon and a label on a tinted
 * ground, a Row is a key facing its value, a DetailRow is a row that owns its
 * own divider, and RowWithJoin is the one with a second tap target for a
 * meeting link. Props in, JSX out, no state between them.
 */
import React from "react";

import { MONO } from "../../design/typography.js";
import { CARD_R } from "./constants.js";
import { ExternalLinkIcon } from "./icons.jsx";
import { normalizeMeetingLink } from "./meetingLink.js";
import { rowSpan } from "./editorRowSpan.js";

/* A row that is one tap target, plus a second one for the link.
 *
 * A meeting link has to be reachable wherever the meeting appears, not only from
 * the timed card that happened to get it first — living in the agenda should not
 * cost two taps to join a call. But a row is already a button, and an anchor
 * inside a button is invalid HTML that browsers and screen readers resolve
 * differently.
 *
 * The two controls occupy real grid columns. The old absolute overlay made the
 * button reserve a guessed width; on a 360px phone that left an ordinary title
 * only ~85px while the time was centred through both text lines. */

const RowWithJoin = React.forwardRef(function RowWithJoin({ T, surface, link, title, onOpen, className = "", padding = "px-3 py-2.5", style = {}, children, ...buttonProps }, ref) {
  const href = normalizeMeetingLink(link);
  return (
    <div className={`nb-hover-tile grid items-stretch ${href ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"}`} style={{ background: surface, borderRadius: CARD_R, boxShadow: "var(--e1)", ...style }}>
      <button ref={ref} onClick={onOpen} {...buttonProps} className={`nb-tap nb-hover-control min-w-0 w-full flex items-center gap-2.5 text-left ${padding} ${className}`}
        style={{ background: "transparent", borderRadius: CARD_R }}>
        {children}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" draggable={false}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Join ${title}`}
          style={{ fontFamily: MONO, color: T.accentText }}
           className="nb-tap nb-hover-control self-center justify-self-end mx-2 inline-flex items-center gap-1 px-1.5 py-1 text-xs font-bold tracking-widest">JOIN <ExternalLinkIcon /></a>
      )}
    </div>
  );
});

/* A row inside a grouped attribute card: value on the left, its icon on the right,
   matching how the reference groups the facts that govern a task. */
function DetailRow({ T, icon, children, divider = false, span = "full" }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: divider ? `1px solid ${T.line}` : "none", ...rowSpan(span) }}>
      <div className="flex-1 min-w-0">{children}</div>
      <span style={{ color: T.dimText }} className="text-sm shrink-0">{icon}</span>
    </div>
  );
}

/* One attribute per row: an icon, the value in plain words, and an optional tint
   when the attribute carries meaning of its own — the category's colour, or the red
   of something overdue or blocked. */
function Pill({ T, surface, icon, label, tint = null, span = "full" }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: tint ? `${tint}22` : surface, borderRadius: CARD_R, ...rowSpan(span) }}>
      <span style={{ color: tint || T.dim }} className="text-sm shrink-0 w-4 text-center">{icon}</span>
      <span className="flex-1 text-sm truncate" style={{ color: tint || T.text }}>{label}</span>
    </div>
  );
}

function Row({ T, k, v }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${T.line}`, fontFamily: MONO }}>
      <span style={{ color: T.dimText }} className="nb-data">{k}</span>
      <span className="nb-data">{v}</span>
    </div>
  );
}

export {
  DetailRow,
  Pill,
  Row,
  RowWithJoin,
};
