function EventResizeEdge({ edge, event, theme, onPointerDown }) {
  const start = edge === "start";
  return (
    <div aria-hidden="true" tabIndex={-1}
      data-touch-resize={edge} data-resize={event.id} data-resize-edge={edge}
      onPointerDown={(pointerEvent) => onPointerDown(pointerEvent, event, edge)}
      className={`absolute inset-x-0 z-10 flex justify-center ${start ? "top-0 items-start" : "bottom-0 items-end"}`}
      style={{
        height: start ? 8 : 12,
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
  );
}

/* One Event has one stable grammar at every duration and lane width: its thin
 * horizontal edges resize and the readable surface between them moves. Touch
 * waits for lift on either role, so an immediate vertical movement can still be
 * owned by the Timeline scroll; active ownership is locked by Planner. */
export default function TimelineEventResizeControls({ event, theme, onPointerDown }) {
  return (
    <>
      <EventResizeEdge edge="start" event={event} theme={theme} onPointerDown={onPointerDown} />
      <EventResizeEdge edge="end" event={event} theme={theme} onPointerDown={onPointerDown} />
    </>
  );
}
