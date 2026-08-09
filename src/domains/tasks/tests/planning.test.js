import test from "node:test";
import assert from "node:assert/strict";
import {
  createTask,
  deferTask,
  derivedStates,
  getOverdueTasks,
  getUpcomingDeadlines,
  isDueToday,
  isOverdue,
  normalizeTaskInput,
} from "../index.js";

const TODAY = "2026-08-09";
const NOW = "2026-08-09T10:00";
const task = (input) => normalizeTaskInput({ id: "t", title: "T", ...input });

/* §5.5 is the rule this planner gets wrong most easily, so it is pinned hardest. */

test("a passed deadline makes a one-off task overdue", () => {
  assert.equal(isOverdue(task({ deadline: { date: "2026-08-08" } }), TODAY), true);
});

test("a passed planned date does not make a task overdue", () => {
  const replanned = task({ planned: { date: "2026-08-01" } });
  assert.equal(isOverdue(replanned, TODAY), false, "moving planned work is not failure");
});

test("a task with no deadline never becomes overdue", () => {
  assert.equal(isOverdue(task({ planned: { date: "2026-01-01" } }), TODAY), false);
});

test("a completed task is never overdue", () => {
  const done = task({ deadline: { date: "2026-08-01" }, status: "completed", completedAt: NOW });
  assert.equal(isOverdue(done, TODAY), false);
});

test("a habit does not accumulate overdue debt under the default skip policy", () => {
  const habit = task({
    deadline: { date: "2026-08-01" },
    recurrence: { frequency: "daily", interval: 1 },
  });
  assert.equal(habit.recurrence.missedPolicy, "skip", "skip is the default");
  assert.equal(isOverdue(habit, TODAY), false);
});

test("an accumulate series does report overdue", () => {
  const series = task({
    deadline: { date: "2026-08-01" },
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "accumulate" },
  });
  assert.equal(isOverdue(series, TODAY), true);
});

test("due today is driven by the deadline, not the planned date", () => {
  assert.equal(isDueToday(task({ deadline: { date: TODAY } }), TODAY), true);
  assert.equal(isDueToday(task({ planned: { date: TODAY } }), TODAY), false);
});

test("deferring moves planned work and preserves the deadline", () => {
  const { tasks } = createTask([], {
    id: "a",
    title: "Chase the invoice",
    planned: { date: TODAY },
    deadline: { date: "2026-08-20" },
  }, { now: NOW });

  const { tasks: deferred, events } = deferTask(tasks, "a", 1, { now: NOW });
  const moved = deferred[0];
  assert.equal(moved.planned.date, "2026-08-10");
  assert.equal(moved.deadline.date, "2026-08-20", "deadline untouched");
  assert.equal(events[0].type, "TaskDeferred");
  assert.equal(events[0].deadlinePreserved, "2026-08-20");
});

test("inbox means captured but not organised", () => {
  assert.ok(derivedStates([], task({}), TODAY).includes("inbox"));
  assert.ok(!derivedStates([], task({ planned: { date: TODAY } }), TODAY).includes("inbox"));
  assert.ok(!derivedStates([], task({ someday: true }), TODAY).includes("inbox"));
});

test("someday work stays out of daily pressure", () => {
  const states = derivedStates([], task({ someday: true }), TODAY);
  assert.ok(states.includes("someday"));
  assert.ok(!states.includes("overdue"));
});

test("overdue and upcoming-deadline queries agree with the policy", () => {
  const tasks = [
    task({ id: "late", title: "Late", deadline: { date: "2026-08-01" } }),
    task({ id: "soon", title: "Soon", deadline: { date: "2026-08-11" } }),
    task({ id: "replanned", title: "Replanned", planned: { date: "2026-07-01" } }),
  ];
  assert.deepEqual(getOverdueTasks(tasks, TODAY).map((entry) => entry.id), ["late"]);
  assert.deepEqual(getUpcomingDeadlines(tasks, TODAY).map((entry) => entry.id), ["soon"]);
});

test("planned time requires a planned day", () => {
  assert.throws(() => task({ planned: { startMinute: 540 } }), /requires a planned date/);
});
