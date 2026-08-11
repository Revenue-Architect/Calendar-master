import assert from "node:assert/strict";
import test from "node:test";

import { generateRecurrenceAnchors } from "../recurrence/expandRecurrence.js";
import { addDaysToKey } from "../../../shared/time/dateKey.js";

/* Proof, not spot checks.
 *
 * `generateRecurrenceAnchors` no longer walks a series day by day from its
 * start — it jumps to the range and strides by the rule's own period. That is a
 * large speedup and a large opportunity to silently lose an occurrence: a jump
 * that lands one day late produces an answer that is wrong only for some rules,
 * in some ranges, and looks perfectly reasonable everywhere else.
 *
 * So this file does not assert what the output should be. It asserts that the
 * fast scan and an obviously-correct slow one agree, across every rule shape the
 * model allows and thousands of ranges — including the ones nobody would think
 * to write by hand.
 *
 * If this ever fails, trust this file and not the optimisation.
 */

/* The naive walk the fast path replaced, kept here as the reference. Its only
   job is to be readable enough that its correctness is self-evident. */
function referenceAnchors(event, rangeStart, rangeEndExclusive, limit = 10_000) {
  return generateReference(event, rangeStart, rangeEndExclusive, limit);
}

/* Deliberately a separate implementation rather than a flag on the real one:
   a reference that shares code with the thing it checks proves nothing. */
function generateReference(event, rangeStart, rangeEndExclusive, limit) {
  const { timing, recurrence: rule } = event;
  const startDate = timing.startLocal.slice(0, 10);
  const anchors = [];
  let generated = 0;
  for (let date = startDate; date < rangeEndExclusive; date = addDaysToKey(date, 1)) {
    if (!referenceMatches(rule, date, startDate)) continue;
    const anchor = `${date}${timing.startLocal.slice(10)}`;
    if (rule.until && (rule.until.includes("T") ? anchor > rule.until : date > rule.until)) break;
    generated += 1;
    if (rule.count && generated > rule.count) break;
    if (date >= rangeStart) {
      anchors.push(anchor);
      if (anchors.length >= limit) break;
    }
  }
  return anchors;
}

const parts = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
};
const daysBetween = (a, b) => Math.round(
  (Date.UTC(...a.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))))
    - Date.UTC(...b.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))))) / 86_400_000,
);
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function referenceWeekStart(dateKey, firstWeekday) {
  return addDaysToKey(dateKey, -(((parts(dateKey).weekday - firstWeekday) + 7) % 7));
}

function referenceMatches(rule, dateKey, startDate) {
  if (dateKey < startDate) return false;
  const c = parts(dateKey);
  const s = parts(startDate);
  if (rule.byMonth?.length && !rule.byMonth.includes(c.month)) return false;

  const monthDayOk = () => {
    if (!rule.byMonthDay?.length && rule.byWeekday?.length) return true;
    const configured = rule.byMonthDay || [s.day];
    const last = daysInMonth(c.year, c.month);
    return configured.some((value) => {
      if (value === -1) return c.day === last;
      if (value <= last) return c.day === value;
      return rule.missingDatePolicy === "clamp" && c.day === last;
    });
  };
  const weekdayOk = () => {
    if (!rule.byWeekday?.length) return true;
    const last = daysInMonth(c.year, c.month);
    return rule.byWeekday.some(({ weekday, ordinal }) => {
      if (c.weekday !== weekday) return false;
      if (ordinal == null) return true;
      if (ordinal === -1) return c.day + 7 > last;
      return Math.ceil(c.day / 7) === ordinal;
    });
  };

  if (rule.frequency === "daily") return daysBetween(dateKey, startDate) % rule.interval === 0;
  if (rule.frequency === "weekly") {
    const weekdays = rule.byWeekday?.map((v) => v.weekday) || [s.weekday];
    if (!weekdays.includes(c.weekday)) return false;
    const weeks = Math.floor(
      daysBetween(referenceWeekStart(dateKey, rule.weekStart), referenceWeekStart(startDate, rule.weekStart)) / 7,
    );
    return weeks % rule.interval === 0;
  }
  if (rule.frequency === "monthly") {
    return ((c.year - s.year) * 12 + c.month - s.month) % rule.interval === 0 && monthDayOk() && weekdayOk();
  }
  return (c.year - s.year) % rule.interval === 0
    && (rule.byMonth || [s.month]).includes(c.month)
    && monthDayOk() && weekdayOk();
}

