import { addDaysToKey, assertDateKey } from "../../../shared/time/dateKey.js";
import { localDateTimeToEpochMinutes } from "../../../shared/time/localDateTime.js";
import { timingLocalBounds } from "../model/timing.js";
import { getOccurrencesForRange } from "./occurrenceQueries.js";

function activeCalendar(calendar) {
  return calendar && calendar.status !== "archived" && calendar.status !== "disconnected";
}

function selectedCalendarIds(state, { calendarIds = null, availabilityOnly = false } = {}) {
  if (calendarIds != null && !Array.isArray(calendarIds)) throw new TypeError("calendarIds must be an array or null");
  const requested = calendarIds == null ? null : new Set(calendarIds);
  return new Set((state?.calendars ?? [])
    .filter(activeCalendar)
    .filter((calendar) => calendar.isVisible !== false)
    .filter((calendar) => !availabilityOnly || calendar.includeInAvailability !== false)
    .filter((calendar) => requested == null || requested.has(calendar.id))
    .map((calendar) => calendar.id));
}

/* A notebook that declares no calendars has no calendar to hide anything by, so
   the visibility filter has no opinion and must not remove a thing. Filtering
   against an empty roster would erase every event in the notebook — an empty day
   is a far worse answer than an unfiltered one, and it would be silent.
   An explicit `calendarIds` request is different: the caller named what it wants,
   so it still narrows, matched against the events' own calendar ids. */
function visibleState(state, options = {}) {
  const calendarIds = selectedCalendarIds(state, options);
  const events = state?.events ?? [];
  const hasRoster = Array.isArray(state?.calendars) && state.calendars.length > 0;
  if (!hasRoster) {
    const requested = options.calendarIds == null ? null : new Set(options.calendarIds);
    return {
      calendarIds,
      state: requested == null
        ? state
        : { ...state, events: events.filter((event) => requested.has(event.calendarId)) },
    };
  }
  return {
    calendarIds,
    state: { ...state, events: events.filter((event) => calendarIds.has(event.calendarId)) },
  };
}

function intervalFromOccurrence(occurrence, viewerTimeZone) {
  const bounds = timingLocalBounds(occurrence.timing, viewerTimeZone);
  return {
    id: occurrence.id,
    eventId: occurrence.seriesId ?? occurrence.id,
    calendarId: occurrence.calendarId,
    occurrence,
    startLocal: bounds.start,
    endLocal: bounds.end,
    start: localDateTimeToEpochMinutes(bounds.start),
    end: localDateTimeToEpochMinutes(bounds.end),
  };
}

function clipIntervalToRange(interval, startDate, endDateExclusive) {
  const start = localDateTimeToEpochMinutes(`${startDate}T00:00`);
  const end = localDateTimeToEpochMinutes(`${endDateExclusive}T00:00`);
  return { ...interval, start: Math.max(start, interval.start), end: Math.min(end, interval.end) };
}

function compareIntervals(left, right) {
  return left.start - right.start || left.end - right.end || String(left.id).localeCompare(String(right.id));
}

function mergeIntervals(intervals) {
  const merged = [];
  for (const interval of [...intervals].sort(compareIntervals)) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }
  return merged;
}

