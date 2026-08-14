import { useEffect, useRef } from "react";

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
  live = false,
  livePct = 0,
  subtaskProgress = null,
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
  onPointerMove,
  onPointerUp,
  clickFollowsGesture,
}) {
  const chipRef = useRef(null);
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

  /* Native listeners stay on the body only. The checkmark and resize edge are
     siblings, so a captured desktop pointer cannot steal their ownership. */
  useEffect(() => {
    const node = chipRef.current;
    if (!node) return undefined;
    const ignoreForeign = (event) => event.target.closest?.("[data-resize], [data-timeline-complete], a[href]");
    const down = (event) => {
      if (ignoreForeign(event)) return;
      onPointerDown?.(event, task);
    };
    const move = (event) => {
      if (ignoreForeign(event)) return;
      onPointerMove?.(event, task);
    };
    const up = (event) => {
      if (ignoreForeign(event)) return;
      onPointerUp?.(event, task);
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
    };
  }, [task, onPointerDown, onPointerMove, onPointerUp]);

  return (
    <div className={`nb-timeline-lane absolute overflow-hidden ${dragging || sizing ? "nb-timeline-lane-active" : "nb-hover-tile"}`}
      data-test="timeline-action-lane"
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
        <button ref={chipRef} type="button" data-task-chip={task.id}
          onClick={open} onKeyDown={keyOpen}
          className="nb-tap absolute inset-0 w-full text-left overflow-hidden"
          style={{
            display: "flex", flexDirection: "column", justifyContent: "flex-start",
            borderRadius: cardRadius,
            border: `1px dashed ${sizing ? theme.accent : theme.faint}`,
            backgroundColor: theme.card,
            backgroundImage: block ? `linear-gradient(${theme.accent}0D, ${theme.accent}0D)` : "none",
            opacity: 1,
          }}>
          {/* Inside the opaque card face so it remains visibly beneath the
              content, COMPLETE overlay, checkmark, and resize affordance. */}
          {live && (
            <span data-test="timeline-action-live-fill" aria-hidden="true"
              className="absolute inset-y-0 left-0 pointer-events-none"
              style={{ width: `${livePct}%`, background: `${theme.accent}26`, transition: "width 260ms linear" }}>
              <span className="absolute inset-y-0 right-0" style={{ width: 2, background: theme.accent }} />
            </span>
          )}
          <span className="flex min-w-0 items-center gap-2 py-1 pr-2.5 pl-8">
            <span className="nb-lead min-w-0 flex-1 truncate" style={{ color: done ? theme.dimText : theme.text }}>{task.title}</span>
            {subtaskProgress?.total > 0 && (
              <span data-test="timeline-action-subtask-marker" aria-label={`${subtaskProgress.total} subtask${subtaskProgress.total === 1 ? "" : "s"}`}
                style={{ fontFamily: mono, color: theme.dimText }} className="nb-data shrink-0">
                ↳ {subtaskProgress.total}
              </span>
            )}
            <span style={{ fontFamily: mono, color: sizing ? theme.accent : theme.dim }} className="nb-task-time ml-auto nb-data shrink-0">
              {sizing || (block && height < 40) ? formatDuration(estimate) : formatTime(task.planned.startMinute)}
            </span>
          </span>
          {block && height >= 40 && (
            <span style={{ fontFamily: mono, color: theme.dimText }} className="nb-task-duration block nb-data truncate pr-2.5 pl-8">{formatDuration(estimate)}</span>
          )}
          {subtaskProgress?.total > 0 && block && height >= 54 && (
            <span data-test="timeline-action-subtasks" style={{ fontFamily: mono, color: theme.dimText }} className="block nb-data truncate pr-2.5 pl-8">
              {subtaskProgress.total} SUBTASK{subtaskProgress.total === 1 ? "" : "S"} · {subtaskProgress.done} DONE
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
        {block && (
          <span data-resize={task.id} data-resize-edge="end" data-test="timeline-action-resize"
            onPointerDown={(event) => {
              event.stopPropagation();
              onResizePointerDown(event, task, estimate);
            }}
            className="absolute inset-x-0 bottom-0 z-30 flex items-end justify-center"
            style={{ height: 12, cursor: "ns-resize", touchAction: "pan-y" }}>
            <span style={{ background: theme.faint, width: 22, height: 2, marginBottom: 3, borderRadius: 2 }} />
          </span>
        )}
      </div>
    </div>
  );
}
