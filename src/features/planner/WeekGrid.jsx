/* The week view: seven day columns against one shared time axis.
 *
 * The largest single component in the planner, and the one that owns the
 * timeline's pointer gestures — the drag that creates, the drag that moves,
 * and the hold that has to not turn a scroll into either. The arithmetic for
 * those decisions is already in timelineGesture.js; this is the surface they
 * act on.
 */
import React, { useEffect, useRef, useState } from "react";

import { MONO } from "../../design/typography.js";
import { fmtHour, fmtTime, pad } from "../../shared/time/clockFormat.js";
import { parseKey } from "../../shared/time/dateKey.js";
import { startSlot } from "../../shared/time/snap.js";

import { CARD_R, DAY_H, HOUR_H, LIFT_MS, WD, catColor } from "./constants.js";
import { fmtDay } from "./dateLabels.js";
import { ExternalLinkIcon } from "./icons.jsx";
import { normalizeMeetingLink } from "./meetingLink.js";
import {
  EMPTY_SPACE_LIFT_MS,
  gestureChangedAnything,
  movedEnoughToActivateDirectDrag,
  movedEnoughToCancelHold,
  pointerButtonsHeld,
  proposeGesture,
} from "./timelineGesture.js";

/* The true week: 7 day columns against one shared time axis. Events are blocks and
   free time is the open space between them — the shape of the week is the point,
   so the columns carry as little chrome as they can. */
