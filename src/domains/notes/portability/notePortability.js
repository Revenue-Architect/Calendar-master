import { NoteValidationError } from "../model/block.js";
import { normalizeNote } from "../model/note.js";
import { normalizeNoteAttachments, validateNoteAttachmentOwnership } from "../model/noteAttachment.js";
import { normalizeNoteTags } from "../model/noteTag.js";
import { blocksToText } from "../model/block.js";
import { blocksToShorthand, textToBlocks } from "../documents/shorthand.js";
import { updateNote } from "../commands/noteCommands.js";

export const NOTE_EXPORT_FORMAT = "calendar-master-notes";
export const NOTE_EXPORT_VERSION = 1;

const clone = (value) => JSON.parse(JSON.stringify(value));

function requireFactory(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} is required`);
  return value;
}

function requireBundle(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new NoteValidationError([{ field: "import", message: "must be an object" }]);
  }
  if (input.format !== NOTE_EXPORT_FORMAT) {
    throw new NoteValidationError([{ field: "format", message: `must be ${NOTE_EXPORT_FORMAT}` }]);
  }
  if (input.version !== NOTE_EXPORT_VERSION) {
    throw new NoteValidationError([{ field: "version", message: `must be ${NOTE_EXPORT_VERSION}` }]);
  }
  if (!Array.isArray(input.notes) || !Array.isArray(input.noteTags) || !Array.isArray(input.noteAttachments)) {
    throw new NoteValidationError([{ field: "import", message: "must include notes, noteTags, and noteAttachments arrays" }]);
  }
  const notes = input.notes.map((note) => normalizeNote(note));
  const noteTags = normalizeNoteTags(input.noteTags);
  const noteAttachments = normalizeNoteAttachments(input.noteAttachments);
  validateNoteAttachmentOwnership(notes, noteAttachments);
  const tagIds = new Set(noteTags.map((tag) => tag.id));
  for (const note of notes) {
    for (const tagId of note.tagIds) {
      if (!tagIds.has(tagId)) {
        throw new NoteValidationError([{ field: "tagIds", message: `note ${note.id} references unknown tag ${tagId}` }]);
      }
    }
  }
  return { notes, noteTags, noteAttachments };
}

function normalizeState(state) {
  const notes = (state?.notes ?? []).map((note) => normalizeNote(note));
  const noteTags = normalizeNoteTags(state?.noteTags ?? []);
  const noteAttachments = normalizeNoteAttachments(state?.noteAttachments ?? []);
  validateNoteAttachmentOwnership(notes, noteAttachments);
  return { ...state, notes, noteTags, noteAttachments };
}

function sameTag(left, right) {
  return left.name === right.name && left.color === right.color;
}

function addImportedTags(noteTags, imports, tagIds) {
  const existing = new Map(noteTags.map((tag) => [tag.id, tag]));
  const add = [];
  for (const tag of imports.filter((entry) => tagIds.has(entry.id))) {
    const current = existing.get(tag.id);
    if (current && !sameTag(current, tag)) {
      throw new NoteValidationError([{ field: "noteTags", message: `tag ${tag.id} conflicts with an existing tag` }]);
    }
    if (!current) { existing.set(tag.id, tag); add.push(tag); }
  }
  return [...noteTags, ...add];
}

function unionLinks(current, incoming) {
  const keys = new Set(current.map((link) => JSON.stringify(link)));
  return [...current, ...incoming.filter((link) => {
    const key = JSON.stringify(link);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  })];
}

function copiedAttachments(attachments, noteId, createAttachmentId) {
  return attachments.map((attachment) => ({
    ...attachment,
    id: createAttachmentId(),
    noteId,
    status: "missing",
    storageRef: null,
  }));
}

function copiedNote(note, attachments, { createNoteId, createBlockId, createAttachmentId }) {
  const id = createNoteId();
  const nextAttachments = copiedAttachments(attachments, id, createAttachmentId);
  return {
    note: normalizeNote({
      ...note,
      id,
      blocks: note.blocks.map((block, order) => ({ ...block, id: createBlockId(), order })),
      attachmentIds: nextAttachments.map((attachment) => attachment.id),
    }),
    attachments: nextAttachments,
  };
}

export function exportNoteAsPlainText(note) {
  const normalized = normalizeNote(note);
  const body = blocksToText(normalized.blocks);
  return normalized.title ? `${normalized.title}${body ? `\n\n${body}` : ""}` : body;
}

export function exportNoteAsMarkdown(note) {
  const normalized = normalizeNote(note);
  const body = blocksToShorthand(normalized.blocks);
  return normalized.title ? `# ${normalized.title}${body ? `\n\n${body}` : ""}` : body;
}

