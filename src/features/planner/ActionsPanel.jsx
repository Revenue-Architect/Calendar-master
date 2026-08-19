/* The actions column: what is claimed for the day, what is overdue, what is
 * blocked, and the notes attached to the page.
 *
 * It is the planner's densest surface and the last composite to leave, because
 * it renders three things that had to go first — TaskCard, NoteBlock and
 * orderedIndex.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { NOW_RED } from "../../design/themes.js";
import { MONO, SERIF } from "../../design/typography.js";
import { plainText } from "../../domains/notes/index.js";
import { SMART_VIEWS } from "../../domains/tasks/index.js";
import { fmtTime } from "../../shared/time/clockFormat.js";
import { diffDays } from "../../shared/time/dateKey.js";
import { dur } from "../../shared/time/duration.js";

import Reveal from "../motion/Reveal.jsx";
import { TaskCard } from "./TaskCard.jsx";
import { CARD_R } from "./constants.js";
import { plannedLabel } from "./dateLabels.js";
import { Inline } from "./fields.jsx";
import { NoteBlock, orderedIndex } from "./notes.jsx";

function ActionsPanel({ T, listRef, tasks, notes, onToggleNoteCheck, onExtract, onOpenDeadline, overdue, deadlines, showOverdue, todayKey, gesture, blockersFor, subtasksFor, onPromoteSub, smartView, viewCounts, onSmartView, lists, onManageLists, clock = "12", selection, onToggleSelect, onStartSelect, onCancelSelect, onBulk, onPullOverdue, onAskPlan, beep, buzz, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onAddTask, onEditNote, onUnschedule, onJump, onCollapse = null, hidingAdd = false }) {
  const [overdueReviewOpen, setOverdueReviewOpen] = useState(false);
  const smartViewRef = useRef(smartView);
  const smartViewRevealTimer = useRef(null);
  /* The panel measures itself through its own ref, not the one the parent lends
     it. `listRef` is shared by the two places an ActionsPanel can be mounted —
     the desktop column and the full-view pane — so a switch between them has a
     moment where the departing instance has nulled it and the arriving one has
     not yet claimed it. Whichever order React commits in, a panel that reads the
     shared ref during that window measures nothing and silently skips its reveal.
     A ref this component owns cannot be cleared by another instance of it. */
  const ownListRef = useRef(null);
  const attachList = useCallback((node) => {
    ownListRef.current = node;
    if (listRef) listRef.current = node;
  }, [listRef]);
  const [smartViewRevealRows, setSmartViewRevealRows] = useState([]);
  const pullable = overdue.filter((t) => t.planned?.date !== todayKey);
  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");
  useEffect(() => {
    if (!pullable.length) setOverdueReviewOpen(false);
  }, [pullable.length]);
  useLayoutEffect(() => {
    if (smartViewRef.current === smartView) return undefined;
    smartViewRef.current = smartView;
    /* The filtered rows are already in the DOM by this layout pass, but have not
       painted. Mark only the rows actually in the Actions viewport so a person
       who changed filter while scrolled down sees continuity where they are. */
    const root = ownListRef.current;
    const scroller = root?.closest?.(".nb-s.overflow-y-auto");
    const viewport = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const visible = root
      ? [...root.querySelectorAll("[data-task]")].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.bottom > viewport.top && box.top < viewport.bottom;
      })
      : [];
    const rows = visible.slice(0, 5).map((node) => ({ id: node.dataset.task, status: node.dataset.taskStatus }));
    setSmartViewRevealRows(rows);
    clearTimeout(smartViewRevealTimer.current);
    smartViewRevealTimer.current = setTimeout(() => setSmartViewRevealRows([]), 360);
    return undefined;
  }, [smartView]);
  useEffect(() => () => clearTimeout(smartViewRevealTimer.current), []);
  const revealIndex = (task) => {
    const index = smartViewRevealRows.findIndex((row) => row.id === task.id && row.status === task.status);
    return index === -1 ? null : index;
  };
  return (
    <div ref={attachList}>
      <div className="hidden lg:flex items-baseline justify-between mb-3">
        <h2 className="text-2xl font-bold tracking-tight">Actions</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => (selection ? onCancelSelect() : onStartSelect(null))} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-label">SELECT</button>
          <button onClick={onManageLists} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-label">LISTS</button>
          <button
            data-test="actions-add"
            data-morph-source="actions-add"
            tabIndex={hidingAdd ? -1 : undefined}
            onClick={() => onAddTask({ id: "actions-add", label: "+ ADD" })}
            style={{ fontFamily: MONO, color: T.accentText, visibility: hidingAdd ? "hidden" : undefined }}
            className="nb-tap nb-hover-control nb-data">+ ADD</button>
          {onCollapse && (
            <button data-test="actions-collapse" onClick={onCollapse} style={{ fontFamily: MONO, color: T.dimText }}
              className="nb-tap nb-hover-control nb-data" aria-label="Collapse Actions column">COLLAPSE ›</button>
          )}
        </div>
      </div>

      {selection && (
        <div className="flex flex-wrap items-center gap-1 mb-2 px-2 py-2" style={{ boxShadow: `inset 0 0 0 1px ${T.accent}`, borderRadius: CARD_R }}>
          <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-data mr-1">{selection.size} SELECTED</span>
          {[["complete", "COMPLETE"], ["today", "TODAY"], ["defer", "TOMORROW"]].map(([action, label]) => (
            <button key={action} onClick={() => onBulk(action)} className="nb-tap nb-hover-choice px-2 py-1 nb-data"
              style={{ fontFamily: MONO, borderRadius: 999, color: T.text, border: `1px solid ${T.line}` }}>{label}</button>
          ))}
          {/* §11.3. The three that benefit most from being done at once, each
              borrowing the single-task command so the rules stay identical. */}
          <select onChange={(e) => { if (e.target.value) { onBulk("list", e.target.value); e.target.value = ""; } }} defaultValue=""
            style={{ fontFamily: MONO, borderRadius: 999, background: "transparent", color: T.dimText, border: `1px solid ${T.line}` }} className="px-2 py-1 nb-data">
            <option value="">MOVE TO…</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select onChange={(e) => { if (e.target.value) { onBulk("priority", e.target.value); e.target.value = ""; } }} defaultValue=""
            style={{ fontFamily: MONO, borderRadius: 999, background: "transparent", color: T.dimText, border: `1px solid ${T.line}` }} className="px-2 py-1 nb-data">
            <option value="">PRIORITY…</option>
            {["urgent", "high", "normal", "low", "none"].map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}
          </select>
          <button onClick={() => { const t = prompt("Tag to add"); if (t && t.trim()) onBulk("tag", t.trim()); }}
            className="nb-tap nb-hover-choice px-2 py-1 nb-data" style={{ fontFamily: MONO, borderRadius: 999, color: T.text, border: `1px solid ${T.line}` }}>TAG…</button>
          <button onClick={() => onBulk("delete")} className="nb-tap nb-hover-danger px-2 py-1 nb-data"
            style={{ fontFamily: MONO, borderRadius: 999, color: NOW_RED, border: `1px solid ${T.line}` }}>DELETE</button>
          <button onClick={onCancelSelect} style={{ fontFamily: MONO, color: T.dimText }} className="ml-auto nb-label">CANCEL</button>
        </div>
      )}

      <div data-owns-swipe="scroller" className="nb-x flex gap-1 overflow-x-auto mb-3 -mx-1 px-1">
        {SMART_VIEWS.map((view) => {
          const on = view.id === smartView;
          const count = viewCounts?.[view.id] ?? 0;
          if (!on && count === 0 && view.id !== "today") return null;
          return (
            <button key={view.id} onClick={() => onSmartView(view.id)} className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} shrink-0 px-2 py-1 nb-label`}
              style={{ fontFamily: MONO, background: on ? T.accent : "transparent", color: on ? T.on : T.dim, border: `1px solid ${on ? T.accent : T.line}` }}>
              {view.label}{count ? ` ${count}` : ""}
            </button>
          );
        })}
      </div>

      {/* Only what PLAN TODAY can actually move is offered: overdue work already
          planned onto today would make the button a visible no-op. */}
      {showOverdue && pullable.length > 0 && (
        <>
        <button data-test="plan-today" onClick={() => { beep("click"); setOverdueReviewOpen((current) => !current); }} className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-left" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }} aria-expanded={overdueReviewOpen}>
          <span style={{ fontFamily: MONO, color: NOW_RED }} className="nb-data shrink-0">{pullable.length} OVERDUE</span>
          <span className="flex-1 text-xs truncate" style={{ color: T.dimText }}>{pullable.map((t) => t.title).join(" · ")}</span>
            <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-label shrink-0">PLAN TODAY</span>
          </button>
          <Reveal open={overdueReviewOpen}>
            {/* No opacity of its own. `Reveal` above already opens this by height, and
                fading a panel that is simultaneously unrolling reads as two things
                happening to one surface. The height is the arrival. */}
            <div data-test="overdue-plan-review" className="mb-3 px-3 py-2.5" style={{ background: T.card, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span style={{ fontFamily: MONO, color: NOW_RED }} className="nb-label">OVERDUE WORK</span>
                <button data-test="overdue-plan-cancel" onClick={() => { beep("click"); setOverdueReviewOpen(false); }} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-label">CANCEL</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {pullable.map((t) => (
                  <div key={t.id} data-test={`overdue-plan-${t.id}`} className="flex items-center gap-2 py-1.5" style={{ borderTop: `1px solid ${T.line}` }}>
                    <button data-test="overdue-plan-open" onClick={() => { beep("click"); setOverdueReviewOpen(false); onInspect(t.id); }} className="nb-tap nb-hover-control min-w-0 flex-1 text-left">
                      <span className="block text-sm font-semibold truncate">{t.title}</span>
                      <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data truncate">
                        DUE {t.deadline?.date || "—"} · WAS {t.planned?.date ? `${plannedLabel(t.planned.date, todayKey)}${t.planned.startMinute != null ? ` ${fmtTime(t.planned.startMinute, clock)}` : ""}` : "UNPLANNED"}{t.planned?.estimateMinutes ? ` · ${dur(t.planned.estimateMinutes)}` : ""}
                      </span>
                    </button>
                    <button data-test="overdue-plan-one" onClick={() => onAskPlan([t.id])} style={{ fontFamily: MONO, color: T.accentText, border: `1px solid ${T.line}`, borderRadius: 999 }} className="nb-tap nb-hover-choice shrink-0 px-2 py-1 nb-label">PLAN</button>
                  </div>
                ))}
              </div>
              <button data-test="overdue-plan-all" onClick={() => { setOverdueReviewOpen(false); onPullOverdue(); }} style={{ fontFamily: MONO, color: T.on, background: T.accent, borderRadius: 999 }} className="nb-tap mt-2 w-full px-2 py-1.5 nb-label">PLAN ALL TODAY</button>
            </div>
          </Reveal>
        </>
      )}

      {deadlines.length > 0 && (
        <div className="mb-3">
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">DEADLINES</span>
          <div className="flex flex-col mt-1">
            {deadlines.slice(0, 4).map((t) => {
              const dLeft = diffDays(t.deadline.date, todayKey);
              return (
                <button key={t.id} data-deadline={t.id} onClick={() => onOpenDeadline(t)} className="nb-row flex items-center gap-2 py-2 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  {/* The chip sizes to its longest word instead of being clipped to a
                      fixed width, which was overlapping the title. */}
                  <span style={{ fontFamily: MONO, color: dLeft <= 1 ? NOW_RED : T.dim, borderRadius: 999, border: `1px solid ${dLeft <= 1 ? NOW_RED : T.line}` }}
                    className="px-2 py-0.5 nb-data shrink-0 whitespace-nowrap">
                    {dLeft === 0 ? "TODAY" : dLeft === 1 ? "TOM" : `${dLeft}D`}
                  </span>
                  <span className="flex-1 text-xs truncate min-w-0">{t.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tasks.length === 0 && !selection && (
        <button onClick={onAddTask} className="nb-list-enter w-full py-8 text-center" style={{ border: `1px dashed ${T.faint}`, "--nb-list-index": 0 }}>
          <span style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice">Nothing claimed for this day yet. Add the one thing that matters.</span>
        </button>
      )}

      <div className="flex flex-col gap-3">
        {open.map((t) => (
          <TaskCard key={t.id} T={T} t={t} beep={beep} buzz={buzz} target={gesture && gesture.overTask === t.id} todayKey={todayKey} blockers={blockersFor(t)} subtasks={subtasksFor(t)} onPromoteSub={onPromoteSub} clock={clock} selection={selection} onToggleSelect={onToggleSelect} onStartSelect={onStartSelect}
            onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} listEnterIndex={revealIndex(t)} />
        ))}
      </div>

      {done.length > 0 && (
        <div className="mt-4">
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">DONE · {done.length}</span>
          <div className="flex flex-col gap-2 mt-2">
            {done.map((t) => (
              <TaskCard key={t.id} T={T} t={t} beep={beep} buzz={buzz} todayKey={todayKey} blockers={blockersFor(t)} subtasks={subtasksFor(t)} onPromoteSub={onPromoteSub} clock={clock} selection={selection} onToggleSelect={onToggleSelect} onStartSelect={onStartSelect}
                onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} listEnterIndex={revealIndex(t)} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">NOTES</span>
          <button onClick={() => onEditNote(notes[0] ?? null)} style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-data">{notes.length ? "EDIT" : "+ WRITE"}</button>
        </div>
        <div className="flex flex-col gap-3 mt-2">
          {notes.map((n) => (
            <div key={n.id} className="pl-3" style={{ borderLeft: `2px solid ${T.faint}` }}>
              {n.blocks.map((block, i, all) => (block.type === "checklist" ? (
                <div key={block.id} className="flex items-center gap-2 py-1">
                  <button onClick={() => onToggleNoteCheck(n.id, block.id)} className="shrink-0" aria-label={block.done ? "Reopen line" : "Complete line"}>
                    <span key={String(block.done)} className={`block rounded-full ${block.done ? "nb-pop" : ""}`} style={{ width: 14, height: 14, background: block.done ? T.accent : "transparent", boxShadow: `inset 0 0 0 1.5px ${block.done ? T.accent : T.faint}` }} />
                  </button>
                  <span className="flex-1 text-sm" style={{ textDecoration: block.done ? "line-through" : "none", color: block.done ? T.dim : T.text }}>
                    <Inline T={T} text={block.text} />
                  </span>
                  {/* §7.2. Once a line has become a task the affordance goes away, so
                      the same line cannot be turned into a second one. */}
                  {!block.extractedTaskId
                    ? <button onClick={() => onExtract(n.id, block.id, plainText(block.text))} style={{ fontFamily: MONO, color: T.accentText }} className="nb-data shrink-0">+ ACTION</button>
                    : <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">TRACKED</span>}
                </div>
              ) : (
                <NoteBlock key={block.id} T={T} block={block} ordinal={orderedIndex(all, i)} onOpen={() => onEditNote(n)} />
              )))}
            </div>
          ))}
          {notes.length === 0 && <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice pl-3">No notes on this page yet.</p>}
        </div>
      </div>
    </div>
  );
}

export {
  ActionsPanel,
};
