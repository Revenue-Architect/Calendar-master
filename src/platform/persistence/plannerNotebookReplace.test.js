import assert from "node:assert/strict";
import test from "node:test";

import { createBlankPlannerState } from "./plannerStateImport.js";
import {
  REPLACE_KEEP_PREFERENCES,
  replacePlannerNotebook,
  wipePlannerNotebook,
} from "./plannerNotebookReplace.js";

test("replace clears reminders and motivation instead of minting leftover xp", () => {
  const imported = createBlankPlannerState({ themeId: "cream-blue" });
  const session = replacePlannerNotebook({ ...imported, xp: 690 });
  assert.equal(session.state.themeId, "cream-blue");
  assert.deepEqual(session.reminderRecords, []);
  assert.deepEqual(session.motivationLedger.entries, []);
  assert.equal(session.backupRecord.exportedOn, null);
  assert.equal(session.keepPreferences, true);
  assert.equal(REPLACE_KEEP_PREFERENCES, true);
});

test("wipe is a blank v8 notebook with the same side-store reset", () => {
  const session = wipePlannerNotebook({ themeId: "cream-blue", clock: "24" });
  assert.equal(session.state.schemaVersion, 8);
  assert.equal(session.state.themeId, "cream-blue");
  assert.deepEqual(session.state.events, []);
  assert.deepEqual(session.state.tasks, []);
  assert.deepEqual(session.reminderRecords, []);
  assert.deepEqual(session.motivationLedger.entries, []);
});