/* A small deterministic generator, so a failure is always reproducible. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

const START_DATES = ["2019-01-01", "2020-02-29", "2021-03-31", "2023-12-31", "2024-01-15", "2026-08-10"];
const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"];

function makeEvent(rule, startDate) {
  return {
    id: "series",
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal: `${startDate}T09:00`, endLocal: `${startDate}T09:30`,
    },
    recurrence: rule,
  };
}

function randomRule(random, startDate) {
  const frequency = FREQUENCIES[Math.floor(random() * FREQUENCIES.length)];
  const rule = {
    frequency,
    interval: 1 + Math.floor(random() * 4),
    weekStart: random() < 0.5 ? 0 : 1,
    missingDatePolicy: random() < 0.5 ? "skip" : "clamp",
  };
  if (frequency === "weekly" && random() < 0.75) {
    const days = [...new Set(Array.from({ length: 1 + Math.floor(random() * 3) }, () => Math.floor(random() * 7)))];
    rule.byWeekday = days.sort().map((weekday) => ({ weekday, ordinal: null }));
  }
  if ((frequency === "monthly" || frequency === "yearly") && random() < 0.5) {
    if (random() < 0.5) {
      rule.byMonthDay = [random() < 0.25 ? -1 : 1 + Math.floor(random() * 31)];
    } else {
      rule.byWeekday = [{
        weekday: Math.floor(random() * 7),
        ordinal: random() < 0.3 ? -1 : 1 + Math.floor(random() * 4),
      }];
    }
  }
  if (frequency === "yearly" && random() < 0.5) rule.byMonth = [1 + Math.floor(random() * 12)];
  if (random() < 0.2) rule.count = 1 + Math.floor(random() * 40);
  /* `until` is always on or after the series start; the model rejects the
     alternative, and a generator that produces rejected rules tests nothing. */
  else if (random() < 0.25) rule.until = addDaysToKey(startDate, Math.floor(random() * 900));
  return rule;
}

test("the fast scan agrees with the naive walk across thousands of rules and ranges", () => {
  const random = makeRandom(20260811);
  let compared = 0;

  for (let iteration = 0; iteration < 3_000; iteration += 1) {
    const startDate = START_DATES[Math.floor(random() * START_DATES.length)];
    const rule = randomRule(random, startDate);
    const event = makeEvent(rule, startDate);

    const rangeStart = addDaysToKey(startDate, Math.floor(random() * 1_500) - 60);
    const span = 1 + Math.floor(random() * 70);
    const rangeEnd = addDaysToKey(rangeStart, span);

    const fast = generateRecurrenceAnchors(event, rangeStart, rangeEnd);
    const slow = referenceAnchors(event, rangeStart, rangeEnd);
    assert.deepEqual(
      fast, slow,
      `disagreement on ${JSON.stringify({ startDate, rule, rangeStart, rangeEnd })}`,
    );
    compared += 1;
  }

  assert.equal(compared, 3_000);
});

test("they agree on the ranges most likely to break a jump", () => {
  /* Ranges that start exactly on an occurrence, exactly one day after one, and
     exactly on a period boundary — the places an off-by-one lands. */
  const random = makeRandom(7);
  for (let iteration = 0; iteration < 600; iteration += 1) {
    const startDate = START_DATES[Math.floor(random() * START_DATES.length)];
    const rule = randomRule(random, startDate);
    const event = makeEvent(rule, startDate);

    for (const offset of [0, 1, 2, 6, 7, 8, 27, 28, 29, 30, 31, 364, 365, 366]) {
      const rangeStart = addDaysToKey(startDate, offset);
      const rangeEnd = addDaysToKey(rangeStart, 1);
      assert.deepEqual(
        generateRecurrenceAnchors(event, rangeStart, rangeEnd),
        referenceAnchors(event, rangeStart, rangeEnd),
        `single-day disagreement at +${offset} on ${JSON.stringify({ startDate, rule })}`,
      );
    }
  }
});

test("a range entirely before the series is empty for both", () => {
  const event = makeEvent({ frequency: "daily", interval: 1, weekStart: 0, missingDatePolicy: "skip" }, "2026-01-01");
  assert.deepEqual(generateRecurrenceAnchors(event, "2025-01-01", "2025-06-01"), []);
  assert.deepEqual(referenceAnchors(event, "2025-01-01", "2025-06-01"), []);
});

test("a counted rule still counts from the beginning, however far away the range is", () => {
  /* The one case that cannot jump: whether the series has run out depends
     entirely on occurrences the range never sees. */
  const event = makeEvent(
    { frequency: "daily", interval: 1, weekStart: 0, missingDatePolicy: "skip", count: 10 },
    "2026-01-01",
  );
  assert.deepEqual(generateRecurrenceAnchors(event, "2026-03-01", "2026-04-01"), []);
  assert.equal(generateRecurrenceAnchors(event, "2026-01-01", "2026-02-01").length, 10);
});

test("the limit is still honoured, and still counts only what is in range", () => {
  const event = makeEvent({ frequency: "daily", interval: 1, weekStart: 0, missingDatePolicy: "skip" }, "2020-01-01");
  const capped = generateRecurrenceAnchors(event, "2026-01-01", "2026-03-01", 5);
  assert.equal(capped.length, 5);
  assert.deepEqual(capped, referenceAnchors(event, "2026-01-01", "2026-03-01", 5));
});
