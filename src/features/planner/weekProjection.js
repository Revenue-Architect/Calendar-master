import {
  getTimedBusyIntervals,
  getVisibleOccurrencesForRange,
  packEventLanes,
} from "../../domains/calendar/index.js";
import { getDayTasks, getUpcomingRange } from "../../domains/tasks/index.js";
import { addDaysToKey } from "../../shared/time/dateKey.js";
import { localDateTimeToEpochMinutes } from "../../shared/time/localDateTime.js";

/* The feature layer owns presentation-safe conversion only — the same contract
   as dayProjection. Every read here goes through the calendar domain's
   visible-occurrence projection, so a hidden, archived or disconnected calendar
   is as absent from the week grid and the month peek as it is from every other
   surface that honours the calendar model. */

/* Segmented reads stamp each per-day segment with its own `date`; fall back to
   the timing's start only for unsegmented occurrences. Bucketing by anything
   else would pile a multi-day event's segments onto its first day. */
const occurrenceDate = (occurrence) => occurrence.date ?? (occurrence.timing.kind === "all-day"
  ? occurrence.timing.startDate
  : occurrence.timing.startLocal.slice(0, 10));

export function projectPlannerWeek(state, {
  weekStart,
  mapEvent = (event) => event,
  viewerTimeZone,
} = {}) {
  const end = addDaysToKey(weekStart, 7);
  const occurrences = getVisibleOccurrencesForRange(state, weekStart, end, { segments: true, viewerTimeZone });
  const tasks = Array.isArray(state?.tasks) ? getUpcomingRange(state, weekStart, 7) : [];
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDaysToKey(weekStart, i);
    const onDay = occurrences.filter((occurrence) => occurrenceDate(occurrence) === key);
    return {
      key,
      allDay: onDay.filter((occurrence) => occurrence.timing.kind === "all-day").map(mapEvent),
      timed: packEventLanes(onDay.filter((occurrence) => occurrence.timing.kind === "timed").map(mapEvent)),
      tasks: tasks.filter((task) => task.planned.date === key && task.planned.startMinute != null),
    };
  });
}

export function projectDayPeek(state, dateKey, {
  mapEvent = (event) => event,
  viewerTimeZone,
} = {}) {
  const occurrences = getVisibleOccurrencesForRange(state, dateKey, addDaysToKey(dateKey, 1), { segments: true, viewerTimeZone });
  return {
    allDay: occurrences.filter((occurrence) => occurrence.timing.kind === "all-day").map(mapEvent),
    timed: occurrences.filter((occurrence) => occurrence.timing.kind === "timed")
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || a.timing.startLocal.localeCompare(b.timing.startLocal))
      .map(mapEvent),
    tasks: Array.isArray(state?.tasks) ? getDayTasks(state, dateKey) : [],
  };
}

/* The month view's free/busy signal: booked minutes inside the working window,
   as a fraction of it. Busyness is an availability question, so it reads through
   `getTimedBusyIntervals` — a visible calendar marked `includeInAvailability:
   false` shows its events but never darkens the heatmap, exactly as it never
   blocks a found slot. Overlaps are merged so a double-booked hour counts once. */
export function busyFractionForDay(state, dateKey, {
  windowStartMinute = 6 * 60,
  windowEndMinute = 22 * 60,
  viewerTimeZone,
} = {}) {
  const dayStart = localDateTimeToEpochMinutes(`${dateKey}T00:00`);
  const clipped = getTimedBusyIntervals(state, dateKey, addDaysToKey(dateKey, 1), { viewerTimeZone })
    .map((interval) => [
      Math.max(interval.start - dayStart, windowStartMinute),
      Math.min(interval.end - dayStart, windowEndMinute),
    ])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let busy = 0;
  let cursor = windowStartMinute;
  for (const [start, end] of clipped) {
    busy += Math.max(0, end - Math.max(start, cursor));
    cursor = Math.max(cursor, end);
  }
  return Math.min(1, busy / (windowEndMinute - windowStartMinute));
}
