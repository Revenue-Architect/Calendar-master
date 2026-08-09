import { addDaysToKey, assertDateKey } from "../../../shared/time/dateKey.js";
import { addMinutesToLocalDateTime } from "../../../shared/time/localDateTime.js";
import { validatePlannerStateV5 } from "./validatePlannerStateV5.js";

export const DEFAULT_CALENDAR = Object.freeze({
  id: "calendar-default",
  name: "My Calendar",
  status: "active",
  role: "owner",
  isDefault: true,
  isVisible: true,
  includeInAvailability: true,
});

const pad = (value) => String(value).padStart(2, "0");

function localAt(dateKey, minute) {
  assertDateKey(dateKey);
  if (!Number.isInteger(minute) || minute < 0) throw new TypeError("legacy event start must be a non-negative integer");
  return addMinutesToLocalDateTime(`${dateKey}T00:00`, minute);
}

function migrateRecurrence(repeat) {
  if (!repeat) return null;
  return {
    frequency: repeat.freq,
    interval: Number(repeat.interval || 1),
    weekStart: 0,
    ...(Array.isArray(repeat.byDay) ? { byWeekday: [...repeat.byDay] } : {}),
    ...(repeat.until ? { until: repeat.until } : {}),
    missingDatePolicy: "skip",
  };
}

function migrateEvent(event) {
  const {
    date, start, dur, allDay, endDate, repeat,
    timing: ignoredTiming, calendarId: ignoredCalendarId,
    ...metadata
  } = event;
  const timing = allDay
    ? {
      kind: "all-day",
      startDate: assertDateKey(date, "event date"),
      endDateExclusive: addDaysToKey(assertDateKey(endDate || date, "event end date"), 1),
    }
    : {
      kind: "timed",
      timeZoneMode: "floating",
      startLocal: localAt(date, Number(start)),
      endLocal: localAt(date, Number(start) + Number(dur)),
    };
  return {
    ...metadata,
    calendarId: "calendar-default",
    timing,
    recurrence: migrateRecurrence(repeat),
    revision: Number.isInteger(event.revision) && event.revision > 0 ? event.revision : 1,
  };
}

function migrateOverrides(overrides, events) {
  const eventIds = new Set(events.map((event) => event.id));
  const taskOverrides = {};
  const eventExceptions = [];
  for (const [occurrenceId, override] of Object.entries(overrides || {})) {
    const separator = occurrenceId.lastIndexOf("@");
    const seriesId = separator > 0 ? occurrenceId.slice(0, separator) : "";
    const recurrenceAnchor = separator > 0 ? occurrenceId.slice(separator + 1) : "";
    if (!eventIds.has(seriesId)) {
      taskOverrides[occurrenceId] = { ...override };
      continue;
    }
    const { deleted, date, ...patch } = override;
    eventExceptions.push({
      id: `migrated:${occurrenceId}`,
      occurrenceId,
      seriesId,
      recurrenceAnchor,
      type: deleted ? "cancelled" : date && date !== recurrenceAnchor ? "moved" : "modified",
      ...(deleted ? {} : { patch: { ...patch, ...(date ? { date } : {}) } }),
      revision: 1,
    });
  }
  return { taskOverrides, eventExceptions };
}

export function migrateV4ToV5(state) {
  if (!state || typeof state !== "object") throw new TypeError("v4 planner state must be an object");
  const sourceEvents = Array.isArray(state.events) ? state.events : [];
  const events = sourceEvents.map(migrateEvent);
  const { taskOverrides, eventExceptions } = migrateOverrides(state.overrides, sourceEvents);
  const migrated = {
    ...state,
    schemaVersion: 5,
    calendars: [{ ...DEFAULT_CALENDAR }],
    events,
    eventExceptions,
    occurrenceAliases: [],
    overrides: taskOverrides,
    tasks: Array.isArray(state.tasks) ? state.tasks.map((task) => structuredClone(task)) : [],
    notes: Array.isArray(state.notes) ? state.notes.map((note) => structuredClone(note)) : [],
  };
  return validatePlannerStateV5(migrated);
}