function WeekGrid({ T, surface, hourRule, hourBand, week, dateKey, todayKey, nowMin, clock, slots, draftPreview, onCreateDraft, onTimelineScroll, onTimelineIntent, onOpenDay, onOpenEvent, onOpenTask, onSlotPick, onMoveEvent, beep, buzz }) {
  const scrollRef = useRef(null);
  const weekKey = week[0]?.key;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firsts = week.flatMap((d) => d.timed.map((e) => e.start));
    const anchor = week.some((d) => d.key === todayKey) ? nowMin : firsts.length ? Math.min(...firsts) : 480;
    const initialScrollTop = Math.max(0, (anchor / 1440) * DAY_H - 140);
    el.scrollTop = initialScrollTop;
    onTimelineScroll?.(initialScrollTop, { initial: true });
  }, [weekKey, onTimelineScroll]);
  const hasAllDay = week.some((d) => d.allDay.length > 0);

  /* ─── dragging a card across the week ───
     Two axes at once, which is the whole point of the view: y is the minute, x is
     the day. Both are read from the pointer rather than from the card, so a drop
     lands where the cursor is and not where the grab started.

     Mouse/pen movement activates directly; touch retains a hold-to-lift guard so
     vertical movement can remain a Timeline scroll. */
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const holdRef = useRef(null);
  const tapRef = useRef(false);
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const draftPressRef = useRef(null);
  const draftEndedAtRef = useRef(0);
  const dragging = Boolean(drag);

  const minuteAt = (clientY) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return ((clientY - rect.top + el.scrollTop) / DAY_H) * 1440;
  };
  /* Hit-test the column under the pointer rather than doing arithmetic on the
     grid's width: the gutter, the borders and a horizontal scroll all shift
     where a column actually is, and `elementFromPoint` already knows. */
  const dayAt = (x, y) => {
    try {
      const found = document.elementFromPoint(x, y)?.closest("[data-week-day]");
      return found ? found.getAttribute("data-week-day") : null;
    } catch { return null; }
  };

  const cancelDraftPress = () => {
    const press = draftPressRef.current;
    if (!press) return;
    clearTimeout(press.timer);
    press.timer = null;
    press.cancelled = true;
  };

  const beginDraft = () => {
    const press = draftPressRef.current;
    if (!press || press.cancelled || draftRef.current) return;
    press.timer = null;
    press.held = true;
    const next = {
      date: press.date,
      start: press.start,
      dur: 30,
      x: press.x,
      y: press.y,
    };
    draftRef.current = next;
    setDraft(next);
    beep?.("lift");
    buzz?.(14);
  };

  const updateDraft = (clientX, clientY) => {
    const current = draftRef.current;
    if (!current) return;
    const next = {
      ...current,
      x: clientX,
      y: clientY,
      /* Creating in a week is anchored to the column where the press began;
         the vertical motion is the duration handle, just like an empty day
         timeline press. A horizontal move can still leave the column without
         silently changing the day being created. */
      dur: proposeGesture("resize-end", {
        start: current.start,
        pointerMinute: minuteAt(clientY),
        kind: "event",
      }).duration,
    };
    draftRef.current = next;
    setDraft(next);
  };

  const finishDraft = () => {
    const current = draftRef.current;
    draftRef.current = null;
    draftPressRef.current = null;
    setDraft(null);
    if (!current) return;
    draftEndedAtRef.current = Date.now();
    onCreateDraft?.({ date: current.date, start: current.start, dur: current.dur });
  };

  const armDraft = (event, day) => {
    if (event.target.closest?.("[data-test='week-event']")) return;
    const { clientX, clientY } = event.touches?.[0] ?? event;
    const rect = event.currentTarget.getBoundingClientRect();
    const start = startSlot(((clientY - rect.top) / DAY_H) * 1440, 5);
    cancelDraftPress();
    const press = {
      date: day,
      start,
      x: clientX,
      y: clientY,
      held: false,
      cancelled: false,
      timer: null,
      pointerType: event.pointerType || "touch",
    };
    press.timer = setTimeout(beginDraft, EMPTY_SPACE_LIFT_MS);
    draftPressRef.current = press;
  };

  const draftPointerDown = (event, day) => {
    if (event.pointerType === "touch" || event.button === 2) return;
    event.stopPropagation();
    armDraft(event, day);
  };

  const draftTouchStart = (event, day) => {
    if (event.touches.length !== 1 || event.target.closest?.("[data-test='week-event']")) return;
    event.stopPropagation();
    armDraft(event, day);
  };

  const draftTouchMove = (event) => {
    if (event.target.closest?.("[data-test='week-event']") && !draftRef.current) return;
    const point = event.touches[0];
    if (!point) return;
    const press = draftPressRef.current;
    if (!draftRef.current) {
      if (press && movedEnoughToCancelHold(press, { x: point.clientX, y: point.clientY })) cancelDraftPress();
      return;
    }
    if (event.cancelable) event.preventDefault();
    updateDraft(point.clientX, point.clientY);
  };

  const draftTouchEnd = (event, day) => {
    if (event.target.closest?.("[data-test='week-event']")) return;
    const press = draftPressRef.current;
    if (draftRef.current) {
      if (event.cancelable) event.preventDefault();
      finishDraft();
      return;
    }
    if (!press) return;
    clearTimeout(press.timer);
    draftPressRef.current = null;
    if (event.cancelable) event.preventDefault();
    if (press.cancelled) {
      /* A cancelled touch must not fall through to the compatibility click on
         the column. Without this, a small scroll that correctly aborts the
         creation hold still opened a one-hour composer when the finger lifted. */
      draftEndedAtRef.current = Date.now();
      return;
    }
    onSlotPick?.({ date: day, start: press.start, dur: 60 });
  };

  useEffect(() => {
    const move = (event) => {
      const press = draftPressRef.current;
      if (!press || press.pointerType === "touch" || draftRef.current) return;
      if (movedEnoughToCancelHold(press, { x: event.clientX, y: event.clientY })) cancelDraftPress();
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    if (!draft) return undefined;
    const move = (event) => { event.preventDefault(); updateDraft(event.clientX, event.clientY); };
    const up = () => finishDraft();
    const cancel = () => {
      draftRef.current = null;
      setDraft(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [Boolean(draft)]);

  const beginDrag = (event, day, clientX, clientY, grabOverride = null) => {
    tapRef.current = false;
    beep?.("lift"); buzz?.(14);
    const next = {
      id: event.id, event, dur: event.dur,
      grab: grabOverride ?? (minuteAt(clientY) - event.start),
      fromDate: day, fromStart: event.start,
      date: day, start: event.start,
      x: clientX, y: clientY,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const updateDrag = (clientX, clientY) => {
    const current = dragRef.current;
    if (!current) return;
    const day = dayAt(clientX, clientY);
    /* Same arithmetic the day timeline uses — features/planner/timelineGesture.js. */
    const { start } = proposeGesture("move", {
      pointerMinute: minuteAt(clientY), grab: current.grab, duration: current.dur,
    });
    const next = { ...current, x: clientX, y: clientY, start, date: day ?? current.date };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = () => {
    const finished = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!finished) return;
    if (!gestureChangedAnything(
      { start: finished.fromStart, duration: finished.dur, date: finished.fromDate },
      { start: finished.start, duration: finished.dur, date: finished.date },
    )) return;
    onMoveEvent?.(finished.event, { date: finished.date, start: finished.start });
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => { if (!pointerButtonsHeld(e)) { dragRef.current = null; setDrag(null); return; } e.preventDefault(); updateDrag(e.clientX, e.clientY); };
    const up = () => endDrag();
    const cancel = () => {
      dragRef.current = null;
      setDrag(null);
    };
    /* Once a lifted card changes columns, the original button is unmounted
       under the finger. Keep the active touch owned by the Week surface so the
       next move/end still updates and commits the live gesture. */
    const touchMove = (e) => {
      if (!dragRef.current) return;
      const point = e.touches?.[0];
      if (!point) return;
      if (e.cancelable) e.preventDefault();
      updateDrag(point.clientX, point.clientY);
    };
    const touchEnd = () => { if (dragRef.current) { disarm(); endDrag(); } };
    const touchCancel = () => {
      disarm();
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", touchEnd);
    window.addEventListener("touchcancel", touchCancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchCancel);
    };
  }, [dragging]);

  /* Touch is driven by touch events, not pointer events: a scroll container fires
     pointercancel the instant the browser claims the gesture, which would kill
     every long press before it lifted. Same reason the day timeline does. */
  const touchStart = (e, event, day) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    const { clientX, clientY } = e.touches[0];
    tapRef.current = true;
    clearTimeout(holdRef.current);
    armedRef.current = { x: clientX, y: clientY };
    holdRef.current = setTimeout(() => beginDrag(event, day, clientX, clientY), LIFT_MS);
  };
  const touchMove = (e) => {
    if (!dragRef.current) {
      const t = e.touches[0];
      const armed = armedRef.current;
      if (armed && t && movedEnoughToCancelHold(armed, { x: t.clientX, y: t.clientY })) {
        disarm();
        tapRef.current = false;
      }
      return;
    }
    e.preventDefault();
    updateDrag(e.touches[0].clientX, e.touches[0].clientY);
  };
  const touchEnd = (e, event, day) => {
    disarm();
    if (dragRef.current) { endDrag(); return; }
    if (tapRef.current) { tapRef.current = false; e.preventDefault(); onOpenEvent(event.id, day); }
  };

  /* A press that moves before it lifts was never a press. Without this the hold
     timer keeps running while the pointer travels, and the card lifts under a
     cursor that had already left it — turning a scroll or a stray drag across the
     week into a move nobody asked for. The day timeline cancels its hold the same
     way; the week grid was missing it. */
  const armedRef = useRef(null);
  const disarm = () => { clearTimeout(holdRef.current); armedRef.current = null; };

  useEffect(() => {
    const move = (e) => {
      const armed = armedRef.current;
      if (!armed || dragRef.current) return;
      if (armed.activateOnMove && !pointerButtonsHeld(e)) {
        disarm();
        tapRef.current = false;
        return;
      }
      if (armed.activateOnMove && movedEnoughToActivateDirectDrag(armed, { x: e.clientX, y: e.clientY })) {
        armed.activateOnMove(e.clientX, e.clientY, e);
        return;
      }
      if (movedEnoughToCancelHold(armed, { x: e.clientX, y: e.clientY })) { disarm(); tapRef.current = false; }
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  const pointerDown = (e, event, day) => {
    if (e.pointerType === "touch") { e.stopPropagation(); return; }
    if (e.button === 2) return;
    e.stopPropagation();
    tapRef.current = true;
    const { clientX, clientY } = e;
    disarm();
    const grab = minuteAt(clientY) - event.start;
    armedRef.current = {
      x: clientX,
      y: clientY,
      activateOnMove: (nextX, nextY, moveEvent) => {
        disarm();
        moveEvent.preventDefault();
        if (moveEvent.currentTarget?.setPointerCapture && moveEvent.pointerId != null) {
          try { moveEvent.currentTarget.setPointerCapture(moveEvent.pointerId); } catch { /* capture is best effort */ }
        }
        beginDrag(event, day, nextX, nextY, grab);
        /* The movement that crosses the threshold is also the first visible
           drag frame; do not wait for a second pointermove to catch up. */
        updateDrag(nextX, nextY);
      },
    };
    holdRef.current = setTimeout(() => {
      const armed = armedRef.current;
      if (!armed) return;
      armedRef.current = null;
      beginDrag(event, day, armed.x, armed.y, grab);
    }, LIFT_MS);
  };
  const pointerUp = (e, event, day) => {
    if (e.pointerType === "touch") return;
    disarm();
    if (dragRef.current) {
      const live = dragRef.current;
      const moved = gestureChangedAnything(
        { start: live.fromStart, duration: live.dur, date: live.fromDate },
        { start: live.start, duration: live.dur, date: live.date },
      );
      if (!moved) {
        dragRef.current = null;
        setDrag(null);
        tapRef.current = false;
        e.stopPropagation();
        onOpenEvent(event.id, day);
        return;
      }
      endDrag();
      return;
    }
    if (tapRef.current) { tapRef.current = false; e.stopPropagation(); onOpenEvent(event.id, day); }
  };

  useEffect(() => () => {
    clearTimeout(holdRef.current);
    clearTimeout(draftPressRef.current?.timer);
  }, []);

  /* The lifted card leaves its old column and is drawn in the one under the
     pointer, so the week shows the move rather than describing it. */
  const cardsFor = (day) => {
    const settled = drag ? day.timed.filter((event) => event.id !== drag.id) : day.timed;
    if (!drag || drag.date !== day.key) return settled;
    return [...settled, { ...drag.event, start: drag.start, dur: drag.dur, lane: 0, cols: 1, lifted: true }];
  };
  return (
    <div data-test="week-grid" className="nb-x flex-1 min-h-0 overflow-x-auto flex flex-col" style={{ background: T.card, borderRadius: 16 }}>
      <div className="flex flex-col flex-1 min-h-0" style={{ minWidth: 620 }}>
        <div className="flex shrink-0" style={{ borderBottom: `1px solid ${T.line}` }}>
          <span className="w-12 shrink-0" />
          {week.map((day) => {
            const d = parseKey(day.key);
            const isToday = day.key === todayKey;
            const sel = day.key === dateKey;
            return (
              <button key={day.key} onClick={() => onOpenDay(day.key)} className="nb-tap flex-1 min-w-0 py-1.5 text-center" style={{ borderLeft: `1px solid ${hourRule}` }} aria-label={`Open ${fmtDay(day.key)}`}>
                <span style={{ fontFamily: MONO, color: sel ? T.accent : T.dim }} className="block nb-data">{WD[d.getDay()]}</span>
                <span className="inline-flex items-center justify-center w-7 h-7 text-sm font-bold" style={{
                  fontFamily: MONO, borderRadius: 999,
                  background: isToday ? T.accent : "transparent",
                  color: isToday ? T.on : T.text,
                  boxShadow: sel && !isToday ? `inset 0 0 0 1.5px ${T.accent}` : "none",
                }}>{pad(d.getDate())}</span>
              </button>
            );
          })}
        </div>
        {hasAllDay && (
          <div className="flex shrink-0" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span className="w-12 shrink-0 self-center pr-2 text-right nb-data" style={{ fontFamily: MONO, color: T.dimText, fontSize: 9 }}>ALL DAY</span>
            {week.map((day) => (
              <div key={day.key} className="flex-1 min-w-0 px-0.5 py-1 flex flex-col gap-0.5" style={{ borderLeft: `1px solid ${hourRule}` }}>
                {day.allDay.map((e) => {
                  const href = normalizeMeetingLink(e.link);
                  return (
                    <div key={e.segmentId ?? e.id} className="relative overflow-hidden" style={{ background: surface, borderRadius: 6 }}>
                      <button onClick={() => onOpenEvent(e.id, day.key)} className="nb-tap flex w-full items-center gap-1 py-0.5 text-left overflow-hidden"
                        style={{ paddingLeft: 6, paddingRight: href ? 20 : 6 }}>
                        <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, background: catColor(e.cat) }} />
                        <span className="font-semibold truncate" style={{ fontSize: 10 }}>{e.title}</span>
                      </button>
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer" draggable={false} data-join={e.id}
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onPointerUp={(ev) => ev.stopPropagation()}
                          onPointerCancel={(ev) => ev.stopPropagation()}
                          onTouchStart={(ev) => ev.stopPropagation()}
                          onTouchEnd={(ev) => ev.stopPropagation()}
                          onClick={(ev) => ev.stopPropagation()}
                          aria-label={`Join ${e.title}`}
                          className="absolute inset-y-0 right-0 z-10 inline-flex w-4 items-center justify-center"
                          style={{ color: T.accentText }}>
                          <ExternalLinkIcon size={10} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div ref={scrollRef} onTouchStartCapture={() => onTimelineIntent?.()}
          onTouchEndCapture={() => { if (dragRef.current) { disarm(); endDrag(); } }}
          onTouchCancelCapture={() => { if (dragRef.current) { disarm(); dragRef.current = null; setDrag(null); } }}
          onWheel={() => onTimelineIntent?.()} onScroll={(event) => {
          /* The scroll container is the reliable cancellation signal on touch:
             a finger can move only a few pixels before the browser starts
             scrolling, which is still a scroll rather than an intentional
             creation hold. Once the draft has lifted, vertical motion belongs
             to its duration update and must not cancel it. */
          if (draftPressRef.current && !draftRef.current) cancelDraftPress();
          onTimelineScroll?.(event.currentTarget.scrollTop);
        }} className="nb-s flex-1 min-h-0 overflow-y-auto">
          <div className="relative flex" style={{ height: DAY_H, userSelect: "none", WebkitUserSelect: "none" }}>
            <div className="relative w-12 shrink-0">
              {Array.from({ length: 24 }).map((_, h) => h > 0 && (
                <span key={h} className="absolute right-2 tracking-widest" style={{ top: h * HOUR_H, transform: "translateY(-50%)", fontFamily: MONO, color: T.dimText, fontSize: 9 }}>{fmtHour(h, clock)}</span>
              ))}
            </div>
            {week.map((day) => {
              const isToday = day.key === todayKey;
              const daySlots = slots.filter((s) => s.date === day.key);
              const dayDraft = draft?.date === day.key ? draft : draftPreview?.date === day.key ? draftPreview : null;
              return (
                <div key={day.key} data-week-day={day.key} className="relative flex-1 min-w-0" style={{
                    borderLeft: `1px solid ${hourRule}`,
                    background: drag?.date === day.key ? `${T.accent}14` : day.key === dateKey ? `${T.accent}08` : "transparent",
                  }}
                  onPointerDown={(event) => draftPointerDown(event, day.key)}
                  onPointerUp={(event) => {
                    if (event.pointerType === "touch") return;
                    const press = draftPressRef.current;
                    if (draftRef.current) { finishDraft(); return; }
                    if (!press) return;
                    clearTimeout(press.timer);
                    draftPressRef.current = null;
                    if (press.cancelled) draftEndedAtRef.current = Date.now();
                  }}
                  onPointerCancel={() => {
                    const press = draftPressRef.current;
                    if (draftRef.current) { draftRef.current = null; setDraft(null); }
                    if (press?.cancelled) draftEndedAtRef.current = Date.now();
                    clearTimeout(press?.timer);
                    draftPressRef.current = null;
                  }}
                  onTouchStart={(event) => draftTouchStart(event, day.key)}
                  onTouchMove={draftTouchMove}
                  onTouchEnd={(event) => draftTouchEnd(event, day.key)}
                  onTouchCancel={() => {
                    cancelDraftPress();
                    draftEndedAtRef.current = Date.now();
                    draftPressRef.current = null;
                  }}
                  onClick={(e) => {
                    /* A drop is not a click on the column underneath it. */
                    if (dragRef.current || Date.now() - draftEndedAtRef.current < 350) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    onSlotPick({ date: day.key, start: startSlot(((e.clientY - rect.top) / DAY_H) * 1440, 30), dur: 60 });
                  }}>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="absolute left-0 right-0 pointer-events-none" style={{ top: h * HOUR_H, height: HOUR_H, borderTop: `1px solid ${hourRule}`, background: h % 2 ? hourBand : "transparent" }} />
                  ))}
                  {dayDraft && (
                    <div data-test="week-draft-preview" className="absolute left-0.5 right-0.5 pointer-events-none flex items-center justify-center"
                      data-date={dayDraft.date} data-start={dayDraft.start} data-duration={dayDraft.dur}
                      style={{ top: (dayDraft.start / 1440) * DAY_H + 1, height: Math.max(16, (dayDraft.dur / 1440) * DAY_H - 2), borderRadius: CARD_R, boxShadow: `inset 0 0 0 1.5px ${T.accent}`, background: `${T.accent}14`, zIndex: 7 }}>
                      <span className="tracking-widest" style={{ fontFamily: MONO, color: T.accentText, fontSize: 9 }}>
                        {fmtTime(dayDraft.start, clock)} – {fmtTime(dayDraft.start + dayDraft.dur, clock)}
                      </span>
                    </div>
                  )}
                  {cardsFor(day).map((e) => {
                    const top = (e.start / 1440) * DAY_H;
                    const h = Math.max(16, (e.dur / 1440) * DAY_H) - 2;
                    const past = !e.lifted && (day.key < todayKey || (isToday && nowMin >= e.start + e.dur));
                    const href = normalizeMeetingLink(e.link);
                    return (
                      <div key={e.segmentId ?? `${e.id}-${e.start}`} className="absolute" style={{
                        top: top + 1, height: h,
                        left: `calc(${(e.lane / e.cols) * 100}% + 2px)`, width: `calc(${100 / e.cols}% - 4px)`,
                        zIndex: e.lifted ? 8 : 2,
                      }}>
                      <button
                        data-test="week-event" data-event-id={e.id}
                        onPointerDown={(ev) => pointerDown(ev, e, day.key)}
                        onPointerUp={(ev) => pointerUp(ev, e, day.key)}
                        onTouchStart={(ev) => touchStart(ev, e, day.key)}
                        onTouchMove={(ev) => { ev.stopPropagation(); touchMove(ev); }}
                        onTouchEnd={(ev) => { ev.stopPropagation(); touchEnd(ev, e, day.key); }}
                        onTouchCancel={(ev) => { ev.stopPropagation(); disarm(); dragRef.current = null; setDrag(null); }}
                        onClick={(ev) => ev.stopPropagation()}
                        className="nb-hover-tile absolute inset-y-0 left-0 text-left overflow-hidden"
                        style={{
                          /* Week columns are ~45px on a phone. A 50px JOIN lane
                             left a 6px title. Keep an icon-sized hit target and
                             give the name the rest of the card. */
                          right: href ? 18 : 0,
                          display: "flex", flexDirection: "column", justifyContent: "flex-start",
                          background: surface, borderRadius: CARD_R,
                          opacity: past ? 0.74 : 1,
                          /* The lifted card rides above everything, is not a drop
                             target for its own hit-test, and says it is lifted. */
                          zIndex: e.lifted ? 8 : 2,
                          pointerEvents: e.lifted ? "none" : "auto",
                          touchAction: "pan-y",
                          transform: e.lifted ? "scale(1.04)" : "none",
                          boxShadow: e.lifted
                            ? `0 8px 24px rgba(0,0,0,0.32), inset 0 0 0 1.5px ${T.accent}`
                            : past ? `inset 0 0 0 1px ${T.line}` : "none",
                        }}>
                        {/* Sharing the column halves the width, and at half a
                            week-column there is only room for one thing to be
                            legible. Keeping the dot and the time turned a title
                            into "R…" over "10:…" — two truncations that say
                            nothing where one whole word would have. */}
                        <span className={`flex flex-1 items-center gap-1 overflow-hidden ${e.cols > 1 || href ? "px-1" : "px-1.5"} pt-0.5 min-w-0`}>
                          {e.cols === 1 && !href && <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, background: catColor(e.cat) }} />}
                          <span className="min-w-0 flex-1 font-semibold leading-tight truncate" style={{ fontSize: 10 }}>{e.title}</span>
                        </span>
                        {(e.lifted || (h >= 30 && e.cols === 1)) && <span className="block truncate tracking-widest" style={{ fontFamily: MONO, color: e.lifted ? T.accent : T.dim, fontSize: 9, paddingLeft: e.lifted && e.cols > 1 ? 4 : (href ? 4 : 15) }}>{fmtTime(e.start, clock)}</span>}
                      </button>
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer" draggable={false} data-join={e.id}
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onPointerUp={(ev) => ev.stopPropagation()}
                          onPointerCancel={(ev) => ev.stopPropagation()}
                          onTouchStart={(ev) => ev.stopPropagation()}
                          onTouchEnd={(ev) => ev.stopPropagation()}
                          onClick={(ev) => ev.stopPropagation()}
                          aria-label={`Join ${e.title}`}
                          className="absolute inset-y-0 right-0 z-10 inline-flex w-4 items-center justify-center"
                          style={{ color: T.accentText }}>
                          <ExternalLinkIcon size={10} />
                        </a>
                      )}
                      </div>
                    );
                  })}
                  {day.tasks.map((t) => (
                    <button key={t.id} onClick={(ev) => { ev.stopPropagation(); onOpenTask(t.id, day.key); }}
                      className="absolute left-0.5 right-0.5 text-left overflow-hidden"
                      style={{ top: (t.planned.startMinute / 1440) * DAY_H + 1, height: 16, borderRadius: 6, border: `1px dashed ${T.faint}`, opacity: t.status === "completed" ? 0.4 : 1, zIndex: 3, background: T.card }}>
                      <span className="block px-1 font-semibold truncate" style={{ fontSize: 9, textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                    </button>
                  ))}
                  {daySlots.map((s) => (
                    <button key={`slot-${s.start}`} onClick={(ev) => { ev.stopPropagation(); onSlotPick(s); }}
                      className="absolute flex items-start justify-center"
                      style={{ left: 2, right: 2, top: (s.start / 1440) * DAY_H + 1, height: (s.dur / 1440) * DAY_H - 2, borderRadius: 6, border: `1.5px dashed ${T.accent}`, background: `${T.accent}14`, zIndex: 4 }}
                      aria-label={`Book ${fmtTime(s.start, clock)} on ${fmtDay(s.date)}`}>
                      <span className="tracking-widest pt-0.5" style={{ fontFamily: MONO, color: T.accentText, fontSize: 9 }}>{fmtTime(s.start, clock)}</span>
                    </button>
                  ))}
                  {isToday && (
                    <div className="absolute left-0 right-0 pointer-events-none" style={{ top: (nowMin / 1440) * DAY_H, height: 2, background: T.accent, zIndex: 6 }}>
                      <span className="absolute left-0 -top-0.5 w-1.5 h-1.5 rounded-full" style={{ background: T.accent }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export {
  WeekGrid,
};
