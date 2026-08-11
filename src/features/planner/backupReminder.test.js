import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BACKUP_INTERVAL_DAYS,
  createBackupRecord,
  fingerprintNotebook,
  normalizeBackupRecord,
  notebookWeight,
  recordBackupDismissed,
  recordBackupTaken,
  shouldPromptBackup,
} from "./backupReminder.js";

const TODAY = "2026-08-10";
const later = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const notebook = (count = 10, salt = "") => ({
  schemaVersion: 8,
  events: Array.from({ length: count }, (_, i) => ({ id: `e${i}`, title: `Event ${i}${salt}` })),
  tasks: [],
  notes: [],
});

test("the fingerprint changes when the notebook changes, and only then", () => {
  assert.equal(fingerprintNotebook(notebook()), fingerprintNotebook(notebook()));
  assert.notEqual(fingerprintNotebook(notebook()), fingerprintNotebook(notebook(11)));
  assert.notEqual(fingerprintNotebook(notebook(10)), fingerprintNotebook(notebook(10, "!")));
});

test("the fingerprint survives nothing at all", () => {
  assert.equal(typeof fingerprintNotebook(null), "string");
  assert.equal(typeof fingerprintNotebook(undefined), "string");
});

test("weight counts the things worth losing", () => {
  assert.equal(notebookWeight({ events: [1, 2], tasks: [1], notes: [1, 2, 3] }), 6);
  assert.equal(notebookWeight({}), 0);
  assert.equal(notebookWeight(null), 0);
});

test("a nearly empty notebook is never worth a prompt", () => {
  const record = createBackupRecord();
  assert.equal(shouldPromptBackup({ state: notebook(0), record, today: TODAY }), false);
  assert.equal(shouldPromptBackup({ state: notebook(4), record, today: TODAY }), false);
  assert.equal(shouldPromptBackup({ state: notebook(5), record, today: TODAY }), true);
});

test("a notebook with content and no copy of it prompts", () => {
  assert.equal(shouldPromptBackup({ state: notebook(), record: createBackupRecord(), today: TODAY }), true);
});

test("exporting silences it for exactly that content", () => {
  const state = notebook();
  const record = recordBackupTaken(createBackupRecord(), { state, today: TODAY });
  assert.equal(shouldPromptBackup({ state, record, today: TODAY }), false);
  /* A year of opening the app and changing nothing earns no reminder. */
  assert.equal(shouldPromptBackup({ state, record, today: later(400) }), false);
});

test("one real edit after the interval brings it back", () => {
  const record = recordBackupTaken(createBackupRecord(), { state: notebook(), today: TODAY });
  const edited = notebook(11);
  assert.equal(shouldPromptBackup({ state: edited, record, today: TODAY }), false, "not the same day");
  assert.equal(
    shouldPromptBackup({ state: edited, record, today: later(DEFAULT_BACKUP_INTERVAL_DAYS - 1) }),
    false,
    "not yet",
  );
  assert.equal(shouldPromptBackup({ state: edited, record, today: later(DEFAULT_BACKUP_INTERVAL_DAYS) }), true);
});

test("dismissing means dismissing this state, not silencing it forever", () => {
  const state = notebook();
  const record = recordBackupDismissed(createBackupRecord(), { state, today: TODAY });

  /* Not on the next reload, and not for this content. */
  assert.equal(shouldPromptBackup({ state, record, today: TODAY }), false);
  assert.equal(shouldPromptBackup({ state, record, today: later(400) }), false);

  /* Changed content still respects the snooze window... */
  assert.equal(shouldPromptBackup({ state: notebook(12), record, today: later(3) }), false);
  /* ...and comes back after it. */
  assert.equal(shouldPromptBackup({ state: notebook(12), record, today: later(DEFAULT_BACKUP_INTERVAL_DAYS) }), true);
});

test("a fresh export clears an earlier dismissal", () => {
  const state = notebook();
  const dismissed = recordBackupDismissed(createBackupRecord(), { state, today: TODAY });
  const exported = recordBackupTaken(dismissed, { state, today: TODAY });
  assert.equal(exported.dismissedOn, null);
  assert.equal(exported.dismissedFingerprint, null);
  assert.equal(exported.exportedOn, TODAY);
});

test("the interval is configurable", () => {
  const record = recordBackupTaken(createBackupRecord(), { state: notebook(), today: TODAY });
  const edited = notebook(11);
  assert.equal(shouldPromptBackup({ state: edited, record, today: later(3), intervalDays: 2 }), true);
  assert.equal(shouldPromptBackup({ state: edited, record, today: later(1), intervalDays: 2 }), false);
});

test("a malformed or missing record is treated as no history, not as a crash", () => {
  for (const record of [null, undefined, "nonsense", [], { exportedOn: 42, dismissedOn: {} }]) {
    assert.equal(shouldPromptBackup({ state: notebook(), record, today: TODAY }), true, JSON.stringify(record));
  }
  assert.deepEqual(normalizeBackupRecord("nonsense"), createBackupRecord());
});

test("today is validated rather than guessed", () => {
  assert.throws(() => shouldPromptBackup({ state: notebook(), record: createBackupRecord(), today: "nope" }), TypeError);
  assert.throws(() => recordBackupTaken(createBackupRecord(), { state: notebook(), today: "nope" }), TypeError);
});

test("records round-trip through JSON, since that is how they are stored", () => {
  const record = recordBackupTaken(createBackupRecord(), { state: notebook(), today: TODAY });
  assert.deepEqual(normalizeBackupRecord(JSON.parse(JSON.stringify(record))), record);
});
