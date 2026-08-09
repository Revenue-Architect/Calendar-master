import assert from "node:assert/strict";
import test from "node:test";

import {
  addMinutesToLocalDateTime,
  assertLocalDateTime,
  compareLocalDateTimes,
  epochMinutesToLocalDateTime,
  localDateTimeToEpochMinutes,
  parseLocalDateTime,
} from "./localDateTime.js";

test("strict local date-times reject impossible dates and 24:00", () => {
  assert.throws(() => assertLocalDateTime("2026-02-30T09:00"), /valid local date-time/);
  assert.throws(() => assertLocalDateTime("2026-08-09T24:00"), /valid local date-time/);
  assert.throws(() => assertLocalDateTime("2026-08-09T09:00:00"), /valid local date-time/);
});

test("local date-time parsing and arithmetic are host-timezone independent", () => {
  assert.deepEqual(parseLocalDateTime("2028-02-28T23:30"), {
    dateKey: "2028-02-28", hour: 23, minute: 30,
  });
  assert.equal(addMinutesToLocalDateTime("2028-02-28T23:30", 90), "2028-02-29T01:00");
  const minutes = localDateTimeToEpochMinutes("2026-08-09T09:05");
  assert.equal(epochMinutesToLocalDateTime(minutes), "2026-08-09T09:05");
  assert.equal(compareLocalDateTimes("2026-08-09T09:00", "2026-08-09T09:01"), -1);
});
