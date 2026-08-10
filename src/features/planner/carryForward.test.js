import test from "node:test";
import assert from "node:assert/strict";
import { carriedTasks, getDayTasksWithCarry, isCarriedTask } from "./carryForward.js";
import { normalizeTaskInput } from "../../domains/tasks/index.js";

const TODAY = "2026-08-10";

let counter = 0;
function task(overrides = {}) {
  counter += 1;
  return normalizeTaskInput({
    id: overrides.id ?? `task-${counter}`,
    title: overrides.title ?? `Task ${counter}`,
    ...overrides,
  });
}

const state = (tasks) => ({ tasks, taskExceptions: [], events: [], notes: [] });
const idsOn = (tasks) => tasks.map((item) => item.id);

test("an undated, undeadlined, active task carries", () => {
  assert.equal(isCarriedTask(task({ id: "a" })), true);
});

test("a decision about when takes a task out of the carry set", () => {
  assert.equal(isCarriedTask(task({ planned: { date: TODAY } })), false, "planned date");
  assert.equal(isCarriedTask(task({ deadline: { date: TODAY } })), false, "deadline");
});

test("a settled task stops carrying", () => {
  for (const status of ["completed", "cancelled", "archived"]) {
    assert.equal(isCarriedTask(task({ status })), false, status);
  }
});

test("every active status carries", () => {
  for (const status of ["open", "in_progress", "waiting"]) {
    assert.equal(isCarriedTask(task({ status })), true, status);
  }
});

test("subtasks and recurring series never carry", () => {
  assert.equal(isCarriedTask(task({ parentTaskId: "parent-1" })), false);
  assert.equal(isCarriedTask(task({ recurrence: { frequency: "daily", interval: 1 } })), false);
});

test("nothing is not a task", () => {
  assert.equal(isCarriedTask(null), false);
  assert.equal(isCarriedTask(undefined), false);
});

test("a carried action appears on today and on every day ahead", () => {
  const db = state([task({ id: "float", title: "Renew passport" })]);
  for (const day of [TODAY, "2026-08-11", "2026-09-01", "2027-01-01"]) {
    assert.deepEqual(idsOn(getDayTasksWithCarry(db, day, { todayDate: TODAY })), ["float"], day);
  }
});

test("a carried action never appears in the past", () => {
  const db = state([task({ id: "float" })]);
  assert.deepEqual(getDayTasksWithCarry(db, "2026-08-09", { todayDate: TODAY }), []);
  assert.deepEqual(getDayTasksWithCarry(db, "2020-01-01", { todayDate: TODAY }), []);
});

test("carried actions sit after the day's own planned work", () => {
  const db = state([
    task({ id: "float", rank: 0 }),
    task({ id: "planned", planned: { date: TODAY }, rank: 1 }),
  ]);
  assert.deepEqual(idsOn(getDayTasksWithCarry(db, TODAY, { todayDate: TODAY })), ["planned", "float"]);
});

test("a carried action is marked so the day view can say what it is", () => {
  const db = state([task({ id: "float" }), task({ id: "planned", planned: { date: TODAY } })]);
  const [ownDay, carried] = getDayTasksWithCarry(db, TODAY, { todayDate: TODAY });
  assert.equal(ownDay.carried, undefined);
  assert.equal(carried.carried, true);
});

test("planning a carried action pins it to that day and stops the carry", () => {
  const db = state([task({ id: "float", planned: { date: "2026-08-12" } })]);
  assert.deepEqual(idsOn(getDayTasksWithCarry(db, "2026-08-12", { todayDate: TODAY })), ["float"]);
  assert.deepEqual(getDayTasksWithCarry(db, "2026-08-13", { todayDate: TODAY }), []);
});

test("completing a carried action removes it from every day at once", () => {
  const db = state([task({ id: "float", status: "completed" })]);
  assert.deepEqual(getDayTasksWithCarry(db, TODAY, { todayDate: TODAY }), []);
  assert.deepEqual(getDayTasksWithCarry(db, "2026-08-20", { todayDate: TODAY }), []);
});

test("a task is never listed twice on one day", () => {
  /* A task planned for today is already in the day's own read; the carry filter
     must not hand back a second copy under any ordering. */
  const db = state([task({ id: "planned", planned: { date: TODAY } })]);
  const rows = getDayTasksWithCarry(db, TODAY, { todayDate: TODAY });
  assert.equal(rows.length, 1);
  assert.equal(new Set(idsOn(rows)).size, rows.length);
});

test("without a todayDate the read is exactly the day's own tasks", () => {
  const db = state([task({ id: "float" }), task({ id: "planned", planned: { date: TODAY } })]);
  assert.deepEqual(idsOn(getDayTasksWithCarry(db, TODAY)), ["planned"]);
});

test("a state with no tasks reads as empty rather than throwing", () => {
  assert.deepEqual(getDayTasksWithCarry({}, TODAY, { todayDate: TODAY }), []);
  assert.deepEqual(carriedTasks(null), []);
});

test("the day key is validated", () => {
  assert.throws(() => getDayTasksWithCarry(state([]), "nope", { todayDate: TODAY }), TypeError);
});

test("carried actions come back in rank order", () => {
  const db = state([
    task({ id: "third", rank: 3 }),
    task({ id: "first", rank: 1 }),
    task({ id: "second", rank: 2 }),
  ]);
  assert.deepEqual(idsOn(carriedTasks(db)), ["first", "second", "third"]);
});
