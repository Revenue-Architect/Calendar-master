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
import { getDayTasks, getNextTaskOccurrence, getOverdueForToday } from "../queries/dayView.js";

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

test("finds the next recurring task instance with its canonical identity", () => {
  const state = { tasks: [series({ frequency: "daily", interval: 1 })], taskExceptions: [] };

  const occurrence = getNextTaskOccurrence(state, "habit", "2026-08-10");
  assert.equal(occurrence.id, "habit@2026-08-10");
  assert.equal(occurrence.occurrenceDate, "2026-08-10");
});

/* An exception cannot outlive the series that owns it: a stored exception whose
   series is gone fails whole-notebook validation, and a notebook that fails
   validation stops saving entirely. */

test("exceptions for a removed series are separable and removable", async () => {
  const { removeTaskExceptionsForSeries, taskExceptionsForSeries } = await import("../recurrence/taskRecurrence.js");
  const exceptions = [
    { id: "a", seriesId: "gone", occurrenceDate: "2026-08-05", kind: "completed", patch: {} },
    { id: "b", seriesId: "kept", occurrenceDate: "2026-08-05", kind: "cancelled", patch: {} },
  ];
  assert.deepEqual(taskExceptionsForSeries(exceptions, ["gone"]).map((x) => x.id), ["a"]);
  assert.deepEqual(removeTaskExceptionsForSeries(exceptions, ["gone"]).map((x) => x.id), ["b"]);
  assert.deepEqual(removeTaskExceptionsForSeries(exceptions, new Set(["gone", "kept"])), []);
  assert.deepEqual(removeTaskExceptionsForSeries(undefined, ["gone"]), [], "tolerates a notebook with no exceptions");
});

test("deleting a series and its exceptions leaves a state that still validates", async () => {
  const { validatePlannerStateV7 } = await import("../../notes/migrations/validatePlannerStateV7.js");
  const { deleteTask } = await import("../index.js");
  const { removeTaskExceptionsForSeries } = await import("../recurrence/taskRecurrence.js");

  const series = normalizeTaskInput({ id: "s", title: "Habit", planned: { date: "2026-08-01" }, recurrence: { frequency: "daily", interval: 1 } });
  const exceptions = upsertTaskException([], { id: "x", seriesId: "s", occurrenceDate: "2026-08-05", kind: "completed", completedAt: "2026-08-05T09:00" });
  const removed = deleteTask([series], "s");

  const shell = {
    schemaVersion: 7,
    calendars: [{ id: "c", name: "C", status: "active", role: "owner", isDefault: true, isVisible: true, includeInAvailability: true }],
    events: [], eventExceptions: [], occurrenceAliases: [], overrides: {},
    taskLists: [{ id: "list-default", name: "Actions", isDefault: true }],
    notebooks: [{ id: "notebook-default", name: "Notes", isDefault: true }], notes: [],
  };
  assert.throws(
    () => validatePlannerStateV7({ ...shell, tasks: removed.tasks, taskExceptions: exceptions }),
    /exception/,
    "keeping the exception is exactly what breaks the notebook",
  );
  assert.doesNotThrow(
    () => validatePlannerStateV7({ ...shell, tasks: removed.tasks, taskExceptions: removeTaskExceptionsForSeries(exceptions, ["s"]) }),
  );
});
