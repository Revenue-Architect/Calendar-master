import {
  blockingReasons,
  completeTask as completeTaskCommand,
  deferTask as deferTaskCommand,
  deleteTask as deleteTaskCommand,
  moveTaskToList,
  normalizeTaskInput,
  parseTaskOccurrenceId,
  planTask as planTaskCommand,
  removeTaskException,
  removeTaskExceptionsForSeries,
  setTaskTags,
  updateTask as updateTaskCommand,
  upsertTaskException,
} from "../../domains/tasks/index.js";

function taskAndOccurrence(state, id) {
  const identity = parseTaskOccurrenceId(id);
  const task = state.tasks.find((entry) => entry.id === identity.seriesId) ?? null;
  return { ...identity, task };
}

export function restoreTaskPlannedDates(tasks, entries) {
  const dates = new Map(entries.map((entry) => [parseTaskOccurrenceId(entry.id).seriesId, entry.date ?? null]));
  return tasks.map((task) => (dates.has(task.id)
    ? { ...task, planned: { ...task.planned, date: dates.get(task.id) } }
    : task));
}

export function createTaskMutationUndoPayload(state, id, fallback) {
  return parseTaskOccurrenceId(id).occurrenceDate
    ? { type: "restore-planner-state", snapshot: { state: structuredClone(state) } }
    : fallback;
}

export function deleteTaskFromPlannerState(state, id, { exceptionId } = {}) {
  const { seriesId, occurrenceDate, task } = taskAndOccurrence(state, id);
  if (!task) throw new Error(`task ${seriesId} does not exist`);

  if (occurrenceDate) {
    const previousException = (state.taskExceptions ?? []).find((entry) => (
      entry.seriesId === seriesId && entry.occurrenceDate === occurrenceDate
    )) ?? null;
    return {
      state: {
        ...state,
        taskExceptions: upsertTaskException(state.taskExceptions ?? [], {
          id: exceptionId,
          seriesId,
          occurrenceDate,
          kind: "cancelled",
          patch: {},
        }),
      },
      removed: { kind: "occurrence", seriesId, occurrenceDate, previousException },
    };
  }

  const deletion = deleteTaskCommand(state.tasks, seriesId);
  const removedTasks = deletion.events[0]?.removed ?? [task];
  const detachedFrom = deletion.events[0]?.detachedFrom ?? [];
  const goneIds = new Set(removedTasks.map((entry) => entry.id));
  const removedExceptions = (state.taskExceptions ?? []).filter((entry) => goneIds.has(entry.seriesId));
  const noteReferences = [];
  const notes = (state.notes ?? []).map((note) => ({
    ...note,
    blocks: note.blocks.map((block) => {
      if (!goneIds.has(block.extractedTaskId)) return block;
      noteReferences.push({ noteId: note.id, blockId: block.id, taskId: block.extractedTaskId });
      return { ...block, extractedTaskId: null };
    }),
  }));

  return {
    state: {
      ...state,
      tasks: deletion.tasks,
      taskExceptions: removeTaskExceptionsForSeries(state.taskExceptions, goneIds),
      notes,
    },
    removed: {
      kind: "series",
      tasks: removedTasks,
      detachedFrom,
      taskExceptions: removedExceptions,
      noteReferences,
    },
  };
}

export function restoreDeletedTaskInPlannerState(state, removed) {
  if (removed.kind === "occurrence") {
    let taskExceptions = removeTaskException(
      state.taskExceptions ?? [],
      removed.seriesId,
      removed.occurrenceDate,
    );
    if (removed.previousException) taskExceptions = [...taskExceptions, removed.previousException];
    return { ...state, taskExceptions };
  }

  let tasks = [...state.tasks, ...removed.tasks];
  for (const reference of removed.detachedFrom ?? []) {
    tasks = tasks.map((task) => (task.id === reference.taskId
      ? { ...task, dependsOn: [...reference.dependsOn] }
      : task));
  }
  const referenceByBlock = new Map(
    (removed.noteReferences ?? []).map((entry) => [`${entry.noteId}:${entry.blockId}`, entry.taskId]),
  );
  const notes = (state.notes ?? []).map((note) => ({
    ...note,
    blocks: note.blocks.map((block) => {
      const taskId = referenceByBlock.get(`${note.id}:${block.id}`);
      return taskId ? { ...block, extractedTaskId: taskId } : block;
    }),
  }));
  return {
    ...state,
    tasks,
    taskExceptions: [...(state.taskExceptions ?? []), ...(removed.taskExceptions ?? [])],
    notes,
  };
}

