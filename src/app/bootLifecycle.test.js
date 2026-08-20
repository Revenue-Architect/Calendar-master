import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOT_LIFECYCLE_VERSION,
  MAX_BOOT_LIFECYCLE_EVENTS,
  appendBootLifecycleEvent,
  createBootLifecycle,
  readBootLifecycle,
  recordBootLifecycleEvent,
  writeBootLifecycle,
} from "./bootLifecycle.js";

function storage(value = null) {
  let current = value;
  return {
    getItem() { return current; },
    setItem(_key, next) { current = next; },
    removeItem() { current = null; },
    value() { return current; },
  };
}

test("boot lifecycle is bounded, redacted, and accepts only known event values", () => {
  let ledger = createBootLifecycle({ buildId: "2026.08", sessionId: "session-1" });
  for (let i = 0; i < MAX_BOOT_LIFECYCLE_EVENTS + 5; i += 1) {
    ledger = appendBootLifecycleEvent(ledger, {
      type: "boundary-failure",
      reason: "react-render",
      message: "private note must never be stored",
    });
  }
  assert.equal(ledger.version, BOOT_LIFECYCLE_VERSION);
  assert.equal(ledger.events.length, MAX_BOOT_LIFECYCLE_EVENTS);
  assert.equal(Object.hasOwn(ledger.events[0], "message"), false);
  assert.equal(ledger.events.every((event) => event.type === "boundary-failure"), true);
});

test("malformed session diagnostics recover to a usable empty trail", () => {
  const malformed = storage("not json");
  const recovered = readBootLifecycle(malformed);
  assert.equal(recovered.version, BOOT_LIFECYCLE_VERSION);
  assert.deepEqual(recovered.events, []);
  assert.doesNotThrow(() => writeBootLifecycle(recovered, malformed));
});

test("root commit is idempotent for React StrictMode effects", () => {
  const first = createBootLifecycle({ sessionId: "session-1" });
  const committed = appendBootLifecycleEvent(first, { type: "root-commit", reason: "success" });
  const twice = appendBootLifecycleEvent(committed, { type: "root-commit", reason: "success" });
  assert.equal(committed.events.length, 1);
  assert.equal(twice.events.length, 1);
});

test("event recording never blocks when storage throws", () => {
  const broken = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.doesNotThrow(() => recordBootLifecycleEvent("pageshow", {}, broken));
});
