import { assertDateKey } from "../../../shared/time/dateKey.js";
import { assertLocalDateTime } from "../../../shared/time/localDateTime.js";
import { normalizeTiming, timingStartDate } from "./timing.js";

const FREQUENCIES = new Set(["daily", "weekly", "monthly", "yearly"]);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function uniqueNumbers(values, field, minimum, maximum, extras = []) {
  if (values == null) return undefined;
  if (!Array.isArray(values) || values.some((value) => !Number.isInteger(value) || (!extras.includes(value) && (value < minimum || value > maximum)))) {
    throw new TypeError(`${field} contains an invalid value`);
  }
  return [...new Set(values)].sort((left, right) => left - right);
}

function weekdays(values) {
  if (values == null) return undefined;
  if (!Array.isArray(values)) throw new TypeError("byWeekday must be an array");
  const normalized = values.map((value) => typeof value === "number" ? { weekday: value } : { ...value });
  for (const value of normalized) {
    if (!Number.isInteger(value.weekday) || value.weekday < 0 || value.weekday > 6) {
      throw new TypeError("weekday must be between 0 and 6");
    }
    if (value.ordinal != null && ![1, 2, 3, 4, -1].includes(value.ordinal)) {
      throw new TypeError("weekday ordinal must be 1 through 4 or -1");
    }
  }
  const keys = new Set();
  return normalized
    .filter((value) => {
      const key = `${value.weekday}:${value.ordinal || 0}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    })
    .sort((left, right) => left.weekday - right.weekday || (left.ordinal || 0) - (right.ordinal || 0));
}

export function normalizeRecurrenceRule(input, seriesTiming) {
  if (!input) return null;
  normalizeTiming(seriesTiming);
  if (!FREQUENCIES.has(input.frequency)) throw new TypeError("recurrence frequency must be daily, weekly, monthly, or yearly");
  const interval = Number(input.interval ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 999) throw new TypeError("recurrence interval must be a positive integer");
  if (input.count != null && input.until != null && input.until !== "") {
    throw new TypeError("recurrence count and until are mutually exclusive");
  }
  let count;
  if (input.count != null) {
    count = Number(input.count);
    if (!Number.isInteger(count) || count < 1) throw new TypeError("recurrence count must be a positive integer");
  }
  let until;
  if (input.until) {
    until = input.until;
    if (String(until).includes("T")) assertLocalDateTime(until, "recurrence until");
    else assertDateKey(until, "recurrence until");
    if (until < timingStartDate(seriesTiming)) throw new RangeError("recurrence until must not precede the series start");
  }
  const byWeekday = weekdays(input.byWeekday);
  const byMonthDay = uniqueNumbers(input.byMonthDay, "month day", 1, 31, [-1]);
  const byMonth = uniqueNumbers(input.byMonth, "month", 1, 12);
  const weekStart = Number(input.weekStart ?? 0);
  if (!Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6) throw new TypeError("weekStart must be between 0 and 6");
  const missingDatePolicy = input.missingDatePolicy || "skip";
  if (!new Set(["skip", "clamp"]).has(missingDatePolicy)) throw new TypeError("missingDatePolicy must be skip or clamp");
  return {
    frequency: input.frequency,
    interval,
    weekStart,
    ...(byWeekday?.length ? { byWeekday } : {}),
    ...(byMonthDay?.length ? { byMonthDay } : {}),
    ...(byMonth?.length ? { byMonth } : {}),
    ...(count ? { count } : {}),
    ...(until ? { until } : {}),
    missingDatePolicy,
  };
}

export function describeRecurrenceRule(input, seriesTiming) {
  const rule = normalizeRecurrenceRule(input, seriesTiming);
  if (!rule) return "Does not repeat";
  const every = rule.interval === 1 ? "Every" : `Every ${rule.interval}`;
  let label = `${every} ${rule.frequency === "daily" ? "day" : rule.frequency === "weekly" ? "week" : rule.frequency === "monthly" ? "month" : "year"}${rule.interval === 1 ? "" : "s"}`;
  if (rule.byWeekday?.length) {
    const days = rule.byWeekday.map(({ weekday, ordinal }) => {
      const prefix = ordinal === -1 ? "last " : ordinal ? `${["", "first", "second", "third", "fourth"][ordinal]} ` : "";
      return `${prefix}${WEEKDAYS[weekday]}`;
    });
    label += ` on ${days.join(", ")}`;
  }
  if (rule.count) label += `, ${rule.count} times`;
  if (rule.until) label += ` until ${rule.until}`;
  return label;
}
