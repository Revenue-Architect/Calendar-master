import { addDaysToKey, assertDateKey, diffDays } from "../../../shared/time/dateKey.js";
import { timingEndDateExclusive, timingStartDate } from "../model/timing.js";
import { expandSeries, generateRecurrenceAnchors } from "../recurrence/expandRecurrence.js";
import { parseOccurrenceId } from "../recurrence/occurrenceIdentity.js";
import { resolveOccurrenceAlias } from "../recurrence/splitSeries.js";
import { segmentOccurrence } from "../segmentation/segmentOccurrence.js";

function startValue(occurrence) {
  return occurrence.timing.kind === "all-day" ? `${occurrence.timing.startDate}T00:00` : occurrence.timing.startLocal;
}

function compareOccurrences(left, right) {
  return startValue(left).localeCompare(startValue(right)) || String(left.id).localeCompare(String(right.id));
}

export function getOccurrencesForRange(state, start, endExclusive, options = {}) {
  assertDateKey(start, "range start");
  assertDateKey(endExclusive, "range end");
  if (endExclusive <= start) throw new RangeError("range end must be after range start");
  const exceptions = state.eventExceptions || [];
  const occurrences = (state.events || []).flatMap((event) => {
    const eventStart = timingStartDate(event.timing, options.viewerTimeZone);
    const eventEnd = timingEndDateExclusive(event.timing, options.viewerTimeZone);
    const lookback = Math.max(0, diffDays(eventEnd, eventStart) - 1);
    return expandSeries(
      event,
      exceptions.filter((item) => item.seriesId === event.id),
      { start: addDaysToKey(start, -lookback), endExclusive },
      { limit: options.limit || 10_000 },
    );
  }).filter((occurrence) => timingStartDate(occurrence.timing, options.viewerTimeZone) < endExclusive
    && timingEndDateExclusive(occurrence.timing, options.viewerTimeZone) > start);
  const seen = new Set(occurrences.map((occurrence) => occurrence.id));
  for (const exception of exceptions.filter((item) => item.type === "moved" && !seen.has(item.occurrenceId))) {
    if (timingStartDate(exception.timing, options.viewerTimeZone) >= endExclusive
      || timingEndDateExclusive(exception.timing, options.viewerTimeZone) <= start) continue;
    const event = (state.events || []).find((item) => item.id === exception.seriesId);
    if (!event) continue;
    const anchorDate = exception.recurrenceAnchor.slice(0, 10);
    if (!generateRecurrenceAnchors(event, anchorDate, addDaysToKey(anchorDate, 1)).includes(exception.recurrenceAnchor)) continue;
    occurrences.push({
      ...event,
      ...(exception.patch || {}),
      timing: exception.timing,
      id: exception.occurrenceId,
      seriesId: event.id,
      recurrenceAnchor: exception.recurrenceAnchor,
      instance: true,
    });
  }
  occurrences.sort(compareOccurrences);
  if (!options.segments) return occurrences;
  return occurrences.flatMap((occurrence) => segmentOccurrence(occurrence, start, endExclusive, options.viewerTimeZone));
}

export function getOccurrence(state, occurrenceId, options = {}) {
  const resolution = resolveOccurrenceAlias(state.occurrenceAliases || [], occurrenceId);
  if (resolution.status === "cycle" || resolution.status === "limit") return null;
  const resolvedId = resolution.occurrenceId;
  const added = (state.eventExceptions || []).find((item) => item.type === "added" && item.occurrenceId === resolvedId);
  if (added) return { ...added.event, id: resolvedId, seriesId: added.seriesId, recurrenceAnchor: null, instance: true, added: true };
  let parsed;
  try { parsed = parseOccurrenceId(resolvedId); } catch { return null; }
  const date = parsed.anchor.slice(0, 10);
  return getOccurrencesForRange(state, date, addDaysToKey(date, 1), options)
    .find((item) => item.id === resolvedId) || null;
}

/* Search and navigation need one source-owned answer for an event series. The
   query advances in yearly windows so a long-running daily series never expands
   tens of thousands of instances merely to find its next valid occurrence. */
export function getNextEventOccurrence(state, eventId, fromDate, options = {}) {
  assertDateKey(fromDate, "fromDate");
  if (typeof eventId !== "string" || !eventId) throw new TypeError("eventId is required");
  const maxYears = options.maxYears ?? 30;
  if (!Number.isInteger(maxYears) || maxYears < 0 || maxYears > 30) {
    throw new RangeError("maxYears must be an integer between 0 and 30");
  }
  if (!(state.events ?? []).some((event) => event.id === eventId)) return null;

  let start = fromDate;
  for (let year = 0; year <= maxYears; year += 1) {
    const endExclusive = addDaysToKey(start, 366);
    const found = getOccurrencesForRange(state, start, endExclusive, options)
      .find((occurrence) => (occurrence.seriesId ?? occurrence.id) === eventId);
    if (found) return found;
    start = endExclusive;
  }
  return null;
}

export function previewRecurrence(event, limit = 5, options = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("preview limit must be between 1 and 100");
  const start = timingStartDate(event.timing);
  const endExclusive = addDaysToKey(start, 36_525);
  return expandSeries(event, [], { start, endExclusive }, { limit }).slice(0, limit);
}

export function getSeriesExceptions(state, seriesId) {
  return (state.eventExceptions || []).filter((item) => item.seriesId === seriesId);
}

export function getOrphanedExceptions(state, seriesId) {
  const event = (state.events || []).find((item) => item.id === seriesId);
  if (!event) return getSeriesExceptions(state, seriesId);
  return getSeriesExceptions(state, seriesId).filter((exception) => {
    if (exception.type === "added") return false;
    const date = exception.recurrenceAnchor.slice(0, 10);
    return !generateRecurrenceAnchors(event, date, addDaysToKey(date, 1)).includes(exception.recurrenceAnchor);
  });
}
