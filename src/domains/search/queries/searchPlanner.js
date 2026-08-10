import { blocksToText, noteExcerpt } from "../../notes/index.js";
import { diffDays, isDateKey } from "../../../shared/time/dateKey.js";
import { normalizeSearchText, parseSearchQuery } from "../query/searchQuery.js";

const EMPTY = Object.freeze([]);

function text(value) {
  return normalizeSearchText(value);
}

function firstDate(...values) {
  return values.find(isDateKey) ?? null;
}

function dateDistance(date, todayDate) {
  if (!isDateKey(date) || !isDateKey(todayDate)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(diffDays(date, todayDate));
}

function eventDate(event) {
  if (event.timing?.kind === "all-day") return event.timing.startDate;
  if (event.timing?.kind === "timed") return event.timing.startLocal.slice(0, 10);
  return event.date ?? null;
}

function candidate(kind, record, { title, excerpt, date, dates = EMPTY, status = null, tags = EMPTY, lists = EMPTY, calendars = EMPTY, fields = EMPTY, recurrence = false }) {
  return {
    kind,
    id: record.id,
    title: title || "Untitled",
    excerpt: excerpt || "",
    date,
    dates,
    status,
    tags,
    lists,
    calendars,
    fields: [title, ...fields].filter(Boolean).map(text),
    target: { entityId: record.id, preferredDate: date, occurrenceId: null },
    recurrence,
  };
}

function projectEvents(events) {
  return events
    .filter((event) => event.status !== "cancelled")
    .map((event) => candidate("event", event, {
      title: event.title,
      excerpt: event.place || event.location || event.note || event.description || "",
      date: eventDate(event),
      dates: eventDate(event) ? [text(eventDate(event))] : EMPTY,
      status: event.status ?? null,
      calendars: event.calendarId ? [text(event.calendarId)] : EMPTY,
      fields: [event.place, event.location, event.note, event.description, event.category, event.calendarId],
      recurrence: Boolean(event.recurrence),
    }));
}

function projectTasks(tasks) {
  return tasks
    .filter((task) => task.status !== "archived")
    .map((task) => candidate("task", task, {
      title: task.title,
      excerpt: task.note || "",
      date: firstDate(task.planned?.date, task.deadline?.date, task.followUpDate),
      dates: [task.planned?.date, task.deadline?.date, task.followUpDate].filter(isDateKey).map(text),
      status: text(task.status),
      tags: (task.tags ?? []).map(text),
      lists: task.listId ? [text(task.listId)] : EMPTY,
      fields: [task.note, task.category, ...(task.tags ?? []), ...(task.checklist ?? []).map((item) => item.title)],
      recurrence: Boolean(task.recurrence),
    }));
}

function projectNotes(notes) {
  return notes
    .filter((note) => !note.archived)
    .map((note) => {
      const body = blocksToText(note.blocks ?? []);
      return candidate("note", note, {
        title: note.title || noteExcerpt({ ...note, blocks: note.blocks ?? [] }, 80),
        excerpt: body,
        date: note.date ?? null,
        dates: isDateKey(note.date) ? [text(note.date)] : EMPTY,
        tags: (note.tags ?? []).map(text),
        fields: [body, ...(note.tags ?? []), note.kind, ...(note.links ?? []).map((link) => link.targetId)],
      });
    });
}

function matchesAny(values, wanted) {
  return wanted.length === 0 || values.some((value) => wanted.includes(value));
}

function matchesFilters(item, filters) {
  if (filters.types.length && !filters.types.includes(item.kind)) return false;
  if (filters.statuses.length && (item.kind !== "task" || !filters.statuses.includes(item.status))) return false;
  if (!matchesAny(item.tags, filters.tags)) return false;
  if (!matchesAny(item.dates, filters.dates)) return false;
  if (!matchesAny(item.lists, filters.lists)) return false;
  if (!matchesAny(item.calendars, filters.calendars)) return false;
  return true;
}

function matchTier(item, terms) {
  if (terms.length === 0) return { tier: 4, field: "filter" };
  const title = text(item.title);
  const phrase = terms.join(" ");
  if (title === phrase) return { tier: 0, field: "title" };
  if (title.startsWith(phrase)) return { tier: 1, field: "title" };
  if (terms.every((term) => title.includes(term))) return { tier: 2, field: "title" };
  if (terms.every((term) => item.fields.some((field) => field.includes(term)))) {
    return { tier: 3, field: "content" };
  }
  return null;
}

function compareResults(todayDate) {
  return (left, right) => (
    left.match.tier - right.match.tier
    || dateDistance(left.date, todayDate) - dateDistance(right.date, todayDate)
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id)
  );
}

function publicResult(item, match) {
  const { fields, dates, lists, calendars, ...result } = item;
  return { ...result, match };
}

export function searchPlanner(state, { query, todayDate, limit = 30 } = {}) {
  const parsed = parseSearchQuery(query);
  if (parsed.terms.length === 0 && Object.values(parsed.filters).every((values) => values.length === 0)) {
    return { query: parsed, results: [] };
  }
  const count = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 30;
  const results = [
    ...projectEvents(state?.events ?? []),
    ...projectTasks(state?.tasks ?? []),
    ...projectNotes(state?.notes ?? []),
  ].filter((item) => matchesFilters(item, parsed.filters))
    .map((item) => ({ item, match: matchTier(item, parsed.terms) }))
    .filter((entry) => entry.match)
    .map(({ item, match }) => publicResult(item, match))
    .sort(compareResults(todayDate))
    .slice(0, count);

  return { query: parsed, results };
}
