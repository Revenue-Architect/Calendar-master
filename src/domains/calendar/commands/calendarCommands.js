import { legacyEventInputToCanonical, normalizeEventInput } from "../model/event.js";
import { occursOn, splitOccurrenceId } from "../recurrence/recurrence.js";
import {
  addMinutesToLocalDateTime,
  localDateTimeToEpochMinutes,
} from "../../../shared/time/localDateTime.js";
import { addDaysToKey } from "../../../shared/time/dateKey.js";
import { timingLocalBounds } from "../model/timing.js";

function minuteOf(localDateTime) {
  const [hour, minute] = localDateTime.slice(11).split(":").map(Number);
  return hour * 60 + minute;
}

function timingFromLegacyPatch(baseTiming, patch) {
  if (!Object.keys(patch).some((key) => ["date", "start", "dur", "allDay", "endDate"].includes(key))) {
    return null;
  }
  const bounds = timingLocalBounds(baseTiming);
  const currentDate = bounds.start.slice(0, 10);
  const currentStart = minuteOf(bounds.start);
  const currentDuration = localDateTimeToEpochMinutes(bounds.end) - localDateTimeToEpochMinutes(bounds.start);
  const allDay = patch.allDay ?? baseTiming.kind === "all-day";
  const date = patch.date || currentDate;
  if (allDay) {
    const currentEnd = baseTiming.kind === "all-day" ? addDaysToKey(baseTiming.endDateExclusive, -1) : date;
    return { kind: "all-day", startDate: date, endDateExclusive: addDaysToKey(patch.endDate || currentEnd, 1) };
  }
  const start = patch.start ?? currentStart;
  const duration = patch.dur ?? currentDuration;
  const startLocal = addMinutesToLocalDateTime(`${date}T00:00`, start);
  return {
    kind: "timed", timeZoneMode: baseTiming.timeZoneMode === "zoned" ? "zoned" : "floating",
    startLocal,
    endLocal: addMinutesToLocalDateTime(startLocal, duration),
    ...(baseTiming.timeZoneMode === "zoned" ? { timeZone: baseTiming.timeZone } : {}),
  };
}

function commandState(state) {
  return {
    ...state,
    events: Array.isArray(state?.events) ? state.events : [],
    overrides: state?.overrides ? { ...state.overrides } : {},
  };
}

function baseEvent(state, seriesId) {
  const event = state.events.find((candidate) => candidate.id === seriesId);
  if (!event) throw new Error(`calendar event ${seriesId} was not found`);
  return event;
}

function eventNotice(type, event, occurrenceId = null) {
  return {
    type,
    aggregateId: event.seriesId || event.id,
    occurrenceId,
  };
}

function result(state, event, removed, domainEvents) {
  return {
    state,
    event: event || null,
    removed: removed || null,
    domainEvents,
  };
}

function normalizedPatch(base, existingOverride, patch, recurrenceDate = null) {
  const merged = normalizeEventInput({
    ...base,
    ...existingOverride,
    ...patch,
    date: patch.date || existingOverride?.date || recurrenceDate || base.date,
    repeat: recurrenceDate ? null : (patch.repeat ?? base.repeat),
  });
  if (recurrenceDate) merged.repeat = base.repeat;
  const next = {};
  for (const key of Object.keys(patch)) {
    if (!recurrenceDate || key !== "repeat") next[key] = merged[key];
  }
  if (Object.hasOwn(patch, "allDay")) {
    next.start = merged.start;
    next.dur = merged.dur;
    next.endDate = merged.endDate;
  }
  return { merged, patch: next };
}

export function createEvent(state, input, options = {}) {
  const id = options.id;
  if (typeof id !== "string" || !id.trim() || id.includes("@")) {
    throw new TypeError("createEvent requires a non-empty ID without @");
  }
  const next = commandState(state);
  if (next.events.some((event) => event.id === id)) {
    throw new Error(`calendar event ${id} already exists`);
  }

  const event = { ...legacyEventInputToCanonical(input), id };
  next.events = [...next.events, event];
  return result(next, event, null, [eventNotice("EventCreated", event)]);
}

