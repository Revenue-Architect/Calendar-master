import assert from "node:assert/strict";
import test from "node:test";

import {
  createPreferences,
  preferencesFromLegacyState,
  resetPreferenceGroup,
} from "./preferences.js";

test("derives a versioned preference record from legacy display fields", () => {
  const preferences = preferencesFromLegacyState({
    themeId: "cream-blue", clock: "24", sound: false, notifs: true,
  });

  assert.equal(preferences.schemaVersion, 1);
  assert.equal(preferences.display.themeId, "cream-blue");
  assert.equal(preferences.display.clock, "24");
  assert.equal(preferences.feedback.sound, false);
  assert.equal(preferences.notifications.systemEnabled, true);
  assert.equal(preferences.motivation.points, true);
});

test("normalizes safe defaults without mutating its input", () => {
  const source = { schemaVersion: 1, display: { clock: "nope", reducedMotion: true } };
  const normalized = createPreferences(source);

  assert.equal(normalized.display.clock, "12");
  assert.equal(normalized.display.reducedMotion, true);
  assert.equal(normalized.feedback.sound, true);
  assert.equal(source.display.clock, "nope");
});

test("resets one preference group without touching the other groups", () => {
  const preferences = createPreferences({
    display: { themeId: "cream-blue", clock: "24" },
    feedback: { sound: false },
  });
  const reset = resetPreferenceGroup(preferences, "display");

  assert.equal(reset.display.themeId, "obsidian-acid");
  assert.equal(reset.display.clock, "12");
  assert.equal(reset.feedback.sound, false);
});
