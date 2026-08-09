import { migrateV4ToV5 } from "../../domains/calendar/migrations/migrateV4ToV5.js";
import { validatePlannerStateV5 } from "../../domains/calendar/migrations/validatePlannerStateV5.js";

export const V4_KEY = "nbmp:state:v4";
export const V5_KEY = "nbmp:state:v5";

function valueOf(result) {
  if (result == null) return null;
  return typeof result === "object" && Object.hasOwn(result, "value") ? result.value : result;
}

function parseStored(result, key) {
  const value = valueOf(result);
  if (value == null || value === "") return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error(`${key} contains invalid JSON`, { cause: error });
  }
}

export async function savePlannerState(storagePort, state) {
  validatePlannerStateV5(state);
  await storagePort.set(V5_KEY, JSON.stringify(state));
}

export async function loadPlannerState(storagePort) {
  const v5 = parseStored(await storagePort.get(V5_KEY), V5_KEY);
  if (v5) return { state: validatePlannerStateV5(v5), migrated: false };

  const v4 = parseStored(await storagePort.get(V4_KEY), V4_KEY);
  if (!v4) return { state: null, migrated: false };
  const state = migrateV4ToV5(v4);
  try {
    await savePlannerState(storagePort, state);
    const confirmed = parseStored(await storagePort.get(V5_KEY), V5_KEY);
    validatePlannerStateV5(confirmed);
  } catch (error) {
    throw new Error("could not persist migrated v5 planner state; v4 was preserved", { cause: error });
  }
  await storagePort.remove(V4_KEY);
  return { state, migrated: true };
}
