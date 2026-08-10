import { NoteValidationError } from "../model/block.js";
import { normalizeNoteAttachment, validateNoteAttachmentOwnership } from "../model/noteAttachment.js";
import { deleteNote, updateNote } from "./noteCommands.js";

function requireAttachment(noteAttachments, attachmentId) {
  const attachment = noteAttachments.find((entry) => entry.id === attachmentId);
  if (!attachment) throw new NoteValidationError([{ field: "attachmentId", message: `attachment ${attachmentId} does not exist` }]);
  return attachment;
}

export function attachNoteMetadata(notes, noteAttachments, noteId, input, { now = null } = {}) {
  if (noteAttachments.some((attachment) => attachment.id === input?.id)) {
    throw new NoteValidationError([{ field: "attachment.id", message: `attachment ${input.id} already exists` }]);
  }
  const attachment = normalizeNoteAttachment({ ...input, noteId });
  const updated = updateNote(notes, noteId, {
    attachmentIds: [...(notes.find((note) => note.id === noteId)?.attachmentIds ?? []), attachment.id],
  }, { now });
  const next = [...noteAttachments, attachment];
  validateNoteAttachmentOwnership(updated.notes, next);
  return { notes: updated.notes, noteAttachments: next, attachment };
}

export function detachNoteMetadata(notes, noteAttachments, noteId, attachmentId, { now = null } = {}) {
  const attachment = requireAttachment(noteAttachments, attachmentId);
  if (attachment.noteId !== noteId) {
    throw new NoteValidationError([{ field: "attachmentId", message: "does not belong to this note" }]);
  }
  const current = notes.find((note) => note.id === noteId);
  const updated = updateNote(notes, noteId, {
    attachmentIds: (current?.attachmentIds ?? []).filter((id) => id !== attachmentId),
  }, { now });
  const next = noteAttachments.filter((entry) => entry.id !== attachmentId);
  validateNoteAttachmentOwnership(updated.notes, next);
  return { notes: updated.notes, noteAttachments: next, removed: attachment };
}

export function deleteNoteWithAttachments(notes, noteAttachments, noteId) {
  const deletion = deleteNote(notes, noteId);
  const attachments = noteAttachments.filter((attachment) => attachment.noteId === noteId);
  const next = noteAttachments.filter((attachment) => attachment.noteId !== noteId);
  validateNoteAttachmentOwnership(deletion.notes, next);
  return {
    notes: deletion.notes,
    noteAttachments: next,
    removed: { note: deletion.events[0].removed, attachments },
    events: deletion.events,
  };
}

export function restoreDeletedNoteWithAttachments(notes, noteAttachments, removed) {
  if (!removed?.note || !Array.isArray(removed.attachments)) {
    throw new NoteValidationError([{ field: "removed", message: "must include a note and attachments" }]);
  }
  if (notes.some((note) => note.id === removed.note.id)) {
    throw new NoteValidationError([{ field: "note", message: `note ${removed.note.id} already exists` }]);
  }
  for (const attachment of removed.attachments) {
    if (noteAttachments.some((entry) => entry.id === attachment.id)) {
      throw new NoteValidationError([{ field: "attachment", message: `attachment ${attachment.id} already exists` }]);
    }
  }
  const nextNotes = [...notes, removed.note];
  const nextAttachments = [...noteAttachments, ...removed.attachments];
  validateNoteAttachmentOwnership(nextNotes, nextAttachments);
  return { notes: nextNotes, noteAttachments: nextAttachments };
}
