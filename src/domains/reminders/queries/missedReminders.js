import { compareLocalDateTimes, localDateTimeToEpochMinutes } from "../../../shared/time/localDateTime.js";
import { isActiveReminder, normalizeReminderRecord } from "../model/reminder.js";

/* What happened while you were not here.
 *
 * `getDueReminders` only returns a reminder within five minutes of its time —
 * deliberately, because firing a stale alarm the moment an app loads is worse
 * than not firing it. But nothing looked at the reminders that fell outside that
 * window, so a reminder whose moment passed while the notebook was closed sat in
 * the ledger as `scheduled` for ever: never delivered, never cancelled, never
 * mentioned. The app knew it had missed something and said nothing.
 *
 * This is the other half. A missed reminder is not an alarm — the moment has
 * gone, and an alarm would be a lie about what time it is. It is a report.
 *
 * A web page cannot schedule an alarm for a time when it is not running. There
 * is no local mechanism for it: the only ways are a push from a server, or a
 * notification-trigger API that never shipped. So this is the honest ceiling for
 * a notebook that keeps everything on the device — not a consolation prize for
 * missing background delivery, but the whole of what background delivery could
 * have told you, delivered when you are actually there to read it.
 */

/* A fortnight. Far enough back to cover a holiday, near enough that reopening an
   old notebook does not produce a wall of things you long ago stopped caring
   about. */
export const MISSED_LOOKBACK_MINUTES = 14 * 24 * 60;

export function getMissedReminders(records, now, {
  graceMinutes = 5,
  lookbackMinutes = MISSED_LOOKBACK_MINUTES,
  limit = 50,
} = {}) {
  const nowMinutes = localDateTimeToEpochMinutes(now);
  return (records ?? [])
    .map(normalizeReminderRecord)
    .filter((record) => isActiveReminder(record))
    .filter((record) => {
      const age = nowMinutes - localDateTimeToEpochMinutes(record.scheduledFor);
      return age > graceMinutes && age <= lookbackMinutes;
    })
    /* Most recent first: the thing you missed twenty minutes ago matters more
       than the thing you missed on Tuesday. */
    .sort((left, right) => compareLocalDateTimes(right.scheduledFor, left.scheduledFor))
    .slice(0, limit);
}

/* Older than the lookback. These are not worth reporting and must not be left
   active, or they would be re-examined on every open for the life of the
   notebook. */
export function getExpiredReminders(records, now, { lookbackMinutes = MISSED_LOOKBACK_MINUTES } = {}) {
  const nowMinutes = localDateTimeToEpochMinutes(now);
  return (records ?? [])
    .map(normalizeReminderRecord)
    .filter((record) => isActiveReminder(record))
    .filter((record) => nowMinutes - localDateTimeToEpochMinutes(record.scheduledFor) > lookbackMinutes);
}
