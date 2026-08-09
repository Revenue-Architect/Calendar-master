import { addDaysToKey, assertDateKey } from "../../../shared/time/dateKey.js";
import { TaskValidationError, assertTransition } from "../model/taskStatus.js";
import { assertTaskId, normalizeTaskInput } from "../model/task.js";
import { normalizeChecklist } from "../model/checklistItem.js";
import { assertParentAssignment, childrenOf } from "../hierarchy/taskHierarchy.js";
import {
  assertDependencyAllowed,
  dependenciesOf,
  getTaskBlockers,
  removeDependencyReferences,
} from "../dependencies/taskDependencies.js";
import { taskEvent } from "../events/taskEvents.js";

/* Every command is pure: it takes the task collection and returns a new one plus the
   domain events it produced (§14.3). Nothing here reads a clock or a store — the
   caller supplies `now` and ids so results stay reproducible in tests. */

function requireTask(tasks, taskId) {
  const task = tasks.find((candidate) => candidate.id === assertTaskId(taskId));
  if (!task) {
    throw new TaskValidationError([{ field: "taskId", message: `task ${taskId} does not exist` }]);
  }
  return task;
}

function replace(tasks, updated) {
  return tasks.map((task) => (task.id === updated.id ? updated : task));
}

function touch(task, now) {
  return { ...task, updatedAt: now ?? task.updatedAt };
}

function result(tasks, events) {
  return { tasks, events };
}

export function createTask(tasks, input, { now = null } = {}) {
  const nextRank = tasks.reduce((max, task) => Math.max(max, task.rank ?? 0), 0) + 1;
  const task = normalizeTaskInput({
    rank: nextRank,
    createdAt: now,
    updatedAt: now,
    ...input,
  });
  if (tasks.some((existing) => existing.id === task.id)) {
    throw new TaskValidationError([{ field: "id", message: `task ${task.id} already exists` }]);
  }
  if (task.parentTaskId) assertParentAssignment(tasks, task.id, task.parentTaskId);
  for (const blockerId of task.dependsOn) {
    assertDependencyAllowed([...tasks, task], task.id, blockerId);
  }
  return result([...tasks, task], [taskEvent("TaskCreated", task.id)]);
}

export function updateTask(tasks, taskId, patch, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  const next = normalizeTaskInput({ ...current, ...patch, id: current.id });
  if (next.parentTaskId !== current.parentTaskId) {
    assertParentAssignment(tasks, current.id, next.parentTaskId);
  }
  const events = [taskEvent("TaskChanged", current.id)];
  if (next.parentTaskId !== current.parentTaskId) {
    events.push(taskEvent("TaskHierarchyChanged", current.id, { parentTaskId: next.parentTaskId }));
  }
  return result(replace(tasks, touch(next, now)), events);
}

/* §5.1/§5.2. Planning sets intent. It never touches the deadline — that separation
   is the point of the two fields. */
export function planTask(tasks, taskId, { date = null, startMinute = null, estimateMinutes = null }, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  const next = normalizeTaskInput({ ...current, planned: { date, startMinute, estimateMinutes } });
  return result(replace(tasks, touch(next, now)), [taskEvent("TaskPlanned", current.id, { planned: next.planned })]);
}

export function scheduleTask(tasks, taskId, startMinute, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  if (startMinute != null && current.planned.date == null) {
    throw new TaskValidationError([{ field: "planned.date", message: "schedule a time only on a planned day" }]);
  }
  const next = normalizeTaskInput({ ...current, planned: { ...current.planned, startMinute } });
  return result(replace(tasks, touch(next, now)), [taskEvent("TaskPlanned", current.id, { planned: next.planned })]);
}

/* §5.4. Deferral moves planned work and deliberately preserves the deadline. */
export function deferTask(tasks, taskId, days, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  if (!Number.isInteger(days) || days === 0) {
    throw new TaskValidationError([{ field: "days", message: "must be a non-zero whole number of days" }]);
  }
  if (current.planned.date == null) {
    throw new TaskValidationError([{ field: "planned.date", message: "cannot defer a task with no planned date" }]);
  }
  const from = current.planned.date;
  const to = addDaysToKey(from, days);
  const next = normalizeTaskInput({ ...current, planned: { ...current.planned, date: to } });
  return result(
    replace(tasks, touch(next, now)),
    [taskEvent("TaskDeferred", current.id, { from, to, deadlinePreserved: current.deadline.date })],
  );
}

/* §10.1. Completion records when, preserves the original plan and deadline, and
   emits an event that gamification reacts to — rewards are not computed here. */
export function completeTask(tasks, taskId, { now = null, completeSubtasks = false, override = false } = {}) {
  const current = requireTask(tasks, taskId);
  assertTransition(current.status, "completed");

  /* §15.4/§7.4. Advisory, not enforced: the caller must have surfaced the blockers
     and had the user choose. Recording the override keeps that decision auditable
     instead of leaving a silently-completed blocked task behind. */
  const blockers = getTaskBlockers(tasks, current.id);
  const children = childrenOf(tasks, current.id).filter((child) => child.status !== "cancelled");
  const openChildren = children.filter((child) => child.status !== "completed");
  if ((blockers.length || openChildren.length) && !override && !completeSubtasks) {
    throw new TaskValidationError([{
      field: "override",
      message: "task is blocked; resolve, complete subtasks, or pass override",
    }]);
  }

  let nextTasks = tasks;
  const events = [];
  if (completeSubtasks) {
    for (const child of openChildren) {
      nextTasks = replace(nextTasks, { ...child, status: "completed", completedAt: now, updatedAt: now });
      events.push(taskEvent("TaskCompleted", child.id, { viaParent: true }));
    }
  }
  const completed = {
    ...current,
    status: "completed",
    completedAt: now,
    updatedAt: now,
    ...(override && (blockers.length || openChildren.length)
      ? { completedWhileBlocked: true }
      : {}),
  };
  events.push(taskEvent("TaskCompleted", current.id, {
    completedAt: now,
    ...(blockers.length ? { overriddenBlockers: blockers.map((blocker) => blocker.id) } : {}),
  }));
  return result(replace(nextTasks, completed), events);
}

