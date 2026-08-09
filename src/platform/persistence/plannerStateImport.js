import { migrateV4ToV5 } from "../../domains/calendar/migrations/migrateV4ToV5.js";
import { validatePlannerStateV5 } from "../../domains/calendar/migrations/validatePlannerStateV5.js";
import { migrateV5ToV6 } from "../../domains/tasks/migrations/migrateV5ToV6.js";
import { validatePlannerStateV6 } from "../../domains/tasks/migrations/validatePlannerStateV6.js";
import { migrateV6ToV7 } from "../../domains/notes/migrations/migrateV6ToV7.js";
import { validatePlannerStateV7 } from "../../domains/notes/migrations/validatePlannerStateV7.js";

export function normalizeImportedPlannerState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("planner import must be an object");
  }
  const version = input.schemaVersion ?? 4;
  if (version === 7) return validatePlannerStateV7(input);
  if (version === 6) return migrateV6ToV7(validatePlannerStateV6(input));
  if (version === 5) return migrateV6ToV7(migrateV5ToV6(validatePlannerStateV5(input)));
  if (version === 4) return migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(input)));
  throw new Error(`unsupported planner schema version ${version}`);
}

export function createBlankPlannerState({ themeId, sound, notifs, clock } = {}) {
  return normalizeImportedPlannerState({
    schemaVersion: 4,
    themeId,
    sound,
    notifs,
    clock,
    xp: 0,
    overrides: {},
    events: [],
    tasks: [],
    notes: [],
  });
}
