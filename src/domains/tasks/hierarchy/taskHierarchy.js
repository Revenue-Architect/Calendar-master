import { TaskValidationError } from "../model/taskStatus.js";

/* §7.2. One visible subtask level today. The limit is enforced here rather than by
   the shape of the data — tasks stay flat records joined by `parentTaskId`, so
   raising this later does not require re-identifying or rewriting anything. */
export const MAX_DEPTH = 1;

export function depthOf(tasks, taskId) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let depth = 0;
  let current = byId.get(taskId);
  const seen = new Set();
  while (current?.parentTaskId) {
    if (seen.has(current.id)) {
      throw new TaskValidationError([{ field: "parentTaskId", message: "hierarchy contains a cycle" }]);
    }
    seen.add(current.id);
    current = byId.get(current.parentTaskId);
    depth += 1;
    if (depth > MAX_DEPTH + 1) break;
  }
  return depth;
}

export function isAncestor(tasks, ancestorId, taskId) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let current = byId.get(taskId);
  const seen = new Set();
  while (current?.parentTaskId) {
    if (current.parentTaskId === ancestorId) return true;
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentTaskId);
  }
  return false;
}

/* §7.1/§7.5. Rejects the three ways a move corrupts a tree: attaching to a missing
   parent, forming a cycle, or exceeding the depth limit. */
export function assertParentAssignment(tasks, taskId, parentTaskId) {
  if (parentTaskId == null) return null;
  if (parentTaskId === taskId) {
    throw new TaskValidationError([{ field: "parentTaskId", message: "a task cannot be its own parent" }]);
  }
  const parent = tasks.find((task) => task.id === parentTaskId);
  if (!parent) {
    throw new TaskValidationError([{ field: "parentTaskId", message: `parent ${parentTaskId} does not exist` }]);
  }
  if (isAncestor(tasks, taskId, parentTaskId)) {
    throw new TaskValidationError([{ field: "parentTaskId", message: "a task cannot become a descendant of itself" }]);
  }
  if (parent.parentTaskId) {
    throw new TaskValidationError([
      { field: "parentTaskId", message: `hierarchy is limited to ${MAX_DEPTH} subtask level` },
    ]);
  }
  return parentTaskId;
}

export function childrenOf(tasks, parentTaskId) {
  return tasks
    .filter((task) => task.parentTaskId === parentTaskId)
    .sort((left, right) => left.rank - right.rank);
}

/* §7.3. Progress counts required work only: cancelled children are excluded from the
   denominator, while waiting children still count as incomplete. */
export function subtaskProgress(tasks, parentTaskId) {
  const children = childrenOf(tasks, parentTaskId);
  const required = children.filter((child) => child.status !== "cancelled");
  const done = required.filter((child) => child.status === "completed").length;
  return { done, total: required.length, complete: required.length > 0 && done === required.length };
}

export function getTaskTree(tasks, rootId) {
  const root = tasks.find((task) => task.id === rootId);
  if (!root) return null;
  return { task: root, children: childrenOf(tasks, rootId).map((child) => ({ task: child, children: [] })) };
}
