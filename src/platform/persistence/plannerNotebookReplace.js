/* Replace / wipe is one transaction across the notebook and its side stores.
 *
 * The planner notebook (`nbmp:state:v8`) is not the whole device. Reminders,
 * motivation, and the backup fingerprint live beside it. Settings → REPLACE
 * and START A BLANK NOTEBOOK used to swap the notebook and then rebuild
 * motivation from the leftover `xp` field — a v4 number that v8 no longer
 * owns. Reminders were emptied, but the backup fingerprint still described
 * the *previous* notebook, so the nudge would stay quiet about a brand-new
 * one (or fire immediately for a restored one it had already exported).
 *
 * Preferences are deliberately *not* part of this transaction. Theme, clock,
 * haptics and the rest are device settings, not notebook content. Importing
 * someone else's week must not restyle this device; wiping the notebook
 * must not throw away the user's theme. Diagnostics stay too: a crash log
 * about the previous notebook is still useful after a replace.
 *
 * Motivation: a JSON export of the planner state does not include the
 * motivation ledger. Opening balance is therefore 0 after replace/wipe —
 * not `pendingImport.xp`, which is leftover v4 and would mint a fake
 * opening-balance entry. Completions after the import award points from
 * here. If a future export starts shipping the ledger, load it through
 * `createMotivationLedger` / `normalizeMotivationLedger` instead of `xp`.
 */

import { createMotivationLedger } from "../../domains/gamification/index.js";
import { createBackupRecord } from "../../features/planner/backupReminder.js";
import { createBlankPlannerState } from "./plannerStateImport.js";

export const REPLACE_KEEP_PREFERENCES = true;
export const REPLACE_RESET_MOTIVATION = true;
export const REPLACE_CLEAR_REMINDERS = true;
export const REPLACE_RESET_BACKUP = true;

/**
 * Side-store snapshot that accompanies a replaced or wiped notebook.
 * Preferences and diagnostics are omitted on purpose — see file comment.
 */
export function createReplacedNotebookSession(state, { openingBalance = 0 } = {}) {
  return {
    state,
    reminderRecords: [],
    motivationLedger: createMotivationLedger({ openingBalance }),
    backupRecord: createBackupRecord(),
    keepPreferences: REPLACE_KEEP_PREFERENCES,
  };
}

/** Settings → REPLACE. `state` is already normalizeImportedPlannerState output. */
export function replacePlannerNotebook(state) {
  return createReplacedNotebookSession(state, { openingBalance: 0 });
}

/** Settings → START A BLANK NOTEBOOK. Device preferences stay where they are. */
export function wipePlannerNotebook(devicePreferences = {}) {
  return createReplacedNotebookSession(createBlankPlannerState({
    themeId: devicePreferences.themeId,
    sound: devicePreferences.sound,
    notifs: devicePreferences.notifs,
    clock: devicePreferences.clock,
  }), { openingBalance: 0 });
}