function assertWorkingWindow({ startMinute = 540, endMinute = 1020, minimumDurationMinutes = 30 } = {}) {
  for (const [name, value] of Object.entries({ startMinute, endMinute, minimumDurationMinutes })) {
    if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer`);
  }
  if (startMinute < 0 || startMinute >= 1440 || endMinute <= startMinute || endMinute > 1440) {
    throw new RangeError("working window must fit within one day");
  }
  if (minimumDurationMinutes < 1 || minimumDurationMinutes > 1440) {
    throw new RangeError("minimumDurationMinutes must be between 1 and 1440");
  }
  return { startMinute, endMinute, minimumDurationMinutes };
}

export function getVisibleCalendarIds(state, options = {}) {
  return [...selectedCalendarIds(state, options)].sort();
}

export function getVisibleOccurrencesForRange(state, startDate, endDateExclusive, options = {}) {
  const { state: filtered } = visibleState(state, options);
  return getOccurrencesForRange(filtered, startDate, endDateExclusive, options);
}

export function getTimedBusyIntervals(state, startDate, endDateExclusive, options = {}) {
  const { state: filtered } = visibleState(state, { ...options, availabilityOnly: true });
  return getOccurrencesForRange(filtered, startDate, endDateExclusive, options)
    .filter((occurrence) => occurrence.timing.kind === "timed")
    .map((occurrence) => clipIntervalToRange(
      intervalFromOccurrence(occurrence, options.viewerTimeZone), startDate, endDateExclusive,
    ))
    .filter((interval) => interval.end > interval.start)
    .sort(compareIntervals);
}

export function getCalendarConflicts(state, startDate, endDateExclusive, options = {}) {
  const intervals = getTimedBusyIntervals(state, startDate, endDateExclusive, options);
  const conflicts = [];
  for (let leftIndex = 0; leftIndex < intervals.length; leftIndex += 1) {
    const left = intervals[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < intervals.length; rightIndex += 1) {
      const right = intervals[rightIndex];
      if (right.start >= left.end) break;
      const overlapMinutes = Math.min(left.end, right.end) - right.start;
      if (overlapMinutes > 0) conflicts.push({ left, right, overlapMinutes });
    }
  }
  return conflicts;
}

export function getFreeSlotsForDay(state, dateKey, options = {}) {
  assertDateKey(dateKey);
  const window = assertWorkingWindow(options);
  const rangeEnd = addDaysToKey(dateKey, 1);
  const dayStart = localDateTimeToEpochMinutes(`${dateKey}T00:00`);
  const windowStart = dayStart + window.startMinute;
  const windowEnd = dayStart + window.endMinute;
  const busy = getTimedBusyIntervals(state, dateKey, rangeEnd, options)
    .map((interval) => ({ start: Math.max(windowStart, interval.start), end: Math.min(windowEnd, interval.end) }))
    .filter((interval) => interval.end > interval.start);
  const slots = [];
  let cursor = windowStart;
  for (const interval of mergeIntervals(busy)) {
    if (interval.start - cursor >= window.minimumDurationMinutes) {
      slots.push({
        date: dateKey,
        startMinute: cursor - dayStart,
        endMinute: interval.start - dayStart,
        durationMinutes: interval.start - cursor,
      });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (windowEnd - cursor >= window.minimumDurationMinutes) {
    slots.push({
      date: dateKey,
      startMinute: cursor - dayStart,
      endMinute: windowEnd - dayStart,
      durationMinutes: windowEnd - cursor,
    });
  }
  return slots;
}

export function getCalendarBriefing(state, dateKey, {
  currentMinute = 0,
  workingHours = {},
  viewerTimeZone,
  calendarIds = null,
} = {}) {
  assertDateKey(dateKey);
  if (!Number.isInteger(currentMinute) || currentMinute < 0 || currentMinute > 1440) {
    throw new RangeError("currentMinute must be between 0 and 1440");
  }
  const endExclusive = addDaysToKey(dateKey, 1);
  const projectionOptions = { viewerTimeZone, calendarIds };
  const occurrences = getVisibleOccurrencesForRange(state, dateKey, endExclusive, projectionOptions);
  const timed = occurrences.filter((occurrence) => occurrence.timing.kind === "timed")
    .map((occurrence) => clipIntervalToRange(
      intervalFromOccurrence(occurrence, viewerTimeZone), dateKey, endExclusive,
    )).filter((interval) => interval.end > interval.start).sort(compareIntervals);
  const dayStart = localDateTimeToEpochMinutes(`${dateKey}T00:00`);
  const busy = mergeIntervals(timed).reduce((total, interval) => total + interval.end - interval.start, 0);
  return {
    date: dateKey,
    visibleCalendarIds: getVisibleCalendarIds(state, { calendarIds }),
    eventCount: occurrences.length,
    allDay: occurrences.filter((occurrence) => occurrence.timing.kind === "all-day"),
    timed,
    busyMinutes: busy,
    firstTimed: timed[0]?.occurrence ?? null,
    nextTimed: timed.find((interval) => interval.start >= dayStart + currentMinute)?.occurrence ?? null,
    conflicts: getCalendarConflicts(state, dateKey, endExclusive, projectionOptions),
    freeSlots: getFreeSlotsForDay(state, dateKey, { ...workingHours, viewerTimeZone, calendarIds }),
    scheduleVariance: { status: "unavailable", reason: "event attendance is not recorded" },
  };
}
