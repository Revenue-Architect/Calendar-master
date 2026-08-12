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

function upgradeStoredPreferences(preferences) {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    return { preferences, upgraded: false };
  }
  if (preferences.schemaVersion !== 1) return { preferences, upgraded: false };

  /* v1 always persisted haptics:false even though there was no control for it,
     so that value cannot represent a user choice. v2 is the first schema where
     OFF is configurable; migrate the old generated value once, then preserve
     every explicit v2 choice from that point forward. */
  const feedback = preferences.feedback && typeof preferences.feedback === "object" && !Array.isArray(preferences.feedback)
    ? preferences.feedback
    : {};
  return {
    upgraded: true,
    preferences: {
      ...preferences,
      schemaVersion: 2,
      feedback: { ...feedback, haptics: true },
    },
  };
}

export async function loadPreferences(storagePort, legacyFallback = {}) {
  const parsed = parseStored(await storagePort.get(PREFERENCES_STORE_KEY));
  if (parsed == null) {
    return { preferences: preferencesFromLegacyState(legacyFallback), initialized: true };
  }
  const upgraded = upgradeStoredPreferences(parsed);
  return { preferences: createPreferences(upgraded.preferences), initialized: upgraded.upgraded };
}

export async function savePreferences(storagePort, preferences) {
  await storagePort.set(PREFERENCES_STORE_KEY, JSON.stringify(createPreferences(preferences)));
}
