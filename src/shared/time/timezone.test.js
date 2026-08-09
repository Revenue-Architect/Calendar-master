import assert from "node:assert/strict";
import test from "node:test";

import {
  detectLocalTimeStatus,
  getOffsetCandidates,
  projectInstantToLocal,
  resolveZonedDateTime,
} from "./timezone.js";

test("Toronto spring-forward local time is skipped", () => {
  assert.equal(detectLocalTimeStatus("2026-03-08T02:30", "America/Toronto"), "skipped");
  assert.throws(() => resolveZonedDateTime("2026-03-08T02:30", "America/Toronto"), /does not exist/);
});

test("Toronto fallback requires one of two explicit offsets", () => {
  assert.equal(detectLocalTimeStatus("2026-11-01T01:30", "America/Toronto"), "ambiguous");
  assert.deepEqual(
    getOffsetCandidates("2026-11-01T01:30", "America/Toronto").map((candidate) => candidate.offset),
    ["-04:00", "-05:00"],
  );
  assert.throws(() => resolveZonedDateTime("2026-11-01T01:30", "America/Toronto"), /ambiguous/);
});

test("zoned resolution and projection round-trip an explicit offset", () => {
  const resolved = resolveZonedDateTime("2026-11-01T01:30", "America/Toronto", "-05:00");
  assert.deepEqual(projectInstantToLocal(resolved.instant, "America/Toronto"), {
    localDateTime: "2026-11-01T01:30", offset: "-05:00",
  });
});
