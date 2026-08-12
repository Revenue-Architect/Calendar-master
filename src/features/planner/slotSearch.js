import { getTimedBusyIntervals } from "../../domains/calendar/index.js";
import { getUpcomingRange } from "../../domains/tasks/index.js";
import { addDaysToKey } from "../../shared/time/dateKey.js";
import { localDateTimeToEpochMinutes } from "../../shared/time/localDateTime.js";

/* "Find a slot": given a duration, the next open gaps across the coming days.

   Busyness comes from the calendar domain's availability projection —
   `getTimedBusyIntervals` — so hidden calendars, archived/disconnected ones and
   calendars marked `includeInAvailability: false` never block a slot, exactly as
   the rest of the app reads free/busy. Timed actions are deliberately added as
   blockers on top: a 9:00 action with a 30-minute estimate is time you have
   already spent, even though it is not a calendar event.

   Each gap contributes its earliest fitting start, clipped to the working
   window. The sweep is a cursor over sorted intervals, so overlapping busy
   blocks merge naturally as the cursor only ever moves forward. */
export function findOpenSlots(state, {
  fromDate,
  todayDate = fromDate,
  currentMinute = 0,
  durationMinutes,
  days = 14,
  limit = 12,
  windowStartMinute = 6 * 60,
  windowEndMinute = 22 * 60,
  viewerTimeZone,
} = {}) {
  if (!state || !fromDate || !durationMinutes || durationMinutes <= 0) return [];
  const tasks = Array.isArray(state.tasks) ? getUpcomingRange(state, fromDate, days) : [];
  const slots = [];
  for (let i = 0; i < days && slots.length < limit; i += 1) {
    const key = addDaysToKey(fromDate, i);
    /* A week can begin before today. Those dates are useful for reading the
       calendar, but offering a booking slot in the past is not useful. The
       cursor's "now" rule is keyed to the actual date rather than array index,
       so a Sunday-starting week does not accidentally treat Sunday as today. */
    if (todayDate && key < todayDate) continue;
    const dayStart = localDateTimeToEpochMinutes(`${key}T00:00`);
    const busy = [
      ...getTimedBusyIntervals(state, key, addDaysToKey(key, 1), { viewerTimeZone })
        .map((interval) => [interval.start - dayStart, interval.end - dayStart]),
      ...tasks
        .filter((task) => task.planned.date === key && task.planned.startMinute != null)
        .map((task) => [task.planned.startMinute, task.planned.startMinute + (task.planned.estimateMinutes ?? 30)]),
    ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    /* Today never offers a slot in the past; it starts at "now", rounded up to
       the next quarter hour so a suggested start is one you could actually say
       out loud in a meeting invite. */
    let cursor = Math.max(windowStartMinute, key === todayDate ? Math.ceil(currentMinute / 15) * 15 : windowStartMinute);
    for (const [start, end] of busy) {
      if (cursor >= windowEndMinute) break;
      const gapEnd = Math.min(start, windowEndMinute);
      if (slots.length < limit && gapEnd - cursor >= durationMinutes) {
        slots.push({ date: key, start: cursor, dur: durationMinutes });
      }
      cursor = Math.max(cursor, end);
    }
    if (slots.length < limit && windowEndMinute - cursor >= durationMinutes) {
      slots.push({ date: key, start: cursor, dur: durationMinutes });
    }
  }
  return slots;
}
