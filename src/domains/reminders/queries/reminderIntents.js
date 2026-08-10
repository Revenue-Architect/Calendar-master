import { getOccurrencesForRange } from "../../calendar/index.js";
import { getUpcomingRange } from "../../tasks/index.js";
import { addDaysToKey } from "../../../shared/time/dateKey.js";
import { addMinutesToLocalDateTime } from "../../../shared/time/localDateTime.js";

const at = (date, minute) => addMinutesToLocalDateTime(`${date}T00:00`, minute);

function eventIntents(state, startDate, endExclusive) {
  return getOccurrencesForRange(state, startDate, endExclusive)
    .filter((event) => event.timing.kind === "timed" && (event.alerts ?? []).length)
    .flatMap((event) => event.alerts.map((offsetMinutes) => ({
      source: {
        domain: "event", entityId: event.seriesId || event.id,
        occurrenceId: event.instance ? event.id : null, intentId: `alert:${offsetMinutes}`,
      },
      title: event.title,
      body: offsetMinutes === 0 ? "Starting now" : `${offsetMinutes}m before event start`,
      scheduledFor: addMinutesToLocalDateTime(event.timing.startLocal, -offsetMinutes),
    })));
}

function taskAnchor(task, reminder) {
  if (reminder.anchor === "planned" && task.planned?.date) {
    return { date: task.planned.date, minute: task.planned.startMinute ?? 9 * 60 };
  }
  if (reminder.anchor === "deadline" && task.deadline?.date) {
    return { date: task.deadline.date, minute: task.deadline.minute ?? 9 * 60 };
  }
  if (reminder.anchor === "followUp" && task.followUpDate) {
    return { date: task.followUpDate, minute: task.planned?.startMinute ?? 9 * 60 };
  }
  return null;
}

function taskIntents(state, startDate, endExclusive) {
  const candidates = new Map();
  const span = (() => { let days = 0; for (let key = startDate; key < endExclusive; key = addDaysToKey(key, 1)) days += 1; return days; })();
  for (const task of getUpcomingRange(state, startDate, span)) candidates.set(task.id, task);
  for (const task of state.tasks ?? []) {
    if (!task.recurrence && (task.deadline?.date || task.followUpDate)) candidates.set(task.id, task);
  }
  return [...candidates.values()]
    .filter((task) => task.status !== "completed" && task.status !== "archived")
    .flatMap((task) => (task.reminders ?? []).flatMap((reminder) => {
      const anchor = taskAnchor(task, reminder);
      if (!anchor || anchor.date < startDate || anchor.date >= endExclusive) return [];
      return [{
        source: {
          domain: "task", entityId: task.seriesId || task.id,
          occurrenceId: task.isOccurrence ? task.id : null, intentId: reminder.id,
        },
        title: task.title,
        body: reminder.offsetMinutes === 0 ? `At ${reminder.anchor}` : `${reminder.offsetMinutes}m before ${reminder.anchor}`,
        scheduledFor: addMinutesToLocalDateTime(at(anchor.date, anchor.minute), -reminder.offsetMinutes),
      }];
    }));
}

export function getReminderIntents(state, { now, horizonDays = 14 } = {}) {
  const startDate = String(now).slice(0, 10);
  const endExclusive = addDaysToKey(startDate, horizonDays);
  return [
    ...eventIntents(state, startDate, endExclusive),
    ...taskIntents(state, startDate, endExclusive),
  ];
}
