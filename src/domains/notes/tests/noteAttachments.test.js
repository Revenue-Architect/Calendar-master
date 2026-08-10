import assert from "node:assert/strict";
import test from "node:test";

import {
  attachNoteMetadata,
  deleteNoteWithAttachments,
  normalizeNote,
  restoreDeletedNoteWithAttachments,
  validateNoteAttachmentOwnership,
} from "../index.js";

const NOW = "2026-08-10T10:00";

function note() {
  return normalizeNote({
    id: "note-1", kind: "standalone", title: "Reference",
    blocks: [{ id: "block-1", type: "paragraph", text: "Keep this." }],
  });
}

test("attachment metadata is sanitized and has reciprocal note ownership", () => {
  const result = attachNoteMetadata([note()], [], "note-1", {
    id: "attachment-1", displayName: "  proposal/../draft.pdf\u0000 ", mediaType: "application/pdf",
    byteSize: 42, status: "available", storageRef: "local:blob-1", caption: "Draft",
  }, { now: NOW });

  assert.equal(result.notes[0].attachmentIds[0], "attachment-1");
  assert.equal(result.noteAttachments[0].noteId, "note-1");
  assert.equal(result.noteAttachments[0].displayName.includes("/"), false);
  assert.equal(validateNoteAttachmentOwnership(result.notes, result.noteAttachments)[0].id, "attachment-1");
});

test("invalid duplicate or orphan attachment metadata is rejected before it can persist", () => {
  const attached = attachNoteMetadata([note()], [], "note-1", {
    id: "attachment-1", displayName: "draft.txt", mediaType: "text/plain", byteSize: 1, status: "pending",
  }, { now: NOW });

  assert.throws(() => attachNoteMetadata(attached.notes, attached.noteAttachments, "note-1", {
    id: "attachment-1", displayName: "other.txt", mediaType: "text/plain", byteSize: 1, status: "pending",
  }), /already exists/);
  assert.throws(() => validateNoteAttachmentOwnership(
    attached.notes.map((entry) => ({ ...entry, attachmentIds: [] })), attached.noteAttachments,
  ), /must be referenced/);
});

test("deleting a note carries attachment metadata for exact undo restoration", () => {
  const attached = attachNoteMetadata([note()], [], "note-1", {
    id: "attachment-1", displayName: "draft.txt", mediaType: "text/plain", byteSize: 1, status: "pending",
  }, { now: NOW });
  const deleted = deleteNoteWithAttachments(attached.notes, attached.noteAttachments, "note-1");

  assert.deepEqual(deleted.notes, []);
  assert.deepEqual(deleted.noteAttachments, []);
  assert.equal(deleted.removed.note.id, "note-1");
  assert.equal(deleted.removed.attachments[0].id, "attachment-1");

  const restored = restoreDeletedNoteWithAttachments(deleted.notes, deleted.noteAttachments, deleted.removed);
  assert.equal(restored.notes[0].attachmentIds[0], "attachment-1");
  assert.equal(restored.noteAttachments[0].noteId, "note-1");
});
