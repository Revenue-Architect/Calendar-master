import { addDaysToKey, assertDateKey } from "../../../shared/time/dateKey.js";
import { isOverdue } from "../planning/derivedState.js";
import { isTaskActive } from "../model/task.js";
import {
  expandTaskOccurrences,
  materializeOccurrence,
  occursOn,
  unfinishedBefore,
} from "../recurrence/taskRecurrence.js";

/* The read model the day screen consumes. One-off tasks appear on their planned
   date; recurring series are expanded into occurrences on the fly, never stored. */

export function getDayTasks(state, dateKey) {
  assertDateKey(dateKey);
  const exceptions = state.taskExceptions ?? [];
  const out = [];
  for (const task of state.tasks) {
    if (task.parentTaskId) continue;
    if (!task.recurrence) {
      if (task.planned.date === dateKey) out.push(task);
      continue;
    }
    if (!occursOn(task, dateKey)) continue;
    const instance = materializeOccurrence(task, dateKey, exceptions);
    if (instance) out.push(instance);
  }
  return out.sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
}

export function getSubtasksOf(state, parentTaskId) {
  return state.tasks
    .filter((task) => task.parentTaskId === parentTaskId)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
}

/* §5.5 + §9.3 together. One-off tasks are overdue strictly by deadline; recurring
   series contribute only what their missed-occurrence policy says is still owed,
   which is why a daily habit adds nothing here by default. */
export function getOverdueForToday(state, todayKey) {
  assertDateKey(todayKey, "todayKey");
  const exceptions = state.taskExceptions ?? [];
  const out = [];
  for (const task of state.tasks) {
    if (task.parentTaskId) continue;
    if (task.recurrence) {
      out.push(...unfinishedBefore(task, todayKey, exceptions));
      continue;
    }
    if (isOverdue(task, todayKey)) out.push(task);
  }
  return out;
}

export function getUpcomingRange(state, startKey, days) {
  const endKeyExclusive = addDaysToKey(startKey, days);
  const exceptions = state.taskExceptions ?? [];
  const out = [];
  for (const task of state.tasks) {
    if (task.parentTaskId) continue;
    if (task.recurrence) {
      out.push(...expandTaskOccurrences(task, startKey, endKeyExclusive, exceptions));
      continue;
    }
    if (task.planned.date && task.planned.date >= startKey && task.planned.date < endKeyExclusive) {
      out.push(task);
    }
  }
  return out;
}

/* Used for the streak: a day counts when anything was actually finished on it. */
export function completedOn(state, dateKey) {
  const exceptions = state.taskExceptions ?? [];
  if (exceptions.some((entry) => entry.kind === "completed" && entry.occurrenceDate === dateKey)) return true;
  return state.tasks.some((task) => (
    task.status === "completed"
    && (task.completedAt?.slice(0, 10) === dateKey || (!task.completedAt && task.planned.date === dateKey))
  ));
}

export function countOpen(tasks) {
  return tasks.filter((task) => isTaskActive(task)).length;
}
