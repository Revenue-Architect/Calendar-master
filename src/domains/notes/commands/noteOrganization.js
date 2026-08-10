import { NoteValidationError } from "../model/block.js";
import { normalizeNoteTag, normalizeNoteTags, tagNameKey } from "../model/noteTag.js";
import { updateNote } from "./noteCommands.js";

function requireTag(noteTags, tagId) {
  const tag = noteTags.find((entry) => entry.id === tagId);
  if (!tag) throw new NoteValidationError([{ field: "tagId", message: `tag ${tagId} does not exist` }]);
  return tag;
}

function checkedTagIds(tagIds, noteTags) {
  if (!Array.isArray(tagIds)) throw new NoteValidationError([{ field: "tagIds", message: "must be an array" }]);
  const ids = [...new Set(tagIds)];
  for (const tagId of ids) {
    if (typeof tagId !== "string" || !tagId) {
      throw new NoteValidationError([{ field: "tagIds", message: "contains an invalid tag ID" }]);
    }
    requireTag(noteTags, tagId);
  }
  return ids;
}

function replaceTagId(tagIds, sourceId, destinationId) {
  return [...new Set(tagIds.map((tagId) => (tagId === sourceId ? destinationId : tagId)))];
}

export function setNoteProcessing(notes, noteId, processing, { now = null } = {}) {
  return updateNote(notes, noteId, { processing }, { now });
}

export function setNoteTagIds(notes, noteId, tagIds, { noteTags, now = null } = {}) {
  const ids = checkedTagIds(tagIds, noteTags);
  return updateNote(notes, noteId, { tagIds: ids, tags: [] }, { now });
}

export function createNoteTag(noteTags, input) {
  const tags = normalizeNoteTags(noteTags);
  const tag = normalizeNoteTag(input);
  if (tags.some((entry) => entry.id === tag.id)) {
    throw new NoteValidationError([{ field: "tag.id", message: `tag ${tag.id} already exists` }]);
  }
  if (tags.some((entry) => tagNameKey(entry.name) === tagNameKey(tag.name))) {
    throw new NoteValidationError([{ field: "tag.name", message: `tag ${tag.name} already exists` }]);
  }
  return { noteTags: normalizeNoteTags([...tags, tag]) };
}

export function renameNoteTag(noteTags, tagId, patch) {
  const tags = normalizeNoteTags(noteTags);
  const current = requireTag(tags, tagId);
  const next = normalizeNoteTag({ ...current, ...patch, id: current.id });
  if (tags.some((entry) => entry.id !== current.id && tagNameKey(entry.name) === tagNameKey(next.name))) {
    throw new NoteValidationError([{ field: "tag.name", message: `tag ${next.name} already exists` }]);
  }
  return { noteTags: normalizeNoteTags(tags.map((entry) => (entry.id === current.id ? next : entry))) };
}

export function mergeNoteTags(notes, noteTags, sourceId, destinationId, { now = null } = {}) {
  if (sourceId === destinationId) {
    throw new NoteValidationError([{ field: "destinationId", message: "must differ from sourceId" }]);
  }
  const tags = normalizeNoteTags(noteTags);
  requireTag(tags, sourceId);
  requireTag(tags, destinationId);
  const nextNotes = notes.map((note) => (note.tagIds?.includes(sourceId)
    ? updateNote(notes, note.id, { tagIds: replaceTagId(note.tagIds, sourceId, destinationId) }, { now }).notes.find((entry) => entry.id === note.id)
    : note));
  return { notes: nextNotes, noteTags: tags.filter((tag) => tag.id !== sourceId) };
}

export function deleteNoteTag(notes, noteTags, tagId, { now = null } = {}) {
  const tags = normalizeNoteTags(noteTags);
  requireTag(tags, tagId);
  const nextNotes = notes.map((note) => (note.tagIds?.includes(tagId)
    ? updateNote(notes, note.id, { tagIds: note.tagIds.filter((id) => id !== tagId) }, { now }).notes.find((entry) => entry.id === note.id)
    : note));
  return { notes: nextNotes, noteTags: tags.filter((tag) => tag.id !== tagId) };
}
