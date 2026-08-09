import test from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  addDaysToKey,
  assertDateKey,
  diffDays,
  keyOf,
  parseKey,
} from "./dateKey.js";

test("date-key arithmetic crosses DST boundaries without skipping dates", () => {
  assert.equal(addDaysToKey("2026-03-07", 1), "2026-03-08");
  assert.equal(addDaysToKey("2026-03-08", 1), "2026-03-09");
  assert.equal(addDaysToKey("2026-11-01", 1), "2026-11-02");
});

test("diffDays compares calendar dates rather than elapsed local hours", () => {
  assert.equal(diffDays("2026-03-09", "2026-03-07"), 2);
  assert.equal(diffDays("2026-03-07", "2026-03-09"), -2);
});

test("assertDateKey rejects malformed and impossible dates", () => {
  assert.throws(() => assertDateKey("2026-2-03"), /valid date key/);
  assert.throws(() => assertDateKey("2026-02-30"), /valid date key/);
  assert.throws(() => assertDateKey(null), /valid date key/);
});

test("local date conversion preserves the selected date", () => {
  const parsed = parseKey("2026-08-09");
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 7);
  assert.equal(parsed.getDate(), 9);
  assert.equal(keyOf(parsed), "2026-08-09");
  assert.equal(keyOf(addDays(parsed, 2)), "2026-08-11");
});
