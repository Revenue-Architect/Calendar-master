import assert from "node:assert/strict";
import test from "node:test";

import { describeRecurrenceRule, normalizeRecurrenceRule } from "../model/recurrenceRule.js";

const timedTiming = {
  kind: "timed", timeZoneMode: "floating",
  startLocal: "2026-01-26T09:00", endLocal: "2026-01-26T10:00",
};

test("monthly last weekday and yearly leap-day rules normalize", () => {
  const monthly = normalizeRecurrenceRule({
    frequency: "monthly", interval: 1,
    byWeekday: [{ weekday: 1, ordinal: -1 }],
  }, timedTiming);
  assert.deepEqual(monthly.byWeekday, [{ weekday: 1, ordinal: -1 }]);
  const yearly = normalizeRecurrenceRule({
    frequency: "yearly", byMonth: [2], byMonthDay: [29], missingDatePolicy: "skip",
  }, timedTiming);
  assert.equal(yearly.frequency, "yearly");
  assert.match(describeRecurrenceRule(monthly, timedTiming), /last Monday/i);
});

test("count and until cannot coexist", () => {
  assert.throws(
    () => normalizeRecurrenceRule({ frequency: "daily", count: 5, until: "2026-12-01" }, timedTiming),
    /mutually exclusive/,
  );
});

test("rule values are sorted, deduplicated, and bounded", () => {
  const rule = normalizeRecurrenceRule({
    frequency: "weekly", interval: 2, byWeekday: [3, 1, 3], count: 4, weekStart: 1,
  }, timedTiming);
  assert.deepEqual(rule.byWeekday, [{ weekday: 1 }, { weekday: 3 }]);
  assert.throws(() => normalizeRecurrenceRule({ frequency: "monthly", byMonthDay: [0] }, timedTiming), /month day/);
});
