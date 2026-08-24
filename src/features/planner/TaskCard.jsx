/* An action as a card: its state, its swipe, and everything hanging off it.
 *
 * The swipe is the interesting part — it rubber-bands past a soft limit and
 * only commits past a threshold, so a scroll that grazes the card does not
 * complete it. That arithmetic lives in timelineInteractionState.js; this is
 * the card it acts on. It renders PromotedSubtasks and SubComposer, which is
 * why both had to move before it could.
 */
import React, { useEffect, useRef, useState } from "react";

import { isDark, mixHex } from "../../design/colorMix.js";
import { NOW_RED } from "../../design/themes.js";
import { MONO } from "../../design/typography.js";
import { uid } from "../../shared/ids.js";
import { fmtTime } from "../../shared/time/clockFormat.js";
import { diffDays } from "../../shared/time/dateKey.js";

import ActionProgress from "./ActionProgress.jsx";
import { CARD_R, HOLD_MS, SWIPE_SOFT_LIMIT, catColor } from "./constants.js";
import { ArrowUpIcon, BlockIcon, CheckIcon, CloseIcon, GripIcon, RepeatIcon } from "./icons.jsx";
import { PromotedSubtasks, SubComposer } from "./subtasks.jsx";
import { rubberBand, shouldCommitSwipe } from "./timelineInteractionState.js";

