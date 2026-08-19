/* The two surfaces a task's steps are seen and added through.
 *
 * `PromotedSubtasks` lists steps that have become task records of their own;
 * `SubComposer` is the one-line field that adds another. TaskCard renders
 * both, which is why they had to leave before it could.
 */
import React, { useState } from "react";

import { MONO } from "../../design/typography.js";

/* A promoted step is now a task record rather than checklist text. Keep it in the
   parent’s visual tree: it is intentionally absent from top-level day queries, so
   rendering it nowhere would turn a successful promotion into apparent deletion. */
function PromotedSubtasks({ T, subtasks, onComplete, onReopen, onOpen, className = "" }) {
  if (!subtasks.length) return null;
  const done = subtasks.filter((task) => task.status === "completed").length;
  return (
    <section data-test="task-subtasks" aria-label={`Subtasks, ${done} of ${subtasks.length} complete`} className={`mx-3 mb-3 pl-3 ${className}`} style={{ borderLeft: `2px solid ${T.accent}` }}>
      <div style={{ fontFamily: MONO, color: T.dimText }} className="flex items-center gap-2 pb-1 pt-0.5 nb-data">
        <span>SUBTASKS</span>
        <span>{done}/{subtasks.length}</span>
      </div>
      {subtasks.map((subtask) => {
        const complete = subtask.status === "completed";
        const status = complete ? "DONE" : subtask.status === "waiting" ? "WAITING" : subtask.status === "in_progress" ? "DOING" : null;
        return (
          <div key={subtask.id} data-test="task-subtask" data-subtask-id={subtask.id} className="flex min-w-0 items-center gap-2 px-1.5 py-1.5" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10 }}>
            <button type="button" aria-label={complete ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); (complete ? onReopen : onComplete)(subtask.id); }}
              className="nb-hover-icon flex h-6 w-6 shrink-0 items-center justify-center" style={{ color: T.accent }}>
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: complete ? T.accent : "transparent", boxShadow: `inset 0 0 0 1px ${complete ? T.accent : T.faint}` }} />
            </button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onOpen(subtask.id); }}
              className="nb-hover-control nb-subtask-title min-w-0 flex-1 py-1 text-left">
              <span className="block truncate text-xs" style={{ color: complete ? T.dim : T.text, textDecoration: complete ? "line-through" : "none" }}>{subtask.title}</span>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="mt-0.5 flex items-center gap-1.5 nb-micro">
                <span>SUBTASK</span>
                {status && <span data-test="task-subtask-status">{status}</span>}
              </span>
            </button>
          </div>
        );
      })}
    </section>
  );
}

function SubComposer({ T, onAdd, autoFocus = false }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(""); } };
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-3 h-3 shrink-0" style={{ boxShadow: `inset 0 0 0 1px ${T.faint}` }} />
      <input autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Add a step" style={{ background: "transparent", border: "none" }} className="flex-1 text-xs py-0.5" />
      {v.trim() && <button onClick={go} style={{ fontFamily: MONO, color: T.accentText }} className="nb-label">ADD</button>}
    </div>
  );
}

export {
  PromotedSubtasks,
  SubComposer,
};
