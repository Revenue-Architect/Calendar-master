import {
  assertLocalDateTime,
  localDateTimeToEpochMinutes,
} from "./localDateTime.js";

const formatterCache = new Map();
const MINUTE_MS = 60_000;

function formatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }));
  }
  return formatterCache.get(timeZone);
}

function projectedParts(instant, timeZone) {
  const values = Object.fromEntries(
    formatter(timeZone).formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute),
  };
}

function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function isTimeZone(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    formatter(value);
    return true;
  } catch {
    formatterCache.delete(value);
    return false;
  }
}

export function assertTimeZone(value) {
  if (!isTimeZone(value)) throw new TypeError("time zone must be a valid IANA time zone");
  return value;
}

export function projectInstantToLocal(instant, timeZone) {
  assertTimeZone(timeZone);
  const instantMs = typeof instant === "string" ? Date.parse(instant) : Number(instant);
  if (!Number.isFinite(instantMs)) throw new TypeError("instant must be an ISO instant or epoch milliseconds");
  const parts = projectedParts(instantMs, timeZone);
  const localDateTime = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  const projectedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const offsetMinutes = Math.round((projectedUtc - instantMs) / MINUTE_MS);
  return { localDateTime, offset: formatOffset(offsetMinutes) };
}

export function getOffsetCandidates(localDateTime, timeZone) {
  assertLocalDateTime(localDateTime, "local date-time");
  assertTimeZone(timeZone);
  const nominalMinutes = localDateTimeToEpochMinutes(localDateTime);
  const candidates = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const instantMs = (nominalMinutes - offsetMinutes) * MINUTE_MS;
    const projected = projectInstantToLocal(instantMs, timeZone);
    if (projected.localDateTime === localDateTime && !candidates.some((item) => item.instant === new Date(instantMs).toISOString())) {
      candidates.push({ instant: new Date(instantMs).toISOString(), offset: formatOffset(offsetMinutes) });
    }
  }
  return candidates.sort((left, right) => left.instant.localeCompare(right.instant));
}

export function detectLocalTimeStatus(localDateTime, timeZone) {
  const count = getOffsetCandidates(localDateTime, timeZone).length;
  return count === 0 ? "skipped" : count === 1 ? "valid" : "ambiguous";
}

export function resolveZonedDateTime(localDateTime, timeZone, preferredOffset) {
  const candidates = getOffsetCandidates(localDateTime, timeZone);
  if (!candidates.length) throw new RangeError(`${localDateTime} does not exist in ${timeZone}`);
  if (preferredOffset != null) {
    const selected = candidates.find((candidate) => candidate.offset === preferredOffset);
    if (!selected) throw new RangeError(`${preferredOffset} is not valid for ${localDateTime} in ${timeZone}`);
    return selected;
  }
  if (candidates.length > 1) throw new RangeError(`${localDateTime} is ambiguous in ${timeZone}; choose an offset`);
  return candidates[0];
}
