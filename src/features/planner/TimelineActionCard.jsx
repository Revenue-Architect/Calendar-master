import { useEffect, useRef } from "react";

function resizeCueStyle(theme) {
  return {
    width: 8,
    height: 8,
    borderRadius: 2,
    border: `1px solid ${theme.accent}`,
    background: `${theme.accent}26`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

export default function TimelineActionCard({
  task,
  top,
  height,
  left,
  width,
  estimate,
  block,
  sizing,
  resizeEligible = block,
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

  /* Native listeners stay on the card root. The move body, checkmark, and
     estimate each occupy a different region, so a captured pointer cannot turn
     a compact card's visible estimate into a competing overlay. */
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
        <div ref={chipRef} data-task-chip={task.id}
          className="absolute inset-0 overflow-hidden"
          style={{
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
          <button type="button" data-test="timeline-action-move" onClick={open} onKeyDown={keyOpen}
            className="nb-tap absolute inset-y-0 left-8 min-w-0 overflow-hidden text-left"
            style={{
              right: resizeEligible ? 48 : 0,
              display: "flex", flexDirection: "column", justifyContent: "flex-start",
              background: "transparent",
              borderRadius: 0,
            }}>
            <span className="flex min-w-0 items-center gap-2 py-1 pr-1.5">
              <span className="nb-lead min-w-0 flex-1 truncate" style={{ color: done ? theme.dimText : theme.text }}>{task.title}</span>
              {subtaskProgress?.total > 0 && (
                <span data-test="timeline-action-subtask-marker" aria-label={`${subtaskProgress.total} subtask${subtaskProgress.total === 1 ? "" : "s"}`}
                  style={{ fontFamily: mono, color: theme.dimText }} className="nb-data shrink-0">
                  ↳ {subtaskProgress.total}
                </span>
              )}
            </span>
            {block && height >= 40 && (
              <span style={{ fontFamily: mono, color: theme.dimText }} className="nb-task-time block nb-data truncate pr-1.5">{formatTime(task.planned.startMinute)}</span>
            )}
            {subtaskProgress?.total > 0 && block && height >= 54 && (
              <span data-test="timeline-action-subtasks" style={{ fontFamily: mono, color: theme.dimText }} className="block nb-data truncate pr-1.5">
                {subtaskProgress.total} SUBTASK{subtaskProgress.total === 1 ? "" : "S"} · {subtaskProgress.done} DONE
              </span>
            )}
          </button>
          {resizeEligible && (
            <span data-resize={task.id} data-resize-edge="end" data-action-estimate={task.id} data-test="timeline-action-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onResizePointerDown(event, task, estimate);
              }}
              className="absolute inset-y-0 right-0 z-30 flex w-12 items-center justify-center gap-0"
              style={{ cursor: "ns-resize", touchAction: "pan-y", fontFamily: mono, color: sizing ? theme.accent : theme.dim }}>
              <span data-test="timeline-action-resize-cue" aria-hidden="true" style={resizeCueStyle(theme)}>
                <span style={{ width: 4, height: 1.5, background: theme.accent }} />
              </span>
              <span className="nb-data shrink-0" style={{ fontSize: 9 }}>{formatDuration(estimate)}</span>
            </span>
          )}
        </div>
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
