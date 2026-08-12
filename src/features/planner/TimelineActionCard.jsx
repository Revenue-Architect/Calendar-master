export default function TimelineActionCard({
  task,
  top,
  height,
  left,
  width,
  estimate,
  block,
  sizing,
  dragging = false,
  reducedMotion = false,
  swipeOffset = 0,
  theme,
  mono,
  cardRadius,
  formatTime,
  formatDuration,
  onOpen,
  onComplete,
  onReopen,
  onResizePointerDown,
  onPointerDown,
  onPointerUp,
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
      style={{
        top, height, left, width, borderRadius: cardRadius,
        zIndex: dragging || sizing ? 20 : 5,
        pointerEvents: "auto",
        transform: dragging && !reducedMotion ? "scale(1.02)" : "none",
        boxShadow: dragging && !reducedMotion ? "0 10px 28px rgba(0,0,0,.38)" : "none",
        transition: reducedMotion ? "none" : "transform 120ms cubic-bezier(.23,1,.32,1), box-shadow 160ms ease-out",
      }}>
      <div aria-hidden="true" className="absolute inset-0 flex items-center pl-2"
        data-test="timeline-completion-backdrop"
        style={{ backgroundColor: theme.accent, color: theme.on, fontFamily: mono, borderRadius: cardRadius, opacity: 1 }}>
        <span className="nb-label inline-flex items-center gap-1"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8.2 3 3 7-7" /></svg>COMPLETE</span>
      </div>
      <div className="absolute inset-0"
        onPointerDown={(event) => onPointerDown?.(event, task)}
        onPointerUp={(event) => onPointerUp?.(event, task)}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? "transform 220ms cubic-bezier(.2,.8,.25,1)" : "none",
          borderRadius: cardRadius,
        }}>
        <div data-test="timeline-action-completion-overlay" data-visible={String(done)} aria-hidden="true"
          className={`nb-action-complete-overlay absolute inset-0 z-20 flex items-center gap-2 pl-9 pr-2 pointer-events-none ${done ? "is-visible" : ""}`}
          style={{ background: theme.accent, color: theme.on, borderRadius: cardRadius, fontFamily: mono }}>
          <span className="nb-label">COMPLETE</span>
        </div>
        <button type="button" data-task-chip={task.id} onClick={open} onKeyDown={keyOpen}
          className="nb-tap absolute inset-0 w-full text-left overflow-hidden"
          style={{
            display: "flex", flexDirection: "column", justifyContent: "flex-start",
            borderRadius: cardRadius,
            border: `1px dashed ${sizing ? theme.accent : theme.faint}`,
            /* The completion backing is a solid reveal surface. The face stays
               opaque in both open and completed states, so the red action never
               bleeds through after a completion or a partial swipe. */
            backgroundColor: theme.card,
            backgroundImage: block ? `linear-gradient(${theme.accent}0D, ${theme.accent}0D)` : "none",
            opacity: 1,
          }}>
          <span className="flex min-w-0 items-center gap-2 py-1 pr-2.5 pl-8">
            <span className="nb-lead min-w-0 flex-1 truncate" style={{ color: done ? theme.dimText : theme.text }}>{task.title}</span>
            <span style={{ fontFamily: mono, color: sizing ? theme.accent : theme.dim }} className="nb-task-time ml-auto nb-data shrink-0">
              {sizing ? formatDuration(estimate) : formatTime(task.planned.startMinute)}
            </span>
          </span>
          {block && height >= 40 && (
            <span style={{ fontFamily: mono, color: theme.dimText }} className="nb-task-duration block nb-data truncate pr-2.5 pl-8">{formatDuration(estimate)}</span>
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
        <button type="button" data-timeline-complete={task.id}
            aria-label={`${done ? "Reopen" : "Complete"} ${task.title}`}
            onClick={(event) => { event.stopPropagation(); (done ? onReopen : onComplete)(task.id); }}
            onPointerDown={(event) => event.stopPropagation()}
            className="nb-tap absolute inset-y-0 left-0 z-30 flex w-8 items-center justify-center"
            style={{ color: theme.accent, background: "transparent", touchAction: "manipulation" }}>
            <span data-test="timeline-complete-mark" aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold leading-none"
               style={{ background: done ? theme.on : theme.card, color: theme.accent, boxShadow: `inset 0 0 0 1.25px ${theme.accent}` }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8.2 3 3 7-7" /></svg>
            </span>
         </button>
      </div>
    </div>
  );
}