export function updateEvent(state, eventId, patch, options = {}) {
  const next = commandState(state);
  const { seriesId, recurrenceDate } = splitOccurrenceId(eventId);
  const base = baseEvent(next, seriesId);
  const scope = recurrenceDate && options.scope !== "series" ? "occurrence" : "series";

  if (base.timing) {
    if (scope === "occurrence") {
      throw new Error("canonical occurrence edits require the typed occurrence command");
    }
    let timing = patch.timing || timingFromLegacyPatch(base.timing, patch) || base.timing;
    if (patch.startLocal && base.timing.kind === "timed") {
      const duration = localDateTimeToEpochMinutes(base.timing.endLocal)
        - localDateTimeToEpochMinutes(base.timing.startLocal);
      timing = {
        ...base.timing,
        startLocal: patch.startLocal,
        endLocal: addMinutesToLocalDateTime(patch.startLocal, duration),
      };
    }
    const {
      startLocal, date, start, dur, allDay, endDate,
      repeat, ...metadataPatch
    } = patch;
    if (repeat !== undefined) {
      metadataPatch.recurrence = repeat ? {
        frequency: repeat.freq, interval: repeat.interval || 1, weekStart: 0,
        ...(repeat.byDay ? { byWeekday: [...repeat.byDay] } : {}),
        ...(repeat.until ? { until: repeat.until } : {}),
        missingDatePolicy: "skip",
      } : null;
    }
    const event = {
      ...normalizeEventInput({ ...base, ...metadataPatch, timing }),
      id: seriesId,
      revision: (base.revision || 1) + 1,
    };
    next.events = next.events.map((candidate) => candidate.id === seriesId ? event : candidate);
    return result(next, event, null, [eventNotice("EventChanged", event)]);
  }

  if (scope === "occurrence") {
    if (!base.repeat || !occursOn(base, recurrenceDate)) {
      throw new Error(`${eventId} is not an occurrence of calendar event ${seriesId}`);
    }
    const previous = next.overrides[eventId] || {};
    const normalized = normalizedPatch(base, previous, patch, recurrenceDate);
    next.overrides[eventId] = { ...previous, ...normalized.patch };
    const event = {
      ...normalized.merged,
      id: eventId,
      seriesId,
      recurrenceDate,
      instance: true,
    };
    return result(next, event, null, [eventNotice("OccurrenceChanged", event, eventId)]);
  }

  const seriesPatch = { ...patch };
  if (recurrenceDate && !options.changeSeriesStart) delete seriesPatch.date;
  const event = { ...normalizeEventInput({ ...base, ...seriesPatch }), id: seriesId };
  next.events = next.events.map((candidate) => candidate.id === seriesId ? event : candidate);
  return result(next, event, null, [eventNotice("EventChanged", event)]);
}

export function moveEvent(state, eventId, target, options = {}) {
  const updated = updateEvent(state, eventId, target, {
    ...options,
    changeSeriesStart: options.scope === "series",
  });
  return {
    ...updated,
    domainEvents: [eventNotice("EventMoved", updated.event, splitOccurrenceId(eventId).recurrenceDate ? eventId : null)],
  };
}

export function resizeEvent(state, eventId, duration, options = {}) {
  const { seriesId } = splitOccurrenceId(eventId);
  const event = state.events.find((candidate) => candidate.id === seriesId);
  if (event?.timing?.kind === "timed") {
    if (!Number.isInteger(duration) || duration <= 0) throw new RangeError("duration must be positive minutes");
    return updateEvent(state, eventId, {
      timing: {
        ...event.timing,
        endLocal: addMinutesToLocalDateTime(event.timing.startLocal, duration),
        ...(event.timing.timeZoneMode === "zoned" ? { endOffset: undefined } : {}),
      },
    }, options);
  }
  const updated = updateEvent(state, eventId, { dur: duration }, options);
  return {
    ...updated,
    domainEvents: [eventNotice("EventChanged", updated.event, splitOccurrenceId(eventId).recurrenceDate ? eventId : null)],
  };
}

