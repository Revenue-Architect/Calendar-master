import { isDateKey } from "../../../shared/time/dateKey.js";
import { NoteValidationError, normalizeBlocks, serializeBlocks } from "./block.js";

export const DEFAULT_NOTEBOOK_ID = "notebook-default";

/* §2. Where a note lives. `daily` belongs to a date, `event` and `task` hang off
   another entity, `standalone` is captured on its own. Every note gets a notebook
   internally even though notebooks are not yet a product feature (§8.4), so
   introducing them later needs no re-identification. */
export const NOTE_KINDS = Object.freeze(["daily", "event", "task", "standalone"]);

export const DOCUMENT_VERSION = 1;

function issue(issues, field, message) {
  issues.push({ field, message });
}

export function normalizeNote(input) {
  if (!input || typeof input !== "object") {
    throw new NoteValidationError([{ field: "note", message: "must be an object" }]);
  }
  const issues = [];

  const id = typeof input.id === "string" ? input.id : "";
  if (!id) issue(issues, "id", "is required");

  const kind = input.kind ?? "standalone";
  if (!NOTE_KINDS.includes(kind)) issue(issues, "kind", `must be one of ${NOTE_KINDS.join(", ")}`);

  const date = input.date ?? null;
  if (date != null && !isDateKey(date)) issue(issues, "date", "must be a YYYY-MM-DD date");
  /* §4.1. A daily note is identified by its day; without one it is not a daily note. */
  if (kind === "daily" && !date) issue(issues, "date", "a daily note requires a date");

  const links = Array.isArray(input.links) ? input.links : [];
  for (const link of links) {
    if (!["event", "task", "note"].includes(link?.type)) {
      issue(issues, "links", "each link needs a type of event, task, or note");
    }
    if (typeof link?.targetId !== "string" || !link.targetId) {
      issue(issues, "links", "each link needs a target");
    }
  }
  /* §2.3/§2.4. A note about an event or a task must say which one. */
  if ((kind === "event" || kind === "task") && !links.some((link) => link.type === kind)) {
    issue(issues, "links", `a ${kind} note must link to its ${kind}`);
  }

  let blocks = [];
  try {
    blocks = normalizeBlocks(input.blocks);
  } catch (error) {
    issues.push(...(error.issues ?? [{ field: "blocks", message: error.message }]));
  }

  if (issues.length) throw new NoteValidationError(issues);

  return {
    id,
    notebookId: input.notebookId || DEFAULT_NOTEBOOK_ID,
    kind,
    date,
    title: typeof input.title === "string" ? input.title.trim() : "",
    /* §3.1. The document's own version travels with the document, separate from the
       planner's schema version, so content can evolve without a state migration. */
    documentVersion: Number.isInteger(input.documentVersion) ? input.documentVersion : DOCUMENT_VERSION,
    blocks,
    links: links.map((link) => ({
      type: link.type,
      targetId: link.targetId,
      ...(link.occurrenceDate ? { occurrenceDate: link.occurrenceDate } : {}),
    })),
    tags: [...new Set((input.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))],
    pinned: input.pinned === true,
    archived: input.archived === true,
    /* §10.2. A monotonic counter plus the last serialization, so a revision bump can
       be detected without diffing and a no-op save does not create a revision. */
    revision: Number.isInteger(input.revision) ? input.revision : 1,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

export function noteChanged(previous, next) {
  return serializeBlocks(previous.blocks) !== serializeBlocks(next.blocks)
    || previous.title !== next.title
    || previous.pinned !== next.pinned
    || previous.archived !== next.archived
    || JSON.stringify(previous.links) !== JSON.stringify(next.links)
    || JSON.stringify(previous.tags) !== JSON.stringify(next.tags);
}

export function isEmptyNote(note) {
  return !note.title && note.blocks.every((block) => !block.text);
}
