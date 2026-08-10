import assert from "node:assert/strict";
import test from "node:test";

import { migrateV6ToV7, migrateV7ToV8, normalizeNote, validatePlannerStateV8 } from "../index.js";

const v6 = {
  schemaVersion: 6,
  calendars: [], events: [], eventExceptions: [], occurrenceAliases: [], overrides: {},
  taskLists: [{ id: "list-default", name: "Actions", isDefault: true }], tasks: [], taskExceptions: [],
  notes: [],
};

test("v7 notes gain deterministic tags, processing, and empty attachment metadata in v8", () => {
  const v7 = migrateV6ToV7(v6);
  const standalone = normalizeNote({ id: "capture", kind: "standalone", title: "Idea", tags: ["Strategy", "strategy"] });
  delete standalone.tagIds;
  delete standalone.attachmentIds;
  delete standalone.processing;
  delete standalone.templateProvenance;
  const migrated = migrateV7ToV8({ ...v7, notes: [standalone] });

  assert.equal(migrated.schemaVersion, 8);
  assert.deepEqual(migrated.noteTags, [{ id: "note-tag:strategy", name: "Strategy", color: null }]);
  assert.deepEqual(migrated.notes[0].tagIds, ["note-tag:strategy"]);
  assert.deepEqual(migrated.notes[0].processing, { state: "inbox", snoozedUntil: null });
  assert.deepEqual(migrated.notes[0].attachmentIds, []);
  assert.deepEqual(migrated.noteAttachments, []);
  assert.equal("tags" in migrated.notes[0], false);
});

test("v8 validation rejects unknown tag references and orphan attachments", () => {
  const base = migrateV7ToV8(migrateV6ToV7(v6));
  const note = normalizeNote({ id: "note", kind: "standalone", tagIds: ["missing"] });
  assert.throws(() => validatePlannerStateV8({ ...base, notes: [note] }), /unknown tag/);
  assert.throws(() => validatePlannerStateV8({
    ...base,
    noteAttachments: [{
      id: "attachment", noteId: "gone", displayName: "gone.txt", mediaType: "text/plain",
      byteSize: 1, checksum: null, status: "pending", storageRef: null, caption: "",
    }],
  }), /unknown note/);
});
