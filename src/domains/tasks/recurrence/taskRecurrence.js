import { addDaysToKey, assertDateKey, diffDays, parseKey } from "../../../shared/time/dateKey.js";
import { TaskValidationError } from "../model/taskStatus.js";

/* §9.2. Occurrence identity is reversible and derived from the series id plus the
   occurrence date, so an instance can be referenced without ever materialising
   future instances into storage (§9.5). */
const SEPARATOR = "@";

export function makeTaskOccurrenceId(seriesId, occurrenceDate) {
  assertDateKey(occurrenceDate, "occurrenceDate");
  return `${seriesId}${SEPARATOR}${occurrenceDate}`;
}

export function parseTaskOccurrenceId(occurrenceId) {
  const index = String(occurrenceId).lastIndexOf(SEPARATOR);
  if (index === -1) return { seriesId: occurrenceId, occurrenceDate: null };
  return {
    seriesId: occurrenceId.slice(0, index),
    occurrenceDate: occurrenceId.slice(index + 1),
  };
}

/* The series anchor is the planned date: recurrence describes when the user intends
   to do the work, not when it is due. A recurring task with no planned date has no
   schedule to repeat and therefore yields nothing. */
export function seriesAnchor(task) {
  return task?.planned?.date ?? null;
}

export function occursOn(task, dateKey) {
  assertDateKey(dateKey);
  const rule = task.recurrence;
  const anchor = seriesAnchor(task);
  if (!rule || !anchor) return false;
  if (dateKey < anchor) return false;
  if (rule.until && dateKey > rule.until) return false;

  const interval = Math.max(1, rule.interval || 1);
  const target = parseKey(dateKey);
  const start = parseKey(anchor);

  if (rule.frequency === "daily") {
    return diffDays(dateKey, anchor) % interval === 0;
  }
  if (rule.frequency === "weekly") {
    const days = rule.byWeekday?.length ? rule.byWeekday : [start.getDay()];
    if (!days.includes(target.getDay())) return false;
    /* Week index is measured from the anchor's own week so an every-2-weeks rule
       stays in phase regardless of which weekday the anchor fell on. */
    const anchorWeekStart = addDaysToKey(anchor, -start.getDay());
    return Math.floor(diffDays(dateKey, anchorWeekStart) / 7) % interval === 0;
  }
  if (rule.frequency === "monthly") {
    if (target.getDate() !== start.getDate()) return false;
    const months = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
    return months % interval === 0;
  }
  if (rule.frequency === "yearly") {
    if (target.getDate() !== start.getDate() || target.getMonth() !== start.getMonth()) return false;
    return (target.getFullYear() - start.getFullYear()) % interval === 0;
  }
  return false;
}

function exceptionFor(exceptions, seriesId, occurrenceDate) {
  return exceptions.find((entry) => entry.seriesId === seriesId && entry.occurrenceDate === occurrenceDate) ?? null;
}

/* Builds the actionable instance for one date. Returns null when the occurrence was
   cancelled, so callers never have to know about exception shapes. */
export function materializeOccurrence(task, occurrenceDate, exceptions = []) {
  const exception = exceptionFor(exceptions, task.id, occurrenceDate);
  if (exception?.kind === "cancelled") return null;
  const patch = exception?.patch ?? {};
  const completed = exception?.kind === "completed";
  return {
    ...task,
    ...patch,
    id: makeTaskOccurrenceId(task.id, occurrenceDate),
    seriesId: task.id,
    occurrenceDate,
    isOccurrence: true,
    planned: { ...task.planned, ...(patch.planned ?? {}), date: occurrenceDate },
    status: completed ? "completed" : patch.status ?? "open",
    completedAt: completed ? exception.completedAt ?? null : null,
  };
}

/* §9.3. The policies differ only in which unfinished past instances stay actionable:
   `skip` lets them go, `accumulate` keeps every one, and `roll_forward` carries the
   single latest one to today. Nothing here writes state — a missed instance is the
   absence of a completion record, not a stored row. */
export function unfinishedBefore(task, todayKey, exceptions = [], lookbackDays = 60) {
  const policy = task.recurrence?.missedPolicy ?? "skip";
  if (policy === "skip") return [];
  const missed = [];
  for (let back = 1; back <= lookbackDays; back += 1) {
    const dateKey = addDaysToKey(todayKey, -back);
    if (seriesAnchor(task) && dateKey < seriesAnchor(task)) break;
    if (!occursOn(task, dateKey)) continue;
    const instance = materializeOccurrence(task, dateKey, exceptions);
    if (instance && instance.status !== "completed") missed.push(instance);
  }
  if (policy === "roll_forward") return missed.slice(0, 1);
  return missed;
}

export function expandTaskOccurrences(task, startKey, endKeyExclusive, exceptions = []) {
  assertDateKey(startKey, "startKey");
  assertDateKey(endKeyExclusive, "endKeyExclusive");
  if (!task.recurrence) return [];
  const out = [];
  for (let dateKey = startKey; dateKey < endKeyExclusive; dateKey = addDaysToKey(dateKey, 1)) {
    if (!occursOn(task, dateKey)) continue;
    const instance = materializeOccurrence(task, dateKey, exceptions);
    if (instance) out.push(instance);
  }
  return out;
}

export function normalizeTaskException(input) {
  if (!input || typeof input !== "object") {
    throw new TaskValidationError([{ field: "taskException", message: "must be an object" }]);
  }
  if (!["modified", "cancelled", "completed"].includes(input.kind)) {
    throw new TaskValidationError([{ field: "taskException.kind", message: "must be modified, cancelled, or completed" }]);
  }
  return {
    id: input.id,
    seriesId: input.seriesId,
    occurrenceDate: assertDateKey(input.occurrenceDate, "taskException.occurrenceDate"),
    kind: input.kind,
    patch: input.patch ?? {},
    completedAt: input.completedAt ?? null,
  };
}

/* §9.4/§9.5. Scoped writes against a series. `one` records a typed exception and
   leaves earlier completion history untouched; `all` edits the series itself. */
export function upsertTaskException(exceptions, exception) {
  const normalized = normalizeTaskException(exception);
  const index = exceptions.findIndex(
    (entry) => entry.seriesId === normalized.seriesId && entry.occurrenceDate === normalized.occurrenceDate,
  );
  if (index === -1) return [...exceptions, normalized];
  const next = [...exceptions];
  next[index] = { ...next[index], ...normalized };
  return next;
}

/* Exceptions belong to a series and cannot outlive it: a stored exception whose
   series is missing fails whole-notebook validation, and once validation fails
   nothing saves at all. Deleting a series must take its exceptions with it. */
export function removeTaskExceptionsForSeries(exceptions, seriesIds) {
  const gone = seriesIds instanceof Set ? seriesIds : new Set(seriesIds ?? []);
  return (exceptions ?? []).filter((entry) => !gone.has(entry.seriesId));
}

export function taskExceptionsForSeries(exceptions, seriesIds) {
  const gone = seriesIds instanceof Set ? seriesIds : new Set(seriesIds ?? []);
  return (exceptions ?? []).filter((entry) => gone.has(entry.seriesId));
}

export function removeTaskException(exceptions, seriesId, occurrenceDate) {
  return exceptions.filter(
    (entry) => !(entry.seriesId === seriesId && entry.occurrenceDate === occurrenceDate),
  );
}
