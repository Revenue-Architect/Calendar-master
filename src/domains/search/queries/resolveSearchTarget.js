import { getNextEventOccurrence } from "../../calendar/index.js";
import { getNote } from "../../notes/index.js";
import { getNextTaskOccurrence } from "../../tasks/index.js";

function unavailable(kind, entityId, reason) {
  return { status: "unavailable", kind, entityId, reason };
}

function eventDate(event) {
  if (event.timing?.kind === "all-day") return event.timing.startDate;
  if (event.timing?.kind === "timed") return event.timing.startLocal.slice(0, 10);
  return event.date ?? null;
}

function targetIdentity(result) {
  const entityId = result?.target?.entityId ?? result?.id ?? null;
  return typeof entityId === "string" && entityId ? entityId : null;
}

export function resolveSearchTarget(state, result, { todayDate } = {}) {
  const kind = result?.kind;
  const entityId = targetIdentity(result);
  if (!["event", "task", "note"].includes(kind) || !entityId) {
    return unavailable(kind ?? "unknown", entityId, "missing");
  }

  if (kind === "event") {
    const event = (state?.events ?? []).find((item) => item.id === entityId);
    if (!event || event.status === "cancelled") return unavailable(kind, entityId, "missing");
    if (!event.recurrence) {
      return { status: "available", kind, entityId, occurrenceId: null, date: eventDate(event) };
    }
    const occurrence = getNextEventOccurrence(state, entityId, todayDate);
    if (!occurrence) return unavailable(kind, entityId, "no-upcoming-occurrence");
    return {
      status: "available", kind, entityId, occurrenceId: occurrence.id,
      date: eventDate(occurrence),
    };
  }

  if (kind === "task") {
    const task = (state?.tasks ?? []).find((item) => item.id === entityId);
    if (!task) return unavailable(kind, entityId, "missing");
    if (task.status === "archived") return unavailable(kind, entityId, "archived");
    if (!task.recurrence) {
      return { status: "available", kind, entityId, occurrenceId: null, date: task.planned?.date ?? null };
    }
    const occurrence = getNextTaskOccurrence(state, entityId, todayDate);
    if (!occurrence) return unavailable(kind, entityId, "no-upcoming-occurrence");
    return {
      status: "available", kind, entityId, occurrenceId: occurrence.id,
      date: occurrence.occurrenceDate,
    };
  }

  const note = getNote(state?.notes ?? [], entityId);
  if (!note) return unavailable(kind, entityId, "missing");
  if (note.archived) return unavailable(kind, entityId, "archived");
  return { status: "available", kind, entityId, occurrenceId: null, date: note.date ?? null };
}
