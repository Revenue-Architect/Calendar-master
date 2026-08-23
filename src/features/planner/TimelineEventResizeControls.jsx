import { EVENT_JOIN_RESERVATION } from "./timelineTouchTarget.js";

/* The coarse-pointer Event controls are deliberately separate from the broad
 * desktop edge overlays. The old semantic targets were invisible 44px plates
 * laid over the card's title area, so the visible mark and the actual owner
 * disagreed. These controls reserve corner lanes and make the ownership lane
 * legible at the same size that receives the touch. */

function cueStyle(theme, edge) {
  return {
    width: 28,
    height: 14,
    borderRadius: 5,
    border: `1px solid ${theme.accent}`,
    background: `${theme.accent}26`,
    color: theme.accentText,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    transform: edge === "start" ? "none" : "rotate(180deg)",
  };
}

function chevronStyle(theme) {
  return {
    width: 6,
    height: 6,
    borderLeft: `1.5px solid ${theme.accentText}`,
    borderTop: `1.5px solid ${theme.accentText}`,
    transform: "rotate(45deg)",
    marginLeft: 3,
  };
}

function EventResizeControl({ edge, event, theme, hasJoin, onPointerDown }) {
  const endOffset = edge === "end" ? (hasJoin ? EVENT_JOIN_RESERVATION : 0) : undefined;
  return (
    <div aria-hidden="true" tabIndex={-1}
      data-touch-resize={edge} data-resize-edge={edge}
      onPointerDown={(pointerEvent) => onPointerDown(pointerEvent, event, edge)}
      className={`absolute ${edge === "start" ? "top-0 left-0" : "bottom-0"} z-10 flex items-center justify-center`}
      style={{ width: 44, height: 44, right: endOffset, cursor: "ns-resize", touchAction: "pan-y", pointerEvents: "auto" }}>
      <span data-test={`timeline-event-resize-cue-${edge}`} style={cueStyle(theme, edge)}>
        <span aria-hidden="true" style={{ width: 12, height: 1.5, background: theme.accentText }} />
        <span aria-hidden="true" style={chevronStyle(theme)} />
      </span>
    </div>
  );
}

export default function TimelineEventResizeControls({ event, theme, hasJoin = false, onPointerDown }) {
  return (
    <>
      <EventResizeControl edge="start" event={event} theme={theme} hasJoin={hasJoin} onPointerDown={onPointerDown} />
      <EventResizeControl edge="end" event={event} theme={theme} hasJoin={hasJoin} onPointerDown={onPointerDown} />
    </>
  );
}
