import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNote } from "../../domains/notes/model/note.js";
import { validatePlannerStateV7 } from "../../domains/notes/migrations/validatePlannerStateV7.js";
import { normalizeTaskInput } from "../../domains/tasks/model/task.js";
import { getDayTasks } from "../../domains/tasks/queries/dayView.js";
import { createBlankPlannerState } from "../../platform/persistence/plannerStateImport.js";
import {
  applyBulkTaskAction,
  createTaskMutationUndoPayload,
  deleteTaskFromPlannerState,
  restoreDeletedTaskInPlannerState,
  restoreTaskPlannedDates,
} from "./taskMutations.js";

const task = (input) => normalizeTaskInput({
  id: input.id,
  title: input.title ?? input.id,
  planned: { date: input.date ?? "2026-08-09", startMinute: null, estimateMinutes: null },
  deadline: { date: null, minute: null },
  reward: input.reward ?? 30,
  ...input,
});

function stateWithTasks(tasks) {
  return { ...createBlankPlannerState(), tasks, taskExceptions: [], notes: [] };
}

test("restores canonical planned dates without creating legacy date fields", () => {
  const tasks = [task({ id: "a", date: "2026-08-10" }), task({ id: "b", date: "2026-08-11" })];
  const restored = restoreTaskPlannedDates(tasks, [
    { id: "a", date: "2026-08-01" },
    { id: "b", date: null },
  ]);

  assert.equal(restored[0].planned.date, "2026-08-01");
  assert.equal(restored[1].planned.date, null);
  assert.equal(Object.hasOwn(restored[0], "date"), false);
  assert.equal(Object.hasOwn(restored[1], "date"), false);
});

test("occurrence mutations receive an exact state undo while one-offs keep their targeted undo", () => {
  const original = stateWithTasks([task({
    id: "habit",
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
  })]);
  const fallback = { type: "task-defer", id: "habit", n: -1 };

  assert.deepEqual(createTaskMutationUndoPayload(original, "habit", fallback), fallback);
  const occurrenceUndo = createTaskMutationUndoPayload(original, "habit@2026-08-09", fallback);
  assert.equal(occurrenceUndo.type, "restore-planner-state");
  assert.deepEqual(occurrenceUndo.snapshot.state, original);
  assert.notEqual(occurrenceUndo.snapshot.state, original);
});

test("series deletion and undo preserve dependencies, exceptions, and note extraction references", () => {
  const habit = task({
    id: "habit",
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
  });
  const child = task({ id: "child", parentTaskId: "habit", recurrence: null });
  const dependent = task({ id: "dependent", dependsOn: ["habit"] });
  const note = normalizeNote({
    id: "note",
    kind: "daily",
    date: "2026-08-09",
    blocks: [{ id: "block", type: "checklist", text: "Walk", order: 0, done: false, extractedTaskId: "habit" }],
  });
  const original = {
    ...stateWithTasks([habit, child, dependent]),
    notes: [note],
    taskExceptions: [{
      id: "exception",
      seriesId: "habit",
      occurrenceDate: "2026-08-08",
      kind: "completed",
      patch: {},
      completedAt: "2026-08-08T09:00",
    }],
  };
  validatePlannerStateV7(original);

  const deleted = deleteTaskFromPlannerState(original, "habit", { exceptionId: "unused" });
  validatePlannerStateV7(deleted.state);
  assert.deepEqual(deleted.state.tasks.map((entry) => entry.id), ["dependent"]);
  assert.deepEqual(deleted.state.tasks[0].dependsOn, []);
  assert.deepEqual(deleted.state.taskExceptions, []);
  assert.equal(deleted.state.notes[0].blocks[0].extractedTaskId, null);

  const restored = restoreDeletedTaskInPlannerState(deleted.state, deleted.removed);
  validatePlannerStateV7(restored);
  assert.deepEqual(new Set(restored.tasks.map((entry) => entry.id)), new Set(["habit", "child", "dependent"]));
  assert.deepEqual(restored.tasks.find((entry) => entry.id === "dependent").dependsOn, ["habit"]);
  assert.equal(restored.taskExceptions[0].id, "exception");
  assert.equal(restored.notes[0].blocks[0].extractedTaskId, "habit");
});