export function deleteEvent(state, eventId, options = {}) {
  const next = commandState(state);
  const { seriesId, recurrenceDate } = splitOccurrenceId(eventId);
  const event = baseEvent(next, seriesId);
  const occurrenceOnly = recurrenceDate && options.scope !== "series";

  if (occurrenceOnly) {
    if (!event.repeat || !occursOn(event, recurrenceDate)) {
      throw new Error(`${eventId} is not an occurrence of calendar event ${seriesId}`);
    }
    const hadOverride = Object.hasOwn(next.overrides, eventId);
    const previousOverride = hadOverride ? { ...next.overrides[eventId] } : null;
    next.overrides[eventId] = { ...(next.overrides[eventId] || {}), deleted: true };
    const removed = { kind: "occurrence", occurrenceId: eventId, hadOverride, previousOverride };
    return result(next, null, removed, [eventNotice("EventDeleted", event, eventId)]);
  }

  if (event.timing) {
    const eventExceptions = Array.isArray(next.eventExceptions) ? next.eventExceptions : [];
    const removedExceptions = eventExceptions.filter((item) => item.seriesId === seriesId);
    next.events = next.events.filter((candidate) => candidate.id !== seriesId);
    next.eventExceptions = eventExceptions.filter((item) => item.seriesId !== seriesId);
    const removed = { kind: "canonical-series", event: structuredClone(event), eventExceptions: structuredClone(removedExceptions) };
    return result(next, null, removed, [eventNotice("EventDeleted", event)]);
  }

  const seriesOverrides = {};
  const remainingOverrides = {};
  const prefix = `${seriesId}@`;
  for (const [id, override] of Object.entries(next.overrides)) {
    if (id.startsWith(prefix)) seriesOverrides[id] = { ...override };
    else remainingOverrides[id] = override;
  }
  next.events = next.events.filter((candidate) => candidate.id !== seriesId);
  next.overrides = remainingOverrides;
  const removed = { kind: "series", event: { ...event }, overrides: seriesOverrides };
  return result(next, null, removed, [eventNotice("EventDeleted", event)]);
}

export function restoreEvent(state, snapshot) {
  const next = commandState(state);
  if (snapshot?.kind === "occurrence") {
    if (snapshot.hadOverride) next.overrides[snapshot.occurrenceId] = { ...snapshot.previousOverride };
    else delete next.overrides[snapshot.occurrenceId];
    const { seriesId } = splitOccurrenceId(snapshot.occurrenceId);
    const event = baseEvent(next, seriesId);
    return result(next, event, null, [eventNotice("OccurrenceChanged", event, snapshot.occurrenceId)]);
  }

  if (snapshot?.kind === "series" && snapshot.event) {
    if (next.events.some((event) => event.id === snapshot.event.id)) {
      throw new Error(`calendar event ${snapshot.event.id} already exists`);
    }
    next.events = [...next.events, { ...snapshot.event }];
    next.overrides = { ...next.overrides, ...snapshot.overrides };
    return result(next, snapshot.event, null, [eventNotice("EventCreated", snapshot.event)]);
  }

  if (snapshot?.kind === "canonical-series" && snapshot.event) {
    if (next.events.some((event) => event.id === snapshot.event.id)) {
      throw new Error(`calendar event ${snapshot.event.id} already exists`);
    }
    next.events = [...next.events, structuredClone(snapshot.event)];
    next.eventExceptions = [...(next.eventExceptions || []), ...structuredClone(snapshot.eventExceptions || [])];
    return result(next, snapshot.event, null, [eventNotice("EventCreated", snapshot.event)]);
  }

  throw new TypeError("restoreEvent requires a Calendar deletion snapshot");
}
