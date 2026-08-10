import { getDayAggregate } from "../../domains/planner/index.js";
import { getUpcomingDeadlines } from "../../domains/tasks/index.js";

/* The feature layer owns presentation-safe conversion only. It deliberately does
   not turn an event/task/note into app state or decide any domain rule. */
export function projectPlannerDay(state, {
  selectedDate,
  todayDate,
  currentMinute,
  viewerTimeZone,
  mapEvent = (event) => event,
} = {}) {
  const aggregate = getDayAggregate(state, {
    selectedDate,
    todayDate,
    currentMinute,
    viewerTimeZone,
  });
  const map = (event) => mapEvent(event);

  return {
    ...aggregate,
    events: aggregate.events.map(map),
    nextEvent: aggregate.nextEvent ? map(aggregate.nextEvent) : null,
    deadlines: Array.isArray(state?.tasks)
      ? getUpcomingDeadlines(state.tasks, todayDate, 10)
      : [],
  };
}
