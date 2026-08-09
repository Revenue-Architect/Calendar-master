import { serializeBlocks } from "../model/block.js";

/* §10.2. A revision is an immutable snapshot taken at a checkpoint, not per
   keystroke. Autosave already refuses to bump a revision when nothing changed, so a
   checkpoint here means the document genuinely moved. */

export const MAX_REVISIONS = 30;

function checksum(text) {
  /* Small, stable and content-derived — enough to tell two revisions apart and to
     spot a snapshot that no longer matches what it claims to hold. */
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export function makeRevision(note, { at = null, source = "editor" } = {}) {
  const serialized = serializeBlocks(note.blocks);
  return {
    id: `rev-${note.id}-${note.revision}`,
    noteId: note.id,
    revision: note.revision,
    at,
    source,
    documentVersion: note.documentVersion,
    title: note.title,
    blocks: JSON.parse(serialized),
    checksum: checksum(serialized),
  };
}

export function recordRevision(revisions, note, options = {}) {
  const entry = makeRevision(note, options);
  const existing = revisions ?? [];
  /* Never store the same head twice — reopening an editor and saving unchanged text
     would otherwise fill the history with duplicates. */
  const head = existing.filter((r) => r.noteId === note.id).at(-1);
  if (head && head.checksum === entry.checksum && head.title === entry.title) return existing;
  const next = [...existing, entry];
  const mine = next.filter((r) => r.noteId === note.id);
  if (mine.length <= MAX_REVISIONS) return next;
  const drop = new Set(mine.slice(0, mine.length - MAX_REVISIONS).map((r) => r.id));
  return next.filter((r) => !drop.has(r.id));
}

export function revisionsFor(revisions, noteId) {
  return (revisions ?? []).filter((r) => r.noteId === noteId).sort((a, b) => b.revision - a.revision);
}

export function revisionIsIntact(revision) {
  return checksum(serializeBlocks(revision.blocks)) === revision.checksum;
}

export function dropRevisionsFor(revisions, noteIds) {
  const gone = noteIds instanceof Set ? noteIds : new Set(noteIds ?? []);
  return (revisions ?? []).filter((r) => !gone.has(r.noteId));
}

/* §10.2. Restoring moves the document back to a previous body and becomes a new head
   revision. Earlier history is never erased — the restore is itself an edit. */
export function restoredNote(note, revision) {
  return { ...note, title: revision.title, blocks: revision.blocks };
}
