export function assertHalfOpenInterval(start, end, compare, label = "interval") {
  if (typeof compare !== "function") throw new TypeError("compare must be a function");
  if (compare(end, start) <= 0) throw new RangeError(`${label} end must be after start`);
}

export function intersectsHalfOpen(startA, endA, startB, endB, compare) {
  assertHalfOpenInterval(startA, endA, compare, "left interval");
  assertHalfOpenInterval(startB, endB, compare, "right interval");
  return compare(startA, endB) < 0 && compare(startB, endA) < 0;
}
