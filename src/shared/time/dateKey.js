const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const pad = (value) => String(value).padStart(2, "0");

function partsOf(value) {
  const match = DATE_KEY.exec(String(value));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) return null;

  return { year, month, day };
}

export function isDateKey(value) {
  return typeof value === "string" && partsOf(value) !== null;
}

export function assertDateKey(value, fieldName = "date") {
  if (!isDateKey(value)) {
    throw new TypeError(`${fieldName} must be a valid date key in YYYY-MM-DD format`);
  }
  return value;
}

export function keyOf(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("date must be a valid Date");
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseKey(dateKey) {
  const { year, month, day } = partsOf(assertDateKey(dateKey));
  return new Date(year, month - 1, day);
}

export function addDays(date, amount) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("date must be a valid Date");
  }
  if (!Number.isInteger(amount)) throw new TypeError("amount must be an integer");
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addDaysToKey(dateKey, amount) {
  assertDateKey(dateKey);
  if (!Number.isInteger(amount)) throw new TypeError("amount must be an integer");
  const { year, month, day } = partsOf(dateKey);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function diffDays(leftDateKey, rightDateKey) {
  const left = partsOf(assertDateKey(leftDateKey, "left date"));
  const right = partsOf(assertDateKey(rightDateKey, "right date"));
  const leftTime = Date.UTC(left.year, left.month - 1, left.day);
  const rightTime = Date.UTC(right.year, right.month - 1, right.day);
  return Math.round((leftTime - rightTime) / DAY_MS);
}
