import { assertLocalDateTime } from "../../../shared/time/localDateTime.js";

export const REMINDER_STATUSES = Object.freeze([
  "scheduled", "delivered", "snoozed", "dismissed", "cancelled", "failed", "superseded",
]);

function text(value, field) {
  if (typeof value !== "string" || !value) throw new TypeError(`${field} is required`);
  return value;
}

export function reminderSourceKey({ source }) {
  const domain = text(source?.domain, "source.domain");
  if (!new Set(["event", "task"]).has(domain)) throw new TypeError("source.domain is invalid");
  const entityId = text(source?.entityId, "source.entityId");
  const intentId = text(source?.intentId, "source.intentId");
  const occurrenceId = source?.occurrenceId == null ? "series" : text(source.occurrenceId, "source.occurrenceId");
  return `${domain}|${entityId}|${occurrenceId}|${intentId}`;
}

export function reminderScheduleId(intent) {
  return `rem:${reminderSourceKey(intent)}|${assertLocalDateTime(intent?.scheduledFor, "scheduledFor")}`;
}

export function createScheduledReminder(intent, { now = null } = {}) {
  const sourceKey = reminderSourceKey(intent);
  const scheduledFor = assertLocalDateTime(intent?.scheduledFor, "scheduledFor");
  return {
    id: reminderScheduleId(intent), sourceKey,
    source: { ...intent.source, occurrenceId: intent.source.occurrenceId ?? null },
    title: typeof intent.title === "string" ? intent.title : "Reminder",
    body: typeof intent.body === "string" ? intent.body : "",
    scheduledFor, status: "scheduled", attemptCount: 0, lastErrorCategory: null,
    createdAt: now, updatedAt: now, deliveredAt: null, dismissedAt: null, snoozedAt: null,
  };
}

export function normalizeReminderRecord(input) {
  const status = text(input?.status, "status");
  if (!REMINDER_STATUSES.includes(status)) throw new TypeError("status is invalid");
  const record = createScheduledReminder({
    source: input.source,
    title: input.title,
    body: input.body,
    scheduledFor: input.scheduledFor,
  }, { now: input.createdAt ?? null });
  if (input.id !== record.id && !String(input.id).startsWith(`rem:${record.sourceKey}|`)) {
    throw new TypeError("reminder id does not match its source");
  }
  if (!Number.isInteger(input.attemptCount) || input.attemptCount < 0) throw new TypeError("attemptCount is invalid");
  for (const field of ["updatedAt", "deliveredAt", "dismissedAt", "snoozedAt"]) {
    if (input[field] != null) assertLocalDateTime(input[field], field);
  }
  return {
    ...record, id: input.id, status, attemptCount: input.attemptCount,
    lastErrorCategory: input.lastErrorCategory ?? null,
    updatedAt: input.updatedAt ?? null, deliveredAt: input.deliveredAt ?? null,
    dismissedAt: input.dismissedAt ?? null, snoozedAt: input.snoozedAt ?? null,
  };
}

export const isActiveReminder = (record) => record.status === "scheduled" || record.status === "snoozed";
