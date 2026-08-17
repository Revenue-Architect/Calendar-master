import test from "node:test";
import assert from "node:assert/strict";
import { planOverdueForDate, planOverdueForToday, pullableOverdue } from "./overduePull.js";
import {
  getOverdueForToday,
  normalizeTaskInput,
  makeTaskOccurrenceId,
} from "../../domains/tasks/index.js";

const TODAY = "2026-08-10";
const YESTERDAY = "2026-08-09";

let seq = 0;
const makeId = () => `gen-${++seq}`;
test.beforeEach(() => { seq = 0; });

const task = (overrides) => normalizeTaskInput({ title: "Task", ...overrides });
const state = (tasks, taskExceptions = []) => ({ tasks, taskExceptions, events: [], notes: [] });
const byId = (s, id) => s.tasks.find((item) => item.id === id);

test("an overdue task planned for another day is pullable", () => {
  const overdue = [task({ id: "a", deadline: { date: YESTERDAY }, planned: { date: YESTERDAY } })];
  assert.deepEqual(pullableOverdue(overdue, TODAY).map((t) => t.id), ["a"]);
});

test("an overdue task already planned for today is not pullable", () => {
  /* It stays overdue — the deadline has passed and planning cannot un-miss it —
     but pulling it would move nothing, so it must not be counted. */
  const overdue = [task({ id: "a", deadline: { date: YESTERDAY }, planned: { date: TODAY } })];
  assert.deepEqual(pullableOverdue(overdue, TODAY), []);
});

test("an overdue task with no planned date at all is pullable", () => {
  const overdue = [task({ id: "a", deadline: { date: YESTERDAY } })];
  assert.deepEqual(pullableOverdue(overdue, TODAY).map((t) => t.id), ["a"]);
});

test("an empty or missing overdue list is empty", () => {
  assert.deepEqual(pullableOverdue([], TODAY), []);
  assert.deepEqual(pullableOverdue(null, TODAY), []);
});

test("planning nothing changes nothing, including the state's identity", () => {
  const before = state([task({ id: "a", deadline: { date: YESTERDAY }, planned: { date: TODAY } })]);
  const after = planOverdueForToday(before, [byId(before, "a")], TODAY, { makeId });
  assert.equal(after.planned, 0);
  assert.equal(after.state, before, "an empty pull must not churn state");
});

test("a one-off overdue task is planned onto today, deadline untouched", () => {
  const before = state([task({
    id: "a", deadline: { date: YESTERDAY }, planned: { date: YESTERDAY, startMinute: 540 },
  })]);
  const { state: after, planned } = planOverdueForToday(before, before.tasks, TODAY, { makeId });

  assert.equal(planned, 1);
  const moved = byId(after, "a");
  assert.equal(moved.planned.date, TODAY);
  assert.equal(moved.planned.startMinute, 540, "the time of day is kept");
  assert.equal(moved.deadline.date, YESTERDAY, "planning never moves a deadline");
  assert.equal(moved.status, "open", "and never completes anything");
});

test("several overdue tasks are all planned in one pass", () => {
  const before = state([
    task({ id: "a", deadline: { date: YESTERDAY }, planned: { date: YESTERDAY } }),
    task({ id: "b", deadline: { date: "2026-08-01" } }),
    task({ id: "c", deadline: { date: YESTERDAY }, planned: { date: TODAY } }),
  ]);
  const { state: after, planned } = planOverdueForToday(before, before.tasks, TODAY, { makeId });

  assert.equal(planned, 2, "the one already on today is not counted");
  assert.equal(byId(after, "a").planned.date, TODAY);
  assert.equal(byId(after, "b").planned.date, TODAY);
  assert.equal(byId(after, "c").planned.date, TODAY);
});

