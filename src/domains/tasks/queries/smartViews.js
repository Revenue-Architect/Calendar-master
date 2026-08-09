import {
  getCompletedTasks,
  getDueToday,
  getInboxTasks,
  getOverdueTasks,
  getSomedayTasks,
  getTasksForDay,
  getUnscheduledTasks,
  getUpcomingDeadlines,
  getWaitingTasks,
} from "./taskQueries.js";
import { getOverdueForToday } from "./dayView.js";
import { addDaysToKey } from "../../../shared/time/dateKey.js";
import { isTaskActive } from "../model/task.js";

/* §4.3. Smart views are named queries. Resolving them in one place keeps the
   interface from re-deriving "what counts as Upcoming" in three different spots. */
export const SMART_VIEWS = Object.freeze([
  { id: "today", label: "TODAY" },
  { id: "inbox", label: "INBOX" },
  { id: "upcoming", label: "UPCOMING" },
  { id: "deadlines", label: "DEADLINES" },
  { id: "overdue", label: "OVERDUE" },
  { id: "waiting", label: "WAITING" },
  { id: "someday", label: "SOMEDAY" },
  { id: "unscheduled", label: "UNSCHEDULED" },
  { id: "completed", label: "COMPLETED" },
  { id: "all", label: "ALL" },
]);

export function resolveSmartView(state, viewId, todayKey) {
  const tasks = state.tasks.filter((task) => !task.parentTaskId);
  switch (viewId) {
    case "today": return getTasksForDay(tasks, todayKey);
    case "inbox": return getInboxTasks(tasks);
    case "upcoming": {
      const end = addDaysToKey(todayKey, 8);
      return tasks
        .filter((task) => isTaskActive(task) && task.planned.date && task.planned.date > todayKey && task.planned.date < end)
        .sort((a, b) => a.planned.date.localeCompare(b.planned.date));
    }
    case "deadlines": return getUpcomingDeadlines(tasks, todayKey, 30);
    case "overdue": return getOverdueForToday({ ...state, tasks }, todayKey);
    case "waiting": return getWaitingTasks(tasks);
    case "someday": return getSomedayTasks(tasks);
    case "unscheduled": return getUnscheduledTasks(tasks).filter((task) => !task.someday);
    case "completed": return getCompletedTasks(tasks);
    case "all": return tasks.filter(isTaskActive);
    default: return getTasksForDay(tasks, todayKey);
  }
}

export function smartViewCounts(state, todayKey) {
  return Object.fromEntries(
    SMART_VIEWS.map((view) => [view.id, resolveSmartView(state, view.id, todayKey).length]),
  );
}

export { getDueToday, getOverdueTasks };