function detachOccurrence(state, id, action, { now, createId, todayKey }) {
  const { seriesId, occurrenceDate, task } = taskAndOccurrence(state, id);
  if (!task || !occurrenceDate || !task.recurrence) throw new Error(`task occurrence ${id} does not exist`);
  const detachedId = createId();
  const detached = normalizeTaskInput({
    ...task,
    id: detachedId,
    status: "open",
    completedAt: null,
    recurrence: null,
    planned: { ...task.planned, date: occurrenceDate },
  });
  const staged = {
    ...state,
    tasks: [...state.tasks, detached],
    taskExceptions: upsertTaskException(state.taskExceptions ?? [], {
      id: createId(),
      seriesId,
      occurrenceDate,
      kind: "cancelled",
      patch: {},
    }),
  };
  const command = action === "defer"
    ? deferTaskCommand(staged.tasks, detachedId, 1, { now })
    : planTaskCommand(staged.tasks, detachedId, {
      date: todayKey,
      startMinute: detached.planned.startMinute,
      estimateMinutes: detached.planned.estimateMinutes,
    }, { now });
  return { ...staged, tasks: command.tasks };
}

export function applyBulkTaskAction(state, ids, action, {
  bulkArg = null,
  createId,
  now = null,
  todayKey = null,
} = {}) {
  let working = state;
  const completedIds = [];
  const failures = [];

  for (const id of ids) {
    const { seriesId, occurrenceDate, task } = taskAndOccurrence(working, id);
    if (!task) {
      failures.push({ id, reason: "gone" });
      continue;
    }
    try {
      if (action === "complete") {
        if (blockingReasons(working.tasks, task).length) throw new Error("blocked");
        if (occurrenceDate) {
          const prior = (working.taskExceptions ?? []).find((entry) => (
            entry.seriesId === seriesId && entry.occurrenceDate === occurrenceDate
          ));
          if (prior?.kind === "completed") throw new Error("already completed");
          working = {
            ...working,
            taskExceptions: upsertTaskException(working.taskExceptions ?? [], {
              id: createId(),
              seriesId,
              occurrenceDate,
              kind: "completed",
              patch: {},
              completedAt: now,
            }),
          };
        } else {
          working = {
            ...working,
            tasks: completeTaskCommand(working.tasks, seriesId, { now }).tasks,
          };
        }
      } else if (action === "defer" || (action === "today" && occurrenceDate)) {
        working = occurrenceDate
          ? detachOccurrence(working, id, action, { now, createId, todayKey })
          : {
            ...working,
            tasks: action === "defer"
              ? deferTaskCommand(working.tasks, seriesId, 1, { now }).tasks
              : planTaskCommand(working.tasks, seriesId, {
                date: todayKey,
                startMinute: task.planned.startMinute,
                estimateMinutes: task.planned.estimateMinutes,
              }, { now }).tasks,
          };
      } else if (action === "today") {
        working = {
          ...working,
          tasks: planTaskCommand(working.tasks, seriesId, {
            date: todayKey,
            startMinute: task.planned.startMinute,
            estimateMinutes: task.planned.estimateMinutes,
          }, { now }).tasks,
        };
      } else if (action === "list") {
        working = { ...working, tasks: moveTaskToList(working.tasks, seriesId, bulkArg, working.taskLists).tasks };
      } else if (action === "tag") {
        working = { ...working, tasks: setTaskTags(working.tasks, seriesId, [...(task.tags ?? []), bulkArg]).tasks };
      } else if (action === "priority") {
        working = { ...working, tasks: updateTaskCommand(working.tasks, seriesId, { priority: bulkArg }, { now }).tasks };
      } else if (action === "delete") {
        const deletion = deleteTaskFromPlannerState(working, id, { exceptionId: createId() });
        working = deletion.state;
      } else {
        throw new Error(`unsupported bulk action ${action}`);
      }
      completedIds.push(id);
    } catch (error) {
      failures.push({ id, reason: error.message === "blocked" ? "blocked" : "refused" });
    }
  }

  return { state: working, completedIds, failures };
}
