export const PREFERENCES_VERSION = 1;

export const DEFAULT_PREFERENCES = Object.freeze({
  schemaVersion: PREFERENCES_VERSION,
  display: Object.freeze({ themeId: "obsidian-acid", clock: "12", reducedMotion: false }),
  feedback: Object.freeze({ sound: true, haptics: false }),
  notifications: Object.freeze({ systemEnabled: false }),
  motivation: Object.freeze({ points: true, levels: true, streaks: true, celebrations: true }),
});

function objectOrEmpty(value, label = "preferences") {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function boolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function themeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_PREFERENCES.display.themeId;
}

export function createPreferences(input = {}) {
  const source = objectOrEmpty(input);
  if (source.schemaVersion != null && source.schemaVersion !== PREFERENCES_VERSION) {
    throw new TypeError(`unsupported preferences schema version ${source.schemaVersion}`);
  }
  const display = objectOrEmpty(source.display, "preferences.display");
  const feedback = objectOrEmpty(source.feedback, "preferences.feedback");
  const notifications = objectOrEmpty(source.notifications, "preferences.notifications");
  const motivation = objectOrEmpty(source.motivation, "preferences.motivation");
  return {
    schemaVersion: PREFERENCES_VERSION,
    display: {
      themeId: themeId(display.themeId),
      clock: display.clock === "24" ? "24" : "12",
      reducedMotion: boolean(display.reducedMotion, DEFAULT_PREFERENCES.display.reducedMotion),
    },
    feedback: {
      sound: boolean(feedback.sound, DEFAULT_PREFERENCES.feedback.sound),
      haptics: boolean(feedback.haptics, DEFAULT_PREFERENCES.feedback.haptics),
    },
    notifications: {
      systemEnabled: boolean(notifications.systemEnabled, DEFAULT_PREFERENCES.notifications.systemEnabled),
    },
    motivation: {
      points: boolean(motivation.points, DEFAULT_PREFERENCES.motivation.points),
      levels: boolean(motivation.levels, DEFAULT_PREFERENCES.motivation.levels),
      streaks: boolean(motivation.streaks, DEFAULT_PREFERENCES.motivation.streaks),
      celebrations: boolean(motivation.celebrations, DEFAULT_PREFERENCES.motivation.celebrations),
    },
  };
}

export function preferencesFromLegacyState(legacy = {}) {
  const source = objectOrEmpty(legacy, "legacy planner state");
  return createPreferences({
    display: { themeId: source.themeId, clock: source.clock },
    feedback: { sound: source.sound },
    notifications: { systemEnabled: source.notifs },
  });
}

export function resetPreferenceGroup(preferences, group) {
  const current = createPreferences(preferences);
  if (!Object.hasOwn(DEFAULT_PREFERENCES, group) || group === "schemaVersion") {
    throw new RangeError(`unknown preference group ${group}`);
  }
  return createPreferences({ ...current, [group]: DEFAULT_PREFERENCES[group] });
}
