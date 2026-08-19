/* The agenda view: the days around the selected one, each listing what it
 * holds, with a row you can open or jump to.
 */
import React from "react";

import { MONO } from "../../design/typography.js";
import { fmtTime, pad } from "../../shared/time/clockFormat.js";
import { parseKey } from "../../shared/time/dateKey.js";

import { CARD_R, WD, catColor } from "./constants.js";
import { RowWithJoin } from "./rows.jsx";

function Agenda({ T, surface, days, dateKey, todayKey, clock, onOpenEvent, onOpenTask, onJump }) {
  return (
    <div className="nb-s overflow-y-auto flex-1 min-h-0" style={{ background: T.card, borderRadius: 16 }}>
      {days.map((day) => {
        const d = parseKey(day.key);
        const isToday = day.key === todayKey;
        const count = day.allDay.length + day.timed.length + day.tasks.length;
        return (
          <div key={day.key} className="flex" style={{ borderTop: `1px solid ${T.line}`, minHeight: 76 }}>
            <button onClick={() => onJump(day.key)} className="nb-hover-tile shrink-0 w-16 py-3 text-center" style={{ background: T.bg }}>
              <span className="inline-flex flex-col items-center px-2 py-1"
                style={{ borderRadius: CARD_R, boxShadow: isToday ? `inset 0 0 0 1.5px ${T.text}` : "none" }}>
                <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data">{WD[d.getDay()]}</span>
                <span style={{ fontFamily: MONO }} className="block text-xl font-bold tracking-tight">{pad(d.getDate())}</span>
              </span>
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-2 pr-2 pl-2">
              {count === 0 && <span style={{ fontFamily: MONO, color: T.faint }} className="nb-data py-2">—</span>}
              {day.allDay.map((e) => (
                <RowWithJoin key={e.id} T={T} surface={surface} link={e.link} title={e.title}
                  onOpen={() => onOpenEvent(e.id, day.key)}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold whitespace-normal break-words leading-5">{e.title}</span>
                    <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-label mt-0.5">ALL DAY</span>
                  </span>
                </RowWithJoin>
              ))}
              {day.timed.map((e) => (
                <RowWithJoin key={e.id} T={T} surface={surface} link={e.link} title={e.title}
                  onOpen={() => onOpenEvent(e.id, day.key)}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold whitespace-normal break-words leading-5">{e.title}</span>
                    <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-2">
                      {e.place && <span style={{ color: T.dimText }} className="min-w-0 flex-1 text-xs truncate">{e.place}</span>}
                      <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{fmtTime(e.start, clock)}</span>
                    </span>
                  </span>
                </RowWithJoin>
              ))}
              {day.tasks.map((t) => (
                <button key={t.id} onClick={() => onOpenTask(t.id, day.key)} className="nb-tap nb-hover-tile flex items-center gap-2.5 px-3 py-2.5 text-left"
                  style={{ background: surface, borderRadius: CARD_R, opacity: t.status === "completed" ? 0.45 : 1 }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, boxShadow: `inset 0 0 0 1.5px ${catColor(t.category)}`, background: t.status === "completed" ? catColor(t.category) : "transparent" }} />
                  <span className="flex-1 text-sm font-semibold truncate" style={{ textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">
                    {t.planned.startMinute != null ? fmtTime(t.planned.startMinute, clock) : "ACTION"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export {
  Agenda,
};
