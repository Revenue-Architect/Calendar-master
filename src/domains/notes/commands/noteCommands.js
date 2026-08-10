import { NoteValidationError, normalizeBlock, normalizeBlocks } from "../model/block.js";
import { normalizeNote, noteChanged } from "../model/note.js";

/* Pure like the other domains: the caller supplies ids and timestamps, and each
   command returns the new collection plus the events it produced. */

const NOTE_EVENTS = new Set([
  "NoteCreated", "NoteChanged", "NoteArchived", "NoteDeleted", "NoteLinked", "NoteUnlinked", "TaskExtracted",
]);

function noteEvent(type, noteId, payload = {}) {
  if (!NOTE_EVENTS.has(type)) throw new TypeError(`unknown note event ${type}`);
  return { type, noteId, ...payload };
}

function requireNote(notes, noteId) {
  const note = notes.find((entry) => entry.id === noteId);
  if (!note) throw new NoteValidationError([{ field: "noteId", message: `note ${noteId} does not exist` }]);
  return note;
}

function replace(notes, updated) {
  return notes.map((note) => (note.id === updated.id ? updated : note));
}

export function createNote(notes, input, { now = null } = {}) {
  const note = normalizeNote({ createdAt: now, updatedAt: now, ...input });
  if (notes.some((existing) => existing.id === note.id)) {
    throw new NoteValidationError([{ field: "id", message: `note ${note.id} already exists` }]);
  }
  return { notes: [...notes, note], events: [noteEvent("NoteCreated", note.id)] };
}

/* §10.1/§10.2. A save that changes nothing does not bump the revision, so autosave
   cannot inflate history just by the editor losing focus. */
export function updateNote(notes, noteId, patch, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  const next = normalizeNote({ ...current, ...patch, id: current.id });
  if (!noteChanged(current, next)) return { notes, events: [] };
  const saved = { ...next, revision: current.revision + 1, updatedAt: now };
  return { notes: replace(notes, saved), events: [noteEvent("NoteChanged", noteId, { revision: saved.revision })] };
}

export function appendBlock(notes, noteId, block, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  const added = normalizeBlock({ order: current.blocks.length, ...block });
  return updateNote(notes, noteId, { blocks: [...current.blocks, added] }, { now });
}

export function updateBlock(notes, noteId, blockId, patch, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  if (!current.blocks.some((block) => block.id === blockId)) {
    throw new NoteValidationError([{ field: "blockId", message: `block ${blockId} does not exist` }]);
  }
  const blocks = current.blocks.map((block) => (block.id === blockId ? { ...block, ...patch, id: block.id } : block));
  return updateNote(notes, noteId, { blocks }, { now });
}

export function removeBlock(notes, noteId, blockId, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  return updateNote(notes, noteId, { blocks: current.blocks.filter((block) => block.id !== blockId) }, { now });
}

export function moveBlock(notes, noteId, blockId, toIndex, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  const list = [...current.blocks];
  const from = list.findIndex((block) => block.id === blockId);
  if (from === -1) throw new NoteValidationError([{ field: "blockId", message: `block ${blockId} does not exist` }]);
  const [moved] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, moved);
  /* §3.3. Reordering rewrites order, never identity. */
  return updateNote(notes, noteId, { blocks: normalizeBlocks(list.map((block, i) => ({ ...block, order: i }))) }, { now });
}

export function toggleChecklistBlock(notes, noteId, blockId, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  const block = current.blocks.find((entry) => entry.id === blockId);
  if (!block || block.type !== "checklist") {
    throw new NoteValidationError([{ field: "blockId", message: "not a checklist block" }]);
  }
  return updateBlock(notes, noteId, blockId, { done: !block.done, completedAt: block.done ? null : now }, { now });
}

/* §5.2. Links are set-like: linking twice is the same as linking once. */
export function linkNote(notes, noteId, link, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  const exists = current.links.some((entry) => (
    entry.type === link.type
    && entry.targetId === link.targetId
    && (entry.occurrenceDate ?? null) === (link.occurrenceDate ?? null)
  ));
  if (exists) return { notes, events: [] };
  const result = updateNote(notes, noteId, {
    links: [...current.links, link],
    processing: current.processing?.state === "inbox" ? { state: "processed", snoozedUntil: null } : current.processing,
  }, { now });
  return { ...result, events: [...result.events, noteEvent("NoteLinked", noteId, { link })] };
}

export function unlinkNote(notes, noteId, link, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  const links = current.links.filter((entry) => !(
    entry.type === link.type
    && entry.targetId === link.targetId
    && (entry.occurrenceDate ?? null) === (link.occurrenceDate ?? null)
  ));
  if (links.length === current.links.length) return { notes, events: [] };
  const result = updateNote(notes, noteId, { links }, { now });
  return { ...result, events: [...result.events, noteEvent("NoteUnlinked", noteId, { link })] };
}

export function pinNote(notes, noteId, pinned, { now = null } = {}) {
  return updateNote(notes, noteId, { pinned }, { now });
}

/* §1.5. Archiving removes clutter without erasing history; deletion is separate. */
export function archiveNote(notes, noteId, archived, { now = null } = {}) {
  const result = updateNote(notes, noteId, { archived }, { now });
  return { ...result, events: [...result.events, noteEvent("NoteArchived", noteId, { archived })] };
}

export function deleteNote(notes, noteId) {
  const removed = requireNote(notes, noteId);
  return {
    notes: notes.filter((note) => note.id !== noteId),
    events: [noteEvent("NoteDeleted", noteId, { removed })],
  };
}

/* §7.1/§7.2. A checklist line becomes a real task once, and the block records which
   task it produced so the same line cannot quietly spawn a second one. The task
   itself is created by the Tasks domain — Notes only records the reference. */
export function markBlockExtracted(notes, noteId, blockId, taskId, { now = null } = {}) {
  const current = requireNote(notes, noteId);
  const block = current.blocks.find((entry) => entry.id === blockId);
  if (!block) throw new NoteValidationError([{ field: "blockId", message: `block ${blockId} does not exist` }]);
  if (block.extractedTaskId) {
    throw new NoteValidationError([{ field: "blockId", message: "this line already became a task" }]);
  }
  const result = updateBlock(notes, noteId, blockId, { extractedTaskId: taskId }, { now });
  return { ...result, events: [...result.events, noteEvent("TaskExtracted", noteId, { blockId, taskId })] };
}
