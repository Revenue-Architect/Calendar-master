import { TaskValidationError } from "../model/taskStatus.js";
import { isAncestor } from "../hierarchy/taskHierarchy.js";

/* §15. Dependencies answer "what has to happen before this can". The edge is held
   once, on the dependent task, as `dependsOn`; "blocks" is always derived (§15.1).
   Storing both directions is the classic way a graph ends up disagreeing with
   itself after one half of a write lands. */

/* §15.3. Settled statuses. Cancelled and archived count as satisfied on purpose:
   work that will never happen must not hold its dependents hostage forever. */
const SETTLED = new Set(["completed", "cancelled", "archived"]);

export function dependenciesOf(task) {
  return task?.dependsOn ?? [];
}

export function normalizeDependsOn(input, field = "dependsOn") {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new TaskValidationError([{ field, message: "must be an array of task ids" }]);
  }
  const ids = [];
  for (const value of input) {
    if (typeof value !== "string" || !value) {
      throw new TaskValidationError([{ field, message: "must contain non-empty task ids" }]);
    }
    if (!ids.includes(value)) ids.push(value);
  }
  return ids;
}

/* Walks the stored direction transitively. Adding B→A is a cycle exactly when A
   already reaches B, so this is the check `assertDependencyAllowed` needs (§15.1). */
export function dependencyReaches(tasks, fromId, targetId) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const stack = [...dependenciesOf(byId.get(fromId))];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === targetId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...dependenciesOf(byId.get(current)));
  }
  return false;
}

/* §15.2. Rejects self-edges, missing blockers, hierarchy edges, and cycles. */
export function assertDependencyAllowed(tasks, taskId, blockerId) {
  if (taskId === blockerId) {
    throw new TaskValidationError([{ field: "dependsOn", message: "a task cannot depend on itself" }]);
  }
  if (!tasks.some((task) => task.id === taskId)) {
    throw new TaskValidationError([{ field: "taskId", message: `task ${taskId} does not exist` }]);
  }
  if (!tasks.some((task) => task.id === blockerId)) {
    throw new TaskValidationError([{ field: "dependsOn", message: `task ${blockerId} does not exist` }]);
  }
  /* Hierarchy already encodes parent/child sequencing through parent progress and
     parent completion. A second, contradictory encoding yields a task that can
     never legitimately start. */
  if (isAncestor(tasks, blockerId, taskId) || isAncestor(tasks, taskId, blockerId)) {
    throw new TaskValidationError([
      { field: "dependsOn", message: "a task cannot depend on its own ancestor or descendant" },
    ]);
  }
  if (dependencyReaches(tasks, blockerId, taskId)) {
    throw new TaskValidationError([
      { field: "dependsOn", message: "dependency would create a cycle" },
    ]);
  }
  return blockerId;
}

export function isDependencySatisfied(blocker) {
  /* A blocker that no longer exists cannot be waited on. Lifecycle integrity
     (§15.5) should have removed the edge, so this is a floor, not the mechanism. */
  if (!blocker) return true;
  return SETTLED.has(blocker.status);
}

/* §15.3. The unsatisfied blockers, in stored order, for a caller that needs to say
   exactly what is in the way rather than just that something is. */
export function getTaskBlockers(tasks, taskId) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return dependenciesOf(byId.get(taskId))
    .map((id) => byId.get(id))
    .filter((blocker) => !isDependencySatisfied(blocker));
}

export function isBlocked(tasks, taskId) {
  return getTaskBlockers(tasks, taskId).length > 0;
}

/* Derived inverse direction (§15.1) — never stored. */
export function getDependents(tasks, blockerId) {
  return tasks.filter((task) => dependenciesOf(task).includes(blockerId));
}

export function getBlockedTasks(tasks) {
  return tasks.filter((task) => isBlocked(tasks, task.id));
}

/* §15.6. The latest date any unsatisfied blocker is expected to land, preferring a
   blocker's deadline over its planned date. Returns null when nothing is known, so
   the caller can tell "no constraint" from "constrained to today". Advisory only:
   this never moves a date by itself. */
export function getEarliestResponsibleStart(tasks, taskId) {
  const dates = getTaskBlockers(tasks, taskId)
    .map((blocker) => blocker.deadline?.date ?? blocker.planned?.date ?? null)
    .filter(Boolean);
  if (!dates.length) return null;
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

/* §15.5. Called when a task is deleted so no dependent keeps an edge to something
   that is gone — an invisible permanent block. */
export function removeDependencyReferences(tasks, removedId) {
  return tasks.map((task) => (
    dependenciesOf(task).includes(removedId)
      ? { ...task, dependsOn: dependenciesOf(task).filter((id) => id !== removedId) }
      : task
  ));
}
