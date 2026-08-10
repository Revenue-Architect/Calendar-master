import { createPreferences, preferencesFromLegacyState } from "../preferences/preferences.js";

export const PREFERENCES_STORE_KEY = "nbmp:preferences:v1";

function valueOf(result) {
  return result && typeof result === "object" && Object.hasOwn(result, "value") ? result.value : result;
}

function parseStored(result) {
  const value = valueOf(result);
  if (value == null || value === "") return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error("preferences storage contains invalid JSON", { cause: error });
  }
}

export async function loadPreferences(storagePort, legacyFallback = {}) {
  const parsed = parseStored(await storagePort.get(PREFERENCES_STORE_KEY));
  if (parsed == null) {
    return { preferences: preferencesFromLegacyState(legacyFallback), initialized: true };
  }
  return { preferences: createPreferences(parsed), initialized: false };
}

export async function savePreferences(storagePort, preferences) {
  await storagePort.set(PREFERENCES_STORE_KEY, JSON.stringify(createPreferences(preferences)));
}
