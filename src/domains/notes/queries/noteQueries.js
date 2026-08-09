import { assertDateKey } from "../../../shared/time/dateKey.js";
import { blocksToText } from "../model/block.js";

/* §8.1. System views are queries over the same notes, never separate containers. */

const active = (note) => !note.archived;
const byUpdated = (a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));

export function getNote(notes, noteId) {
  return notes.find((note) => note.id === noteId) ?? null;
}

/* §4.1. At most one daily note per day — it is identified by its date, so a second
   one would make "the note for today" ambiguous. */
export function getDailyNote(notes, dateKey) {
  assertDateKey(dateKey);
  return notes.find((note) => note.kind === "daily" && note.date === dateKey) ?? null;
}

export function getNotesForDate(notes, dateKey) {
  assertDateKey(dateKey);
  return notes.filter((note) => active(note) && note.date === dateKey).sort(byUpdated);
}

/* §5.3. Backlinks are derived from the links already stored on each note, so the two
   directions cannot disagree. */
export function getNotesForEntity(notes, type, targetId) {
  return notes
    .filter((note) => active(note) && note.links.some((link) => link.type === type && link.targetId === targetId))
    .sort(byUpdated);
}

export function getBacklinks(notes, noteId) {
  return getNotesForEntity(notes, "note", noteId);
}

/* §6.1. Inbox is a captured note with nowhere to be yet: no day, nothing linked. */
export function getInboxNotes(notes) {
  return notes.filter((note) => active(note) && note.kind === "standalone" && !note.date && note.links.length === 0).sort(byUpdated);
}

export function getPinnedNotes(notes) {
  return notes.filter((note) => active(note) && note.pinned).sort(byUpdated);
}

export function getArchivedNotes(notes) {
  return notes.filter((note) => note.archived).sort(byUpdated);
}

/* §9.1. Title, body text and tags are indexed; archived notes stay out unless asked
   for, so search reflects what is in play rather than everything ever written. */
export function searchNotes(notes, term, { includeArchived = false } = {}) {
  const needle = String(term ?? "").trim().toLowerCase();
  if (!needle) return [];
  return notes.filter((note) => {
    if (!includeArchived && note.archived) return false;
    const haystack = [note.title, blocksToText(note.blocks), ...(note.tags ?? [])].filter(Boolean).join("\n").toLowerCase();
    return haystack.includes(needle);
  }).sort(byUpdated);
}

export function allNoteTags(notes) {
  return [...new Set(notes.flatMap((note) => note.tags ?? []))].sort();
}

export function noteExcerpt(note, length = 90) {
  const text = note.title || blocksToText(note.blocks);
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}