test("a missed occurrence of a series detaches into a real task and is planned", () => {
  const series = task({
    id: "habit",
    title: "Weekly report",
    planned: { date: "2026-08-01", startMinute: 600 },
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "accumulate" },
  });
  const before = state([series]);
  const occurrence = { ...series, id: makeTaskOccurrenceId("habit", YESTERDAY), planned: { ...series.planned, date: YESTERDAY } };

  const { state: after, planned } = planOverdueForToday(before, [occurrence], TODAY, { makeId });
  assert.equal(planned, 1);

  /* The series is untouched — this detaches one day, it does not reschedule a habit. */
  const stillSeries = byId(after, "habit");
  assert.ok(stillSeries.recurrence, "the series keeps recurring");
  assert.equal(stillSeries.planned.date, "2026-08-01", "the series' own plan is unmoved");

  /* The detached task is real, one-off, and on today. */
  const detached = after.tasks.find((item) => item.id !== "habit");
  assert.ok(detached, "a detached task was created");
  assert.equal(detached.recurrence, null);
  assert.equal(detached.planned.date, TODAY);
  assert.equal(detached.planned.startMinute, 600, "the occurrence keeps its time");
  assert.equal(detached.title, "Weekly report");

  /* And the day is cancelled on the series, so it cannot also still be owed. */
  const exception = after.taskExceptions.find((e) => e.seriesId === "habit" && e.occurrenceDate === YESTERDAY);
  assert.ok(exception, "the occurrence is cancelled on the series");
  assert.equal(exception.kind, "cancelled");
});

test("a detached occurrence is no longer reported as overdue afterwards", () => {
  /* The round trip that matters: pull it, then ask the domain again. Owing the
     same day twice is the bug this guards. */
  const series = task({
    id: "habit",
    planned: { date: "2026-08-01" },
    deadline: { date: null },
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "accumulate" },
  });
  const before = state([series]);
  const owedBefore = getOverdueForToday(before, TODAY);
  assert.ok(owedBefore.length > 0, "the series owes something to begin with");

  const { state: after } = planOverdueForToday(before, owedBefore, TODAY, { makeId });
  const owedAfter = getOverdueForToday(after, TODAY);

  const stillOwed = owedAfter.filter((item) => owedBefore.some((was) => was.id === item.id));
  assert.deepEqual(stillOwed, [], "no day is owed twice after being pulled");
});

test("mixed one-offs and occurrences are handled in the same pass", () => {
  const series = task({
    id: "habit", planned: { date: "2026-08-01" },
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "accumulate" },
  });
  const oneOff = task({ id: "solo", deadline: { date: YESTERDAY }, planned: { date: YESTERDAY } });
  const before = state([series, oneOff]);
  const overdue = [
    { ...series, id: makeTaskOccurrenceId("habit", YESTERDAY), planned: { ...series.planned, date: YESTERDAY } },
    oneOff,
  ];

  const { state: after, planned } = planOverdueForToday(before, overdue, TODAY, { makeId });
  assert.equal(planned, 2);
  assert.equal(byId(after, "solo").planned.date, TODAY);
  assert.equal(after.tasks.filter((t) => t.planned.date === TODAY).length, 2);
});

test("the id factory is required rather than silently random", () => {
  const before = state([task({ id: "a", deadline: { date: YESTERDAY } })]);
  assert.throws(() => planOverdueForToday(before, before.tasks, TODAY), TypeError);
});

test("planning is deterministic given the same ids", () => {
  const build = () => {
    let n = 0;
    const before = state([task({
      id: "habit", planned: { date: "2026-08-01" },
      recurrence: { frequency: "daily", interval: 1, missedPolicy: "accumulate" },
    })]);
    const occurrence = { ...before.tasks[0], id: makeTaskOccurrenceId("habit", YESTERDAY) };
    return planOverdueForToday(before, [occurrence], TODAY, { makeId: () => `fixed-${++n}` }).state;
  };
  assert.deepEqual(build(), build());
});

test("planning can land on a chosen day, not only today", () => {
  const before = state([task({
    id: "a", deadline: { date: YESTERDAY }, planned: { date: YESTERDAY, startMinute: 540 },
  })]);
  const { state: after, planned } = planOverdueForDate(before, before.tasks, "2026-08-18", { makeId });
  assert.equal(planned, 1);
  assert.equal(byId(after, "a").planned.date, "2026-08-18");
  assert.equal(byId(after, "a").deadline.date, YESTERDAY);
});
