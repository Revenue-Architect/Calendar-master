import assert from "node:assert/strict";
import test from "node:test";

import { createBlankPlannerState } from "../../platform/persistence/plannerStateImport.js";
import {
  completeTask,
  createTask,
  normalizeTaskInput,
  upsertTaskException,
} from "../../domains/tasks/index.js";
import {
  applyTaskCompleteUndo,
  createTaskCompleteUndoPayload,
} from "./taskCompleteUndo.js";

function notebookWith(task) {
  const blank = createBlankPlannerState({});
  return { ...blank, tasks: [normalizeTaskInput(task)], taskExceptions: [] };
}

test("a one-off completion undoes by reopening the series only", () => {
  const original = notebookWith({
    id: "one",
    title: "File taxes",
    planned: { date: "2026-08-09" },
  });
  const completed = { ...original, tasks: completeTask(original.tasks, "one", { now: "2026-08-09T10:00" }).tasks };
  const payload = createTaskCompleteUndoPayload("one");
  assert.equal(payload.type, "task-complete-series");
  const undone = applyTaskCompleteUndo(completed, payload);
  assert.equal(undone.tasks[0].status, "open");
  assert.deepEqual(undone.taskExceptions, []);
});

test("an occurrence completion undoes by dropping only that exception", () => {
  const original = notebookWith({
    id: "habit",
    title: "Walk",
    planned: { date: "2026-08-01" },
    recurrence: { frequency: "daily", interval: 1 },
  });
  const completed = {
    ...original,
    taskExceptions: upsertTaskException(original.taskExceptions, {
      id: "ex-1",
      seriesId: "habit",
      occurrenceDate: "2026-08-09",
      kind: "completed",
      completedAt: "2026-08-09T08:00",
    }),
  };
  /* Completing the series later must survive undoing one day. */
  const seriesAlsoDone = {
    ...completed,
    tasks: completeTask(completed.tasks, "habit", { now: "2026-08-10T08:00" }).tasks,
  };
  const payload = createTaskCompleteUndoPayload("habit@2026-08-09");
  assert.equal(payload.type, "task-complete-occurrence");
  const undone = applyTaskCompleteUndo(seriesAlsoDone, payload);
  assert.equal(undone.tasks[0].status, "completed", "series completion is not the inverse of one day");
  assert.equal(undone.taskExceptions.length, 0);
});

test("missing taskExceptions is a no-op, not a throw", () => {
  const state = { tasks: [], taskExceptions: undefined };
  assert.doesNotThrow(() => applyTaskCompleteUndo(state, {
    type: "task-complete-occurrence",
    id: "habit@2026-08-09",
    seriesId: "habit",
    occurrenceDate: "2026-08-09",
  }));
  const next = applyTaskCompleteUndo(state, {
    type: "task-complete",
    id: "one",
  });
  assert.deepEqual(next.taskExceptions ?? [], []);
});

test("createTask still works as a smoke that this helper does not import Planner", () => {
  const created = createTask([], { id: "t", title: "Hi" });
  assert.equal(created.tasks[0].title, "Hi");
});
