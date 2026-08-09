import assert from "node:assert/strict";
import test from "node:test";

import { loadPlannerState, savePlannerState, V4_KEY, V5_KEY } from "./plannerStateStore.js";

const v4State = {
  events: [{ id: "event", title: "Event", date: "2026-08-09", start: 540, dur: 60 }],
  tasks: [], notes: [], overrides: {},
};

function memoryStorage(initial = {}, failV5 = false) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    async get(key) { calls.push(["get", key]); return values.has(key) ? { value: values.get(key) } : null; },
    async set(key, value) {
      calls.push(["set", key]);
      if (failV5 && key === V5_KEY) throw new Error("disk full");
      values.set(key, value);
    },
    async remove(key) { calls.push(["remove", key]); values.delete(key); },
  };
}

test("confirmed v5 cutover removes v4 only after v5 can be read", async () => {
  const port = memoryStorage({ [V4_KEY]: JSON.stringify(v4State) });
  const loaded = await loadPlannerState(port);
  assert.equal(loaded.state.schemaVersion, 5);
  assert.equal(loaded.migrated, true);
  assert.equal(await port.get(V4_KEY), null);
  assert.ok(await port.get(V5_KEY));
  const setIndex = port.calls.findIndex(([type, key]) => type === "set" && key === V5_KEY);
  const confirmationIndex = port.calls.findIndex(([type, key], index) => index > setIndex && type === "get" && key === V5_KEY);
  const removeIndex = port.calls.findIndex(([type, key]) => type === "remove" && key === V4_KEY);
  assert.ok(setIndex < confirmationIndex && confirmationIndex < removeIndex);
});

test("failed v5 write leaves v4 untouched", async () => {
  const port = memoryStorage({ [V4_KEY]: JSON.stringify(v4State) }, true);
  await assert.rejects(() => loadPlannerState(port), /persist migrated v5/);
  assert.ok(await port.get(V4_KEY));
  assert.equal(port.calls.some(([type]) => type === "remove"), false);
});

test("missing state is not silently seeded and saves require valid v5", async () => {
  const port = memoryStorage();
  assert.deepEqual(await loadPlannerState(port), { state: null, migrated: false });
  await assert.rejects(() => savePlannerState(port, { schemaVersion: 4 }), /schemaVersion/);
});
