import { migrateV4ToV5 } from "../../domains/calendar/migrations/migrateV4ToV5.js";
import { validatePlannerStateV5 } from "../../domains/calendar/migrations/validatePlannerStateV5.js";
import { migrateV5ToV6 } from "../../domains/tasks/migrations/migrateV5ToV6.js";
import { migrateV6ToV7 } from "../../domains/notes/migrations/migrateV6ToV7.js";
import { validatePlannerStateV7 } from "../../domains/notes/migrations/validatePlannerStateV7.js";

export const V4_KEY = "nbmp:state:v4";
export const V5_KEY = "nbmp:state:v5";
export const V6_KEY = "nbmp:state:v6";
export const V7_KEY = "nbmp:state:v7";

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
  validatePlannerStateV7(state);
  await storagePort.set(V7_KEY, JSON.stringify(state));
}

/* Same policy as the v4 cutover: migrate in memory, write, read back, validate the
   confirmation, and only then drop the older key. A failed write or a failed
   confirmation leaves the previous version untouched, so a broken upgrade costs
   nothing. There is no dual-write period. */
async function cutOver(storagePort, state, previousKey, previousLabel) {
  try {
    await savePlannerState(storagePort, state);
    validatePlannerStateV7(parseStored(await storagePort.get(V7_KEY), V7_KEY));
  } catch (error) {
    throw new Error(`could not persist migrated v7 planner state; ${previousLabel} was preserved`, { cause: error });
  }
  if (previousKey) await storagePort.remove(previousKey);
  return { state, migrated: true };
}

export async function loadPlannerState(storagePort) {
  const v7 = parseStored(await storagePort.get(V7_KEY), V7_KEY);
  if (v7) return { state: validatePlannerStateV7(v7), migrated: false };

  /* Whatever version is on the device upgrades to v7 in a single confirmed write.
     Chaining the migrations in memory and writing once means an interrupted upgrade
     never strands a half-migrated intermediate version. */
  const v6 = parseStored(await storagePort.get(V6_KEY), V6_KEY);
  if (v6) return cutOver(storagePort, migrateV6ToV7(v6), V6_KEY, "v6");

  const v5 = parseStored(await storagePort.get(V5_KEY), V5_KEY);
  if (v5) return cutOver(storagePort, migrateV6ToV7(migrateV5ToV6(validatePlannerStateV5(v5))), V5_KEY, "v5");

  const v4 = parseStored(await storagePort.get(V4_KEY), V4_KEY);
  if (!v4) return { state: null, migrated: false };
  return cutOver(storagePort, migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(v4))), V4_KEY, "v4");
}
