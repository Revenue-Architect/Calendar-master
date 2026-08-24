function EventResizeEdge({ edge, event, theme, onPointerDown }) {
  const start = edge === "start";
  const touchHeight = start
    ? "min(8px, calc(50% - 1px))"
    : "min(12px, calc(50% - 1px))";
  return (
    <>
      {/* Mouse/pen keep the precise full-width edge contract. It intentionally
          has no touch marker, so a finger outside the visible centred cue
          resolves to the Event body. */}
      <div aria-hidden="true" tabIndex={-1}
        data-resize={event.id} data-resize-edge={edge}
        onPointerDown={(pointerEvent) => onPointerDown(pointerEvent, event, edge)}
        className={`absolute inset-x-0 z-10 ${start ? "top-0" : "bottom-0"}`}
        style={{
          height: start ? 8 : 12,
          cursor: "ns-resize",
          touchAction: "pan-y",
          pointerEvents: "auto",
        }} />
      {/* Touch gets a semantic lane only around the visible cue. Short cards
          divide their minimum height around a two-pixel body seam; taller cards
          retain the proven thin-edge depth so the title remains a move target. */}
      <div aria-hidden="true" tabIndex={-1}
        data-touch-resize={edge}
        onPointerDown={(pointerEvent) => onPointerDown(pointerEvent, event, edge)}
        className={`absolute left-1/2 z-20 flex -translate-x-1/2 justify-center ${start ? "top-0 items-start" : "bottom-0 items-end"}`}
        style={{
          width: "min(44px, 100%)",
          height: touchHeight,
          cursor: "ns-resize",
          touchAction: "pan-y",
          pointerEvents: "auto",
        }}>
        <span data-test={`timeline-event-resize-cue-${edge}`} aria-hidden="true" style={{
          width: 22,
          height: 2,
          marginTop: start ? 2 : undefined,
          marginBottom: start ? undefined : 3,
          borderRadius: 2,
          background: theme.faint,
        }} />
      </div>
    </>
  );
}

/* One Event has one stable grammar at every duration and lane width: its thin
 * full-width mouse edges resize, centred coarse touch cues resize, and the
 * remaining readable surface moves. Touch waits for lift on either role, so an
 * immediate vertical movement can still be owned by the Timeline scroll. */
export default function TimelineEventResizeControls({ event, theme, onPointerDown }) {
  return (
    <>
      <EventResizeEdge edge="start" event={event} theme={theme} onPointerDown={onPointerDown} />
      <EventResizeEdge edge="end" event={event} theme={theme} onPointerDown={onPointerDown} />
    </>
  );
}
