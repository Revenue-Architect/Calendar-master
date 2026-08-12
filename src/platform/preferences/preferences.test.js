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
  assert.equal(normalized.feedback.haptics, true);
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

test("week start defaults to Sunday and only accepts Monday as the alternative", () => {
  assert.equal(createPreferences({}).display.weekStart, 0);
  assert.equal(createPreferences({ display: { weekStart: 1 } }).display.weekStart, 1);
  assert.equal(createPreferences({ display: { weekStart: 0 } }).display.weekStart, 0);
  /* A stored value from a future build, or junk, falls back rather than laying
     out the grid against a weekday index that does not exist. */
  for (const value of [3, -1, "1", null, true, 1.5]) {
    assert.equal(createPreferences({ display: { weekStart: value } }).display.weekStart, 0);
  }
});
