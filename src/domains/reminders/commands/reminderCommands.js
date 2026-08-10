import {
  createScheduledReminder,
  isActiveReminder,
  normalizeReminderRecord,
  reminderSourceKey,
} from "../model/reminder.js";

const activeWithin = (record, horizonEnd) => isActiveReminder(record) && (!horizonEnd || record.scheduledFor <= horizonEnd);

/* §2.2. A changed source produces a new deterministic schedule. Its old active
   schedule remains audit history, marked superseded rather than disappearing. */
export function reconcileReminders(records, intents, { now = null, horizonEnd = null } = {}) {
  const normalized = (records ?? []).map(normalizeReminderRecord);
  const current = new Map(intents.map((intent) => [createScheduledReminder(intent, { now }).id, intent]));
  const sourceKeys = new Set(intents.map((intent) => reminderSourceKey(intent)));
  const next = normalized.map((record) => {
    if (!activeWithin(record, horizonEnd) || current.has(record.id)) return record;
    return {
      ...record,
      status: sourceKeys.has(record.sourceKey) ? "superseded" : "cancelled",
      updatedAt: now,
    };
  });
  const known = new Set(next.map((record) => record.id));
  for (const intent of intents) {
    const scheduled = createScheduledReminder(intent, { now });
    if (!known.has(scheduled.id)) next.push(scheduled);
  }
  return next.sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor) || left.id.localeCompare(right.id));
}

function updateRecord(records, reminderId, update) {
  let found = false;
  const next = records.map((record) => {
    if (record.id !== reminderId) return record;
    found = true;
    return update(normalizeReminderRecord(record));
  });
  if (!found) throw new RangeError(`reminder ${reminderId} was not found`);
  return next;
}

export function deliverReminder(records, reminderId, { now } = {}) {
  return updateRecord(records, reminderId, (record) => ({
    ...record, status: "delivered", attemptCount: record.attemptCount + 1,
    deliveredAt: now, updatedAt: now,
  }));
}

export function snoozeReminder(records, reminderId, { now, until } = {}) {
  return updateRecord(records, reminderId, (record) => ({
    ...record, status: "snoozed", scheduledFor: until, snoozedAt: now, updatedAt: now,
  }));
}

export function dismissReminder(records, reminderId, { now } = {}) {
  return updateRecord(records, reminderId, (record) => ({
    ...record, status: "dismissed", dismissedAt: now, updatedAt: now,
  }));
}
