import { TaskValidationError } from "../model/taskStatus.js";
import { DEFAULT_LIST_ID, INBOX_LIST_ID } from "../model/task.js";
import { taskEvent } from "../events/taskEvents.js";

/* §4.1/§4.2. Lists are containers a task belongs to exactly one of; tags are free
   labels that cut across them. Keeping them separate is what lets "Errands" be a
   place work lives while "urgent" describes work anywhere. */

function requireList(lists, listId) {
  const list = lists.find((entry) => entry.id === listId);
  if (!list) throw new TaskValidationError([{ field: "listId", message: `list ${listId} does not exist` }]);
  return list;
}

export function createTaskList(lists, { id, name }) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new TaskValidationError([{ field: "name", message: "is required" }]);
  if (lists.some((entry) => entry.id === id)) {
    throw new TaskValidationError([{ field: "id", message: `list ${id} already exists` }]);
  }
  const order = lists.reduce((max, entry) => Math.max(max, entry.order ?? 0), 0) + 1;
  return [...lists, { id, name: trimmed, isSystem: false, isDefault: false, order }];
}

export function renameTaskList(lists, listId, name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new TaskValidationError([{ field: "name", message: "is required" }]);
  requireList(lists, listId);
  return lists.map((entry) => (entry.id === listId ? { ...entry, name: trimmed } : entry));
}

/* §4.1. Deleting a list must decide what happens to the work inside it. Tasks are
   moved rather than deleted, and the system lists are not removable — losing the
   Inbox would leave captured work with nowhere to land. */
export function deleteTaskList(lists, tasks, listId, { moveTo = DEFAULT_LIST_ID } = {}) {
  const list = requireList(lists, listId);
  if (list.isSystem || list.isDefault) {
    throw new TaskValidationError([{ field: "listId", message: "system and default lists cannot be deleted" }]);
  }
  requireList(lists, moveTo);
  return {
    lists: lists.filter((entry) => entry.id !== listId),
    tasks: tasks.map((task) => (task.listId === listId ? { ...task, listId: moveTo } : task)),
  };
}

export function moveTaskToList(tasks, taskId, listId, lists) {
  requireList(lists, listId);
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task) throw new TaskValidationError([{ field: "taskId", message: `task ${taskId} does not exist` }]);
  return {
    tasks: tasks.map((entry) => (entry.id === taskId ? { ...entry, listId } : entry)),
    events: [taskEvent("TaskChanged", taskId, { listId })],
  };
}

export function setTaskTags(tasks, taskId, tags) {
  const next = [...new Set((tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))];
  return {
    tasks: tasks.map((task) => (task.id === taskId ? { ...task, tags: next } : task)),
    events: [taskEvent("TaskChanged", taskId, { tags: next })],
  };
}

/* §4.2. Renaming or removing a tag updates every reference without touching tasks. */
export function renameTag(tasks, from, to) {
  const target = String(to ?? "").trim();
  if (!target) throw new TaskValidationError([{ field: "tag", message: "is required" }]);
  return tasks.map((task) => (
    (task.tags ?? []).includes(from)
      ? { ...task, tags: [...new Set(task.tags.map((tag) => (tag === from ? target : tag)))] }
      : task
  ));
}

export function deleteTag(tasks, tag) {
  return tasks.map((task) => (
    (task.tags ?? []).includes(tag)
      ? { ...task, tags: task.tags.filter((entry) => entry !== tag) }
      : task
  ));
}

export function allTags(tasks) {
  return [...new Set(tasks.flatMap((task) => task.tags ?? []))].sort();
}

export function getTasksByList(tasks, listId) {
  return tasks.filter((task) => task.listId === listId).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

export { DEFAULT_LIST_ID, INBOX_LIST_ID };
