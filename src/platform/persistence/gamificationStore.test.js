import assert from "node:assert/strict";
import test from "node:test";

import { createMotivationLedger } from "../../domains/gamification/model/ledger.js";
import { loadMotivationLedger, saveMotivationLedger } from "./gamificationStore.js";

function port(value = null) {
  let stored = value;
  return {
    get: async () => stored == null ? null : { value: stored },
    set: async (_key, value) => { stored = value; },
    value: () => stored,
  };
}

test("missing motivation storage boots from an explicit legacy balance", async () => {
  const result = await loadMotivationLedger(port(), { openingBalance: 75 });
  assert.equal(result.initialized, true);
  assert.equal(result.ledger.entries[0].amount, 75);
});

test("motivation ledger round-trips separately from planner state", async () => {
  const storage = port();
  const ledger = createMotivationLedger({ openingBalance: 75 });
  await saveMotivationLedger(storage, ledger);
  const result = await loadMotivationLedger(storage);
  assert.deepEqual(result.ledger, ledger);
});

test("malformed motivation storage is rejected rather than silently replaced", async () => {
  await assert.rejects(() => loadMotivationLedger(port("not-json")), /invalid JSON/);
  await assert.rejects(() => loadMotivationLedger(port("[]")), /must be an object/);
});
