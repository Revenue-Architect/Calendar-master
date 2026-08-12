import assert from "node:assert/strict";
import test from "node:test";

import { loadPreferences, savePreferences } from "./preferencesStore.js";

function port(value = null) {
  let stored = value;
  return {
    get: async () => stored == null ? null : { value: stored },
    set: async (_key, value) => { stored = value; },
    value: () => stored,
  };
}

test("missing preferences use the supplied legacy fallback without changing planner state", async () => {
  const storage = port();
  const result = await loadPreferences(storage, { themeId: "cream-blue", sound: false });

  assert.equal(result.initialized, true);
  assert.equal(result.preferences.display.themeId, "cream-blue");
  assert.equal(result.preferences.feedback.sound, false);
  assert.equal(storage.value(), null);
});

test("preferences round-trip through their independent storage key", async () => {
  const storage = port();
  await savePreferences(storage, { display: { clock: "24" } });
  const result = await loadPreferences(storage, {});

  assert.equal(result.initialized, false);
  assert.equal(result.preferences.display.clock, "24");
});

test("legacy v1 feedback is upgraded because haptics off was not a user choice", async () => {
  const storage = port(JSON.stringify({
    schemaVersion: 1,
    display: { themeId: "cream-blue", clock: "24" },
    feedback: { sound: false, haptics: false },
    notifications: { systemEnabled: true },
    motivation: { points: false, levels: true, streaks: true, celebrations: false },
  }));

  const result = await loadPreferences(storage, {});

  assert.equal(result.initialized, true, "the upgraded payload must be written back once");
  assert.equal(result.preferences.schemaVersion, 2);
  assert.equal(result.preferences.feedback.haptics, true);
  assert.equal(result.preferences.feedback.sound, false);
  assert.equal(result.preferences.display.clock, "24");
  assert.equal(result.preferences.notifications.systemEnabled, true);
  assert.equal(result.preferences.motivation.points, false);
});

test("malformed preference storage is rejected rather than silently replaced", async () => {
  await assert.rejects(() => loadPreferences(port("not-json"), {}), /invalid JSON/);
  await assert.rejects(() => loadPreferences(port("[]"), {}), /must be an object/);
});
