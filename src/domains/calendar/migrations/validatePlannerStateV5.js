import { normalizeTiming } from "../model/timing.js";

function collection(state, key) {
  if (!Array.isArray(state[key])) throw new TypeError(`${key} must be an array in planner state v5`);
}

export function validatePlannerStateV5(state) {
  if (!state || typeof state !== "object") throw new TypeError("planner state must be an object");
  if (state.schemaVersion !== 5) throw new TypeError("schemaVersion must be 5");
  for (const key of ["calendars", "events", "eventExceptions", "occurrenceAliases", "tasks", "notes"]) {
    collection(state, key);
  }
  if (!state.overrides || typeof state.overrides !== "object" || Array.isArray(state.overrides)) {
    throw new TypeError("overrides must be an object in planner state v5");
  }
  const calendarIds = new Set(state.calendars.map((calendar) => calendar.id));
  for (const event of state.events) {
    if (typeof event.id !== "string" || !event.id) throw new TypeError("event id is required");
    if (typeof event.title !== "string" || !event.title.trim()) throw new TypeError(`event ${event.id} title is required`);
    if (!calendarIds.has(event.calendarId)) throw new TypeError(`event ${event.id} calendarId is invalid`);
    try {
      normalizeTiming(event.timing);
    } catch (error) {
      throw new TypeError(`event ${event.id} timing is invalid: ${error.message}`);
    }
  }
  return state;
}
