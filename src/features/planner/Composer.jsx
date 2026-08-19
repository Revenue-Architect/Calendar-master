/* The composer: one sheet that creates or edits an event, an action or a note.
 *
 * What it is deciding changes which fields exist, so most of its size is the
 * branching between those three shapes rather than any one of them. The
 * recurrence preview, the duration arithmetic and the timezone candidates are
 * all borrowed from the domain and the shared time modules; this owns the
 * arrangement, not the rules.
 */
import React, { useMemo, useRef, useState } from "react";

import { isDark, mixHex } from "../../design/colorMix.js";
import { NOW_RED } from "../../design/themes.js";
import { MONO, SERIF } from "../../design/typography.js";
import { previewRecurrence } from "../../domains/calendar/index.js";
import { pad } from "../../shared/time/clockFormat.js";
import { addDaysToKey, parseKey } from "../../shared/time/dateKey.js";
import { dur } from "../../shared/time/duration.js";
import { addMinutesToLocalDateTime } from "../../shared/time/localDateTime.js";
import { startSlot } from "../../shared/time/snap.js";
import { getOffsetCandidates } from "../../shared/time/timezone.js";

import PillNav from "./PillNav.jsx";
import { ALERT_CHOICES, CARD_R, CATS, DAY_LETTERS, REPEATS, catColor } from "./constants.js";
import { durationFromClockRange } from "./detailDraft.js";
import { DurationPicker } from "./fields.jsx";
import { GooeyFilter } from "./gooey.jsx";
import { Chips, LiquidFill } from "./liquid.jsx";
import { normalizeMeetingLink } from "./meetingLink.js";

