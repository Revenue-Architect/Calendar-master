import { NoteValidationError } from "./block.js";

const COLOR = /^[a-z0-9#-]{1,32}$/i;

export function normalizedTagName(value) {
  if (typeof value !== "string") throw new NoteValidationError([{ field: "tag.name", message: "is required" }]);
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) {
    throw new NoteValidationError([{ field: "tag.name", message: "must be between 1 and 80 characters" }]);
  }
  return name;
}

export function tagNameKey(value) {
  return normalizedTagName(value).toLocaleLowerCase("en");
}

export function normalizeNoteTag(input) {
  if (!input || typeof input !== "object") {
    throw new NoteValidationError([{ field: "tag", message: "must be an object" }]);
  }
  if (typeof input.id !== "string" || !input.id) {
    throw new NoteValidationError([{ field: "tag.id", message: "is required" }]);
  }
  const name = normalizedTagName(input.name);
  const color = input.color == null ? null : String(input.color).trim().toLowerCase();
  if (color && !COLOR.test(color)) {
    throw new NoteValidationError([{ field: "tag.color", message: "must be a short color token" }]);
  }
  return { id: input.id, name, color };
}

export function normalizeNoteTags(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new NoteValidationError([{ field: "noteTags", message: "must be an array" }]);
  const ids = new Set();
  const names = new Set();
  return input.map((tag) => {
    const normalized = normalizeNoteTag(tag);
    if (ids.has(normalized.id)) throw new NoteValidationError([{ field: "noteTags", message: `duplicate tag ${normalized.id}` }]);
    if (names.has(tagNameKey(normalized.name))) {
      throw new NoteValidationError([{ field: "noteTags", message: `duplicate tag name ${normalized.name}` }]);
    }
    ids.add(normalized.id);
    names.add(tagNameKey(normalized.name));
    return normalized;
  }).sort((left, right) => left.name.localeCompare(right.name));
}
