import { getEventsForDay, getNextEvent } from "../../calendar/index.js";
import { getDayTasks, getOverdueForToday } from "../../tasks/index.js";
import { getDailyNote, getNotesForDate } from "../../notes/index.js";

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
    return getEventsForDay(state.events, selectedDate, state.overrides ?? {}, { viewerTimeZone });
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
  const nextEvent = isToday && events.status === "available"
    ? getNextEvent(state.events, selectedDate, currentMinute, state.overrides ?? {})
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
