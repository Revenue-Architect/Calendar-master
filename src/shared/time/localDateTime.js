import { assertDateKey } from "./dateKey.js";

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
const MINUTE_MS = 60_000;

const pad = (value) => String(value).padStart(2, "0");

export function parseLocalDateTime(value) {
  const match = typeof value === "string" ? LOCAL_DATE_TIME.exec(value) : null;
  if (!match) throw new TypeError("value must be a valid local date-time in YYYY-MM-DDTHH:mm format");
  const dateKey = assertDateKey(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) {
    throw new TypeError("value must be a valid local date-time in YYYY-MM-DDTHH:mm format");
  }
  return { dateKey, hour, minute };
}

export function assertLocalDateTime(value, fieldName = "value") {
  try {
    parseLocalDateTime(value);
  } catch {
    throw new TypeError(`${fieldName} must be a valid local date-time in YYYY-MM-DDTHH:mm format`);
  }
  return value;
}

export function localDateTimeToEpochMinutes(value) {
  const { dateKey, hour, minute } = parseLocalDateTime(value);
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) / MINUTE_MS;
}

export function epochMinutesToLocalDateTime(value) {
  if (!Number.isInteger(value)) throw new TypeError("epoch minutes must be an integer");
  const date = new Date(value * MINUTE_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function addMinutesToLocalDateTime(value, minutes) {
  if (!Number.isInteger(minutes)) throw new TypeError("minutes must be an integer");
  return epochMinutesToLocalDateTime(localDateTimeToEpochMinutes(value) + minutes);
}

export function compareLocalDateTimes(left, right) {
  const difference = localDateTimeToEpochMinutes(left) - localDateTimeToEpochMinutes(right);
  return difference === 0 ? 0 : difference < 0 ? -1 : 1;
}
