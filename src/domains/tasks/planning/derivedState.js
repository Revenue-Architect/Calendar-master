import { assertDateKey, diffDays } from "../../../shared/time/dateKey.js";
import { isTaskActive } from "../model/task.js";
import { subtaskProgress } from "../hierarchy/taskHierarchy.js";
import { getTaskBlockers } from "../dependencies/taskDependencies.js";

/* §2.2. Derived states are computed, never stored, so they can never drift out of
   agreement with the fields they are read from. */

/* §5.5, and the reason this module exists.
   Overdue is driven by the deadline alone. A planned date is an intention the user
   is free to move (§5.1 "moving it does not imply failure"), so letting a passed
   planned date create overdue debt punishes ordinary replanning. A task with no
   deadline therefore never becomes overdue, and a recurring task defers to its
   series' missed-occurrence policy (§9.3) instead. */
export function isOverdue(task, todayKey) {
  assertDateKey(todayKey, "todayKey");
  if (!isTaskActive(task)) return false;
  if (task.recurrence) return task.recurrence.missedPolicy === "accumulate" && hasPassedDeadline(task, todayKey);
  return hasPassedDeadline(task, todayKey);
}

function hasPassedDeadline(task, todayKey) {
  return task.deadline.date != null && task.deadline.date < todayKey;
}

export function isDueToday(task, todayKey) {
  assertDateKey(todayKey, "todayKey");
  return isTaskActive(task) && task.deadline.date === todayKey;
}

export function isScheduled(task) {
  return task.planned.date != null && task.planned.startMinute != null;
}

export function isPlanned(task) {
  return task.planned.date != null;
}

/* §1.2/§4.3. Inbox is "captured but not yet organised": no plan, no deadline, not
   parked in Someday, and still untouched. Status is part of that test — starting a
   task or moving it to waiting is triage, so those have left the inbox even when
   they carry no dates. */
export function isInbox(task) {
  return task.status === "open"
    && !task.parentTaskId
    && !isPlanned(task)
    && task.deadline.date == null
    && !task.someday;
}

export function isUnscheduled(task) {
  return isTaskActive(task) && !isPlanned(task);
}

export function isWaitingWithoutFollowUp(task) {
  return task.status === "waiting" && task.followUpDate == null;
}

export function isCompletedLate(task) {
  if (task.status !== "completed" || !task.completedAt || task.deadline.date == null) return false;
  return task.completedAt.slice(0, 10) > task.deadline.date;
}

/* §7.3/§8.3. Subtask and checklist progress are reported separately — a parent with
   every checklist item ticked but an open subtask is not "nearly done". */
export function taskProgress(tasks, task) {
  const subtasks = subtaskProgress(tasks, task.id);
  const items = task.checklist ?? [];
  const checklistDone = items.filter((item) => item.done).length;
  return {
    subtasks,
    checklist: { done: checklistDone, total: items.length },
  };
}

export function derivedStates(tasks, task, todayKey) {
  assertDateKey(todayKey, "todayKey");
  const states = [];
  if (isInbox(task)) states.push("inbox");
  if (task.someday) states.push("someday");
  if (isPlanned(task)) states.push("planned");
  if (isScheduled(task)) states.push("scheduled");
  if (isUnscheduled(task)) states.push("unscheduled");
  if (isDueToday(task, todayKey)) states.push("due_today");
  if (isOverdue(task, todayKey)) states.push("overdue");
  if (task.recurrence) states.push("recurring");
  if (task.status === "waiting") states.push("waiting");
  if (isWaitingWithoutFollowUp(task)) states.push("waiting_without_follow_up");
  if (isCompletedLate(task)) states.push("completed_late");
  if (isTaskActive(task) && task.deadline.date != null && task.deadline.date > todayKey) {
    states.push("upcoming");
  }
  if (isTaskActive(task) && blockingReasons(tasks, task).length > 0) states.push("blocked");
  return states;
}

/* §2.2/§15.3. Two different things make a task un-startable, and a user needs to
   know which: required subtasks still open, or an explicit dependency unmet.
   Returned as reasons rather than a bare boolean so the caller can name the
   blocker instead of just greying the row out. */
export function blockingReasons(tasks, task) {
  const reasons = [];
  const progress = subtaskProgress(tasks, task.id);
  if (progress.total > 0 && !progress.complete) {
    reasons.push({ kind: "subtasks", remaining: progress.total - progress.done });
  }
  const blockers = getTaskBlockers(tasks, task.id);
  if (blockers.length) {
    reasons.push({ kind: "dependencies", blockers });
  }
  return reasons;
}

/* §15.4. Blocking is advisory: this reports what stands in the way so the caller can
   warn and let the user proceed, rather than refusing on the domain's behalf. */
export function canStart(tasks, task) {
  const reasons = blockingReasons(tasks, task);
  return { allowed: reasons.length === 0, reasons };
}

export function daysUntilDeadline(task, todayKey) {
  if (task.deadline.date == null) return null;
  return diffDays(task.deadline.date, todayKey);
}
