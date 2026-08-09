import { addDaysToKey, assertDateKey } from "../../../shared/time/dateKey.js";
import {
  assertLocalDateTime,
  compareLocalDateTimes,
} from "../../../shared/time/localDateTime.js";
import { assertHalfOpenInterval } from "../../../shared/time/interval.js";
import {
  assertTimeZone,
  projectInstantToLocal,
  resolveZonedDateTime,
} from "../../../shared/time/timezone.js";

function allDayTiming(input) {
  const startDate = assertDateKey(input.startDate, "timing.startDate");
  const endDateExclusive = assertDateKey(input.endDateExclusive, "timing.endDateExclusive");
  assertHalfOpenInterval(startDate, endDateExclusive, (left, right) => left.localeCompare(right), "all-day timing");
  return { kind: "all-day", startDate, endDateExclusive };
}

function timedTiming(input) {
  const timeZoneMode = input.timeZoneMode;
  if (timeZoneMode !== "floating" && timeZoneMode !== "zoned") {
    throw new TypeError("timing.timeZoneMode must be floating or zoned");
  }
  const startLocal = assertLocalDateTime(input.startLocal, "timing.startLocal");
  const endLocal = assertLocalDateTime(input.endLocal, "timing.endLocal");
  if (timeZoneMode === "floating") {
    assertHalfOpenInterval(startLocal, endLocal, compareLocalDateTimes, "timed timing");
    return { kind: "timed", timeZoneMode, startLocal, endLocal };
  }

  const timeZone = assertTimeZone(input.timeZone);
  const start = resolveZonedDateTime(startLocal, timeZone, input.startOffset);
  const end = resolveZonedDateTime(endLocal, timeZone, input.endOffset);
  assertHalfOpenInterval(Date.parse(start.instant), Date.parse(end.instant), (left, right) => left - right, "zoned timing");
  return {
    kind: "timed", timeZoneMode, startLocal, endLocal, timeZone,
    startOffset: start.offset, endOffset: end.offset,
  };
}

export function normalizeTiming(input) {
  if (!input || typeof input !== "object") throw new TypeError("timing is required");
  if (input.kind === "all-day") return allDayTiming(input);
  if (input.kind === "timed") return timedTiming(input);
  throw new TypeError("timing.kind must be all-day or timed");
}

export function timingLocalBounds(timing, viewerTimeZone) {
  const canonical = normalizeTiming(timing);
  if (canonical.kind === "all-day") {
    return { start: `${canonical.startDate}T00:00`, end: `${canonical.endDateExclusive}T00:00` };
  }
  if (canonical.timeZoneMode === "floating" || !viewerTimeZone || viewerTimeZone === canonical.timeZone) {
    return { start: canonical.startLocal, end: canonical.endLocal };
  }
  const start = resolveZonedDateTime(canonical.startLocal, canonical.timeZone, canonical.startOffset);
  const end = resolveZonedDateTime(canonical.endLocal, canonical.timeZone, canonical.endOffset);
  return {
    start: projectInstantToLocal(start.instant, viewerTimeZone).localDateTime,
    end: projectInstantToLocal(end.instant, viewerTimeZone).localDateTime,
  };
}

export function timingStartDate(timing, viewerTimeZone) {
  return timingLocalBounds(timing, viewerTimeZone).start.slice(0, 10);
}

export function timingEndDateExclusive(timing, viewerTimeZone) {
  const canonical = normalizeTiming(timing);
  if (canonical.kind === "all-day") return canonical.endDateExclusive;
  const end = timingLocalBounds(canonical, viewerTimeZone).end;
  return end.endsWith("T00:00") ? end.slice(0, 10) : addDaysToKey(end.slice(0, 10), 1);
}

export function timingIntersectsDate(timing, dateKey, viewerTimeZone) {
  assertDateKey(dateKey);
  const start = timingStartDate(timing, viewerTimeZone);
  const endExclusive = timingEndDateExclusive(timing, viewerTimeZone);
  return start <= dateKey && dateKey < endExclusive;
}