function TaskCard({ T, t, beep, buzz, target, todayKey, blockers = [], subtasks = [], onPromoteSub, clock = "12", selection = null, onToggleSelect, onStartSelect, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onUnschedule, listEnterIndex = null }) {
  const [prog, setProg] = useState(0);
  const [dx, setDx] = useState(0);
  const [burst, setBurst] = useState(null);
  const [quickStepOpen, setQuickStepOpen] = useState(false);
  const raf = useRef(null), t0 = useRef(0), lastTick = useRef(0), holding = useRef(false);
  const progRef = useRef(0);
  const completedRef = useRef(t.status === "completed");
  const sw = useRef(null);

  const stopHold = (aborted) => {
    cancelAnimationFrame(raf.current);
    const wasHolding = holding.current;
    const currentProg = progRef.current;
    holding.current = false;
    progRef.current = 0;
    setProg(0);
    if (wasHolding && aborted && currentProg > 0.15) beep?.("abort");
  };
  const startHold = () => {
    if (t.status === "completed" || completedRef.current || (blockers && blockers.length > 0)) return;
    cancelAnimationFrame(raf.current);
    holding.current = true;
    t0.current = performance.now();
    lastTick.current = 0;
    progRef.current = 0;
    const loop = (now) => {
      if (!holding.current) return;
      const p = Math.min(1, (now - t0.current) / HOLD_MS);
      progRef.current = p;
      setProg(p);
      const step = 0.17 - 0.11 * p;
      if (p - lastTick.current >= step) { lastTick.current = p; beep?.("ratchet", p); buzz?.(3); }
      if (p >= 1) { fire(); return; }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  const fire = () => {
    cancelAnimationFrame(raf.current);
    holding.current = false;
    progRef.current = 0;
    setProg(0);
    if (t.status === "completed" || completedRef.current) return;
    completedRef.current = true;
    setBurst(uid());
    setTimeout(() => setBurst(null), 640);
    onComplete(t.id);
  };

  useEffect(() => {
    completedRef.current = t.status === "completed";
    if (t.status === "completed") {
      cancelAnimationFrame(raf.current);
      holding.current = false;
      progRef.current = 0;
      setProg(0);
    }
  }, [t.status, t.id]);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    holding.current = false;
  }, []);

  const onDown = (e) => { sw.current = { x: e.clientX, y: e.clientY, live: false, at: Date.now() }; };
  const onMove = (e) => {
    if (!sw.current) return;
    const ddx = e.clientX - sw.current.x, ddy = e.clientY - sw.current.y;
    if (!sw.current.live && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy)) { sw.current.live = true; stopHold(false); }
    if (sw.current.live) setDx(rubberBand(ddx, SWIPE_SOFT_LIMIT));
  };
  const onUp = () => {
    if (sw.current && sw.current.live) {
      /* A flick completes as readily as a full drag, and both directions share
         one judgement so completing and deferring stay the same gesture family. */
      const committed = shouldCommitSwipe({
        delta: dx, elapsedMs: Date.now() - sw.current.at, distanceThreshold: 96,
      });
      if (committed && dx > 0 && t.status !== "completed") fire();
      else if (committed && dx < 0) onDefer(t.id, 1);
    }
    sw.current = null;
    setDx(0);
  };

  /* Derived from the theme rather than passed down: the card only needs the same
     lift rule as the timeline, and threading a token through three components to
     say "one step above the page" is not worth the prop. */
  const surface = isDark(T.bg) ? mixHex(T.card, "#FFFFFF", 0.13) : mixHex(T.card, "#000000", 0.06);
  const checklist = t.checklist ?? [];
  const subDone = checklist.filter((s) => s.done).length;
  const dueLeft = t.deadline.date ? diffDays(t.deadline.date, todayKey) : null;
  const isDone = t.status === "completed";
  const showChecklistComposer = checklist.length > 0 || subtasks.length === 0 || quickStepOpen;

  return (
    <div data-task={t.id} data-task-status={t.status} className={`relative ${listEnterIndex != null ? "nb-list-enter" : ""}`} style={{ background: "transparent", borderRadius: CARD_R, boxShadow: target ? `inset 0 2px 0 ${T.accent}, var(--e1)` : "var(--e1)", "--nb-list-index": listEnterIndex ?? undefined }}>
        <div data-test="task-completion-backdrop" className="absolute inset-0 flex items-center justify-between px-4"
          style={{ fontFamily: MONO, background: dx > 0 ? T.accent : surface, color: dx > 0 ? T.on : T.dimText, borderRadius: CARD_R }}>
          <span className="nb-data" style={{ color: T.on, opacity: dx > 20 ? 1 : 0 }}>COMPLETE</span>
          <span className="nb-data" style={{ color: T.dimText, opacity: dx < -20 ? 1 : 0 }}>TOMORROW</span>
        </div>

      {/* Complete-right and defer-left are this card's own, and it says so twice
          over: the attribute stops the view switch claiming the same finger, and
          stopping the touch stream keeps the two from racing on a real screen,
          where one finger emits pointer *and* touch and this card only reads the
          first of them. */}
      <article data-owns-swipe="card" className="nb-action-card nb-hover-tile relative overflow-hidden" style={{ background: surface, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${T.line}`, transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 220ms cubic-bezier(.2,.8,.25,1), box-shadow 200ms cubic-bezier(.2,.8,.25,1)" : "none", opacity: 1, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
        onTouchStart={(ev) => ev.stopPropagation()} onTouchMove={(ev) => ev.stopPropagation()}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div data-test="task-completion-overlay" data-visible={String(isDone)} aria-hidden="true"
          className={`nb-action-complete-overlay absolute inset-0 z-10 flex items-center gap-2 pl-14 pr-4 pointer-events-none ${isDone ? "is-visible" : ""}`}
          style={{ background: T.accent, color: T.on, borderRadius: CARD_R, fontFamily: MONO }}>
          <CheckIcon size={14} />
          <span className="nb-label">COMPLETE</span>
        </div>
        <div className="flex items-start gap-3 p-3 pl-4">
          <button onPointerDown={(e) => { e.stopPropagation(); if (selection) return; if (!isDone) startHold(); }}
            onPointerUp={(e) => {
              e.stopPropagation();
              /* While selecting, the same control toggles membership — no second
                 checkbox appears and nothing shifts position. */
              if (selection) { onToggleSelect(t.id); return; }
              if (isDone) onReopen(t.id); else stopHold(true);
            }}
            onPointerLeave={() => stopHold(true)} onPointerCancel={() => stopHold(true)}
            className="nb-hover-icon relative z-20 mt-0.5 w-8 h-8 shrink-0 flex items-center justify-center"
            aria-label={selection ? (selection.has(t.id) ? "Deselect" : "Select") : isDone ? "Reopen" : "Hold to complete"} style={{ touchAction: "none" }}>
            <svg width="32" height="32" viewBox="0 0 32 32" className="absolute inset-0">
              <circle cx="16" cy="16" r="13" fill="none" stroke={selection && selection.has(t.id) ? T.accent : T.faint} strokeWidth="2" />
              <circle cx="16" cy="16" r="13" fill="none" stroke={T.accent} strokeWidth="3" strokeDasharray={2 * Math.PI * 13} strokeDashoffset={2 * Math.PI * 13 * (1 - (isDone ? 1 : prog))} transform="rotate(-90 16 16)" />
            </svg>
            <span className="relative" style={{ width: 10, height: 10, borderRadius: selection ? 2 : 0, background: (isDone || (selection && selection.has(t.id))) ? T.accent : "transparent", transform: `scale(${1 + prog * 0.5})` }} />
            {burst && Array.from({ length: 10 }).map((_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return <span key={burst + i} className="nb-p absolute" style={{ width: 4, height: 4, background: T.accent, "--tx": `${Math.cos(a) * 34}px`, "--ty": `${Math.sin(a) * 34}px` }} />;
            })}
          </button>

            <div className="flex-1 min-w-0">
              <button onClick={() => onInspect(t.id)} className="nb-hover-control text-left w-full">
                <span className="block text-sm font-semibold leading-snug" style={{ color: isDone ? T.dimText : T.text }}>{t.title}</span>
              </button>
              <div className="flex flex-wrap items-center gap-2 mt-1" style={{ fontFamily: MONO }}>
              <span className="inline-flex items-center gap-1.5">
                <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, background: catColor(t.category) }} />
                <span style={{ color: T.dimText }} className="nb-data">{t.category}</span>
                </span>
                {isDone && <span style={{ color: T.accentText, border: `1px solid ${T.accent}`, borderRadius: 999 }} className="px-1.5 py-0.5 nb-label shrink-0">DONE</span>}
              {/* Open is the default and stays quiet; the two states you set on
                  purpose announce themselves, so changing status in the detail view
                  has a visible effect out here on the row. */}
              {!isDone && t.status === "in_progress" && (
                <span style={{ color: T.accentText, border: `1px solid ${T.accent}`, borderRadius: 999 }} className="px-1.5 py-0.5 nb-label shrink-0">DOING</span>
              )}
              {!isDone && t.status === "waiting" && (
                <span style={{ color: T.dimText, border: `1px solid ${T.line}`, borderRadius: 999 }} className="px-1.5 py-0.5 nb-label shrink-0">WAITING</span>
              )}
              {t.recurrence && <span style={{ color: T.dimText }} className="text-xs"><RepeatIcon /></span>}
              {t.planned.startMinute != null && <button onClick={() => onUnschedule(t.id)} style={{ color: T.accentText }} className="nb-hover-control nb-data">{fmtTime(t.planned.startMinute, clock)}</button>}
              {dueLeft != null && <span style={{ color: dueLeft <= 0 ? NOW_RED : T.dim }} className="nb-data">DUE {dueLeft === 0 ? "TODAY" : dueLeft < 0 ? `${-dueLeft}D LATE` : `${dueLeft}D`}</span>}
              {checklist.length > 0 && <span style={{ color: T.dimText }} className="nb-data">{subDone}/{checklist.length}</span>}
              {blockers.length > 0 && (
                <span title={blockers.map((b) => b.title).join(", ")} style={{ color: NOW_RED }} className="nb-data">
                  <span className="inline-flex items-center gap-1"><BlockIcon />BLOCKED BY {blockers.length === 1 ? blockers[0].title : `${blockers.length} TASKS`}</span>
                </span>
              )}
            </div>
            <ActionProgress T={T} title={t.title} checklist={checklist} subtasks={subtasks} className="mt-2" />
          </div>

          <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(t.id, e.clientX, e.clientY); }}
            onContextMenu={(e) => { e.preventDefault(); if (!selection) onStartSelect(t.id); }}
            style={{ color: T.dimText, touchAction: "none" }}
              className="nb-tap shrink-0 w-7 h-8 flex items-center justify-center text-xs" aria-label="Drag to schedule, reorder, or move to another day"><GripIcon /></button>
        </div>

        {!isDone && showChecklistComposer && (
          <section data-test="task-checklist" aria-label="Checklist" className={`pl-8 pr-3 ${checklist.length > 0 ? "pb-3" : "pt-1 pb-2"}`}>
            <div data-test="task-add-step" className="pl-3" style={{ borderLeft: `2px solid ${T.faint}` }}>
              {(checklist.length > 0 || quickStepOpen) && (
                <div style={{ fontFamily: MONO, color: T.dimText }} className="flex items-center gap-2 pt-0.5 nb-data">
                  <span>CHECKLIST</span>
                  {checklist.length > 0 && <span>{subDone}/{checklist.length}</span>}
                </div>
              )}
              <SubComposer T={T} autoFocus={quickStepOpen && checklist.length === 0} onAdd={(v) => onAddSub(t.id, v)} />
              {checklist.map((s) => (
                <div key={s.id} className="nb-row flex items-center gap-2 w-full py-1.5">
                  <button onClick={() => {
                    /* The tick that finishes the last step is about to finish the
                       whole action — burst here, where the circle is, so the
                       celebration starts on the control the finger is on. A
                       dependency-blocked task asks for confirmation instead. */
                    if (!s.done && !blockers.length && checklist.every((x) => x.done || x.id === s.id)) {
                      setBurst(uid()); setTimeout(() => setBurst(null), 640);
                    }
                    onToggleSub(t.id, s.id);
                  }} className="flex items-center gap-2 flex-1 text-left">
                    <span className="w-3 h-3 shrink-0" style={{ background: s.done ? T.accent : "transparent", boxShadow: `inset 0 0 0 1px ${s.done ? T.accent : T.faint}` }} />
                    <span className="text-xs" style={{ textDecoration: s.done ? "line-through" : "none", color: s.done ? T.dim : T.text }}>{s.title}</span>
                  </button>
                  <button type="button" data-test="task-promote-subtask"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onPromoteSub(t.id, s.id); }}
                    style={{ color: T.dimText, touchAction: "manipulation" }}
                    className="nb-tap nb-hover-icon flex h-11 w-11 shrink-0 items-center justify-center"
                    aria-label="Convert step to a subtask" title="Turn this checklist item into tracked child work"><ArrowUpIcon /></button>
                  <button type="button" onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onRemoveSub(t.id, s.id); }}
                    style={{ color: T.dimText, touchAction: "manipulation" }}
                    className="nb-tap nb-hover-icon flex h-11 w-11 shrink-0 items-center justify-center"
                    aria-label="Remove step"><CloseIcon /></button>
                </div>
              ))}
            </div>
          </section>
        )}
        {!isDone && checklist.length === 0 && subtasks.length > 0 && !quickStepOpen && (
          <div className="mx-3 mb-2">
            <button type="button" onClick={() => setQuickStepOpen(true)}
              className="nb-tap nb-hover-control nb-micro inline-flex min-h-11 items-center py-1" style={{ color: T.dimText, minHeight: 44 }}>
              + QUICK STEP
            </button>
          </div>
        )}
        <PromotedSubtasks T={T} subtasks={subtasks}
          onComplete={onComplete} onReopen={onReopen} onOpen={onInspect} />
      </article>
    </div>
  );
}

export {
  TaskCard,
};
