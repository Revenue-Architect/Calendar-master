import assert from "node:assert/strict";
import test from "node:test";

import { loadPlannerState, savePlannerState, V4_KEY, V5_KEY, V6_KEY, V7_KEY } from "./plannerStateStore.js";

const v4State = {
  events: [{ id: "event", title: "Event", date: "2026-08-09", start: 540, dur: 60 }],
  tasks: [
    { id: "one-off", title: "Chase the invoice", date: "2026-08-01", due: "2026-08-01", done: false, subs: [], order: 0, xp: 30 },
    { id: "habit", title: "Walk 8k steps", date: "2026-07-20", done: false, subs: [], order: 1, xp: 30, repeat: { freq: "daily", interval: 1 } },
  ],
  notes: [],
  overrides: {},
};

function memoryStorage(initial = {}, failKey = null) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    async get(key) { calls.push(["get", key]); return values.has(key) ? { value: values.get(key) } : null; },
    async set(key, value) {
      calls.push(["set", key]);
      if (failKey && key === failKey) throw new Error("disk full");
      values.set(key, value);
    },
    async remove(key) { calls.push(["remove", key]); values.delete(key); },
  };
}

test("confirmed v7 cutover removes v4 only after v6 can be read back", async () => {
  const port = memoryStorage({ [V4_KEY]: JSON.stringify(v4State) });
  const loaded = await loadPlannerState(port);
  assert.equal(loaded.state.schemaVersion, 7);
  assert.equal(loaded.migrated, true);
  assert.equal(await port.get(V4_KEY), null);
  assert.ok(await port.get(V7_KEY));

  const setIndex = port.calls.findIndex(([type, key]) => type === "set" && key === V7_KEY);
  const confirmationIndex = port.calls.findIndex(([type, key], index) => index > setIndex && type === "get" && key === V7_KEY);
  const removeIndex = port.calls.findIndex(([type, key]) => type === "remove" && key === V4_KEY);
  assert.ok(setIndex < confirmationIndex && confirmationIndex < removeIndex);
});

test("a v4 notebook never lands on an intermediate v5 key", async () => {
  const port = memoryStorage({ [V4_KEY]: JSON.stringify(v4State) });
  await loadPlannerState(port);
  assert.equal(await port.get(V5_KEY), null);
  assert.equal(port.calls.some(([type, key]) => type === "set" && key === V5_KEY), false);
});

test("an existing v5 notebook migrates forward to v7", async () => {
  const seed = memoryStorage({ [V4_KEY]: JSON.stringify(v4State) });
  const { state: v5Shaped } = await loadPlannerState(seed);
  /* present the same notebook as a v5 record to exercise the v5 -> v6 path */
  const asV5 = { ...v5Shaped, schemaVersion: 5 };
  delete asV5.taskLists;
  delete asV5.taskExceptions;
  asV5.tasks = v4State.tasks;

  const port = memoryStorage({ [V5_KEY]: JSON.stringify(asV5) });
  const loaded = await loadPlannerState(port);
  assert.equal(loaded.state.schemaVersion, 7);
  assert.equal(await port.get(V5_KEY), null);
  assert.ok(await port.get(V7_KEY));
});

test("failed v6 write leaves the previous version untouched", async () => {
  const port = memoryStorage({ [V4_KEY]: JSON.stringify(v4State) }, V7_KEY);
  await assert.rejects(() => loadPlannerState(port), /persist migrated v7/);
  assert.ok(await port.get(V4_KEY));
  assert.equal(port.calls.some(([type]) => type === "remove"), false);
});

test("missing state is not silently seeded and saves require valid v7", async () => {
  const port = memoryStorage();
  assert.deepEqual(await loadPlannerState(port), { state: null, migrated: false });
  await assert.rejects(() => savePlannerState(port, { schemaVersion: 6 }), /schemaVersion/);
});

test("migration carries legacy task fields onto the canonical model", async () => {
  const port = memoryStorage({ [V4_KEY]: JSON.stringify(v4State) });
  const { state } = await loadPlannerState(port);

  const oneOff = state.tasks.find((task) => task.id === "one-off");
  assert.equal(oneOff.planned.date, "2026-08-01");
  assert.equal(oneOff.deadline.date, "2026-08-01");
  assert.equal(oneOff.status, "open");
  assert.equal(oneOff.reward, 30);

  /* legacy repeating tasks adopt skip, the policy that stops habits accruing debt */
  const habit = state.tasks.find((task) => task.id === "habit");
  assert.equal(habit.recurrence.frequency, "daily");
  assert.equal(habit.recurrence.missedPolicy, "skip");
});
