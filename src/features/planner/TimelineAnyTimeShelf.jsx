/* The Day-only flexible-work landmark. Data selection stays in Planner; this
 * component only presents the already-filtered Actions and keeps the empty
 * state from changing the page's information architecture. */

export default function TimelineAnyTimeShelf({
  tasks,
  T,
  mono,
  surface,
  anyTimeRef,
  anyTimeFade,
  onOpenTask,
  onTaskPointerDown,
}) {
  return (
    <>
      <span style={{ fontFamily: mono, color: T.dimText }} className="nb-label mt-1">ANY TIME</span>
      {tasks.length > 0 ? (
        <div ref={anyTimeRef} data-test="any-time-row" data-owns-swipe="scroller" style={anyTimeFade} className="flex gap-1.5 overflow-x-auto nb-x pb-0.5">
          {tasks.map((task) => (
            <button key={task.id}
              onClick={() => onOpenTask(task.id)}
              onPointerDown={(event) => onTaskPointerDown(event, task)}
              className="nb-tap nb-hover-tile shrink-0 flex items-center gap-2 px-2.5 py-1.5 text-left"
              style={{ background: surface, borderRadius: 999, opacity: task.status === "completed" ? .55 : 1 }}>
              <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: task.status === "completed" ? T.accent : "transparent", boxShadow: `inset 0 0 0 1.5px ${T.accent}` }} />
              <span className="text-xs font-semibold max-w-48 truncate" style={{ textDecoration: task.status === "completed" ? "line-through" : "none" }}>{task.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <span data-test="any-time-empty" style={{ color: T.dimText }} className="nb-data block pb-0.5">No unscheduled Actions</span>
      )}
    </>
  );
}
