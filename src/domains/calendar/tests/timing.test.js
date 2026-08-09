import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTiming,
  timingIntersectsDate,
} from "../model/timing.js";

test("all-day timing requires an exclusive end after start", () => {
  assert.deepEqual(
    normalizeTiming({ kind: "all-day", startDate: "2026-08-09", endDateExclusive: "2026-08-10" }),
    { kind: "all-day", startDate: "2026-08-09", endDateExclusive: "2026-08-10" },
  );
  assert.throws(
    () => normalizeTiming({ kind: "all-day", startDate: "2026-08-09", endDateExclusive: "2026-08-09" }),
    /after start/,
  );
});

test("floating timing can cross midnight", () => {
  const timing = normalizeTiming({
    kind: "timed", timeZoneMode: "floating",
    startLocal: "2026-08-09T23:30", endLocal: "2026-08-10T01:00",
  });
  assert.equal(timing.endLocal, "2026-08-10T01:00");
  assert.equal(timingIntersectsDate(timing, "2026-08-10"), true);
});

test("zoned timing preserves explicit fallback offsets", () => {
  const timing = normalizeTiming({
    kind: "timed", timeZoneMode: "zoned",
    startLocal: "2026-11-01T01:30", endLocal: "2026-11-01T02:30",
    timeZone: "America/Toronto", startOffset: "-04:00", endOffset: "-05:00",
  });
  assert.equal(timing.startOffset, "-04:00");
  assert.equal(timing.endOffset, "-05:00");
});
