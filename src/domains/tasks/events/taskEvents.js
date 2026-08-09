/* §14.3. Commands return their events alongside the new state. Calendar, Notes,
   Reminders and Gamification react to these without Tasks importing any of them —
   which is what keeps reward rules (§10.1) out of the task model. */

export const TASK_EVENT_TYPES = Object.freeze([
  "TaskCreated",
  "TaskChanged",
  "TaskPlanned",
  "TaskDeferred",
  "TaskCompleted",
  "TaskReopened",
  "TaskDeleted",
  "TaskHierarchyChanged",
  "TaskDependenciesChanged",
  "TaskReminderIntentChanged",
]);

export function taskEvent(type, taskId, payload = {}) {
  if (!TASK_EVENT_TYPES.includes(type)) {
    throw new TypeError(`unknown task domain event ${type}`);
  }
  return { type, taskId, ...payload };
}
