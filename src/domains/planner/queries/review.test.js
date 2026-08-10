import assert from "node:assert/strict";
import test from "node:test";

import { getDailyReview } from "./review.js";

const DAY = "2026-08-10";

function state() {
  return {
    events: [
      { id: "event", title: "Retrospective", date: DAY, start: 600, dur: 30, allDay: false },
    ],
    overrides: {},
    tasks: [
      {
        id: "done-planned", title: "Sent proposal", status: "completed", parentTaskId: null,
        rank: 1, planned: { date: DAY, startMinute: null }, deadline: { date: null }, recurrence: null,
        completedAt: "2026-08-10T10:00:00Z",
      },
      {
        id: "done-inbox", title: "Captured follow-up", status: "completed", parentTaskId: null,
        rank: 2, planned: { date: null, startMinute: null }, deadline: { date: null }, recurrence: null,
        completedAt: "2026-08-10T11:00:00Z",
      },
      {
        id: "recurring", title: "Close the day", status: "open", parentTaskId: null,
        rank: 3, planned: { date: DAY, startMinute: null }, deadline: { date: null },
        recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
      },
      {
        id: "unfinished", title: "Write review", status: "open", parentTaskId: null,
        rank: 4, planned: { date: DAY, startMinute: null }, deadline: { date: null }, recurrence: null,
      },
    ],
    taskExceptions: [
      { id: "complete-recurring", seriesId: "recurring", occurrenceDate: DAY, kind: "completed", patch: {}, completedAt: "2026-08-10T12:00:00Z" },
    ],
    notes: [
      { id: "daily", kind: "daily", date: DAY, title: "Daily note", archived: false, pinned: false, links: [], blocks: [], updatedAt: "2026-08-10T12:00:00Z" },
    ],
  };
}

test("reports completed and unfinished work for one day without inventing attendance", () => {
  const review = getDailyReview(state(), DAY, { todayDate: DAY });

  assert.deepEqual(review.completed.map((item) => item.id), ["done-planned", "done-inbox", "recurring@2026-08-10"]);
  assert.deepEqual(review.unfinished.map((item) => item.id), ["unfinished"]);
  assert.equal(review.dailyNote.id, "daily");
  assert.equal(review.eventCount, 1);
  assert.deepEqual(review.scheduleVariance, { status: "unavailable", reason: "event attendance is not recorded" });
});

test("returns an honest empty review for a day with no records", () => {
  const review = getDailyReview({ events: [], overrides: {}, tasks: [], taskExceptions: [], notes: [] }, DAY, { todayDate: DAY });

  assert.deepEqual(review.completed, []);
  assert.deepEqual(review.unfinished, []);
  assert.deepEqual(review.notes, []);
  assert.equal(review.dailyNote, null);
  assert.equal(review.eventCount, 0);
});
