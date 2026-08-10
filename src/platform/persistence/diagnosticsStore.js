import { createDiagnosticsLedger } from "../diagnostics/diagnostics.js";

export const DIAGNOSTICS_STORE_KEY = "nbmp:diagnostics:v1";

function valueOf(result) {
  return result && typeof result === "object" && Object.hasOwn(result, "value") ? result.value : result;
}

function parseStored(result) {
  const value = valueOf(result);
  if (value == null || value === "") return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error("diagnostics storage contains invalid JSON", { cause: error });
  }
}

export async function loadDiagnostics(storagePort) {
  const parsed = parseStored(await storagePort.get(DIAGNOSTICS_STORE_KEY));
  if (parsed == null) return { ledger: createDiagnosticsLedger(), initialized: true };
  return { ledger: createDiagnosticsLedger(parsed), initialized: false };
}

export async function saveDiagnostics(storagePort, ledger) {
  await storagePort.set(DIAGNOSTICS_STORE_KEY, JSON.stringify(createDiagnosticsLedger(ledger)));
}
