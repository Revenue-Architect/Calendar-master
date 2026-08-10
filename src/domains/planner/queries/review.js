import { isTaskActive } from "../../tasks/index.js";
import { getDayAggregate } from "./dayAggregate.js";

const completedOn = (task, dateKey) => task.status === "completed"
  && String(task.completedAt ?? "").slice(0, 10) === dateKey;

/* §1.4. A review is evidence about the day, not an inference engine. Event records
   say what was scheduled, not whether it happened, so variance remains explicit
   until an attendance model exists. */
export function getDailyReview(state, dateKey, { todayDate = dateKey, currentMinute = 0 } = {}) {
  const day = getDayAggregate(state, { selectedDate: dateKey, todayDate, currentMinute });
  const completed = [];
  const seen = new Set();
  const completedOccurrences = new Map(
    day.tasks
      .filter((task) => task.isOccurrence && task.status === "completed")
      .map((task) => [task.seriesId, task]),
  );

  for (const task of state?.tasks ?? []) {
    if (completedOn(task, dateKey)) {
      completed.push(task);
      seen.add(task.id);
      continue;
    }
    const occurrence = completedOccurrences.get(task.id);
    if (occurrence) {
      completed.push(occurrence);
      seen.add(occurrence.id);
    }
  }
  for (const task of day.tasks) {
    if (task.status === "completed" && !seen.has(task.id)) completed.push(task);
  }

  return {
    date: dateKey,
    completed,
    unfinished: day.tasks.filter((task) => isTaskActive(task)),
    dailyNote: day.dailyNote,
    notes: day.notes,
    eventCount: day.events.length,
    scheduleVariance: { status: "unavailable", reason: "event attendance is not recorded" },
    sections: day.sections,
  };
}
