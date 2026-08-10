import { compareLocalDateTimes, localDateTimeToEpochMinutes } from "../../../shared/time/localDateTime.js";
import { isActiveReminder, normalizeReminderRecord } from "../model/reminder.js";

export function getDueReminders(records, now, { graceMinutes = 5, limit = 3 } = {}) {
  const nowMinutes = localDateTimeToEpochMinutes(now);
  return (records ?? [])
    .map(normalizeReminderRecord)
    .filter((record) => isActiveReminder(record))
    .filter((record) => {
      const delta = nowMinutes - localDateTimeToEpochMinutes(record.scheduledFor);
      return delta >= 0 && delta <= graceMinutes;
    })
    .sort((left, right) => compareLocalDateTimes(left.scheduledFor, right.scheduledFor))
    .slice(0, limit);
}

export function getActiveReminders(records) {
  return (records ?? []).map(normalizeReminderRecord).filter(isActiveReminder);
}
