import { createMotivationLedger, normalizeMotivationLedger } from "../../domains/gamification/index.js";

export const MOTIVATION_STORE_KEY = "nbmp:motivation:v1";

function valueOf(result) {
  return result && typeof result === "object" && Object.hasOwn(result, "value") ? result.value : result;
}

function parseStored(result) {
  const value = valueOf(result);
  if (value == null || value === "") return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error("motivation storage contains invalid JSON", { cause: error });
  }
}

export async function loadMotivationLedger(storagePort, { openingBalance = 0 } = {}) {
  const parsed = parseStored(await storagePort.get(MOTIVATION_STORE_KEY));
  if (parsed == null) return { ledger: createMotivationLedger({ openingBalance }), initialized: true };
  return { ledger: normalizeMotivationLedger(parsed), initialized: false };
}

export async function saveMotivationLedger(storagePort, ledger) {
  await storagePort.set(MOTIVATION_STORE_KEY, JSON.stringify(normalizeMotivationLedger(ledger)));
}
