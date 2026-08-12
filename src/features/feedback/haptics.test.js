import test from "node:test";
import assert from "node:assert/strict";
import { HAPTIC_PATTERNS, triggerDeviceHaptic } from "./haptics.js";

test("action completion requests pulses a phone motor can render", () => {
  assert.deepEqual(HAPTIC_PATTERNS.complete, [24, 32, 36]);
  assert.ok(HAPTIC_PATTERNS.complete.filter((_, index) => index % 2 === 0).every((pulse) => pulse >= 20));
});

test("device haptics receive an independent copy of the requested pattern", () => {
  let received = null;
  const device = { vibrate(pattern) { received = pattern; return true; } };

  assert.equal(triggerDeviceHaptic(HAPTIC_PATTERNS.complete, device), true);
  assert.deepEqual(received, [24, 32, 36]);
  assert.notEqual(received, HAPTIC_PATTERNS.complete);
});

test("unsupported or failing vibration never blocks the interaction", () => {
  assert.equal(triggerDeviceHaptic(HAPTIC_PATTERNS.complete, {}), false);
  assert.equal(triggerDeviceHaptic(HAPTIC_PATTERNS.complete, { vibrate() { throw new Error("not available"); } }), false);
});
