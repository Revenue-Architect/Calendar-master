import { validatePlannerStateV5 } from "../../calendar/migrations/validatePlannerStateV5.js";
import { normalizeTaskInput } from "../model/task.js";
import { normalizeTaskException } from "../recurrence/taskRecurrence.js";
import { assertParentAssignment } from "../hierarchy/taskHierarchy.js";
import { assertDependencyAllowed, dependenciesOf } from "../dependencies/taskDependencies.js";

export function validatePlannerStateV6(state) {
  if (!state || typeof state !== "object") throw new TypeError("planner state must be an object");
  if (state.schemaVersion !== 6) throw new TypeError("schemaVersion must be 6");

  /* Calendar invariants are unchanged by this migration, so they are checked with
     the v5 validator against a v5-shaped view rather than restated here. */
  validatePlannerStateV5({ ...state, schemaVersion: 5 });

  for (const key of ["taskLists", "taskExceptions"]) {
    if (!Array.isArray(state[key])) throw new TypeError(`${key} must be an array in planner state v6`);
  }

  const listIds = new Set(state.taskLists.map((list) => list.id));
  const ids = new Set();
  for (const task of state.tasks) {
    const normalized = normalizeTaskInput(task);
    if (ids.has(normalized.id)) throw new TypeError(`task ${normalized.id} is duplicated`);
    ids.add(normalized.id);
    if (!listIds.has(normalized.listId)) {
      throw new TypeError(`task ${normalized.id} listId ${normalized.listId} is invalid`);
    }
  }

  /* Structural checks that need the whole collection: hierarchy depth and cycles,
     and dependency edges that must point at tasks that actually exist (§15.5). */
  for (const task of state.tasks) {
    if (task.parentTaskId) assertParentAssignment(state.tasks, task.id, task.parentTaskId);
    for (const blockerId of dependenciesOf(task)) {
      if (!ids.has(blockerId)) {
        throw new TypeError(`task ${task.id} depends on missing task ${blockerId}`);
      }
    }
  }
  /* Cycles are validated by replaying each edge against the graph without it. */
  for (const task of state.tasks) {
    for (const blockerId of dependenciesOf(task)) {
      const without = state.tasks.map((entry) => (
        entry.id === task.id
          ? { ...entry, dependsOn: dependenciesOf(entry).filter((id) => id !== blockerId) }
          : entry
      ));
      assertDependencyAllowed(without, task.id, blockerId);
    }
  }

  for (const exception of state.taskExceptions) {
    const normalized = normalizeTaskException(exception);
    if (!ids.has(normalized.seriesId)) {
      throw new TypeError(`task exception ${normalized.id} series ${normalized.seriesId} is invalid`);
    }
  }
  return state;
}
