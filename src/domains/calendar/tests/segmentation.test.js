import assert from "node:assert/strict";
import test from "node:test";

import { segmentOccurrence } from "../segmentation/segmentOccurrence.js";

test("a floating overnight occurrence becomes two display segments", () => {
  const occurrence = {
    id: "overnight",
    timing: {
      kind: "timed", timeZoneMode: "floating",
      startLocal: "2026-08-09T23:30", endLocal: "2026-08-10T01:00",
    },
  };
  const segments = segmentOccurrence(occurrence, "2026-08-09", "2026-08-11", "America/Toronto");
  assert.deepEqual(segments.map((segment) => [segment.date, segment.start, segment.dur, segment.continuesBefore, segment.continuesAfter]), [
    ["2026-08-09", 1410, 30, false, true],
    ["2026-08-10", 0, 60, true, false],
  ]);
});

test("all-day segmentation honors exclusive end dates", () => {
  const occurrence = {
    id: "trip",
    timing: { kind: "all-day", startDate: "2026-08-09", endDateExclusive: "2026-08-11" },
  };
  assert.deepEqual(
    segmentOccurrence(occurrence, "2026-08-08", "2026-08-12").map((segment) => segment.date),
    ["2026-08-09", "2026-08-10"],
  );
});
