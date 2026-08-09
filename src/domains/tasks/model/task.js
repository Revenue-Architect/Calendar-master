import { assertDateKey, isDateKey } from "../../../shared/time/dateKey.js";
import { normalizeChecklist } from "./checklistItem.js";
import { normalizeDependsOn } from "../dependencies/taskDependencies.js";
import { TaskValidationError, assertTaskStatus, isActiveStatus } from "./taskStatus.js";

export const INBOX_LIST_ID = "list-inbox";
export const DEFAULT_LIST_ID = "list-default";

export const TASK_PRIORITIES = Object.freeze(["none", "low", "normal", "high", "urgent"]);

/* §9.3. The policy a series uses for instances that were never completed. `skip` is
   the default because a missed habit is not a debt — without it one daily task
   manufactures an unbounded overdue pile. */
export const MISSED_POLICIES = Object.freeze(["skip", "roll_forward", "accumulate"]);

const MINUTES_PER_DAY = 1440;

function issue(issues, field, message) {
  issues.push({ field, message });
}

function optionalDate(value, field, issues) {
  if (value == null || value === "") return null;
  if (!isDateKey(value)) {
    issue(issues, field, "must be a YYYY-MM-DD date");
    return null;
  }
  return value;
}

function optionalMinute(value, field, issues) {
  if (value == null || value === "") return null;
  if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY) {
    issue(issues, field, "must be a minute of the day between 0 and 1439");
    return null;
  }
  return value;
}

function optionalDuration(value, field, issues) {
  if (value == null || value === "") return null;
  if (!Number.isInteger(value) || value <= 0) {
    issue(issues, field, "must be a positive whole number of minutes");
    return null;
  }
  return value;
}

/* §5.1–5.3. Planned answers "when do I intend to work on this"; deadline answers
   "when must this be finished". They are normalised separately and neither derives
   from the other — collapsing them is what makes a planner nag about the wrong day. */
function normalizePlanned(input, issues) {
  const source = input ?? {};
  const date = optionalDate(source.date, "planned.date", issues);
  const startMinute = optionalMinute(source.startMinute, "planned.startMinute", issues);
  const estimateMinutes = optionalDuration(source.estimateMinutes, "planned.estimateMinutes", issues);
  if (startMinute != null && date == null) {
    issue(issues, "planned.startMinute", "requires a planned date");
  }
  return { date, startMinute, estimateMinutes };
}

function normalizeDeadline(input, issues) {
  const source = input ?? {};
  const date = optionalDate(source.date, "deadline.date", issues);
  const minute = optionalMinute(source.minute, "deadline.minute", issues);
  if (minute != null && date == null) {
    issue(issues, "deadline.minute", "requires a deadline date");
  }
  return { date, minute };
}

function normalizeRecurrence(input, issues) {
  if (!input) return null;
  const frequency = input.frequency;
  if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) {
    issue(issues, "recurrence.frequency", "must be daily, weekly, monthly, or yearly");
  }
  const interval = Number(input.interval ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
    issue(issues, "recurrence.interval", "must be a whole number between 1 and 30");
  }
  const missedPolicy = input.missedPolicy ?? "skip";
  if (!MISSED_POLICIES.includes(missedPolicy)) {
    issue(issues, "recurrence.missedPolicy", `must be one of ${MISSED_POLICIES.join(", ")}`);
  }
  const byWeekday = Array.isArray(input.byWeekday) ? [...input.byWeekday] : undefined;
  if (byWeekday && byWeekday.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    issue(issues, "recurrence.byWeekday", "must contain weekday numbers 0-6");
  }
  const until = optionalDate(input.until, "recurrence.until", issues);
  return {
    frequency,
    interval,
    missedPolicy,
    ...(byWeekday ? { byWeekday } : {}),
    ...(until ? { until } : {}),
  };
}

function normalizeTags(input, issues) {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    issue(issues, "tags", "must be an array");
    return [];
  }
  const tags = input.map((tag) => String(tag).trim()).filter(Boolean);
  return [...new Set(tags)];
}

