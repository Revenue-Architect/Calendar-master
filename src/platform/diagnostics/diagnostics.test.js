import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DIAGNOSTIC_RECORDS,
  createDiagnosticRecord,
  createDiagnosticsLedger,
  exportDiagnostics,
  recordDiagnostic,
  shouldRecordStorageDiagnostic,
  storageDiagnosticOperation,
} from "./diagnostics.js";

function storageFailure(id, overrides = {}) {
  return {
    id: `diag-${id}`,
    category: "storage",
    operation: "planner-save",
    occurredAt: "2026-08-10T12:00:00.000Z",
    appVersion: "0.1.0",
    schemaVersion: 8,
    correlationId: `local-${id}`,
    errorCode: "write-failed",
    ...overrides,
  };
}

test("diagnostic records accept only the redacted schema", () => {
  const record = createDiagnosticRecord(storageFailure("one"));
  assert.deepEqual(record, storageFailure("one"));

  const migration = storageFailure("migration", {
    category: "migration",
    operation: "planner-migration",
    errorCode: "invalid-record",
  });
  assert.deepEqual(createDiagnosticRecord(migration), migration);

  assert.throws(
    () => createDiagnosticRecord(storageFailure("two", { message: "Private meeting notes", stack: "trace" })),
    /unknown field/,
  );
  assert.throws(
    () => createDiagnosticRecord(storageFailure("three", { errorCode: "raw browser error" })),
    /errorCode/,
  );
  assert.throws(
    () => createDiagnosticRecord(storageFailure("four", { category: "migration" })),
    /operation/,
  );
  assert.throws(
    () => createDiagnosticRecord(storageFailure("five", { occurredAt: "August 10, 2026" })),
    /timestamp/,
  );
});

test("diagnostic retention is capped and export is a content-free projection", () => {
  let ledger = createDiagnosticsLedger();
  for (let index = 0; index < MAX_DIAGNOSTIC_RECORDS + 2; index += 1) {
    ledger = recordDiagnostic(ledger, storageFailure(index));
  }

  assert.equal(ledger.entries.length, MAX_DIAGNOSTIC_RECORDS);
  assert.equal(ledger.entries[0].id, "diag-2");
  const exported = exportDiagnostics(ledger);
  assert.deepEqual(Object.keys(exported.entries[0]).sort(), [
    "appVersion", "category", "correlationId", "errorCode", "id", "occurredAt", "operation", "schemaVersion",
  ]);
  assert.equal(JSON.stringify(exported).includes("Private meeting notes"), false);
});

test("only real storage failures are eligible for diagnostic recording", () => {
  assert.equal(shouldRecordStorageDiagnostic("planner", true), true);
  assert.equal(shouldRecordStorageDiagnostic("reminders", true), true);
  assert.equal(shouldRecordStorageDiagnostic("planner", false), false);
  assert.equal(shouldRecordStorageDiagnostic("diagnostics", true), false);
  assert.equal(shouldRecordStorageDiagnostic("unknown", true), false);
  assert.equal(storageDiagnosticOperation("planner"), "planner-save");
  assert.equal(storageDiagnosticOperation("diagnostics"), null);
});
