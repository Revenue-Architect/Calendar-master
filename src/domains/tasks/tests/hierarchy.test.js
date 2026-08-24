import test from "node:test";
import assert from "node:assert/strict";
import {
  canStart,
  checklistProgress,
  completeTask,
  createSubtask,
  createTask,
  deleteTask,
  getTaskTree,
  moveTask,
  normalizeTaskInput,
  promoteChecklistItem,
  reopenTask,
  subtaskProgress,
  taskProgress,
} from "../index.js";

const NOW = "2026-08-09T10:00";

function parentWithChildren() {
  let tasks = createTask([], { id: "p", title: "Ship pricing v2" }, { now: NOW }).tasks;
  tasks = createSubtask(tasks, "p", { id: "c1", title: "Pull cohort data" }, { now: NOW }).tasks;
  tasks = createSubtask(tasks, "p", { id: "c2", title: "Rebuild tier math" }, { now: NOW }).tasks;
  return tasks;
}

test("hierarchy is limited to one subtask level", () => {
  const tasks = parentWithChildren();
  assert.throws(
    () => createSubtask(tasks, "c1", { id: "g1", title: "Too deep" }, { now: NOW }),
    /limited to 1 subtask level/,
  );
});

test("a task cannot become its own ancestor", () => {
  const tasks = parentWithChildren();
  assert.throws(() => moveTask(tasks, "p", "c1"), /descendant of itself|limited to/);
});

test("parent progress counts required children only", () => {
  let tasks = parentWithChildren();
  assert.deepEqual(subtaskProgress(tasks, "p"), { done: 0, total: 2, complete: false });

  tasks = completeTask(tasks, "c1", { now: NOW }).tasks;
  assert.deepEqual(subtaskProgress(tasks, "p"), { done: 1, total: 2, complete: false });

  /* §7.3 cancelled children leave the denominator; waiting children do not */
  tasks = tasks.map((task) => (task.id === "c2" ? { ...task, status: "cancelled" } : task));
  assert.deepEqual(subtaskProgress(tasks, "p"), { done: 1, total: 1, complete: true });
});

test("a waiting child still counts as incomplete", () => {
  let tasks = parentWithChildren();
  tasks = tasks.map((task) => (task.id === "c1" ? { ...task, status: "waiting" } : task));
  assert.equal(subtaskProgress(tasks, "p").complete, false);
});

test("completing a parent with open children needs an explicit choice", () => {
  const tasks = parentWithChildren();
  assert.throws(() => completeTask(tasks, "p", { now: NOW }), /blocked|subtasks/);

  const { tasks: cascaded } = completeTask(tasks, "p", { now: NOW, completeSubtasks: true });
  assert.equal(cascaded.every((task) => task.status === "completed"), true, "no child work vanishes silently");
});

test("completing only the parent leaves child work intact", () => {
  const { tasks } = completeTask(parentWithChildren(), "p", { now: NOW, override: true });
  assert.equal(tasks.find((task) => task.id === "p").status, "completed");
  assert.equal(tasks.find((task) => task.id === "c1").status, "open");
});

test("a parent with open children reports why it is blocked", () => {
  const tasks = parentWithChildren();
  const { allowed, reasons } = canStart(tasks, tasks.find((task) => task.id === "p"));
  assert.equal(allowed, false);
  assert.deepEqual(reasons, [{ kind: "subtasks", remaining: 2 }]);
});

test("deleting a parent removes its children and reports them for undo", () => {
  const { tasks, events } = deleteTask(parentWithChildren(), "p");
  assert.deepEqual(tasks, []);
  assert.deepEqual(events[0].removed.map((task) => task.id).sort(), ["c1", "c2", "p"]);
});

test("getTaskTree returns the parent with its ordered children", () => {
  const tree = getTaskTree(parentWithChildren(), "p");
  assert.equal(tree.task.id, "p");
  assert.deepEqual(tree.children.map((entry) => entry.task.id), ["c1", "c2"]);
});

test("a subtask cannot carry its own recurrence", () => {
  assert.throws(
    () => normalizeTaskInput({
      id: "c", title: "C", parentTaskId: "p", recurrence: { frequency: "daily", interval: 1 },
    }),
    /subtask cannot carry its own recurrence/,
  );
});

