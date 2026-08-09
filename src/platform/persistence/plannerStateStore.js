import { migrateV4ToV5 } from "../../domains/calendar/migrations/migrateV4ToV5.js";
import { validatePlannerStateV5 } from "../../domains/calendar/migrations/validatePlannerStateV5.js";
import { migrateV5ToV6 } from "../../domains/tasks/migrations/migrateV5ToV6.js";
import { validatePlannerStateV6 } from "../../domains/tasks/migrations/validatePlannerStateV6.js";

export const V4_KEY = "nbmp:state:v4";
export const V5_KEY = "nbmp:state:v5";
export const V6_KEY = "nbmp:state:v6";

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
  validatePlannerStateV6(state);
  await storagePort.set(V6_KEY, JSON.stringify(state));
}

/* Same policy as the v4 cutover: migrate in memory, write, read back, validate the
   confirmation, and only then drop the older key. A failed write or a failed
   confirmation leaves the previous version untouched, so a broken upgrade costs
   nothing. There is no dual-write period. */
async function cutOver(storagePort, state, previousKey, previousLabel) {
  try {
    await savePlannerState(storagePort, state);
    validatePlannerStateV6(parseStored(await storagePort.get(V6_KEY), V6_KEY));
  } catch (error) {
    throw new Error(`could not persist migrated v6 planner state; ${previousLabel} was preserved`, { cause: error });
  }
  if (previousKey) await storagePort.remove(previousKey);
  return { state, migrated: true };
}

export async function loadPlannerState(storagePort) {
  const v6 = parseStored(await storagePort.get(V6_KEY), V6_KEY);
  if (v6) return { state: validatePlannerStateV6(v6), migrated: false };

  const v5 = parseStored(await storagePort.get(V5_KEY), V5_KEY);
  if (v5) {
    return cutOver(storagePort, migrateV5ToV6(validatePlannerStateV5(v5)), V5_KEY, "v5");
  }

  const v4 = parseStored(await storagePort.get(V4_KEY), V4_KEY);
  if (!v4) return { state: null, migrated: false };
  /* A v4 notebook upgrades straight to v6 in one confirmed write rather than
     landing on v5 first, so an interrupted upgrade never strands a half-migrated
     intermediate version on the device. */
  return cutOver(storagePort, migrateV5ToV6(migrateV4ToV5(v4)), V4_KEY, "v4");
}