export function normalizeTaskInput(input) {
  if (!input || typeof input !== "object") {
    throw new TaskValidationError([{ field: "task", message: "must be an object" }]);
  }
  const issues = [];

  const id = typeof input.id === "string" ? input.id : "";
  if (!id) issue(issues, "id", "is required");

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) issue(issues, "title", "is required");

  let status = input.status ?? "open";
  try {
    assertTaskStatus(status);
  } catch {
    issue(issues, "status", "is not a known task status");
    status = "open";
  }

  const priority = input.priority ?? "none";
  if (!TASK_PRIORITIES.includes(priority)) {
    issue(issues, "priority", `must be one of ${TASK_PRIORITIES.join(", ")}`);
  }

  const planned = normalizePlanned(input.planned, issues);
  const deadline = normalizeDeadline(input.deadline, issues);
  const recurrence = normalizeRecurrence(input.recurrence, issues);

  let checklist = [];
  try {
    checklist = normalizeChecklist(input.checklist);
  } catch (error) {
    issues.push(...(error.issues ?? [{ field: "checklist", message: error.message }]));
  }

  const parentTaskId = input.parentTaskId ?? null;
  if (parentTaskId != null && (typeof parentTaskId !== "string" || !parentTaskId)) {
    issue(issues, "parentTaskId", "must be a task id or null");
  }
  if (parentTaskId === id) {
    issue(issues, "parentTaskId", "a task cannot be its own parent");
  }
  /* §7.1. A subtask is a full task, but recurrence belongs to the series that owns
     the parent — letting a child repeat on its own schedule produces occurrences
     with no parent occurrence to hang from. */
  if (parentTaskId && recurrence) {
    issue(issues, "recurrence", "a subtask cannot carry its own recurrence");
  }

  /* §15.1. Only the dependent side is stored; "blocks" is derived on read. Shape is
     validated here, but whether an edge is *legal* needs the whole task set, so
     cycles and hierarchy conflicts are checked in the command (§15.2). */
  let dependsOn = [];
  try {
    dependsOn = normalizeDependsOn(input.dependsOn);
  } catch (error) {
    issues.push(...(error.issues ?? [{ field: "dependsOn", message: error.message }]));
  }
  if (dependsOn.includes(id)) {
    issue(issues, "dependsOn", "a task cannot depend on itself");
  }

  const followUpDate = optionalDate(input.followUpDate, "followUpDate", issues);
  const rank = Number.isInteger(input.rank) ? input.rank : 0;
  const reward = Number.isInteger(input.reward) ? input.reward : 0;

  if (issues.length) throw new TaskValidationError(issues);

  const completedAt = status === "completed" ? input.completedAt ?? null : null;
  return {
    id,
    listId: input.listId || DEFAULT_LIST_ID,
    parentTaskId,
    title,
    status,
    planned,
    deadline,
    priority,
    /* §4.4. Someday is a planning state, not a status — it keeps work searchable
       while excluding it from daily pressure. */
    someday: input.someday === true,
    tags: normalizeTags(input.tags, issues),
    category: input.category ?? null,
    note: typeof input.note === "string" ? input.note : "",
    checklist,
    recurrence,
    dependsOn,
    rank,
    reward,
    followUpDate,
    waitingFor: typeof input.waitingFor === "string" ? input.waitingFor : "",
    completedAt,
    /* §3.4. Collaboration-ready without requiring sharing to exist yet. */
    ownerId: input.ownerId ?? null,
    assigneeId: input.assigneeId ?? null,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
    links: Array.isArray(input.links) ? [...input.links] : [],
  };
}

export function isTaskActive(task) {
  return isActiveStatus(task.status);
}

export function assertTaskId(value, field = "taskId") {
  if (typeof value !== "string" || !value) {
    throw new TaskValidationError([{ field, message: "is required" }]);
  }
  return value;
}

export function assertPlannerDate(value, field) {
  return assertDateKey(value, field);
}
