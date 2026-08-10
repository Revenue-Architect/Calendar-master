import assert from "node:assert/strict";
import test from "node:test";

import { createDiagnosticsLedger, recordDiagnostic } from "../diagnostics/diagnostics.js";
import { loadDiagnostics, saveDiagnostics } from "./diagnosticsStore.js";

function port(value = null) {
  let stored = value;
  return {
    get: async () => stored == null ? null : { value: stored },
    set: async (_key, value) => { stored = value; },
    value: () => stored,
  };
}

function storageFailure() {
  return {
    id: "diag-one",
    category: "storage",
    operation: "planner-save",
    occurredAt: "2026-08-10T12:00:00.000Z",
    appVersion: "0.1.0",
    schemaVersion: 8,
    correlationId: "local-one",
    errorCode: "write-failed",
  };
}

test("missing diagnostics storage initializes an empty versioned ledger", async () => {
  const result = await loadDiagnostics(port());
  assert.equal(result.initialized, true);
  assert.deepEqual(result.ledger.entries, []);
});

test("diagnostics ledger round-trips in its own persistence key", async () => {
  const storage = port();
  const ledger = recordDiagnostic(createDiagnosticsLedger(), storageFailure());
  await saveDiagnostics(storage, ledger);
  const result = await loadDiagnostics(storage);
  assert.equal(result.initialized, false);
  assert.deepEqual(result.ledger, ledger);
});

test("malformed or invalid diagnostics storage is rejected without replacement", async () => {
  await assert.rejects(() => loadDiagnostics(port("not-json")), /invalid JSON/);
  await assert.rejects(() => loadDiagnostics(port("[]")), /must be an object/);
});
