import { getEventsForDay, getOccurrencesForRange } from "../../calendar/index.js";
import { addDaysToKey } from "../../../shared/time/dateKey.js";
import { localDateTimeToEpochMinutes } from "../../../shared/time/localDateTime.js";
import { getDayTasks, getOverdueForToday } from "../../tasks/index.js";
import { getDailyNote, getNotesForDate } from "../../notes/index.js";

/* §2.1/§7. A day is expanded from the series that reach it, not read off the stored
   events. `getEventsForDay` only segments an event that already sits on the day, so
   a recurring series contributed nothing: the day view lost every repeating event,
   and because the agenda still expanded them, tapping one there opened nothing —
   the day it jumped to held no such occurrence. Both views expand the same way now.

   A pre-v5 event carries `date`/`start` instead of `timing`; it has no series to
   expand and still answers to `overrides`, so it keeps the older path. */
function occurrencesOn(state, dateKey, viewerTimeZone) {
  const events = state.events || [];
  const canonical = events.filter((event) => event.timing);
  const legacy = events.filter((event) => !event.timing);
  return [
    ...(canonical.length
      ? getOccurrencesForRange({ ...state, events: canonical }, dateKey, addDaysToKey(dateKey, 1), {
        segments: true, viewerTimeZone,
      })
      : []),
    ...(legacy.length ? getEventsForDay(legacy, dateKey, state.overrides ?? {}, { viewerTimeZone }) : []),
  ].sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || startMinuteOf(a) - startMinuteOf(b));
}

/* An expanded occurrence states its time as a local date-time; a legacy event states
   it as a minute of the day. Ordering and "what is next" need one of the two. */
function startMinuteOf(event) {
  if (Number.isFinite(event.start)) return event.start;
  if (event.timing?.kind === "timed") {
    return ((localDateTimeToEpochMinutes(event.timing.startLocal) % 1440) + 1440) % 1440;
  }
  return 0;
}

const available = (items) => ({ status: "available", items });
const unavailable = (reason) => ({ status: "unavailable", reason });

function read(readSource) {
  try {
    return available(readSource());
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "source is unavailable");
  }
}

/* §1.1. The planner's day is a projection, never another stored aggregate. Each
   domain keeps its own canonical record and this layer keeps its identity intact. */
export function getDayAggregate(state, {
  selectedDate,
  todayDate,
  currentMinute = 0,
  viewerTimeZone,
} = {}) {
  const events = read(() => {
    if (!Array.isArray(state?.events)) throw new TypeError("events are unavailable");
    return occurrencesOn(state, selectedDate, viewerTimeZone);
  });
  const tasks = read(() => {
    if (!Array.isArray(state?.tasks)) throw new TypeError("tasks are unavailable");
    return getDayTasks(state, selectedDate);
  });
  const notes = read(() => {
    if (!Array.isArray(state?.notes)) throw new TypeError("notes are unavailable");
    return getNotesForDate(state.notes, selectedDate);
  });

  const isToday = selectedDate === todayDate;
  /* "What is next" is answered from the same expansion, so a repeating standup can
     be the next thing on the day rather than being skipped over. */
  const nextEvent = isToday && events.status === "available"
    ? events.items.find((event) => !event.allDay && startMinuteOf(event) >= currentMinute) ?? null
    : null;
  const overdue = tasks.status === "available" ? getOverdueForToday(state, todayDate) : [];

  return {
    date: selectedDate,
    isToday,
    events: events.status === "available" ? events.items : [],
    tasks: tasks.status === "available" ? tasks.items : [],
    dailyNote: notes.status === "available" ? getDailyNote(state.notes, selectedDate) : null,
    notes: notes.status === "available" ? notes.items : [],
    overdue,
    nextEvent,
    sections: { events, tasks, notes },
  };
}