/* §10.2. Reopening a parent deliberately leaves checklist items alone (§8.3). */
export function reopenTask(tasks, taskId, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  assertTransition(current.status, "open");
  const next = {
    ...current,
    status: "open",
    completedAt: null,
    completedWhileBlocked: undefined,
    updatedAt: now,
  };
  delete next.completedWhileBlocked;
  return result(replace(tasks, next), [taskEvent("TaskReopened", current.id, { previousCompletedAt: current.completedAt })]);
}

export function moveTask(tasks, taskId, parentTaskId, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  assertParentAssignment(tasks, current.id, parentTaskId);
  const next = normalizeTaskInput({ ...current, parentTaskId });
  return result(
    replace(tasks, touch(next, now)),
    [taskEvent("TaskHierarchyChanged", current.id, { from: current.parentTaskId, to: parentTaskId })],
  );
}

/* §15.5. Deleting takes the task's children with it, but never its dependents — it
   only detaches the edges pointing at what is gone. The removed records travel in
   the result so undo restores them without reconstruction (§10.3). */
export function deleteTask(tasks, taskId) {
  const current = requireTask(tasks, taskId);
  const removed = [current, ...childrenOf(tasks, current.id)];
  const removedIds = new Set(removed.map((task) => task.id));
  const detachedFrom = tasks
    .filter((task) => !removedIds.has(task.id) && dependenciesOf(task).some((id) => removedIds.has(id)))
    .map((task) => ({ taskId: task.id, dependsOn: [...dependenciesOf(task)] }));

  let remaining = tasks.filter((task) => !removedIds.has(task.id));
  for (const id of removedIds) remaining = removeDependencyReferences(remaining, id);

  return result(remaining, [taskEvent("TaskDeleted", current.id, { removed, detachedFrom })]);
}

export function restoreTask(tasks, removed, detachedFrom = []) {
  let next = [...tasks, ...removed];
  for (const entry of detachedFrom) {
    next = next.map((task) => (task.id === entry.taskId ? { ...task, dependsOn: [...entry.dependsOn] } : task));
  }
  return result(next, removed.map((task) => taskEvent("TaskCreated", task.id, { restored: true })));
}

export function addTaskDependency(tasks, taskId, blockerId, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  assertDependencyAllowed(tasks, taskId, blockerId);
  /* §15.2. Adding an edge that already exists is a no-op, not a duplicate. */
  if (dependenciesOf(current).includes(blockerId)) return result(tasks, []);
  const next = { ...current, dependsOn: [...dependenciesOf(current), blockerId], updatedAt: now };
  return result(
    replace(tasks, next),
    [taskEvent("TaskDependenciesChanged", taskId, { added: blockerId, dependsOn: next.dependsOn })],
  );
}

export function removeTaskDependency(tasks, taskId, blockerId, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  if (!dependenciesOf(current).includes(blockerId)) return result(tasks, []);
  const next = { ...current, dependsOn: dependenciesOf(current).filter((id) => id !== blockerId), updatedAt: now };
  return result(
    replace(tasks, next),
    [taskEvent("TaskDependenciesChanged", taskId, { removed: blockerId, dependsOn: next.dependsOn })],
  );
}

export function createSubtask(tasks, parentTaskId, input, { now = null } = {}) {
  assertParentAssignment(tasks, input.id, parentTaskId);
  return createTask(tasks, { ...input, parentTaskId }, { now });
}

/* §8.4. Promotion keeps the title, completion state, order and parent relationship,
   and grants a full task identity so the step can carry its own planning. */
export function promoteChecklistItem(tasks, taskId, checklistItemId, newTaskId, { now = null } = {}) {
  const current = requireTask(tasks, taskId);
  const item = (current.checklist ?? []).find((entry) => entry.id === checklistItemId);
  if (!item) {
    throw new TaskValidationError([{ field: "checklistItemId", message: `item ${checklistItemId} does not exist` }]);
  }
  const parentTaskId = current.parentTaskId ?? current.id;
  const withoutItem = {
    ...current,
    checklist: normalizeChecklist((current.checklist ?? []).filter((entry) => entry.id !== checklistItemId)),
    updatedAt: now,
  };
  const promoted = normalizeTaskInput({
    id: newTaskId,
    title: item.title,
    listId: current.listId,
    parentTaskId,
    status: item.done ? "completed" : "open",
    completedAt: item.done ? item.completedAt ?? now : null,
    rank: item.order,
    category: current.category,
    createdAt: now,
    updatedAt: now,
  });
  return result(
    [...replace(tasks, withoutItem), promoted],
    [
      taskEvent("TaskCreated", promoted.id, { promotedFrom: { taskId: current.id, checklistItemId } }),
      taskEvent("TaskChanged", current.id),
    ],
  );
}

export function assertPlannedBeforeDeadline(task) {
  if (task.planned.date && task.deadline.date && task.planned.date > task.deadline.date) {
    return { warning: "planned_after_deadline", planned: task.planned.date, deadline: task.deadline.date };
  }
  return null;
}

export { assertDateKey };
