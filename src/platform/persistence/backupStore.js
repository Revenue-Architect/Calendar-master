import { BACKUP_STORE_KEY, createBackupRecord, normalizeBackupRecord } from "../../features/planner/backupReminder.js";

/* When the notebook was last copied off this device, kept beside the notebook
   rather than inside it — a record of what happened to the data is not part of
   the data, and writing it into the notebook would change the very fingerprint
   it exists to compare against. */

export { BACKUP_STORE_KEY };

function valueOf(result) {
  return result && typeof result === "object" && Object.hasOwn(result, "value") ? result.value : result;
}

function parseStored(result) {
  const value = valueOf(result);
  if (value == null || value === "") return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    /* A damaged record means "we know nothing about past backups", which is the
       safe reading: the worst it can do is ask once more than necessary. */
    return null;
  }
}

export async function loadBackupRecord(storagePort) {
  const parsed = parseStored(await storagePort.get(BACKUP_STORE_KEY));
  if (parsed == null) return { record: createBackupRecord(), initialized: true };
  return { record: normalizeBackupRecord(parsed), initialized: false };
}

export async function saveBackupRecord(storagePort, record) {
  await storagePort.set(BACKUP_STORE_KEY, JSON.stringify(normalizeBackupRecord(record)));
}