function Composer({ T, initial, dateLabel, dateKey, onSubmit, onTick, weekStart = 0 }) {
  const editing = !!initial.id;
  const [kind, setKind] = useState(initial.kind || "event");
  const [title, setTitle] = useState(initial.title || "");
  const [cat, setCat] = useState(initial.cat || CATS[0]);
  /* Clamped here too, so no caller — a drag that reached the bottom of the grid, an
     imported entry, a stale draft — can hand the editor a start the day has no room
     for and take the page down with it. */
  const [start, setStart] = useState(initial.start != null ? startSlot(initial.start, 1) : 540);
  const [len, setLen] = useState(initial.dur != null && initial.dur > 0 ? initial.dur : 60);
  const [xp, setXp] = useState(initial.xp || 30);
  const [place, setPlace] = useState(initial.place || "");
  const [link, setLink] = useState(initial.link || "");
  const [note, setNote] = useState(initial.note || "");
  const [at, setAt] = useState(initial.at != null ? initial.at : null);
  const [estimate, setEstimate] = useState(initial.estimate != null ? initial.estimate : null);
  const [due, setDue] = useState(initial.due || "");
  const [allDay, setAllDay] = useState(!!initial.allDay);
  const [endDate, setEndDate] = useState(initial.endDate || "");
  const [alerts, setAlerts] = useState(initial.alerts || []);
  const [repeat, setRepeat] = useState(initial.repeat || null);
  const [date, setDate] = useState(initial.date || dateKey);
  /* §4.7. Arriving here from a detail view's repeat row means the disclosure is
     already the reason you came, so it opens with the panel showing. */
  const [more, setMore] = useState(!!initial.openRepeat);
  /* §1.2. An action captured without a day is what makes the Inbox reachable. */
  const [unplanned, setUnplanned] = useState(initial.kind === "task" && initial.id ? !initial.date : false);
  const [timeZoneMode, setTimeZoneMode] = useState(initial.timeZoneMode || "floating");
  const [timeZone, setTimeZone] = useState(initial.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [startOffset, setStartOffset] = useState(initial.timing?.startOffset || "");
  const [endOffset, setEndOffset] = useState(initial.timing?.endOffset || "");
  /* The editor is the detail view in an editable state, so it borrows the same
     surfaces: filled rounded fields rather than outlined boxes. */
  const surface = isDark(T.bg) ? mixHex(T.card, "#FFFFFF", 0.13) : mixHex(T.card, "#000000", 0.06);
  const field = { background: surface, border: "none", borderRadius: CARD_R };
  const startLocal = `${date}T${`${pad(Math.floor(start / 60))}:${pad(start % 60)}`}`;
  const endLocal = addMinutesToLocalDateTime(startLocal, len);
  const offsetInfo = useMemo(() => {
    if (allDay || timeZoneMode !== "zoned") return { start: [], end: [], valid: true };
    try {
      const startCandidates = getOffsetCandidates(startLocal, timeZone);
      const endCandidates = getOffsetCandidates(endLocal, timeZone);
      return { start: startCandidates, end: endCandidates, valid: startCandidates.length > 0 && endCandidates.length > 0 };
    } catch { return { start: [], end: [], valid: false }; }
  }, [allDay, timeZoneMode, startLocal, endLocal, timeZone]);
  const recurrence = repeat?.freq ? {
    frequency: repeat.freq,
    interval: repeat.interval || 1,
    /* A weekly rule counts its interval in weeks, so which day starts the week
       decides which side of a boundary an occurrence falls on. It has to be the
       same week the grid is drawing. */
    weekStart,
    ...(repeat.freq === "weekly" ? { byWeekday: repeat.byDay || [parseKey(date).getDay()] } : {}),
    ...(repeat.freq === "monthly" && repeat.monthlyMode === "last-weekday" ? { byWeekday: [{ weekday: parseKey(date).getDay(), ordinal: -1 }] } : {}),
    ...(repeat.freq === "monthly" && repeat.monthlyMode !== "last-weekday" ? { byMonthDay: [parseKey(date).getDate()] } : {}),
    ...(repeat.freq === "yearly" ? { byMonth: [parseKey(date).getMonth() + 1], byMonthDay: [parseKey(date).getDate()] } : {}),
    ...(repeat.endMode === "count" ? { count: Math.max(1, Number(repeat.count) || 1) } : repeat.until ? { until: repeat.until } : {}),
    missingDatePolicy: repeat.missingDatePolicy || "skip",
  } : null;
  const timing = allDay
    ? { kind: "all-day", startDate: date, endDateExclusive: addDaysToKey(endDate && endDate >= date ? endDate : date, 1) }
    : {
      kind: "timed", timeZoneMode, startLocal, endLocal,
      ...(timeZoneMode === "zoned" ? {
        timeZone,
        ...(offsetInfo.start.length > 1 ? { startOffset: startOffset || offsetInfo.start[0].offset } : {}),
        ...(offsetInfo.end.length > 1 ? { endOffset: endOffset || offsetInfo.end[0].offset } : {}),
      } : {}),
    };
  /* An empty link is fine; a non-empty one must be something a Join button could
     actually open, so newly typed junk is caught here rather than silently dropped
     on save. A stored value that was already unparseable is let through untouched —
     an unrelated edit must not hold the whole save hostage or erase the field. */
  const linkUntouched = link.trim() === String(initial.link || "").trim();
  const linkOk = kind !== "event" || !link.trim() || !!normalizeMeetingLink(link) || linkUntouched;
  const ok = title.trim().length > 0 && (allDay || offsetInfo.valid) && linkOk;
  const preview = useMemo(() => {
    if (kind !== "event" || !recurrence || !ok) return [];
    try {
      return previewRecurrence({ id: "preview", title: title.trim(), calendarId: "calendar-default", timing, recurrence }, 5);
    } catch { return []; }
  }, [kind, recurrence && JSON.stringify(recurrence), JSON.stringify(timing), ok]);
  const submit = () => {
    if (!ok) return;
    onSubmit({ id: initial.id, date: unplanned && kind === "task" ? null : date, unplanned, kind, title: title.trim(), cat, start: allDay ? 0 : start, dur: allDay ? 0 : len, xp, place, link: normalizeMeetingLink(link), note, at, estimate, due: due || null, allDay, endDate, alerts, repeat: repeat && repeat.freq ? repeat : null, recurrence, timing });
  };
  const toTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fromTime = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const setFreq = (f) => { onTick(); setRepeat(f ? { freq: f, interval: 1, byDay: f === "weekly" ? [parseKey(date).getDay()] : undefined, until: (repeat && repeat.until) || "", endMode: "never", missingDatePolicy: "skip" } : null); };
  const dayFilterId = useRef(`goo-days-${Math.random().toString(36).slice(2, 9)}`).current;
  const [osReducedDays] = useState(() => (
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  ));
  /* On for the whole life of the row rather than only while a run exists. The
     merge is what the filter is for, but toggling it as days are picked meant it
     switched on and off under the user's finger — every chip press flickered the
     whole row. Over chips with nothing adjacent it is invisible anyway. */
  const dayGooOff = osReducedDays;

  const toggleDay = (i) => {
    onTick();
    const days = (repeat.byDay || []).includes(i) ? repeat.byDay.filter((d) => d !== i) : [...(repeat.byDay || []), i].sort();
    setRepeat({ ...repeat, byDay: days });
  };

  return (
    <div data-test="composer" data-composer-kind={kind} className="nb-notch-cascade">
      {!editing && (
        <PillNav T={T} ariaLabel="What to add" value={kind}
          options={[["event", "EVENT"], ["task", "ACTION"]]}
          onPick={(k) => { onTick(); setKind(k); }}
          surface={surface} className="mb-1 p-1 w-full [&>button]:flex-1 [&>button]:py-1.5" />
      )}

      <div key={kind} className={`nb-composer-ask ${kind === "event" ? "text-center" : ""} pt-3 pb-5`}>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={kind === "event" ? "What's happening?" : "What gets finished?"}
          style={{ background: "transparent", border: "none" }}
          className={`w-full text-2xl font-bold tracking-tight leading-tight ${kind === "event" ? "text-center" : ""}`} />
        <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mt-1.5">
          {editing ? "EDITING" : dateLabel}
        </span>
      </div>

      {/* Only what the entry cannot exist without. Everything else waits behind
          "More options", so adding a thing is one decision and refining it is another. */}
      <div className="flex flex-col gap-3">
        {kind === "event" ? (
          <>
            <Chips T={T} surface={surface} value={allDay ? "all" : "timed"} onChange={(v) => { onTick(); setAllDay(v === "all"); }}
              options={[["timed", "AT A TIME"], ["all", "ALL DAY"]]} />
            {!allDay && (
              <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">FROM</span>
                <input aria-label="Start time" type="time" step={60} value={toTime(start)} onChange={(e) => e.target.value && setStart(fromTime(e.target.value))}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                <span style={{ color: T.dimText }} className="text-sm">&#8594;</span>
                <input aria-label="End time" type="time" step={60} value={endLocal.slice(11)} onChange={(e) => {
                  if (!e.target.value) return;
                  setLen(durationFromClockRange(start, fromTime(e.target.value)));
                }} style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data ml-auto shrink-0">{dur(len)}</span>
              </div>
            )}
            {!allDay && (
              <Chips T={T} surface={surface} value={len} onChange={(v) => { onTick(); setLen(v); }}
                options={[[30, "30M"], [60, "1H"], [90, "1H30"], [120, "2H"]]} />
            )}
          </>
        ) : (
          <>
            <Chips T={T} surface={surface} value={unplanned ? "inbox" : "day"} onChange={(v) => { onTick(); setUnplanned(v === "inbox"); }}
              options={[["day", "ON A DAY"], ["inbox", "INBOX"]]} />
            {!unplanned && (
              <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">ON</span>
                <input aria-label="Action date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm flex-1" />
              </div>
            )}
          </>
        )}

        <Chips T={T} surface={surface} value={cat} onChange={(v) => { onTick(); setCat(v); }}
          options={CATS.map((c) => [c, c])} dot={catColor} wrap />
      </div>

      <button onClick={() => { onTick(); setMore(!more); }}
        style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap w-full py-3 nb-data">
        {more ? "Fewer options" : "More options"}
      </button>

      <div data-more-panel style={{
        display: "grid",
        gridTemplateRows: more ? "1fr" : "0fr",
        opacity: more ? 1 : 0,
        overflow: "hidden",
        transition: "grid-template-rows 300ms var(--motion-lane), opacity 200ms ease",
      }}>
        <div className="flex flex-col gap-2 pb-1 min-h-0 overflow-hidden">
          {kind === "event" && allDay && (
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">THROUGH</span>
              <input aria-label="Last event day" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)}
                style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm flex-1" />
            </div>
          )}
          {kind === "event" && !initial.instance && (
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">ON</span>
                <input aria-label="Event day" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
                style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm flex-1" />
            </div>
          )}

          {kind === "event" ? (
            <>
              <Chips T={T} surface={surface} label="REMIND ME" multi value={alerts}
                onChange={(v) => { onTick(); setAlerts(v); }}
                options={ALERT_CHOICES.map((a) => [a, a === 0 ? "AT TIME" : `${a}M`])} wrap />
              <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Where"
                style={{ background: surface, border: "none", borderRadius: CARD_R }} className="w-full px-3 py-2.5 text-sm" />
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Meeting link — Meet, Zoom, Teams…" inputMode="url"
                style={{ background: surface, border: "none", borderRadius: CARD_R }} className="w-full px-3 py-2.5 text-sm" />
              {!linkOk && (
                <span style={{ fontFamily: MONO, color: NOW_RED }} className="px-1 nb-label">DOESN'T LOOK LIKE A LINK</span>
              )}
            </>
          ) : (
            <>
              <Chips T={T} surface={surface} label="REWARD" value={xp} onChange={(v) => { onTick(); setXp(v); }}
                options={[[30, "+30"], [40, "+40"], [50, "+50"], [60, "+60"]]} />
              <DurationPicker T={T} label="ESTIMATE" value={estimate} onPick={(value) => { onTick(); setEstimate(value); }} />
              {!unplanned && (
                <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">AT</span>
                  <input aria-label="Action time" type="time" step={60} value={at != null ? toTime(at) : ""} onChange={(e) => setAt(e.target.value ? fromTime(e.target.value) : null)}
                    style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0 ml-auto">DUE</span>
                  <input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)}
                    style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                </div>
              )}
            </>
          )}

          <Chips T={T} surface={surface} label="REPEATS" value={repeat ? repeat.freq : ""}
            onChange={(v) => setFreq(v)}
            options={[["", "ONCE"], ["daily", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]]} wrap />

          {repeat && (
            <div className="flex flex-col gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">EVERY</span>
                <input type="number" min={1} max={30} value={repeat.interval || 1}
                  onChange={(e) => setRepeat({ ...repeat, interval: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="w-12 text-sm" />
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">
                  {repeat.freq === "daily" ? "DAYS" : repeat.freq === "weekly" ? "WEEKS" : repeat.freq === "monthly" ? "MONTHS" : "YEARS"}
                </span>
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label ml-auto">UNTIL</span>
                <input aria-label="Repeat until" type="date" value={repeat.until || ""} onChange={(e) => setRepeat({ ...repeat, until: e.target.value })}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
              </div>
              {/* The one place the goo says something rather than decorates: a
                  weekly rule of Mon–Wed–Fri is three separate marks, and one of
                  Mon–Tue–Wed is a *run*. Letting adjacent selected days merge
                  into a single bar makes that difference visible at a glance,
                  which is the actual question this control is asking. */}
              {repeat.freq === "weekly" && (
                <div className="flex gap-1" style={{ filter: dayGooOff ? "none" : `url(#${dayFilterId})` }}>
                  {!dayGooOff && <GooeyFilter id={dayFilterId} blur={5} />}
                  {Array.from({ length: 7 }, (_, offset) => (weekStart + offset) % 7).map((i) => {
                    const d = DAY_LETTERS[i];
                    const on = (repeat.byDay || []).includes(i);
                    return (
                      <button key={d} data-test="weekday-chip" data-weekday={i} data-on={on ? "true" : "false"}
                        aria-pressed={on} aria-label={DAY_LETTERS[i]}
                        onClick={() => toggleDay(i)} className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} relative flex-1 py-1 nb-data`}
                        style={{ fontFamily: MONO, borderRadius: 999, background: "transparent", color: on ? T.on : T.dim,
                          border: `1px solid ${on ? "transparent" : T.line}`, transition: "color 260ms ease, border-color 180ms ease" }}>
                        <LiquidFill T={T} on={on} />
                        <span className="relative" style={{ zIndex: 2 }}>{d[0]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Notes"
            style={{ background: surface, border: "none", borderRadius: CARD_R, fontFamily: SERIF, resize: "none" }}
            className="w-full px-3 py-2.5 nb-voice" />
        </div>
      </div>

      <button onClick={submit} disabled={!ok} className="nb-tap nb-liquid nb-hover-control w-full py-3 mt-2 text-xs font-bold tracking-widest"
        style={{ fontFamily: MONO, borderRadius: CARD_R, background: ok ? T.accent : surface, color: ok ? T.on : T.dim, border: "none", transition: "background 180ms ease" }}>
        {editing ? "SAVE CHANGES" : kind === "event" ? "ADD TO TIMELINE" : "ADD ACTION"}
      </button>
    </div>
  );
}

export {
  Composer,
};
