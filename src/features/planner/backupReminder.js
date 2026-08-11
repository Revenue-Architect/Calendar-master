import { assertDateKey, diffDays } from "../../shared/time/dateKey.js";

/* Asking for a backup, without becoming the thing you dismiss on sight.
 *
 * Everything is on one device, and export is a manual action buried in Settings
 * that nobody performs on a good day. The failure mode is not dramatic: a
 * browser profile is cleared, a phone is replaced, or — on Safari specifically —
 * storage written by script is evicted after about a week without visiting the
 * site. The notebook does not corrupt; it simply is not there any more.
 *
 * So the prompt has to be rare enough to be believed:
 *
 * - It never asks about a notebook with nothing in it.
 * - It never asks twice for the same content. The fingerprint is over the
 *   notebook itself, so a week of opening the app and changing nothing does not
 *   earn a reminder, and one real edit does.
 * - Dismissing means dismissing *this* state. It comes back when the notebook
 *   has moved on and enough time has passed, not on the next reload.
 *
 * The fingerprint is a plain FNV-1a over the serialised notebook. It is not a
 * security hash — nothing here is adversarial — it just has to change whenever
 * the content changes and be cheap enough to run on a few hundred kilobytes.
 */

export const BACKUP_STORE_KEY = "nbmp:backup:v1";
export const DEFAULT_BACKUP_INTERVAL_DAYS = 14;
/* Below this a notebook is a trial, not a record worth nagging about. */
export const MIN_RECORDS_TO_PROMPT = 5;

export function fingerprintNotebook(state) {
  const source = JSON.stringify(state ?? null);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}-${source.length.toString(36)}`;
}

/** How much is actually in here — a notebook, or a first look around? */
export function notebookWeight(state) {
  return (state?.events?.length ?? 0) + (state?.tasks?.length ?? 0) + (state?.notes?.length ?? 0);
}

export function normalizeBackupRecord(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const dateOrNull = (value) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
  return {
    schemaVersion: 1,
    exportedOn: dateOrNull(source.exportedOn),
    exportedFingerprint: typeof source.exportedFingerprint === "string" ? source.exportedFingerprint : null,
    dismissedOn: dateOrNull(source.dismissedOn),
    dismissedFingerprint: typeof source.dismissedFingerprint === "string" ? source.dismissedFingerprint : null,
  };
}

export function createBackupRecord() {
  return normalizeBackupRecord({});
}

/**
 * Should the planner ask for a backup right now?
 *
 * @param {object} options
 * @param {object} options.state        the notebook
 * @param {object} options.record       what we know about past exports
 * @param {string} options.today        date key
 * @param {number} [options.intervalDays]
 */
export function shouldPromptBackup({ state, record, today, intervalDays = DEFAULT_BACKUP_INTERVAL_DAYS } = {}) {
  assertDateKey(today, "today");
  if (notebookWeight(state) < MIN_RECORDS_TO_PROMPT) return false;

  const history = normalizeBackupRecord(record);
  const fingerprint = fingerprintNotebook(state);

  /* Already saved exactly this. Nothing has happened since worth rescuing. */
  if (history.exportedFingerprint === fingerprint) return false;

  /* Dismissed this exact state: only ask again once it has changed *and* the
     interval has passed, so "not now" is not overruled by a reload. */
  if (history.dismissedFingerprint === fingerprint) return false;
  if (history.dismissedOn && diffDays(today, history.dismissedOn) < intervalDays) return false;

  /* Never exported anything: the notebook has content and no copy of it. */
  if (!history.exportedOn) return true;

  return diffDays(today, history.exportedOn) >= intervalDays;
}

export function recordBackupTaken(record, { state, today }) {
  assertDateKey(today, "today");
  return {
    ...normalizeBackupRecord(record),
    exportedOn: today,
    exportedFingerprint: fingerprintNotebook(state),
    /* A fresh copy clears the snooze: the next prompt should be decided by the
       interval from here, not by a dismissal that predates it. */
    dismissedOn: null,
    dismissedFingerprint: null,
  };
}

export function recordBackupDismissed(record, { state, today }) {
  assertDateKey(today, "today");
  return {
    ...normalizeBackupRecord(record),
    dismissedOn: today,
    dismissedFingerprint: fingerprintNotebook(state),
  };
}
