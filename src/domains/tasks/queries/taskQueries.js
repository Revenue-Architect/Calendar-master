import { assertDateKey, diffDays } from "../../../shared/time/dateKey.js";
import { isTaskActive } from "../model/task.js";
import {
  isDueToday,
  isInbox,
  isOverdue,
  isPlanned,
} from "../planning/derivedState.js";

/* §4.3. Smart views are queries, not containers — nothing here mutates or stores a
   membership list, so a task can never be "in" a view it no longer qualifies for. */

const byRank = (left, right) => (left.rank ?? 0) - (right.rank ?? 0);

export function getTask(tasks, taskId) {
  return tasks.find((task) => task.id === taskId) ?? null;
}

export function getTasksForDay(tasks, dateKey) {
  assertDateKey(dateKey);
  return tasks.filter((task) => task.planned.date === dateKey).sort(byRank);
}

export function getTasksForRange(tasks, startKey, endKeyExclusive) {
  assertDateKey(startKey, "startKey");
  assertDateKey(endKeyExclusive, "endKeyExclusive");
  return tasks
    .filter((task) => task.planned.date != null
      && task.planned.date >= startKey
      && task.planned.date < endKeyExclusive)
    .sort(byRank);
}

export function getInboxTasks(tasks) {
  return tasks.filter(isInbox).sort(byRank);
}

export function getOverdueTasks(tasks, todayKey) {
  return tasks.filter((task) => isOverdue(task, todayKey)).sort(byRank);
}

export function getDueToday(tasks, todayKey) {
  return tasks.filter((task) => isDueToday(task, todayKey)).sort(byRank);
}

export function getUpcomingDeadlines(tasks, todayKey, withinDays = 10) {
  assertDateKey(todayKey, "todayKey");
  return tasks
    .filter((task) => isTaskActive(task)
      && task.deadline.date != null
      && task.deadline.date >= todayKey
      && diffDays(task.deadline.date, todayKey) <= withinDays)
    .sort((left, right) => left.deadline.date.localeCompare(right.deadline.date));
}

export function getSomedayTasks(tasks) {
  return tasks.filter((task) => task.someday && isTaskActive(task)).sort(byRank);
}

export function getUnscheduledTasks(tasks) {
  return tasks.filter((task) => isTaskActive(task) && !isPlanned(task)).sort(byRank);
}

export function getWaitingTasks(tasks) {
  return tasks.filter((task) => task.status === "waiting").sort(byRank);
}

export function getCompletedTasks(tasks) {
  return tasks.filter((task) => task.status === "completed");
}

/* §13.1. Checklist items are excluded from global results by default (§8.1); a step
   is a detail of its task, not a search result competing with it. */
export function searchTasks(tasks, term, { includeChecklist = false, includeArchived = false } = {}) {
  const needle = String(term ?? "").trim().toLowerCase();
  if (!needle) return [];
  return tasks.filter((task) => {
    if (!includeArchived && task.status === "archived") return false;
    const fields = [task.title, task.note, task.category, ...(task.tags ?? [])];
    if (includeChecklist) fields.push(...(task.checklist ?? []).map((item) => item.title));
    return fields.filter(Boolean).some((field) => String(field).toLowerCase().includes(needle));
  });
}

export function getTaskCompletionHistory(tasks) {
  return tasks
    .filter((task) => task.status === "completed" && task.completedAt)
    .map((task) => ({ taskId: task.id, completedAt: task.completedAt, deadline: task.deadline.date }))
    .sort((left, right) => String(left.completedAt).localeCompare(String(right.completedAt)));
}
