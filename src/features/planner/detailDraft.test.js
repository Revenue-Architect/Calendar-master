import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDetailDraft,
  buildDetailEntryPayload,
  buildTaskWritePatch,
  durationFromDatedClockRange,
  durationFromClockRange,
} from "./detailDraft.js";

const task = {
  id: "task-1",
  title: "Plan launch",
  category: "DEEP WORK",
  reward: 40,
  note: "Keep the launch notes",
  status: "open",
  tags: ["launch"],
  reminders: [{ id: "reminder-1", offsetMinutes: 15 }],
  planned: { date: "2026-08-10", startMinute: 540, estimateMinutes: 90 },
  deadline: { date: "2026-08-12", minute: null },
  recurrence: null,
};

test("task detail drafts project time, estimate, reminders, and tags without mutating the record", () => {
  const projected = applyDetailDraft("task", task, {
    at: 600,
    estimate: 120,
    reminders: [{ id: "draft-reminder", offsetMinutes: 60 }],
    tags: ["launch", "focus"],
  }, "2026-08-10");

  assert.deepEqual(projected.planned, {
    date: "2026-08-10",
    startMinute: 600,
    estimateMinutes: 120,
  });
  assert.deepEqual(projected.reminders, [{ id: "draft-reminder", offsetMinutes: 60 }]);
  assert.deepEqual(projected.tags, ["launch", "focus"]);
  assert.deepEqual(task.planned, { date: "2026-08-10", startMinute: 540, estimateMinutes: 90 });
});

test("task detail payload round-trip preserves an existing estimate and reminder", () => {
  const payload = buildDetailEntryPayload("task", task, "2026-08-10");
  const patch = buildTaskWritePatch(payload, "2026-08-10");

  assert.deepEqual(patch.planned, {
    date: "2026-08-10",
    startMinute: 540,
    estimateMinutes: 90,
  });
  assert.deepEqual(patch.reminders, [{ id: "reminder-1", offsetMinutes: 15 }]);
  assert.deepEqual(patch.tags, ["launch"]);
});

test("leaving waiting status clears its follow-up date in the write patch", () => {
  const payload = buildDetailEntryPayload("task", {
    ...task,
    status: "waiting",
    followUpDate: "2026-08-13",
  }, "2026-08-10");

  assert.deepEqual(
    buildTaskWritePatch({ ...payload, status: "open" }, "2026-08-10").followUpDate,
    null,
  );
});

test("clock ranges support ordinary, overnight, and full-day timed events", () => {
  assert.equal(durationFromClockRange(9 * 60, 10 * 60), 60);
  assert.equal(durationFromClockRange(23 * 60 + 30, 30), 60);
  assert.equal(durationFromClockRange(9 * 60, 9 * 60), 1440);
});

test("dated clock ranges preserve multi-day timed event length", () => {
  assert.equal(durationFromDatedClockRange("2026-08-10", 23 * 60, "2026-08-12", 60), 1560);
  assert.equal(durationFromDatedClockRange("2026-08-10", 23 * 60, "2026-08-10", 60), 120);
  assert.throws(
    () => durationFromDatedClockRange("2026-08-10", 60, "2026-08-09", 120),
    /endDate/,
  );
});

test("clock ranges reject invalid minute values", () => {
  assert.throws(() => durationFromClockRange(-1, 60), /startMinute/);
  assert.throws(() => durationFromClockRange(60, 1440), /endMinute/);
});
