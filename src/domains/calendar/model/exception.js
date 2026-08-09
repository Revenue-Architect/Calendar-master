import { normalizeEventInput } from "./event.js";
import { normalizeTiming } from "./timing.js";

const TYPES = new Set(["modified", "moved", "cancelled", "added"]);

export function normalizeException(input, series) {
  if (!input || typeof input !== "object") throw new TypeError("exception is required");
  if (!TYPES.has(input.type)) throw new TypeError("exception type is invalid");
  if (typeof input.id !== "string" || !input.id) throw new TypeError("exception id is required");
  if (input.seriesId !== series.id) throw new TypeError("exception series does not match");
  const revision = Number(input.revision ?? 1);
  if (!Number.isInteger(revision) || revision < 1) throw new TypeError("exception revision must be positive");
  if (input.type === "added") {
    if (typeof input.occurrenceId !== "string" || !input.occurrenceId) throw new TypeError("added occurrence ID is required");
    return {
      id: input.id, type: "added", seriesId: series.id,
      occurrenceId: input.occurrenceId,
      event: normalizeEventInput({ ...input.event, recurrence: null }),
      revision,
    };
  }
  if (typeof input.recurrenceAnchor !== "string" || !input.recurrenceAnchor) throw new TypeError("recurrence anchor is required");
  const base = {
    id: input.id, type: input.type, seriesId: series.id,
    occurrenceId: input.occurrenceId,
    recurrenceAnchor: input.recurrenceAnchor,
    revision,
  };
  if (input.type === "moved") return { ...base, timing: normalizeTiming(input.timing), ...(input.patch ? { patch: structuredClone(input.patch) } : {}) };
  if (input.type === "modified") return { ...base, patch: structuredClone(input.patch || {}) };
  return base;
}
