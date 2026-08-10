import { NoteValidationError } from "./block.js";

export const NOTE_ATTACHMENT_STATUSES = Object.freeze([
  "pending", "available", "failed", "quarantined", "missing", "deleted",
]);

const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function sanitizeAttachmentName(value) {
  if (typeof value !== "string") throw new NoteValidationError([{ field: "attachment.displayName", message: "is required" }]);
  const name = value.normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "—")
    .trim();
  if (!name || name.length > 255) {
    throw new NoteValidationError([{ field: "attachment.displayName", message: "must be between 1 and 255 characters" }]);
  }
  return name;
}

export function normalizeNoteAttachment(input) {
  if (!input || typeof input !== "object") {
    throw new NoteValidationError([{ field: "attachment", message: "must be an object" }]);
  }
  if (typeof input.id !== "string" || !input.id) {
    throw new NoteValidationError([{ field: "attachment.id", message: "is required" }]);
  }
  if (typeof input.noteId !== "string" || !input.noteId) {
    throw new NoteValidationError([{ field: "attachment.noteId", message: "is required" }]);
  }
  const mediaType = typeof input.mediaType === "string" ? input.mediaType.trim().toLowerCase() : "";
  if (!MEDIA_TYPE.test(mediaType)) {
    throw new NoteValidationError([{ field: "attachment.mediaType", message: "must be a media type" }]);
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize < 0 || input.byteSize > MAX_ATTACHMENT_BYTES) {
    throw new NoteValidationError([{ field: "attachment.byteSize", message: `must be an integer between 0 and ${MAX_ATTACHMENT_BYTES}` }]);
  }
  const status = input.status;
  if (!NOTE_ATTACHMENT_STATUSES.includes(status)) {
    throw new NoteValidationError([{ field: "attachment.status", message: `must be one of ${NOTE_ATTACHMENT_STATUSES.join(", ")}` }]);
  }
  const storageRef = input.storageRef == null ? null : String(input.storageRef).trim();
  if (status === "available" && !storageRef) {
    throw new NoteValidationError([{ field: "attachment.storageRef", message: "is required for an available attachment" }]);
  }
  const checksum = input.checksum == null ? null : String(input.checksum).trim();
  if (checksum && checksum.length > 160) {
    throw new NoteValidationError([{ field: "attachment.checksum", message: "is too long" }]);
  }
  const caption = input.caption == null ? "" : String(input.caption).trim();
  if (caption.length > 1_000) {
    throw new NoteValidationError([{ field: "attachment.caption", message: "is too long" }]);
  }
  return {
    id: input.id,
    noteId: input.noteId,
    displayName: sanitizeAttachmentName(input.displayName),
    mediaType,
    byteSize: input.byteSize,
    checksum,
    status,
    storageRef: storageRef || null,
    caption,
  };
}

export function normalizeNoteAttachments(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new NoteValidationError([{ field: "noteAttachments", message: "must be an array" }]);
  const ids = new Set();
  return input.map((attachment) => {
    const normalized = normalizeNoteAttachment(attachment);
    if (ids.has(normalized.id)) {
      throw new NoteValidationError([{ field: "noteAttachments", message: `duplicate attachment ${normalized.id}` }]);
    }
    ids.add(normalized.id);
    return normalized;
  });
}

export function validateNoteAttachmentOwnership(notes, noteAttachments) {
  const attachments = normalizeNoteAttachments(noteAttachments);
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const noteIds = new Set(notes.map((note) => note.id));
  for (const attachment of attachments) {
    if (!noteIds.has(attachment.noteId)) {
      throw new NoteValidationError([{ field: "noteAttachments", message: `attachment ${attachment.id} has an unknown note` }]);
    }
  }
  for (const note of notes) {
    const seen = new Set();
    for (const attachmentId of note.attachmentIds ?? []) {
      if (seen.has(attachmentId)) {
        throw new NoteValidationError([{ field: "attachmentIds", message: `note ${note.id} repeats ${attachmentId}` }]);
      }
      seen.add(attachmentId);
      const attachment = byId.get(attachmentId);
      if (!attachment || attachment.noteId !== note.id) {
        throw new NoteValidationError([{ field: "attachmentIds", message: `note ${note.id} has an invalid attachment ${attachmentId}` }]);
      }
    }
  }
  for (const attachment of attachments) {
    const owner = notes.find((note) => note.id === attachment.noteId);
    if (!(owner?.attachmentIds ?? []).includes(attachment.id)) {
      throw new NoteValidationError([{ field: "noteAttachments", message: `attachment ${attachment.id} must be referenced by its note` }]);
    }
  }
  return attachments;
}
