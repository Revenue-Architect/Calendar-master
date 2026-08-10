import { normalizeReminderRecord } from "../../domains/reminders/index.js";

export const REMINDER_STORE_KEY = "nbmp:reminders:v1";

function valueOf(result) {
  return result && typeof result === "object" && Object.hasOwn(result, "value") ? result.value : result;
}

export async function loadReminderRecords(storagePort) {
  const value = valueOf(await storagePort.get(REMINDER_STORE_KEY));
  if (value == null || value === "") return [];
  let parsed;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch (error) {
    throw new Error("reminder storage contains invalid JSON", { cause: error });
  }
  if (!Array.isArray(parsed)) throw new TypeError("reminder storage must be an array");
  return parsed.map(normalizeReminderRecord);
}

export async function saveReminderRecords(storagePort, records) {
  const normalized = (records ?? []).map(normalizeReminderRecord);
  await storagePort.set(REMINDER_STORE_KEY, JSON.stringify(normalized));
}
