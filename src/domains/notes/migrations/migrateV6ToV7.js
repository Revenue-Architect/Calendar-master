import { normalizeNote, DEFAULT_NOTEBOOK_ID } from "../model/note.js";
import { validatePlannerStateV7 } from "./validatePlannerStateV7.js";

let counter = 0;
const nextId = (prefix) => `${prefix}-${(counter += 1).toString(36)}`;

/* A v6 note was a single string tied to a date. Each becomes a daily note whose text
   is split into paragraph blocks on blank lines, because a paragraph break is the
   one structural signal the old format actually carried. Nothing else is inferred:
   guessing headings or lists out of prose would invent structure the user never
   wrote. */
function migrateNote(note) {
  const text = typeof note.text === "string" ? note.text : "";
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return normalizeNote({
    id: note.id,
    notebookId: DEFAULT_NOTEBOOK_ID,
    kind: note.date ? "daily" : "standalone",
    date: note.date ?? null,
    title: "",
    blocks: (paragraphs.length ? paragraphs : [""]).map((part, index) => ({
      id: nextId("blk"),
      type: "paragraph",
      text: part,
      order: index,
    })),
    links: [],
    tags: [],
    revision: 1,
    createdAt: note.createdAt ?? null,
    updatedAt: note.updatedAt ?? null,
  });
}

export function migrateV6ToV7(state) {
  if (!state || typeof state !== "object") throw new TypeError("planner state must be an object");
  const notes = Array.isArray(state.notes) ? state.notes : [];
  return validatePlannerStateV7({
    ...state,
    schemaVersion: 7,
    notebooks: Array.isArray(state.notebooks) && state.notebooks.length
      ? state.notebooks
      : [{ id: DEFAULT_NOTEBOOK_ID, name: "Notes", isDefault: true }],
    /* Already-migrated notes carry blocks; a v6 note carries text. */
    notes: notes.map((note) => (Array.isArray(note.blocks) ? normalizeNote(note) : migrateNote(note))),
  });
}
