import { resolveSearchTarget, searchPlanner } from "../../domains/search/index.js";

export function projectPlannerSearch(state, { query, todayDate, limit = 30 } = {}) {
  return searchPlanner(state, { query, todayDate, limit });
}

export function resolvePlannerSearchPick(state, result, { todayDate } = {}) {
  const target = resolveSearchTarget(state, result, { todayDate });
  if (target.status !== "available") return target;
  if (target.kind === "note") {
    return { status: "available", noteId: target.entityId, date: target.date };
  }
  return {
    status: "available",
    inspect: { kind: target.kind, id: target.occurrenceId ?? target.entityId },
    date: target.date,
  };
}

export function searchResultDateLabel(result, formatDate) {
  if (result.recurrence) return "REPEAT";
  if (result.date) return formatDate(result.date);
  if (result.kind === "task") return "INBOX";
  return result.kind === "note" ? "NOTE" : "EVENT";
}
