import { validatePlannerStateV6 } from "../../tasks/migrations/validatePlannerStateV6.js";
import { normalizeNote } from "../model/note.js";

export function validatePlannerStateV7(state) {
  if (!state || typeof state !== "object") throw new TypeError("planner state must be an object");
  if (state.schemaVersion !== 7) throw new TypeError("schemaVersion must be 7");

  /* Calendar and Tasks invariants are untouched by this migration, so they are
     checked with the v6 validator against a v6-shaped view rather than restated. */
  validatePlannerStateV6({ ...state, schemaVersion: 6 });

  if (!Array.isArray(state.notebooks)) throw new TypeError("notebooks must be an array in planner state v7");
  const notebookIds = new Set(state.notebooks.map((book) => book.id));
  const ids = new Set();
  const dailyByDate = new Set();
  for (const note of state.notes) {
    const normalized = normalizeNote(note);
    if (ids.has(normalized.id)) throw new TypeError(`note ${normalized.id} is duplicated`);
    ids.add(normalized.id);
    if (!notebookIds.has(normalized.notebookId)) {
      throw new TypeError(`note ${normalized.id} notebookId is invalid`);
    }
    /* §4.1. One daily note per day, or "the note for today" stops being answerable. */
    if (normalized.kind === "daily") {
      if (dailyByDate.has(normalized.date)) {
        throw new TypeError(`more than one daily note for ${normalized.date}`);
      }
      dailyByDate.add(normalized.date);
    }
  }
  return state;
}
