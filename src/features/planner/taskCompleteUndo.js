/* Inverse of `writeTask(..., { completed: true })`.
 *
 * Completing a one-off task writes `status: completed` on the series row.
 * Completing a recurring occurrence writes a typed `completed` exception and
 * leaves the series open. Undo used to treat both as `task-complete` and then:
 *   1. reopen the series if it happened to be completed, and
 *   2. always call `removeTaskException` with the parsed occurrence date.
 *
 * For a one-off that meant (2) ran with `occurrenceDate: ""` against a
 * possibly-missing `taskExceptions` array — `removeTaskException` threw,
 * the state updater died, and the page went blank. For an occurrence it
 * also reopened the whole series if the user had later completed it.
 *
 * Payloads are now split:
 *   - `task-complete-occurrence` → drop only that day's completed exception
 *   - `task-complete-series`     → reopen the series row
 *
 * `applyTaskCompleteUndo` is the only place Planner should interpret those
 * types, so a future complete-path change has one inverse to update.
 */

import {
  parseTaskOccurrenceId,
  removeTaskException,
  reopenTask as reopenTaskCommand,
} from "../../domains/tasks/index.js";

export function createTaskCompleteUndoPayload(id) {
  const { seriesId, occurrenceDate } = parseTaskOccurrenceId(id);
  if (occurrenceDate) {
    return { type: "task-complete-occurrence", id, seriesId, occurrenceDate };
  }
  return { type: "task-complete-series", id: seriesId };
}

export function isTaskCompleteUndo(payload) {
  return payload?.type === "task-complete-occurrence"
    || payload?.type === "task-complete-series"
    || payload?.type === "task-complete";
}

/**
 * Apply the inverse of a completion. Unknown / already-undone states are
 * no-ops — undo is best-effort and must never throw out of `setDb`.
 */
export function applyTaskCompleteUndo(state, payload) {
  if (!state || !payload) return state;
  const type = payload.type;

  if (type === "task-complete-occurrence") {
    const seriesId = payload.seriesId ?? parseTaskOccurrenceId(payload.id).seriesId;
    const occurrenceDate = payload.occurrenceDate
      ?? parseTaskOccurrenceId(payload.id).occurrenceDate;
    if (!seriesId || !occurrenceDate) return state;
    return {
      ...state,
      taskExceptions: removeTaskException(state.taskExceptions, seriesId, occurrenceDate),
    };
  }

  if (type === "task-complete-series") {
    const seriesId = payload.id ?? parseTaskOccurrenceId(payload.id).seriesId;
    const target = (state.tasks ?? []).find((task) => task.id === seriesId);
    if (!target || target.status !== "completed") return state;
    return { ...state, tasks: reopenTaskCommand(state.tasks, seriesId).tasks };
  }

  /* Legacy `task-complete` payloads (toasts still on screen during a hot
     reload, or an older session) keep the old combined behaviour but with
     null-safe exception removal so they cannot blank the page. */
  if (type === "task-complete") {
    const { seriesId, occurrenceDate } = parseTaskOccurrenceId(payload.id);
    let next = state;
    const target = (state.tasks ?? []).find((task) => task.id === seriesId);
    if (target && target.status === "completed") {
      next = { ...next, tasks: reopenTaskCommand(next.tasks, seriesId).tasks };
    }
    if (occurrenceDate) {
      next = {
        ...next,
        taskExceptions: removeTaskException(next.taskExceptions, seriesId, occurrenceDate),
      };
    }
    return next;
  }

  return state;
}