export function exportNativeNoteCollection(state, { noteIds = null } = {}) {
  const normalized = normalizeState(state);
  if (noteIds != null && !Array.isArray(noteIds)) {
    throw new TypeError("noteIds must be an array or null");
  }
  const requested = noteIds == null ? null : new Set(noteIds);
  if (requested && requested.size !== noteIds.length) throw new NoteValidationError([{ field: "noteIds", message: "must not contain duplicates" }]);
  const notes = normalized.notes.filter((note) => requested == null || requested.has(note.id));
  if (requested && notes.length !== requested.size) {
    throw new NoteValidationError([{ field: "noteIds", message: "contains an unknown note" }]);
  }
  const tagIds = new Set(notes.flatMap((note) => note.tagIds));
  const noteAttachments = normalized.noteAttachments.filter((attachment) => notes.some((note) => note.id === attachment.noteId));
  return clone({
    format: NOTE_EXPORT_FORMAT,
    version: NOTE_EXPORT_VERSION,
    notes,
    noteTags: normalized.noteTags.filter((tag) => tagIds.has(tag.id)),
    noteAttachments,
    warnings: noteAttachments.length ? [{ code: "binary-not-included", attachmentIds: noteAttachments.map((attachment) => attachment.id) }] : [],
  });
}

export function importPlainTextNote(text, { id, title = "", createBlockId } = {}) {
  return normalizeNote({
    id,
    kind: "standalone",
    title,
    blocks: textToBlocks(String(text ?? ""), [], requireFactory(createBlockId, "createBlockId")),
  });
}

export function importMarkdownNote(markdown, { id, title = null, createBlockId } = {}) {
  const source = String(markdown ?? "").replace(/\r\n?/g, "\n");
  const match = /^#\s+([^\n]+)(?:\n|$)/.exec(source);
  return importPlainTextNote(match ? source.slice(match[0].length).replace(/^\n/, "") : source, {
    id,
    title: title ?? match?.[1].trim() ?? "",
    createBlockId,
  });
}

export function importNativeNoteCollection(state, input, {
  onDuplicate = "copy",
  createNoteId,
  createBlockId,
  createAttachmentId,
} = {}) {
  if (!["copy", "skip", "merge"].includes(onDuplicate)) {
    throw new TypeError("onDuplicate must be copy, skip, or merge");
  }
  const base = normalizeState(state);
  const imported = requireBundle(input);
  const copyFactories = () => ({
    createNoteId: requireFactory(createNoteId, "createNoteId"),
    createBlockId: requireFactory(createBlockId, "createBlockId"),
    createAttachmentId: requireFactory(createAttachmentId, "createAttachmentId"),
  });
  let notes = [...base.notes];
  let noteTags = [...base.noteTags];
  let noteAttachments = [...base.noteAttachments];
  const report = { copiedNoteIds: [], skippedNoteIds: [], mergedNoteIds: [] };
  const importedAttachmentsByNote = new Map();
  for (const attachment of imported.noteAttachments) {
    const list = importedAttachmentsByNote.get(attachment.noteId) ?? [];
    list.push(attachment);
    importedAttachmentsByNote.set(attachment.noteId, list);
  }

  for (const importedNote of imported.notes) {
    const current = notes.find((note) => note.id === importedNote.id) ?? null;
    const attachmentSource = importedAttachmentsByNote.get(importedNote.id) ?? [];
    if (!current) {
      /* A non-conflicting native ID remains stable; only block and attachment IDs
         need no rewrite in that case. Imported bytes are still unavailable here. */
      const stableAttachments = attachmentSource.map((attachment) => ({ ...attachment, status: "missing", storageRef: null }));
      const stable = normalizeNote({ ...importedNote, attachmentIds: stableAttachments.map((attachment) => attachment.id) });
      const tagIds = new Set(stable.tagIds);
      noteTags = addImportedTags(noteTags, imported.noteTags, tagIds);
      notes.push(stable);
      noteAttachments.push(...stableAttachments);
      report.copiedNoteIds.push(stable.id);
      continue;
    }
    if (onDuplicate === "skip") {
      report.skippedNoteIds.push(importedNote.id);
      continue;
    }
    const tagIds = new Set(importedNote.tagIds);
    noteTags = addImportedTags(noteTags, imported.noteTags, tagIds);
    if (onDuplicate === "copy") {
      const copied = copiedNote(importedNote, attachmentSource, copyFactories());
      if (notes.some((note) => note.id === copied.note.id)) {
        throw new NoteValidationError([{ field: "id", message: `copied note ${copied.note.id} already exists` }]);
      }
      notes.push(copied.note);
      noteAttachments.push(...copied.attachments);
      report.copiedNoteIds.push(copied.note.id);
      continue;
    }
    const copied = copiedAttachments(attachmentSource, current.id, requireFactory(createAttachmentId, "createAttachmentId"));
    const merged = updateNote(notes, current.id, {
      links: unionLinks(current.links, importedNote.links),
      tagIds: [...new Set([...current.tagIds, ...importedNote.tagIds])],
      attachmentIds: [...new Set([...current.attachmentIds, ...copied.map((attachment) => attachment.id)])],
    }).notes;
    notes = merged;
    noteAttachments.push(...copied);
    report.mergedNoteIds.push(current.id);
  }
  validateNoteAttachmentOwnership(notes, noteAttachments);
  return { state: { ...base, notes, noteTags, noteAttachments }, report };
}
