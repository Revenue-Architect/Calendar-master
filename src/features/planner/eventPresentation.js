/* Presentation-safe view of a stored event for Planner UI.
 *
 * Kept out of Planner.jsx so day-card duration rules can be tested without
 * mounting the 7k-line orchestrator. A segmented occurrence already states
 * this day's slice as `start`/`dur`; using the full multi-day span for a
 * day-card height is what made overnight and multi-day events overflow the
 * rail. Prefer the slice. If the caller did not segment, clip to the
 * remaining minutes of this date so the rail still cannot overflow.
 *
 * Domain rules stay in calendar/; this file only folds timing into the
 * date/start/dur shape the existing cards already speak.
 */

import { addDaysToKey } from "../../shared/time/dateKey.js";
import { localDateTimeToEpochMinutes } from "../../shared/time/localDateTime.js";

export function recurrenceToRepeat(recurrence) {
  return recurrence ? {
    freq: recurrence.frequency,
    interval: recurrence.interval || 1,
    ...(recurrence.byWeekday ? { byDay: recurrence.byWeekday.map((value) => typeof value === "number" ? value : value.weekday) } : {}),
    until: recurrence.until || "",
    ...(recurrence.count ? { count: recurrence.count } : {}),
    endMode: recurrence.count ? "count" : recurrence.until ? "until" : "never",
    missingDatePolicy: recurrence.missingDatePolicy || "skip",
    ...(recurrence.frequency === "monthly" ? { monthlyMode: recurrence.byWeekday?.some((value) => typeof value === "object" && value.ordinal === -1) ? "last-weekday" : "day" } : {}),
  } : null;
}

export function eventForUi(event) {
  if (!event?.timing) return event;
  const repeat = recurrenceToRepeat(event.recurrence);
  if (event.timing.kind === "all-day") {
    return {
      ...event,
      date: event.date || event.timing.startDate,
      allDay: true,
      start: 0,
      dur: event.dur || 1440,
      endDate: addDaysToKey(event.timing.endDateExclusive, -1),
      repeat,
    };
  }
  const start = localDateTimeToEpochMinutes(event.timing.startLocal);
  const end = localDateTimeToEpochMinutes(event.timing.endLocal);
  const startMinute = event.start ?? ((start % 1440) + 1440) % 1440;
  const fullSpan = end - start;
  const dur = Number.isFinite(event.dur) && event.dur > 0
    ? event.dur
    : Math.min(fullSpan, 1440 - startMinute);
  return {
    ...event,
    date: event.date || event.timing.startLocal.slice(0, 10),
    allDay: false,
    start: startMinute,
    dur,
    endDate: event.timing.endLocal.slice(0, 10),
    repeat,
    timeZoneMode: event.timing.timeZoneMode,
    timeZone: event.timing.timeZone || "",
  };
}
