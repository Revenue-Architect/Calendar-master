import {
  addDaysToKey,
  assertDateKey,
  diffDays,
  parseKey,
} from "../../../shared/time/dateKey.js";

function recurrenceInterval(repeat) {
  const interval = Number(repeat?.interval ?? 1);
  return Number.isInteger(interval) && interval > 0 ? interval : 1;
}

function occurrence(event, recurrenceDate, override = {}) {
  return {
    ...event,
    ...override,
    id: makeOccurrenceId(event.id, recurrenceDate),
    seriesId: event.id,
    recurrenceDate,
    date: override.date || recurrenceDate,
    instance: true,
  };
}

export function makeOccurrenceId(seriesId, recurrenceDate) {
  if (typeof seriesId !== "string" || !seriesId.trim() || seriesId.includes("@")) {
    throw new TypeError("series ID must be a non-empty ID without @");
  }
  return `${seriesId}@${assertDateKey(recurrenceDate, "recurrence date")}`;
}

export function splitOccurrenceId(id) {
  const value = String(id);
  const separator = value.lastIndexOf("@");
  if (separator <= 0) return { seriesId: value, recurrenceDate: null };

  const recurrenceDate = value.slice(separator + 1);
  try {
    assertDateKey(recurrenceDate, "recurrence date");
  } catch {
    return { seriesId: value, recurrenceDate: null };
  }

  return { seriesId: value.slice(0, separator), recurrenceDate };
}

export function occursOn(event, dateKey) {
  assertDateKey(event.date, "event date");
  assertDateKey(dateKey);
  if (dateKey < event.date) return false;

  const repeat = event.repeat;
  if (!repeat) return event.date === dateKey;
  if (repeat.until && dateKey > assertDateKey(repeat.until, "recurrence until")) return false;

  const interval = recurrenceInterval(repeat);
  const candidate = parseKey(dateKey);
  const start = parseKey(event.date);

  if (repeat.freq === "daily") {
    return diffDays(dateKey, event.date) % interval === 0;
  }

  if (repeat.freq === "weekly") {
    const weekdays = Array.isArray(repeat.byDay) && repeat.byDay.length
      ? repeat.byDay
      : [start.getDay()];
    if (!weekdays.includes(candidate.getDay())) return false;
    const startWeek = addDaysToKey(event.date, -start.getDay());
    const candidateWeek = addDaysToKey(dateKey, -candidate.getDay());
    return Math.floor(diffDays(candidateWeek, startWeek) / 7) % interval === 0;
  }

  if (repeat.freq === "monthly") {
    if (candidate.getDate() !== start.getDate()) return false;
    const months = (candidate.getFullYear() - start.getFullYear()) * 12
      + candidate.getMonth() - start.getMonth();
    return months % interval === 0;
  }

  return false;
}

export function expandEventOnDay(event, dateKey, overrides = {}) {
  assertDateKey(dateKey);

  if (!event.repeat) {
    const withinAllDaySpan = event.allDay
      && event.endDate
      && event.date <= dateKey
      && dateKey <= event.endDate;
    return event.date === dateKey || withinAllDaySpan ? [{ ...event }] : [];
  }

  const results = [];
  if (occursOn(event, dateKey)) {
    const id = makeOccurrenceId(event.id, dateKey);
    const override = overrides[id] || {};
    if (!override.deleted && (!override.date || override.date === dateKey)) {
      results.push(occurrence(event, dateKey, override));
    }
  }

  const prefix = `${event.id}@`;
  for (const [id, override] of Object.entries(overrides)) {
    if (!id.startsWith(prefix) || override.deleted || override.date !== dateKey) continue;
    const { seriesId, recurrenceDate } = splitOccurrenceId(id);
    if (seriesId !== event.id || !recurrenceDate || recurrenceDate === dateKey) continue;
    if (!occursOn(event, recurrenceDate)) continue;
    results.push(occurrence(event, recurrenceDate, override));
  }

  return results;
}
