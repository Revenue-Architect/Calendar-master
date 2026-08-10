import assert from "node:assert/strict";
import test from "node:test";

import {
  exportNativeNoteCollection,
  exportNoteAsMarkdown,
  exportNoteAsPlainText,
  importMarkdownNote,
  importNativeNoteCollection,
  importPlainTextNote,
  normalizeNote,
} from "../index.js";

function state() {
  const note = normalizeNote({
    id: "note-1", kind: "standalone", title: "Decision", tagIds: ["strategy"], attachmentIds: ["attachment-1"],
    links: [{ type: "note", targetId: "unresolved-note" }],
    blocks: [{ id: "block-1", type: "heading", level: 2, text: "Context" }, { id: "block-2", type: "paragraph", text: "Choose focus." }],
  });
  return {
    notes: [note],
    noteTags: [{ id: "strategy", name: "Strategy", color: "violet" }],
    noteAttachments: [{
      id: "attachment-1", noteId: "note-1", displayName: "brief.pdf", mediaType: "application/pdf",
      byteSize: 12, checksum: null, status: "available", storageRef: "local:brief", caption: "Brief",
    }],
  };
}

test("plain text and Markdown exports remain readable without the native schema", () => {
  const note = state().notes[0];
  assert.equal(exportNoteAsPlainText(note), "Decision\n\nContext\nChoose focus.");
  assert.match(exportNoteAsMarkdown(note), /^# Decision\n\n## Context\nChoose focus\.$/);

  let block = 0;
  assert.equal(importPlainTextNote("A plain capture", { id: "plain", createBlockId: () => `block-${++block}` }).blocks[0].text, "A plain capture");
  const markdown = importMarkdownNote("# Imported\n\n- Keep the link", { id: "markdown", createBlockId: () => `block-${++block}` });
  assert.equal(markdown.title, "Imported");
  assert.equal(markdown.blocks[0].type, "bulleted");
});

test("native selected-note export carries metadata but makes missing binary bytes explicit", () => {
  const backup = exportNativeNoteCollection(state(), { noteIds: ["note-1"] });
  assert.equal(backup.format, "calendar-master-notes");
  assert.equal(backup.notes.length, 1);
  assert.equal(backup.noteTags[0].id, "strategy");
  assert.equal(backup.noteAttachments[0].id, "attachment-1");
  assert.deepEqual(backup.warnings, [{ code: "binary-not-included", attachmentIds: ["attachment-1"] }]);
});

test("a non-conflicting native import preserves note identity without collision factories", () => {
  const imported = importNativeNoteCollection({ notes: [], noteTags: [], noteAttachments: [] }, exportNativeNoteCollection(state()));

  assert.equal(imported.state.notes[0].id, "note-1");
  assert.equal(imported.state.notes[0].blocks[0].id, "block-1");
  assert.equal(imported.state.noteAttachments[0].id, "attachment-1");
  assert.equal(imported.state.noteAttachments[0].status, "missing");
});

test("native import rejects malformed input before returning a partial aggregate", () => {
  assert.throws(() => importNativeNoteCollection(state(), { format: "wrong", version: 1 }), /format/);
  assert.throws(() => importNativeNoteCollection(state(), {
    format: "calendar-master-notes", version: 1, notes: [{ id: "bad", blocks: "bad" }], noteTags: [], noteAttachments: [],
  }), /blocks/);
});

test("untrusted text and native bundle limits reject oversized input before import", () => {
  let block = 0;
  assert.throws(() => importPlainTextNote("x".repeat(100_001), {
    id: "too-large", createBlockId: () => `block-${++block}`,
  }), /limit/);
  assert.throws(() => importMarkdownNote("# Title\n\n" + "x".repeat(100_001), {
    id: "too-large-markdown", createBlockId: () => `block-${++block}`,
  }), /limit/);
  assert.throws(() => importNativeNoteCollection({ notes: [], noteTags: [], noteAttachments: [] }, {
    format: "calendar-master-notes", version: 1,
    notes: Array.from({ length: 501 }, (_, index) => ({ id: `note-${index}`, blocks: [] })),
    noteTags: [], noteAttachments: [],
  }), /limit/);
  assert.throws(() => importNativeNoteCollection({ notes: [], noteTags: [], noteAttachments: [] }, {
    format: "calendar-master-notes", version: 1,
    notes: [{ id: "block-limit", blocks: Array.from({ length: 2_001 }, (_, index) => ({ id: `block-${index}`, type: "paragraph", text: "" })) }],
    noteTags: [], noteAttachments: [],
  }), /limit/);
  assert.throws(() => importNativeNoteCollection({ notes: [], noteTags: [], noteAttachments: [] }, {
    format: "calendar-master-notes", version: 1,
    notes: [],
    noteTags: Array.from({ length: 501 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: "violet" })),
    noteAttachments: [],
  }), /limit/);
  assert.throws(() => importNativeNoteCollection({ notes: [], noteTags: [], noteAttachments: [] }, {
    format: "calendar-master-notes", version: 1,
    notes: [], noteTags: [],
    noteAttachments: Array.from({ length: 1_001 }, (_, index) => ({
      id: `attachment-${index}`, noteId: "missing-note", displayName: "brief.txt", mediaType: "text/plain",
      byteSize: 0, checksum: null, status: "missing", storageRef: null, caption: "",
    })),
  }), /limit/);
});

test("duplicate import policies copy, skip, or metadata-merge without overwriting a document", () => {
  const initial = state();
  const backup = exportNativeNoteCollection(initial);
  let noteCount = 0;
  let blockCount = 0;
  let attachmentCount = 0;
  const ids = {
    createNoteId: () => `copied-${++noteCount}`,
    createBlockId: () => `copied-block-${++blockCount}`,
    createAttachmentId: () => `copied-attachment-${++attachmentCount}`,
  };

  const copied = importNativeNoteCollection(initial, backup, { onDuplicate: "copy", ...ids });
  assert.equal(copied.state.notes.length, 2);
  assert.equal(copied.state.notes[1].id, "copied-1");
  assert.notEqual(copied.state.notes[1].blocks[0].id, "block-1");
  assert.equal(copied.state.noteAttachments.at(-1).status, "missing");
  assert.equal(copied.state.noteAttachments.at(-1).storageRef, null);

  const skipped = importNativeNoteCollection(initial, backup, { onDuplicate: "skip", ...ids });
  assert.deepEqual(skipped.state, initial);
  assert.deepEqual(skipped.report.skippedNoteIds, ["note-1"]);

  const mergeBundle = structuredClone(backup);
  mergeBundle.notes[0].links.push({ type: "note", targetId: "another-note" });
  mergeBundle.notes[0].tagIds = ["strategy"];
  mergeBundle.notes[0].blocks[1].text = "Never replace this.";
  const merged = importNativeNoteCollection(initial, mergeBundle, { onDuplicate: "merge", ...ids });
  assert.equal(merged.state.notes[0].blocks[1].text, "Choose focus.");
  assert.equal(merged.state.notes[0].links.some((link) => link.targetId === "another-note"), true);
  assert.equal(merged.state.noteAttachments.at(-1).status, "missing");
});
