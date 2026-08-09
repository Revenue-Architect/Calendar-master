import { assertDateKey } from "../../../shared/time/dateKey.js";

const SUPPORTED_FREQUENCIES = new Set(["daily", "weekly", "monthly"]);

export class CalendarValidationError extends Error {
  constructor(issues) {
    super(issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "));
    this.name = "CalendarValidationError";
    this.issues = issues;
  }
}

function issue(issues, field, message) {
  issues.push({ field, message });
}

function validDate(value, field, issues) {
  try {
    return assertDateKey(value, field);
  } catch (error) {
    issue(issues, field, error.message);
    return null;
  }
}

function normalizeRepeat(repeat, eventDate, issues) {
  if (!repeat) return null;
  if (!SUPPORTED_FREQUENCIES.has(repeat.freq)) {
    issue(issues, "repeat.freq", "must be daily, weekly, or monthly in Phase 1");
  }

  const interval = Number(repeat.interval ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
    issue(issues, "repeat.interval", "must be an integer between 1 and 30");
  }

  let until = repeat.until || "";
  if (until) {
    until = validDate(until, "repeat.until", issues) || until;
    if (eventDate && until < eventDate) {
      issue(issues, "repeat.until", "must be on or after event date");
    }
  }

  let byDay;
  if (repeat.freq === "weekly" && repeat.byDay != null) {
    if (!Array.isArray(repeat.byDay) || repeat.byDay.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      issue(issues, "repeat.byDay", "must contain weekday integers from 0 through 6");
    } else {
      byDay = [...new Set(repeat.byDay)].sort((left, right) => left - right);
    }
  }

  return {
    ...repeat,
    freq: repeat.freq,
    interval: Number.isInteger(interval) ? interval : repeat.interval,
    ...(byDay ? { byDay } : {}),
    ...(until ? { until } : { until: "" }),
  };
}

function normalizeAlerts(alerts, issues) {
  if (alerts == null) return [];
  if (!Array.isArray(alerts) || alerts.some((minutes) => !Number.isFinite(minutes) || minutes < 0)) {
    issue(issues, "alerts", "must contain non-negative minute values");
    return alerts;
  }
  return [...new Set(alerts)].sort((left, right) => left - right);
}

export function normalizeEventInput(input) {
  const issues = [];
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title) issue(issues, "title", "is required");

  const date = validDate(input?.date, "date", issues);
  const allDay = Boolean(input?.allDay);
  let start = Number(input?.start);
  let dur = Number(input?.dur);
  let endDate = input?.endDate || null;

  if (allDay) {
    start = 0;
    dur = 0;
    if (endDate) {
      endDate = validDate(endDate, "endDate", issues) || endDate;
      if (date && endDate < date) issue(issues, "endDate", "end date must be on or after event date");
    }
  } else {
    endDate = null;
    if (!Number.isInteger(start) || start < 0 || start >= 1440) {
      issue(issues, "start", "must be an integer from 0 through 1439");
    }
    if (!Number.isInteger(dur) || dur <= 0) {
      issue(issues, "dur", "must be a positive integer number of minutes");
    } else if (Number.isInteger(start) && start + dur > 1440) {
      issue(issues, "dur", "event must end within the day in Phase 1");
    }
  }

  const repeat = normalizeRepeat(input?.repeat, date, issues);
  const alerts = normalizeAlerts(input?.alerts, issues);
  if (issues.length) throw new CalendarValidationError(issues);

  return {
    ...input,
    title,
    date,
    allDay,
    start,
    dur,
    endDate,
    alerts,
    repeat,
  };
}
