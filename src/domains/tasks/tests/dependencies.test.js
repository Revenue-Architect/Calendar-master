import test from "node:test";
import assert from "node:assert/strict";
import {
  addTaskDependency,
  completeTask,
  createTask,
  deleteTask,
  getBlockedTasks,
  getDependents,
  getEarliestResponsibleStart,
  getTaskBlockers,
  isBlocked,
  removeTaskDependency,
  restoreTask,
} from "../index.js";

const NOW = "2026-08-09T10:00";

function seed(...inputs) {
  return inputs.reduce((tasks, input) => createTask(tasks, input, { now: NOW }).tasks, []);
}

const base = () => seed(
  { id: "a", title: "Draft the contract" },
  { id: "b", title: "Send the contract" },
);

test("a dependency blocks until its blocker settles", () => {
  const { tasks } = addTaskDependency(base(), "b", "a");
  assert.equal(isBlocked(tasks, "b"), true);
  assert.deepEqual(getTaskBlockers(tasks, "b").map((task) => task.id), ["a"]);

  const done = completeTask(tasks, "a", { now: NOW }).tasks;
  assert.equal(isBlocked(done, "b"), false);
});

test("the inverse direction is derived, not stored", () => {
  const { tasks } = addTaskDependency(base(), "b", "a");
  assert.deepEqual(tasks.find((task) => task.id === "b").dependsOn, ["a"]);
  /* nothing is written onto the blocker itself */
  assert.equal("blocks" in tasks.find((task) => task.id === "a"), false);
  assert.deepEqual(getDependents(tasks, "a").map((task) => task.id), ["b"]);
});

test("cancelling a blocker releases its dependents instead of deadlocking them", () => {
  const { tasks } = addTaskDependency(base(), "b", "a");
  const cancelled = tasks.map((task) => (task.id === "a" ? { ...task, status: "cancelled" } : task));
  assert.equal(isBlocked(cancelled, "b"), false);
});

test("direct and transitive cycles are rejected", () => {
  let tasks = seed(
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C" },
  );
  tasks = addTaskDependency(tasks, "b", "a").tasks;
  tasks = addTaskDependency(tasks, "c", "b").tasks;

  assert.throws(() => addTaskDependency(tasks, "a", "a"), /cannot depend on itself/);
  assert.throws(() => addTaskDependency(tasks, "a", "c"), /cycle/);
});

test("a task cannot depend on its own parent or child", () => {
  let tasks = seed({ id: "parent", title: "Ship release" });
  tasks = createTask(tasks, { id: "child", title: "Cut the tag", parentTaskId: "parent" }, { now: NOW }).tasks;

  assert.throws(() => addTaskDependency(tasks, "child", "parent"), /ancestor or descendant/);
  assert.throws(() => addTaskDependency(tasks, "parent", "child"), /ancestor or descendant/);
});

test("subtasks under different parents may depend on each other", () => {
  let tasks = seed({ id: "p1", title: "Backend" }, { id: "p2", title: "Frontend" });
  tasks = createTask(tasks, { id: "c1", title: "Ship the API", parentTaskId: "p1" }, { now: NOW }).tasks;
  tasks = createTask(tasks, { id: "c2", title: "Wire the UI", parentTaskId: "p2" }, { now: NOW }).tasks;

  const { tasks: linked } = addTaskDependency(tasks, "c2", "c1");
  assert.deepEqual(getTaskBlockers(linked, "c2").map((task) => task.id), ["c1"]);
});

test("adding the same edge twice is idempotent", () => {
  const first = addTaskDependency(base(), "b", "a");
  const second = addTaskDependency(first.tasks, "b", "a");
  assert.deepEqual(second.tasks.find((task) => task.id === "b").dependsOn, ["a"]);
  assert.deepEqual(second.events, []);
});

test("deleting a blocker detaches edges without deleting dependents", () => {
  const { tasks } = addTaskDependency(base(), "b", "a");
  const removed = deleteTask(tasks, "a");

  const b = removed.tasks.find((task) => task.id === "b");
  assert.ok(b, "dependent survives");
  assert.deepEqual(b.dependsOn, [], "no dangling blocker reference");
  assert.equal(isBlocked(removed.tasks, "b"), false);
});

test("undo restores a deleted blocker and the edges that pointed at it", () => {
  const { tasks } = addTaskDependency(base(), "b", "a");
  const { tasks: afterDelete, events } = deleteTask(tasks, "a");
  const { removed, detachedFrom } = events[0];

  const { tasks: restored } = restoreTask(afterDelete, removed, detachedFrom);
  assert.deepEqual(restored.find((task) => task.id === "b").dependsOn, ["a"]);
  assert.equal(isBlocked(restored, "b"), true);
});

test("completing a blocked task requires an explicit override and records it", () => {
  const { tasks } = addTaskDependency(base(), "b", "a");
  assert.throws(() => completeTask(tasks, "b", { now: NOW }), /blocked/);

  const { tasks: forced, events } = completeTask(tasks, "b", { now: NOW, override: true });
  assert.equal(forced.find((task) => task.id === "b").completedWhileBlocked, true);
  assert.deepEqual(events.at(-1).overriddenBlockers, ["a"]);
});

test("earliest responsible start follows the latest unsatisfied blocker", () => {
  let tasks = seed(
    { id: "a", title: "A", deadline: { date: "2026-08-12" } },
    { id: "b", title: "B", planned: { date: "2026-08-15" } },
    { id: "c", title: "C" },
  );
  tasks = addTaskDependency(tasks, "c", "a").tasks;
  tasks = addTaskDependency(tasks, "c", "b").tasks;

  assert.equal(getEarliestResponsibleStart(tasks, "c"), "2026-08-15");

  /* satisfied blockers drop out of the calculation */
  const done = completeTask(tasks, "b", { now: NOW }).tasks;
  assert.equal(getEarliestResponsibleStart(done, "c"), "2026-08-12");
});

test("no dependencies means no constraint rather than a date", () => {
  assert.equal(getEarliestResponsibleStart(base(), "b"), null);
});

test("removing an edge unblocks and getBlockedTasks reflects it", () => {
  const { tasks } = addTaskDependency(base(), "b", "a");
  assert.deepEqual(getBlockedTasks(tasks).map((task) => task.id), ["b"]);

  const { tasks: cleared } = removeTaskDependency(tasks, "b", "a");
  assert.deepEqual(getBlockedTasks(cleared), []);
});
