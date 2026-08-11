import {
  addDaysToKey,
  assertDateKey,
  diffDays,
} from "../../../shared/time/dateKey.js";
import {
  addMinutesToLocalDateTime,
  localDateTimeToEpochMinutes,
} from "../../../shared/time/localDateTime.js";
import { getOffsetCandidates } from "../../../shared/time/timezone.js";
import { normalizeRecurrenceRule } from "../model/recurrenceRule.js";
import { normalizeTiming, timingEndDateExclusive, timingStartDate } from "../model/timing.js";
import { makeOccurrenceId } from "./occurrenceIdentity.js";

function dateParts(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthDifference(candidate, start) {
  return (candidate.year - start.year) * 12 + candidate.month - start.month;
}

function weekStart(dateKey, firstWeekday) {
  const weekday = dateParts(dateKey).weekday;
  return addDaysToKey(dateKey, -((weekday - firstWeekday + 7) % 7));
}

function matchesMonthDay(rule, candidate, start) {
  if (!rule.byMonthDay?.length && rule.byWeekday?.length) return true;
  const configured = rule.byMonthDay || [start.day];
  const last = daysInMonth(candidate.year, candidate.month);
  return configured.some((value) => {
    if (value === -1) return candidate.day === last;
    if (value <= last) return candidate.day === value;
    return rule.missingDatePolicy === "clamp" && candidate.day === last;
  });
}

function matchesWeekday(rule, candidate) {
  if (!rule.byWeekday?.length) return true;
  const last = daysInMonth(candidate.year, candidate.month);
  return rule.byWeekday.some(({ weekday, ordinal }) => {
    if (candidate.weekday !== weekday) return false;
    if (ordinal == null) return true;
    if (ordinal === -1) return candidate.day + 7 > last;
    return Math.ceil(candidate.day / 7) === ordinal;
  });
}

function matchesRule(rule, dateKey, startDate) {
  if (dateKey < startDate) return false;
  const candidate = dateParts(dateKey);
  const start = dateParts(startDate);
  if (rule.byMonth?.length && !rule.byMonth.includes(candidate.month)) return false;
  if (rule.frequency === "daily") return diffDays(dateKey, startDate) % rule.interval === 0;
  if (rule.frequency === "weekly") {
    const weekdays = rule.byWeekday?.map((value) => value.weekday) || [start.weekday];
    if (!weekdays.includes(candidate.weekday)) return false;
    const weeks = Math.floor(diffDays(weekStart(dateKey, rule.weekStart), weekStart(startDate, rule.weekStart)) / 7);
    return weeks % rule.interval === 0;
  }
  if (rule.frequency === "monthly") {
    return monthDifference(candidate, start) % rule.interval === 0
      && matchesMonthDay(rule, candidate, start)
      && matchesWeekday(rule, candidate);
  }
  return (candidate.year - start.year) % rule.interval === 0
    && (rule.byMonth || [start.month]).includes(candidate.month)
    && matchesMonthDay(rule, candidate, start)
    && matchesWeekday(rule, candidate);
}

function anchorFor(timing, dateKey) {
  return timing.kind === "all-day" ? dateKey : `${dateKey}${timing.startLocal.slice(10)}`;
}

function anchorWithinUntil(anchor, until) {
  if (!until) return true;
  return until.includes("T") ? anchor <= until : anchor.slice(0, 10) <= until;
}


/* ── Scanning a rule without walking every day of its history ──
 *
 * The obvious loop steps one day at a time from the series start. It is
 * correct and it is O(days since the series began): a standup started three
 * years ago costs eleven hundred wasted steps every time any view asks what is
 * on next Tuesday, and the month grid asks eighty-four times. That was 1.8
 * seconds to open a month on a year-old notebook.
 *
 * Two changes, both of which have to preserve the answer exactly:
 *
 * 1. **Start at the range, not at the beginning of time.** Nothing before the
 *    range can change what is inside it — *unless* the rule has a `count`, in
 *    which case every earlier occurrence has to be counted before we know
 *    whether the series has already run out. So a counted rule still scans from
 *    the start; everything else jumps.
 *
 * 2. **Step by the rule's own stride.** A day that cannot possibly match is
 *    skipped wholesale: an off-interval week jumps to the next on-interval one,
 *    a month the rule excludes jumps to the first of the next month.
 *
 * Every jump here is deliberately conservative — landing early costs a few
 * iterations, landing late loses an occurrence — and `recurrence-equivalence`
 * asserts the output against the naive walk over thousands of rule/range pairs.
 */

function firstOfNextMonth(dateKey) {
  const { year, month } = dateParts(dateKey);
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/* The month cannot contain a match: wrong month for a `byMonth` rule, or off
   the monthly/yearly interval. Nothing in it needs looking at. */
function monthIsExcluded(rule, candidate, start) {
  if (rule.byMonth?.length && !rule.byMonth.includes(candidate.month)) return true;
  if (rule.frequency === "monthly") return monthDifference(candidate, start) % rule.interval !== 0;
  if (rule.frequency === "yearly") return (candidate.year - start.year) % rule.interval !== 0;
  return false;
}

/* The first date at or before the range that the scan can safely begin from.
   Never later than the true first match, and never before the series start. */
function scanStartFor(rule, startDate, rangeStart) {
  if (rangeStart <= startDate) return startDate;
  if (rule.frequency === "daily") {
    /* Exact phase: the stride below is `interval` days, so landing off-phase
       would step straight past every occurrence. */
    const elapsed = diffDays(rangeStart, startDate);
    const stride = rule.interval;
    return addDaysToKey(startDate, Math.ceil(elapsed / stride) * stride);
  }
  if (rule.frequency === "weekly") return weekStart(rangeStart, rule.weekStart);
  /* Monthly and yearly are scanned within a month, so the first of the range's
     month is always safe. */
  return `${rangeStart.slice(0, 7)}-01`;
}

/* The next date worth testing after one that did not match. */
function nextCandidate(rule, date, startDate) {
  if (rule.frequency === "daily") return addDaysToKey(date, rule.interval);
  const candidate = dateParts(date);
  const start = dateParts(startDate);
  if (rule.frequency === "weekly") {
    const week = weekStart(date, rule.weekStart);
    const weeks = Math.floor(diffDays(week, weekStart(startDate, rule.weekStart)) / 7);
    /* An off-interval week holds nothing; skip to the next one that counts. */
    if (weeks % rule.interval !== 0) {
      const ahead = rule.interval - (((weeks % rule.interval) + rule.interval) % rule.interval);
      return addDaysToKey(week, ahead * 7);
    }
    return addDaysToKey(date, 1);
  }
  if (monthIsExcluded(rule, candidate, start)) return firstOfNextMonth(date);
  return addDaysToKey(date, 1);
}

export function generateRecurrenceAnchors(event, rangeStart, rangeEndExclusive, limit = 10_000) {
  assertDateKey(rangeStart, "range start");
  assertDateKey(rangeEndExclusive, "range end");
  if (rangeEndExclusive <= rangeStart) throw new RangeError("range end must be after range start");
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer");
  const timing = normalizeTiming(event.timing);
  const startDate = timingStartDate(timing);
  const rule = normalizeRecurrenceRule(event.recurrence, timing);
  if (!rule) {
    return startDate < rangeEndExclusive && timingEndDateExclusive(timing) > rangeStart
      ? [anchorFor(timing, startDate)]
      : [];
  }
  const anchors = [];
  let generated = 0;
  let iterations = 0;
  /* A counted rule has to know how many occurrences came before the range, so it
     scans from the start. Anything else can begin at the range itself. */
  let date = rule.count ? startDate : scanStartFor(rule, startDate, rangeStart);
  while (date < rangeEndExclusive) {
    if (++iterations > 200_000) throw new RangeError("recurrence expansion exceeded its safety bound");
    if (!matchesRule(rule, date, startDate)) {
      date = nextCandidate(rule, date, startDate);
      continue;
    }
    const anchor = anchorFor(timing, date);
    if (!anchorWithinUntil(anchor, rule.until)) break;
    generated += 1;
    if (rule.count && generated > rule.count) break;
    if (date >= rangeStart) {
      anchors.push(anchor);
      if (anchors.length >= limit) break;
    }
    /* A day that matched cannot also be skipped past by a stride that assumes it
       did not, so a match always advances by one day — except for daily, whose
       stride *is* its period. */
    date = rule.frequency === "daily" ? addDaysToKey(date, rule.interval) : addDaysToKey(date, 1);
  }
  return anchors;
}

export function timingAtAnchor(baseTiming, anchor) {
  const timing = normalizeTiming(baseTiming);
  if (timing.kind === "all-day") {
    const span = diffDays(timing.endDateExclusive, timing.startDate);
    return { kind: "all-day", startDate: anchor.slice(0, 10), endDateExclusive: addDaysToKey(anchor.slice(0, 10), span) };
  }
  const duration = localDateTimeToEpochMinutes(timing.endLocal) - localDateTimeToEpochMinutes(timing.startLocal);
  const startLocal = anchor;
  const endLocal = addMinutesToLocalDateTime(startLocal, duration);
  if (timing.timeZoneMode === "floating") return { kind: "timed", timeZoneMode: "floating", startLocal, endLocal };
  const selectOffset = (local, preferred) => {
    const candidates = getOffsetCandidates(local, timing.timeZone);
    if (!candidates.length) return null;
    return candidates.find((candidate) => candidate.offset === preferred)?.offset || candidates[0].offset;
  };
  const startOffset = selectOffset(startLocal, timing.startOffset);
  const endOffset = selectOffset(endLocal, timing.endOffset);
  if (!startOffset || !endOffset) return null;
  return { kind: "timed", timeZoneMode: "zoned", startLocal, endLocal, timeZone: timing.timeZone, startOffset, endOffset };
}

export function expandSeries(event, exceptions = [], range, options = {}) {
  const anchors = generateRecurrenceAnchors(event, range.start, range.endExclusive, options.limit);
  const byAnchor = new Map(exceptions.filter((item) => item.seriesId === event.id && item.type !== "added").map((item) => [item.recurrenceAnchor, item]));
  const results = [];
  for (const anchor of anchors) {
    const exception = byAnchor.get(anchor);
    if (exception?.type === "cancelled") continue;
    const timing = exception?.timing || timingAtAnchor(event.timing, anchor);
    if (!timing) continue;
    const occurrence = {
      ...event,
      ...(exception?.patch || {}),
      timing,
      id: event.recurrence ? makeOccurrenceId(event.id, anchor) : event.id,
      seriesId: event.id,
      recurrenceAnchor: anchor,
      instance: Boolean(event.recurrence),
    };
    results.push(occurrence);
  }
  for (const exception of exceptions.filter((item) => item.seriesId === event.id && item.type === "added")) {
    const occurrence = { ...exception.event, id: exception.occurrenceId, seriesId: event.id, recurrenceAnchor: null, instance: true, added: true };
    if (timingStartDate(occurrence.timing) < range.endExclusive && timingEndDateExclusive(occurrence.timing) > range.start) results.push(occurrence);
  }
  return results;
}
