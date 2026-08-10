export const DIAGNOSTICS_VERSION = 1;
export const MAX_DIAGNOSTIC_RECORDS = 50;
export const DIAGNOSTICS_EXPORT_FORMAT = "calendar-master-diagnostics";

const DIAGNOSTIC_FIELDS = new Set([
  "id", "category", "operation", "occurredAt", "appVersion", "schemaVersion", "correlationId", "errorCode",
]);
const STORAGE_OPERATIONS = Object.freeze({
  planner: "planner-save",
  reminders: "reminder-save",
  preferences: "preferences-save",
  motivation: "motivation-save",
});
const OPERATION_CATEGORIES = Object.freeze({
  ...Object.fromEntries(Object.values(STORAGE_OPERATIONS).map((operation) => [operation, "storage"])),
  "planner-migration": "migration",
  "reminder-delivery": "reminder",
  "search-projection": "search",
  "command-mutation": "command",
  "app-render": "unhandled",
});
const VALID_ERROR_CODES = new Set(["read-failed", "write-failed", "invalid-json", "invalid-record"]);
const SAFE_TOKEN = /^[a-z0-9][a-z0-9.-]{0,95}$/i;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function requireToken(value, name) {
  if (typeof value !== "string" || !SAFE_TOKEN.test(value)) {
    throw new Error(`${name} must be a safe token`);
  }
  return value;
}

function requireExactFields(record) {
  for (const key of Object.keys(record)) {
    if (!DIAGNOSTIC_FIELDS.has(key)) throw new Error(`diagnostic record has unknown field: ${key}`);
  }
  for (const key of DIAGNOSTIC_FIELDS) {
    if (!Object.hasOwn(record, key)) throw new Error(`diagnostic record requires ${key}`);
  }
}

export function createDiagnosticRecord(input) {
  const record = requireObject(input, "diagnostic record");
  requireExactFields(record);
  if (OPERATION_CATEGORIES[record.operation] !== record.category) {
    throw new Error("diagnostic operation is not allowed for its category");
  }
  if (!VALID_ERROR_CODES.has(record.errorCode)) throw new Error("diagnostic errorCode is not allowed");
  if (!Number.isInteger(record.schemaVersion) || record.schemaVersion < 1 || record.schemaVersion > 999) {
    throw new Error("diagnostic schemaVersion must be a positive integer");
  }
  if (typeof record.occurredAt !== "string" || !ISO_UTC_TIMESTAMP.test(record.occurredAt)
    || Number.isNaN(Date.parse(record.occurredAt)) || new Date(record.occurredAt).toISOString() !== record.occurredAt) {
    throw new Error("diagnostic occurredAt must be an ISO timestamp");
  }
  return {
    id: requireToken(record.id, "diagnostic id"),
    category: record.category,
    operation: record.operation,
    occurredAt: record.occurredAt,
    appVersion: requireToken(record.appVersion, "diagnostic appVersion"),
    schemaVersion: record.schemaVersion,
    correlationId: requireToken(record.correlationId, "diagnostic correlationId"),
    errorCode: record.errorCode,
  };
}

export function createDiagnosticsLedger(input = {}) {
  const ledger = requireObject(input, "diagnostics ledger");
  for (const key of Object.keys(ledger)) {
    if (key !== "version" && key !== "entries") throw new Error(`diagnostics ledger has unknown field: ${key}`);
  }
  const version = Object.hasOwn(ledger, "version") ? ledger.version : DIAGNOSTICS_VERSION;
  const entries = Object.hasOwn(ledger, "entries") ? ledger.entries : [];
  if (version !== DIAGNOSTICS_VERSION) throw new Error("diagnostics ledger version is not supported");
  if (!Array.isArray(entries)) throw new Error("diagnostics ledger entries must be an array");
  return {
    version: DIAGNOSTICS_VERSION,
    entries: entries.map(createDiagnosticRecord).slice(-MAX_DIAGNOSTIC_RECORDS),
  };
}

export function recordDiagnostic(ledger, input) {
  const current = createDiagnosticsLedger(ledger);
  return createDiagnosticsLedger({ entries: [...current.entries, createDiagnosticRecord(input)] });
}

export function exportDiagnostics(ledger) {
  const normalized = createDiagnosticsLedger(ledger);
  return {
    format: DIAGNOSTICS_EXPORT_FORMAT,
    version: DIAGNOSTICS_VERSION,
    entries: normalized.entries.map((entry) => ({ ...entry })),
  };
}

export function shouldRecordStorageDiagnostic(scope, failed) {
  return failed === true && Object.hasOwn(STORAGE_OPERATIONS, scope);
}

export function storageDiagnosticOperation(scope) {
  return STORAGE_OPERATIONS[scope] || null;
}
