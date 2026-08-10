import { getDayTasks } from "../../domains/tasks/index.js";
import { assertDateKey } from "../../shared/time/dateKey.js";

/* An action with no day is not an action for no day.
 *
 * `getDayTasks` answers "what is planned for this date", and an undated action
 * is planned for none, so it appeared on no day at all — it existed only in the
 * Inbox and Unscheduled views. That is the wrong reading of an undated action:
 * it is work you still owe, and work you still owe should be in front of you
 * every day until you either do it or decide when you will.
 *
 * So an undated, undeadlined, active action *carries*: it shows on today and on
 * every day ahead, and it leaves the moment it is completed, cancelled, given a
 * planned date, or given a deadline. Any one of those is a decision, and once a
 * decision exists the ordinary queries own the task again.
 *
 * Two boundaries keep this from becoming noise:
 *
 * - It never carries backwards. Showing an undated action on last Tuesday would
 *   claim it was owed then, which is a thing the record does not say.
 * - It never carries a deadline'd task. A deadline already places the work in
 *   time, and Deadlines and Overdue answer for it — carrying it as well would
 *   show the same task twice under two different arguments.
 *
 * This is a projection, not a stored fact: nothing is written, so the same task
 * on two days is one record read twice, and completing it on any day completes
 * the one task.
 */

const ACTIVE = new Set(["open", "in_progress", "waiting"]);

/** Does this task have no place in time yet? */
export function isCarriedTask(task) {
  return Boolean(task)
    && ACTIVE.has(task.status)
    && !task.parentTaskId
    && !task.recurrence
    && task.planned?.date == null
    && task.deadline?.date == null;
}

/** The undated backlog, in the list's own rank order. */
export function carriedTasks(state) {
  return (state?.tasks ?? [])
    .filter(isCarriedTask)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
}

/**
 * The day's actions with the undated backlog folded in.
 *
 * @param {object} state
 * @param {string} dateKey    the day being read
 * @param {string} todayDate  today, so the past is left alone
 */
export function getDayTasksWithCarry(state, dateKey, { todayDate } = {}) {
  assertDateKey(dateKey);
  const planned = Array.isArray(state?.tasks) ? getDayTasks(state, dateKey) : [];
  if (!todayDate || dateKey < todayDate) return planned;
  const seen = new Set(planned.map((task) => task.id));
  /* Marked rather than merged silently: the day view can say "this is not from
     today, it is just still open", and nothing downstream mistakes a carried
     action for one somebody planned onto this date. */
  const carried = carriedTasks(state)
    .filter((task) => !seen.has(task.id))
    .map((task) => ({ ...task, carried: true }));
  return [...planned, ...carried];
}