test("deleting one recurring occurrence writes and restores a typed exception", () => {
  const original = stateWithTasks([task({
    id: "habit",
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
  })]);

  const deleted = deleteTaskFromPlannerState(original, "habit@2026-08-09", { exceptionId: "cancel" });
  assert.equal(getDayTasks(deleted.state, "2026-08-09").length, 0);
  assert.deepEqual(deleted.state.taskExceptions[0], {
    id: "cancel",
    seriesId: "habit",
    occurrenceDate: "2026-08-09",
    kind: "cancelled",
    patch: {},
    completedAt: null,
  });

  const restored = restoreDeletedTaskInPlannerState(deleted.state, deleted.removed);
  assert.equal(getDayTasks(restored, "2026-08-09")[0].id, "habit@2026-08-09");
  assert.deepEqual(restored.taskExceptions, []);
});

test("bulk completion settles only the selected recurring occurrence", () => {
  const original = stateWithTasks([task({
    id: "habit",
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
  })]);

  const result = applyBulkTaskAction(original, ["habit@2026-08-09"], "complete", {
    now: "2026-08-09T09:00",
    createId: () => "completed-exception",
    todayKey: "2026-08-09",
  });

  assert.deepEqual(result.completedIds, ["habit@2026-08-09"]);
  assert.deepEqual(result.failures, []);
  assert.equal(result.state.tasks[0].status, "open");
  assert.equal(getDayTasks(result.state, "2026-08-09")[0].status, "completed");
  assert.equal(getDayTasks(result.state, "2026-08-10")[0].status, "open");
});

test("bulk completion preserves legacy xp while the motivation ledger owns new rewards", () => {
  const original = { ...stateWithTasks([task({ id: "one" })]), xp: 75 };
  const result = applyBulkTaskAction(original, ["one"], "complete", {
    now: "2026-08-09T09:00",
    createId: () => "unused",
    todayKey: "2026-08-09",
  });

  assert.equal(result.state.xp, 75);
  assert.equal(result.state.tasks[0].status, "completed");
});

test("bulk defer detaches one occurrence without shifting the series", () => {
  const ids = ["detached", "cancelled"];
  const original = stateWithTasks([task({
    id: "habit",
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
  })]);

  const result = applyBulkTaskAction(original, ["habit@2026-08-09"], "defer", {
    now: "2026-08-09T09:00",
    createId: () => ids.shift(),
    todayKey: "2026-08-09",
  });

  assert.equal(result.state.tasks.find((entry) => entry.id === "habit").planned.date, "2026-08-09");
  assert.equal(result.state.tasks.find((entry) => entry.id === "detached").planned.date, "2026-08-10");
  assert.equal(result.state.tasks.find((entry) => entry.id === "detached").recurrence, null);
  assert.equal(getDayTasks(result.state, "2026-08-09").length, 0);
  assert.equal(getDayTasks(result.state, "2026-08-10").length, 2);
});

test("bulk delete cascades series records and reports missing selections", () => {
  const original = stateWithTasks([task({
    id: "habit",
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
  })]);
  original.taskExceptions = [{
    id: "done",
    seriesId: "habit",
    occurrenceDate: "2026-08-08",
    kind: "completed",
    patch: {},
    completedAt: "2026-08-08T09:00",
  }];

  const result = applyBulkTaskAction(original, ["habit", "missing"], "delete", {
    now: "2026-08-09T09:00",
    createId: () => "unused",
    todayKey: "2026-08-09",
  });

  assert.deepEqual(result.completedIds, ["habit"]);
  assert.deepEqual(result.failures, [{ id: "missing", reason: "gone" }]);
  assert.deepEqual(result.state.tasks, []);
  assert.deepEqual(result.state.taskExceptions, []);
  validatePlannerStateV7(result.state);
});
