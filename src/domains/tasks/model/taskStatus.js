export class TaskValidationError extends Error {
  constructor(issues) {
    super(issues.map((entry) => `${entry.field}: ${entry.message}`).join("; "));
    this.name = "TaskValidationError";
    this.issues = issues;
  }
}

/* §2.1. The interface emphasises open and completed; the model keeps the richer set
   so a status never has to be invented later. */
export const TASK_STATUSES = Object.freeze([
  "open",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
  "archived",
]);

export const ACTIVE_STATUSES = Object.freeze(["open", "in_progress", "waiting"]);

/* §2.3. Reopening lands on `open`, and archive is reachable only from a settled
   status, so "archived" always means the work stopped deliberately. */
const TRANSITIONS = Object.freeze({
  open: ["in_progress", "waiting", "completed", "cancelled"],
  in_progress: ["open", "waiting", "completed", "cancelled"],
  waiting: ["open", "in_progress", "completed", "cancelled"],
  completed: ["open", "archived"],
  cancelled: ["open", "archived"],
  archived: ["open"],
});

export function isTaskStatus(value) {
  return TASK_STATUSES.includes(value);
}

export function isActiveStatus(value) {
  return ACTIVE_STATUSES.includes(value);
}

export function assertTaskStatus(value, field = "status") {
  if (!isTaskStatus(value)) {
    throw new TaskValidationError([{ field, message: `must be one of ${TASK_STATUSES.join(", ")}` }]);
  }
  return value;
}

export function canTransition(from, to) {
  assertTaskStatus(from, "from");
  assertTaskStatus(to, "to");
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new TaskValidationError([{ field: "status", message: `cannot move from ${from} to ${to}` }]);
  }
  return to;
}
