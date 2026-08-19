/* Every icon the planner draws, as plain SVG components.
 *
 * They were 106 lines in the middle of Planner.jsx between a mask helper and
 * an audio hook, which is nobody's idea of where to look for a chevron. They
 * take no props beyond size and colour, hold no state, and read no theme —
 * they inherit currentColor from whatever they stand next to.
 *
 * Moved byte-exact: the block below is the text that was in Planner, and the
 * export list at the bottom is the only thing added.
 */
import React from "react";

/* A reminder is a bell.
   The job was being done by `◔`, a quarter-filled clock face, which at 12px in
   dim grey reads as a smudge rather than a symbol — it sat on a card beside ⚠, ↻
   and ↗, all of which say what they are at a glance. Drawn rather than typed, so
   it is the same shape at every size and in every font, and inherits the colour
   of whatever it is standing next to. */
function BellIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d="M4.1 6.6a3.9 3.9 0 0 1 7.8 0c0 2.8.9 3.7 1.4 4.3h-10.6c.5-.6 1.4-1.5 1.4-4.3Z" />
      <path d="M6.4 13.1a1.75 1.75 0 0 0 3.2 0" />
    </svg>
  );
}

/* Small controls use the same drawn language as the bell. Unicode arrows and
   dingbats inherit whichever font happens to be active, so their weight and
   baseline changed between themes and made compact controls look unfinished. */
function UiIcon({ size = 14, viewBox = "0 0 16 16", children, fill = "none", stroke = "currentColor", strokeWidth = 1.6, style = {} }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0, pointerEvents: "none", ...style }}>
      {children}
    </svg>
  );
}

function MenuIcon({ size = 14 }) {
  return <UiIcon size={size}><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></UiIcon>;
}

function MoreIcon({ size = 14 }) {
  return <UiIcon size={size} fill="currentColor" stroke="none"><circle cx="3.25" cy="8" r="1.15" /><circle cx="8" cy="8" r="1.15" /><circle cx="12.75" cy="8" r="1.15" /></UiIcon>;
}

function ChevronIcon({ direction = "right", size = 12 }) {
  const angle = direction === "left" ? 180 : direction === "up" ? -90 : direction === "down" ? 90 : 0;
  return <UiIcon size={size} style={{ transform: `rotate(${angle}deg)` }}><path d="m5 2.75 5.25 5.25L5 13.25" /></UiIcon>;
}

function CloseIcon({ size = 14 }) {
  return <UiIcon size={size}><path d="m4 4 8 8M12 4 4 12" /></UiIcon>;
}

function ExternalLinkIcon({ size = 12 }) {
  return <UiIcon size={size}><path d="M9 3h4v4M13 3 7.25 8.75" /><path d="M11 8.5v3a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 3 11.5v-5A1.5 1.5 0 0 1 4.5 5h3" /></UiIcon>;
}

function RepeatIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M2.75 5.25h8.5l-1.75-1.75M13.25 10.75h-8.5l1.75 1.75" /><path d="M11.25 5.25A2.25 2.25 0 0 1 13 7.4M4.75 10.75A2.25 2.25 0 0 1 3 8.6" /></UiIcon>;
}

function WarningIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="m8 2.15 5.45 10.7H2.55L8 2.15Z" /><path d="M8 5.35v3.2M8 10.55h.01" /></UiIcon>;
}

function ArrowUpIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M8 13V3M4.5 6.5 8 3l3.5 3.5" /></UiIcon>;
}

function ArrowRightIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M3 8h10M9 4l4 4-4 4" /></UiIcon>;
}

function GripIcon({ size = 14 }) {
  return <UiIcon size={size}><path d="M5 3.5h.01M8 3.5h.01M11 3.5h.01M5 8h.01M8 8h.01M11 8h.01M5 12.5h.01M8 12.5h.01M11 12.5h.01" strokeWidth="2.4" /></UiIcon>;
}

function SearchIcon({ size = 14 }) {
  return <UiIcon size={size}><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></UiIcon>;
}

function PinIcon({ size = 14, filled = false }) {
  return <UiIcon size={size} fill={filled ? "currentColor" : "none"}><path d="m8 2.35 1.55 3.15 3.45.5-2.5 2.45.6 3.45L8 10.3l-3.1 1.6.6-3.45L3 6l3.45-.5L8 2.35Z" /></UiIcon>;
}

function CheckIcon({ size = 12 }) {
  return <UiIcon size={size}><path d="m3 8.2 3 3 7-7" /></UiIcon>;
}

function LocationIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M8 13s4-3.55 4-7a4 4 0 0 0-8 0c0 3.45 4 7 4 7Z" /><circle cx="8" cy="6" r="1.25" /></UiIcon>;
}

function LinkIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="m6.25 9.75-1 1a2.1 2.1 0 0 1-3-3l1.5-1.5a2.1 2.1 0 0 1 3-.05" /><path d="m9.75 6.25 1-1a2.1 2.1 0 0 1 3 3l-1.5 1.5a2.1 2.1 0 0 1-3 .05" /><path d="m5.75 8.25 4.5-.5" /></UiIcon>;
}

function ClockIcon({ size = 13 }) {
  return <UiIcon size={size}><circle cx="8" cy="8" r="5.25" /><path d="M8 5v3.25l2.25 1.25" /></UiIcon>;
}

function CalendarIcon({ size = 13 }) {
  return <UiIcon size={size}><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M5 2.5v2M11 2.5v2M2.5 6.25h11" /></UiIcon>;
}

function ListIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M3 4.5h10M3 8h10M3 11.5h7" /></UiIcon>;
}

function BlockIcon({ size = 13 }) {
  return <UiIcon size={size}><circle cx="8" cy="8" r="5.25" /><path d="m4.5 4.5 7 7" /></UiIcon>;
}

export {
  ArrowRightIcon,
  ArrowUpIcon,
  BellIcon,
  BlockIcon,
  CalendarIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  CloseIcon,
  ExternalLinkIcon,
  GripIcon,
  LinkIcon,
  ListIcon,
  LocationIcon,
  MenuIcon,
  MoreIcon,
  PinIcon,
  RepeatIcon,
  SearchIcon,
  UiIcon,
  WarningIcon,
};
