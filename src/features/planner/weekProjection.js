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

/* The month, in two queries instead of eighty-four.
 *
 * A month grid is 42 cells, and each one used to ask the domain two questions of
 * its own: what occurs on this day, and how much of its working window is
 * booked. Every one of those is a range query that walks the recurrence rules
 * from scratch, so stepping one month forward cost 84 of them — about a tenth of
 * a second of blocked main thread on a small notebook, and far worse on a real
 * one, all of it spent re-deriving the same six weeks over and over.
 *
 * These ask once for the whole grid and hand back a lookup. The arithmetic per
 * day is unchanged — `busyFractionsForRange` computes exactly what
 * `busyFractionForDay` does, and there is a test asserting they agree — the only
 * difference is how many times the recurrence expansion runs.
 */
export function monthDensitiesForRange(state, startDate, days, { calendarIds } = {}) {
  const counts = new Map();
  if (!state || days <= 0) return counts;
  const endExclusive = addDaysToKey(startDate, days);
  for (let key = startDate; key < endExclusive; key = addDaysToKey(key, 1)) counts.set(key, 0);

  /* `segments: true` matters and is not an optimisation detail. Asked for one
     day, a range query returns a multi-day event once because it overlaps that
     day — so each of the days it spans counts it. Asked for six weeks it would
     also return it once, and only its first day would count it. Segmenting makes
     the wide read say the same thing as the narrow ones. */
  for (const occurrence of getVisibleOccurrencesForRange(state, startDate, endExclusive, { calendarIds, segments: true })) {
    const key = occurrenceDate(occurrence);
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
  }
  /* Tasks still go a day at a time: `getDayTasks` materialises a recurring task's
     occurrence for a specific date, and there is no range form of that to call.
     It walks the task list rather than expanding calendar recurrence, which is
     the cheap half of what the month was paying for. */
  for (let key = startDate; key < endExclusive; key = addDaysToKey(key, 1)) {
    const open = getDayTasks(state, key).filter((task) => task.status !== "completed").length;
    counts.set(key, counts.get(key) + open);
  }
  return counts;
}

export function busyFractionsForRange(state, startDate, days, {
  windowStartMinute = 6 * 60,
  windowEndMinute = 22 * 60,
  viewerTimeZone,
} = {}) {
  const fractions = new Map();
  if (!state || days <= 0) return fractions;
  const endExclusive = addDaysToKey(startDate, days);

  const perDay = new Map();
  for (let key = startDate; key < endExclusive; key = addDaysToKey(key, 1)) perDay.set(key, []);

  /* One expansion for the whole grid; each interval is then clipped into every
     day it touches, so an event running past midnight still counts on both. */
  for (const interval of getTimedBusyIntervals(state, startDate, endExclusive, { viewerTimeZone })) {
    for (const [key, list] of perDay) {
      const dayStart = localDateTimeToEpochMinutes(`${key}T00:00`);
      const start = Math.max(interval.start - dayStart, windowStartMinute);
      const end = Math.min(interval.end - dayStart, windowEndMinute);
      if (end > start) list.push([start, end]);
    }
  }

  const span = windowEndMinute - windowStartMinute;
  for (const [key, list] of perDay) {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let busy = 0;
    let cursor = windowStartMinute;
    for (const [start, end] of list) {
      busy += Math.max(0, end - Math.max(start, cursor));
      cursor = Math.max(cursor, end);
    }
    fractions.set(key, Math.min(1, busy / span));
  }
  return fractions;
}
