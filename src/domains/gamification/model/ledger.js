export const MOTIVATION_SCHEMA_VERSION = 1;
export const REWARD_POLICY_VERSION = "reward-v1";
export const POINTS_PER_LEVEL = 300;

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function optionalString(value, label) {
  if (value == null) return null;
  return requiredString(value, label);
}

function normalizeSource(value) {
  if (value == null) return null;
  const source = assertObject(value, "award source");
  if (source.domain !== "task") throw new TypeError("award source domain must be task");
  return {
    domain: "task",
    entityId: requiredString(source.entityId, "award source entityId"),
    occurrenceId: optionalString(source.occurrenceId, "award source occurrenceId"),
  };
}

function normalizeDate(value, label) {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a date key or null`);
  }
  try { assertDateKey(value); } catch { throw new TypeError(`${label} must be a date key or null`); }
  return value;
}

function normalizeEntry(input) {
  const entry = assertObject(input, "motivation entry");
  const kind = entry.kind;
  if (kind !== "opening-balance" && kind !== "award" && kind !== "reversal") {
    throw new TypeError("motivation entry kind is invalid");
  }
  if (!Number.isInteger(entry.amount)) throw new TypeError("motivation entry amount must be an integer");
  if (kind === "reversal" && entry.amount > 0) throw new TypeError("motivation reversal amount must not be positive");
  if (kind === "award" && entry.amount < 0) throw new TypeError("motivation award amount must not be negative");
  const source = normalizeSource(entry.source);
  if (kind !== "opening-balance" && !source) throw new TypeError("task reward entries require a source");
  return {
    id: requiredString(entry.id, "motivation entry id"),
    kind,
    reason: requiredString(entry.reason, "motivation entry reason"),
    amount: entry.amount,
    policyVersion: requiredString(entry.policyVersion, "motivation entry policyVersion"),
    source,
    occurredAt: optionalString(entry.occurredAt, "motivation entry occurredAt"),
    planningDate: normalizeDate(entry.planningDate, "motivation entry planningDate"),
    reversalOf: optionalString(entry.reversalOf, "motivation entry reversalOf"),
  };
}

export function normalizeMotivationLedger(input) {
  const ledger = assertObject(input, "motivation ledger");
  if (ledger.schemaVersion !== MOTIVATION_SCHEMA_VERSION) {
    throw new TypeError(`unsupported motivation schema version ${ledger.schemaVersion}`);
  }
  if (!Array.isArray(ledger.entries)) throw new TypeError("motivation ledger entries must be an array");
  const entries = ledger.entries.map(normalizeEntry);
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new TypeError(`motivation entry ${entry.id} is duplicated`);
    ids.add(entry.id);
  }
  const awards = new Map(entries.filter((entry) => entry.kind === "award").map((entry) => [entry.id, entry]));
  const reversed = new Set();
  for (const entry of entries.filter((candidate) => candidate.kind === "reversal")) {
    if (!entry.reversalOf) throw new TypeError("motivation reversal requires an award reference");
    const award = awards.get(entry.reversalOf);
    if (!award) throw new TypeError(`motivation reversal references an unknown award ${entry.reversalOf}`);
    if (reversed.has(award.id)) throw new TypeError(`motivation award ${award.id} is reversed more than once`);
    if (entry.amount !== -award.amount || !sameSource(entry.source, award.source)) {
      throw new TypeError("motivation reversal must exactly negate its source award");
    }
    reversed.add(award.id);
  }
  return { schemaVersion: MOTIVATION_SCHEMA_VERSION, entries };
}

export function createMotivationLedger({ openingBalance = 0 } = {}) {
  if (!Number.isInteger(openingBalance) || openingBalance < 0) {
    throw new TypeError("opening balance must be a non-negative integer");
  }
  const entries = openingBalance === 0 ? [] : [{
    id: "legacy-opening-balance:v1",
    kind: "opening-balance",
    reason: "legacy-opening-balance",
    amount: openingBalance,
    policyVersion: REWARD_POLICY_VERSION,
    source: null,
    occurredAt: null,
    planningDate: null,
    reversalOf: null,
  }];
  return normalizeMotivationLedger({ schemaVersion: MOTIVATION_SCHEMA_VERSION, entries });
}

function sameSource(left, right) {
  return left?.domain === right?.domain
    && left?.entityId === right?.entityId
    && left?.occurrenceId === right?.occurrenceId;
}

function reversedAwardIds(entries) {
  return new Set(entries.filter((entry) => entry.kind === "reversal").map((entry) => entry.reversalOf));
}

export function findLatestActiveTaskAward(ledger, source) {
  const normalized = normalizeMotivationLedger(ledger);
  const normalizedSource = normalizeSource(source);
  const reversed = reversedAwardIds(normalized.entries);
  return [...normalized.entries].reverse().find((entry) => (
    entry.kind === "award" && !reversed.has(entry.id) && sameSource(entry.source, normalizedSource)
  )) ?? null;
}

export function awardTaskCompletion(ledger, input) {
  const normalized = normalizeMotivationLedger(ledger);
  const award = {
    id: requiredString(input?.id, "award id"),
    kind: "award",
    reason: "task-completed",
    amount: input?.amount,
    policyVersion: input?.policyVersion ?? REWARD_POLICY_VERSION,
    source: input?.source,
    occurredAt: input?.occurredAt ?? null,
    planningDate: input?.planningDate ?? null,
    reversalOf: null,
  };
  const entry = normalizeEntry(award);
  if (normalized.entries.some((existing) => existing.id === entry.id)) return normalized;
  /* The task state has one active completion at a time. A repeated UI event may
     carry a fresh action id, so source identity is the second idempotency guard. */
  if (findLatestActiveTaskAward(normalized, entry.source)) return normalized;
  return { ...normalized, entries: [...normalized.entries, entry] };
}

export function reverseLatestTaskAward(ledger, source, { id, occurredAt = null } = {}) {
  const normalized = normalizeMotivationLedger(ledger);
  const reversalId = requiredString(id, "reversal id");
  if (normalized.entries.some((entry) => entry.id === reversalId)) return normalized;
  const award = findLatestActiveTaskAward(normalized, source);
  if (!award) return normalized;
  const reversal = normalizeEntry({
    id: reversalId,
    kind: "reversal",
    reason: "task-reopened",
    amount: -award.amount,
    policyVersion: award.policyVersion,
    source: award.source,
    occurredAt,
    planningDate: award.planningDate,
    reversalOf: award.id,
  });
  return { ...normalized, entries: [...normalized.entries, reversal] };
}
import { assertDateKey } from "../../../shared/time/dateKey.js";
