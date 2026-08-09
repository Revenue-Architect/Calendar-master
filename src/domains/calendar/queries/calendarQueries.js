import {
  addDaysToKey,
  assertDateKey,
} from "../../../shared/time/dateKey.js";
import { expandEventOnDay } from "../recurrence/recurrence.js";
import { segmentOccurrence } from "../segmentation/segmentOccurrence.js";

function compareEvents(left, right) {
  if (left.date !== right.date) return left.date < right.date ? -1 : 1;
  if (Boolean(left.allDay) !== Boolean(right.allDay)) return left.allDay ? -1 : 1;
  const start = (left.start || 0) - (right.start || 0);
  if (start !== 0) return start;
  return String(left.id).localeCompare(String(right.id));
}

export function getEventsForDay(events, dateKey, overrides = {}, options = {}) {
  assertDateKey(dateKey);
  return events
    .flatMap((event) => event.timing
      ? segmentOccurrence(event, dateKey, addDaysToKey(dateKey, 1), options.viewerTimeZone)
      : expandEventOnDay(event, dateKey, overrides))
    .sort(compareEvents);
}

export function getEventsForRange(events, startDate, endDate, overrides = {}) {
  assertDateKey(startDate, "start date");
  assertDateKey(endDate, "end date");
  if (endDate < startDate) throw new RangeError("end date must be on or after start date");

  const results = [];
  for (let dateKey = startDate; dateKey <= endDate; dateKey = addDaysToKey(dateKey, 1)) {
    results.push(...getEventsForDay(events, dateKey, overrides));
  }
  return results.sort(compareEvents);
}

export function getCalendarDensity(events, dateKey, overrides = {}) {
  return getEventsForDay(events, dateKey, overrides).length;
}

export function getNextEvent(events, dateKey, minute, overrides = {}) {
  if (!Number.isFinite(minute) || minute < 0 || minute > 1440) {
    throw new RangeError("minute must be between 0 and 1440");
  }
  return getEventsForDay(events, dateKey, overrides)
    .find((event) => !event.allDay && event.start >= minute) || null;
}

export function getEventSegmentsForDay(events, dateKey, options = {}) {
  return getEventsForDay(events, dateKey, options.overrides || {}, options);
}

export function getEventSegmentsForRange(events, startDate, endDateExclusive, options = {}) {
  assertDateKey(startDate, "start date");
  assertDateKey(endDateExclusive, "end date");
  if (endDateExclusive <= startDate) throw new RangeError("end date must be after start date");
  return events
    .flatMap((event) => event.timing
      ? segmentOccurrence(event, startDate, endDateExclusive, options.viewerTimeZone)
      : getEventsForRange([event], startDate, addDaysToKey(endDateExclusive, -1), options.overrides || {}))
    .sort(compareEvents);
}
