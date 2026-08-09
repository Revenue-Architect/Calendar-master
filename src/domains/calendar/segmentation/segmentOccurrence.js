import { addDaysToKey, assertDateKey } from "../../../shared/time/dateKey.js";
import { parseLocalDateTime } from "../../../shared/time/localDateTime.js";
import { normalizeTiming, timingLocalBounds } from "../model/timing.js";

function minuteOf(localDateTime) {
  const { hour, minute } = parseLocalDateTime(localDateTime);
  return hour * 60 + minute;
}

export function segmentOccurrence(occurrence, rangeStart, rangeEndExclusive, viewerTimeZone) {
  assertDateKey(rangeStart, "range start");
  assertDateKey(rangeEndExclusive, "range end");
  if (rangeEndExclusive <= rangeStart) throw new RangeError("range end must be after range start");
  const timing = normalizeTiming(occurrence?.timing);
  const segments = [];

  if (timing.kind === "all-day") {
    const start = timing.startDate < rangeStart ? rangeStart : timing.startDate;
    const end = timing.endDateExclusive > rangeEndExclusive ? rangeEndExclusive : timing.endDateExclusive;
    for (let date = start; date < end; date = addDaysToKey(date, 1)) {
      segments.push({
        ...occurrence, segmentId: `${occurrence.id}:${date}`, date, allDay: true,
        start: 0, dur: 1440, endDate: addDaysToKey(timing.endDateExclusive, -1),
        continuesBefore: date > timing.startDate,
        continuesAfter: addDaysToKey(date, 1) < timing.endDateExclusive,
      });
    }
    return segments;
  }

  const bounds = timingLocalBounds(timing, viewerTimeZone);
  const firstDate = bounds.start.slice(0, 10) < rangeStart ? rangeStart : bounds.start.slice(0, 10);
  const lastDate = bounds.end.slice(0, 10);
  for (let date = firstDate; date < rangeEndExclusive && date <= lastDate; date = addDaysToKey(date, 1)) {
    const isFirst = date === bounds.start.slice(0, 10);
    const isLast = date === lastDate;
    const start = isFirst ? minuteOf(bounds.start) : 0;
    const end = isLast ? minuteOf(bounds.end) : 1440;
    if (end <= start) continue;
    segments.push({
      ...occurrence, segmentId: `${occurrence.id}:${date}`, date, allDay: false,
      start, dur: end - start,
      continuesBefore: date > bounds.start.slice(0, 10),
      continuesAfter: date < lastDate,
    });
  }
  return segments;
}
