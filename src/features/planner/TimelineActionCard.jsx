export default function TimelineActionCard({
  task,
  top,
  height,
  left,
  width,
  estimate,
  block,
  sizing,
  swipeOffset = 0,
  theme,
  mono,
  cardRadius,
  formatTime,
  formatDuration,
  onOpen,
  onComplete,
  onResizePointerDown,
  clickFollowsGesture,
}) {
  const open = () => {
    if (clickFollowsGesture?.()) return;
    onOpen(task.id);
  };
  const keyOpen = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  };
  const done = task.status === "completed";

  return (
    <div className="nb-timeline-lane absolute overflow-hidden"
      style={{ top, height, left, width, borderRadius: cardRadius, zIndex: sizing ? 20 : 5, pointerEvents: "auto" }}>
      <div aria-hidden="true" className="absolute inset-0 flex items-center pl-2"
        style={{ background: theme.accent, color: theme.on, fontFamily: mono, borderRadius: cardRadius }}>
        <span className="nb-label">✓ COMPLETE</span>
      </div>
      <div className="absolute inset-0"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? "transform 220ms cubic-bezier(.2,.8,.25,1)" : "none",
          borderRadius: cardRadius,
        }}>
        <button type="button" data-task-chip={task.id} onClick={open} onKeyDown={keyOpen}
          className="nb-tap absolute inset-0 w-full text-left overflow-hidden"
          style={{
            display: "flex", flexDirection: "column", justifyContent: "flex-start",
            borderRadius: cardRadius,
            border: `1px dashed ${sizing ? theme.accent : theme.faint}`,
            background: block ? `${theme.accent}0D` : theme.card,
            opacity: done ? 0.4 : 1,
          }}>
          <span className="flex min-w-0 items-center gap-2 py-1 pr-2.5 pl-9">
            <span className="nb-lead min-w-0 flex-1 truncate" style={{ textDecoration: done ? "line-through" : "none" }}>{task.title}</span>
            <span style={{ fontFamily: mono, color: sizing ? theme.accent : theme.dim }} className="nb-task-time ml-auto nb-data shrink-0">
              {sizing ? formatDuration(estimate) : formatTime(task.planned.startMinute)}
            </span>
          </span>
          {block && height >= 40 && (
            <span style={{ fontFamily: mono, color: theme.dimText }} className="nb-task-duration block nb-data truncate pr-2.5 pl-9">{formatDuration(estimate)}</span>
          )}
          {block && (
            <span data-resize={task.id} data-resize-edge="end"
              onPointerDown={(event) => onResizePointerDown(event, task, estimate)}
              className="absolute inset-x-0 bottom-0 flex items-end justify-center"
              style={{ height: 12, cursor: "ns-resize", touchAction: "pan-y" }}>
              <span style={{ background: theme.faint, width: 22, height: 2, marginBottom: 3, borderRadius: 2 }} />
            </span>
          )}
        </button>
        {!done && (
          <button type="button" data-timeline-complete={task.id}
            aria-label={`Complete ${task.title}`}
            onClick={(event) => { event.stopPropagation(); onComplete(task.id); }}
            onPointerDown={(event) => event.stopPropagation()}
            className="nb-tap absolute left-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full"
            style={{ color: theme.accent, background: theme.card, boxShadow: `inset 0 0 0 1.5px ${theme.accent}`, touchAction: "manipulation" }}>
            <span aria-hidden="true" className="text-xs font-bold">✓</span>
          </button>
        )}
      </div>
    </div>
  );
}
