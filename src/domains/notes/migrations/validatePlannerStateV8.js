import { validateNoteAttachmentOwnership } from "../model/noteAttachment.js";
import { normalizeNote } from "../model/note.js";
import { normalizeNoteTags } from "../model/noteTag.js";
import { validatePlannerStateV7 } from "./validatePlannerStateV7.js";

export function validatePlannerStateV8(state) {
  if (!state || typeof state !== "object") throw new TypeError("planner state must be an object");
  if (state.schemaVersion !== 8) throw new TypeError("schemaVersion must be 8");
  validatePlannerStateV7({ ...state, schemaVersion: 7 });
  if (!Array.isArray(state.noteTags)) throw new TypeError("noteTags must be an array in planner state v8");
  if (!Array.isArray(state.noteAttachments)) throw new TypeError("noteAttachments must be an array in planner state v8");
  const noteTags = normalizeNoteTags(state.noteTags);
  const tagIds = new Set(noteTags.map((tag) => tag.id));
  for (const note of state.notes) {
    if (Object.hasOwn(note, "tags")) throw new TypeError(`note ${note.id} must use tagIds rather than legacy tags`);
    if (!Array.isArray(note.tagIds)) throw new TypeError(`note ${note.id} tagIds must be an array in planner state v8`);
    if (!Array.isArray(note.attachmentIds)) throw new TypeError(`note ${note.id} attachmentIds must be an array in planner state v8`);
    if (!note.processing || typeof note.processing !== "object") throw new TypeError(`note ${note.id} processing is required in planner state v8`);
    const normalized = normalizeNote(note);
    for (const tagId of normalized.tagIds) {
      if (!tagIds.has(tagId)) throw new TypeError(`note ${note.id} references unknown tag ${tagId}`);
    }
  }
  validateNoteAttachmentOwnership(state.notes, state.noteAttachments);
  return state;
}