test("promoting a checklist item keeps title, state and order and grants identity", () => {
  const tasks = createTask([], {
    id: "p",
    title: "Ship",
    checklist: [
      { id: "i1", title: "Draft", done: true, completedAt: NOW },
      { id: "i2", title: "Review", done: false },
    ],
  }, { now: NOW }).tasks;

  const { tasks: promoted } = promoteChecklistItem(tasks, "p", "i1", "new", { now: NOW });
  const created = promoted.find((task) => task.id === "new");
  assert.equal(created.title, "Draft");
  assert.equal(created.status, "completed");
  assert.equal(created.parentTaskId, "p");
  assert.deepEqual(promoted.find((task) => task.id === "p").checklist.map((item) => item.id), ["i2"]);
});

test("checklist progress is reported apart from subtask progress", () => {
  const tasks = createTask([], {
    id: "p",
    title: "Ship",
    checklist: [{ id: "i1", title: "A", done: true }, { id: "i2", title: "B", done: false }],
  }, { now: NOW }).tasks;
  assert.deepEqual(checklistProgress(tasks[0].checklist), { done: 1, total: 2, complete: false });
});

test("taskProgress keeps checklist and subtask tracks separate", () => {
  let tasks = createTask([], {
    id: "p",
    title: "Ship",
    checklist: [{ id: "i1", title: "Draft", done: true }, { id: "i2", title: "Review", done: false }],
  }, { now: NOW }).tasks;
  tasks = createSubtask(tasks, "p", { id: "c1", title: "Pull data" }, { now: NOW }).tasks;
  tasks = createSubtask(tasks, "p", { id: "c2", title: "Rebuild math" }, { now: NOW }).tasks;
  tasks = completeTask(tasks, "c1", { now: NOW }).tasks;
  tasks = tasks.map((task) => (task.id === "c2" ? { ...task, status: "cancelled" } : task));

  const progress = taskProgress(tasks, tasks.find((task) => task.id === "p"));
  assert.deepEqual(progress.checklist, { done: 1, total: 2 });
  assert.deepEqual(progress.subtasks, { done: 1, total: 1, complete: true });
  assert.equal(
    progress.checklist.done + progress.subtasks.done,
    2,
    "a combined percentage would hide that checklist work is still open",
  );
});

test("promoting a checklist item moves that unit onto the subtask track", () => {
  let tasks = createTask([], {
    id: "p",
    title: "Ship",
    checklist: [
      { id: "i1", title: "Draft", done: true, completedAt: NOW },
      { id: "i2", title: "Review", done: false },
    ],
  }, { now: NOW }).tasks;
  const parent = () => tasks.find((task) => task.id === "p");

  tasks = promoteChecklistItem(tasks, "p", "i2", "child-open", { now: NOW }).tasks;
  assert.deepEqual(taskProgress(tasks, parent()).checklist, { done: 1, total: 1 });
  assert.deepEqual(taskProgress(tasks, parent()).subtasks, { done: 0, total: 1, complete: false });

  tasks = promoteChecklistItem(tasks, "p", "i1", "child-done", { now: NOW }).tasks;
  assert.deepEqual(taskProgress(tasks, parent()).checklist, { done: 0, total: 0 });
  assert.deepEqual(taskProgress(tasks, parent()).subtasks, { done: 1, total: 2, complete: false });
  assert.equal(parent().checklist.length, 0);
  assert.equal(tasks.some((task) => "progress" in task), false);
});

test("reopening a parent does not reopen its checklist items", () => {
  let tasks = createTask([], {
    id: "p",
    title: "Ship",
    checklist: [{ id: "i1", title: "A", done: true, completedAt: NOW }],
  }, { now: NOW }).tasks;
  tasks = completeTask(tasks, "p", { now: NOW }).tasks;
  tasks = reopenTask(tasks, "p", { now: NOW }).tasks;
  assert.equal(tasks[0].status, "open");
  assert.equal(tasks[0].checklist[0].done, true);
});

test("checklist order survives a normalisation round trip", () => {
  const tasks = createTask([], {
    id: "p",
    title: "Ship",
    checklist: [
      { id: "b", title: "Second", order: 5 },
      { id: "a", title: "First", order: 1 },
    ],
  }, { now: NOW }).tasks;
  assert.deepEqual(tasks[0].checklist.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(tasks[0].checklist.map((item) => item.order), [0, 1]);
});
