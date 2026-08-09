import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskInput } from "../index.js";
import {
  expandTaskOccurrences,
  makeTaskOccurrenceId,
  materializeOccurrence,
  occursOn,
  parseTaskOccurrenceId,
  unfinishedBefore,
  upsertTaskException,
} from "../recurrence/taskRecurrence.js";
import { getDayTasks, getOverdueForToday } from "../queries/dayView.js";

const TODAY = "2026-08-09";

const series = (recurrence, planned = "2026-08-01") => normalizeTaskInput({
  id: "habit",
  title: "Walk 8k steps",
  planned: { date: planned },
  recurrence,
});

test("occurrence ids round-trip", () => {
  const id = makeTaskOccurrenceId("habit", TODAY);
  assert.deepEqual(parseTaskOccurrenceId(id), { seriesId: "habit", occurrenceDate: TODAY });
});

test("daily interval stays in phase with its anchor", () => {
  const task = series({ frequency: "daily", interval: 2 });
  assert.equal(occursOn(task, "2026-08-01"), true);
  assert.equal(occursOn(task, "2026-08-02"), false);
  assert.equal(occursOn(task, "2026-08-03"), true);
});

test("weekly rules honour selected weekdays and interval", () => {
  const task = series({ frequency: "weekly", interval: 2, byWeekday: [1, 3] }, "2026-08-03");
  assert.equal(occursOn(task, "2026-08-03"), true, "anchor Monday");
  assert.equal(occursOn(task, "2026-08-05"), true, "Wednesday same week");
  assert.equal(occursOn(task, "2026-08-10"), false, "skipped week");
  assert.equal(occursOn(task, "2026-08-17"), true, "two weeks on");
});

test("monthly and yearly rules match the anchor date", () => {
  assert.equal(occursOn(series({ frequency: "monthly", interval: 1 }, "2026-01-15"), "2026-03-15"), true);
  assert.equal(occursOn(series({ frequency: "monthly", interval: 2 }, "2026-01-15"), "2026-02-15"), false);
  assert.equal(occursOn(series({ frequency: "yearly", interval: 1 }, "2026-02-11"), "2027-02-11"), true);
});

test("until bounds the series", () => {
  const task = series({ frequency: "daily", interval: 1, until: "2026-08-05" });
  assert.equal(occursOn(task, "2026-08-05"), true);
  assert.equal(occursOn(task, "2026-08-06"), false);
});

test("a cancelled occurrence disappears without touching the series", () => {
  const task = series({ frequency: "daily", interval: 1 });
  const exceptions = upsertTaskException([], {
    id: "x1", seriesId: "habit", occurrenceDate: TODAY, kind: "cancelled",
  });
  assert.equal(materializeOccurrence(task, TODAY, exceptions), null);
  assert.equal(occursOn(task, TODAY), true, "series itself is unchanged");
});

test("a completed occurrence records completion on that instance only", () => {
  const task = series({ frequency: "daily", interval: 1 });
  const exceptions = upsertTaskException([], {
    id: "x1", seriesId: "habit", occurrenceDate: TODAY, kind: "completed", completedAt: `${TODAY}T09:00`,
  });
  assert.equal(materializeOccurrence(task, TODAY, exceptions).status, "completed");
  assert.equal(materializeOccurrence(task, "2026-08-08", exceptions).status, "open");
});

/* §9.3 — the policies that decide whether a habit can generate overdue debt. */

test("skip leaves no debt behind", () => {
  const task = series({ frequency: "daily", interval: 1, missedPolicy: "skip" });
  assert.deepEqual(unfinishedBefore(task, TODAY, []), []);
});

test("roll_forward carries only the latest missed instance", () => {
  const task = series({ frequency: "daily", interval: 1, missedPolicy: "roll_forward" });
  const missed = unfinishedBefore(task, TODAY, []);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].occurrenceDate, "2026-08-08", "the most recent one");
});

test("accumulate keeps every missed instance actionable", () => {
  const task = series({ frequency: "daily", interval: 1, missedPolicy: "accumulate" });
  const missed = unfinishedBefore(task, TODAY, []);
  assert.equal(missed.length, 8, "2026-08-01 through 2026-08-08");
});

test("a daily habit contributes nothing to today's overdue list by default", () => {
  const state = {
    tasks: [
      series({ frequency: "daily", interval: 1 }),
      normalizeTaskInput({ id: "late", title: "Chase the invoice", deadline: { date: "2026-08-01" } }),
    ],
    taskExceptions: [],
  };
  assert.deepEqual(getOverdueForToday(state, TODAY).map((task) => task.id), ["late"]);
});

test("the day view expands a series and hides subtasks", () => {
  const state = {
    tasks: [
      series({ frequency: "daily", interval: 1 }),
      normalizeTaskInput({ id: "p", title: "Parent", planned: { date: TODAY } }),
      normalizeTaskInput({ id: "c", title: "Child", parentTaskId: "p", planned: { date: TODAY } }),
    ],
    taskExceptions: [],
  };
  const ids = getDayTasks(state, TODAY).map((task) => task.id);
  assert.ok(ids.includes(makeTaskOccurrenceId("habit", TODAY)));
  assert.ok(ids.includes("p"));
  assert.ok(!ids.includes("c"), "subtasks are shown under their parent, not as rows");
});

test("expansion covers a half-open range", () => {
  const task = series({ frequency: "daily", interval: 1 });
  const occurrences = expandTaskOccurrences(task, "2026-08-01", "2026-08-04", []);
  assert.deepEqual(occurrences.map((entry) => entry.occurrenceDate), ["2026-08-01", "2026-08-02", "2026-08-03"]);
});
