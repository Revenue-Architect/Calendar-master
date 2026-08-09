import { normalizeEventInput } from "../model/event.js";
import { occursOn, splitOccurrenceId } from "../recurrence/recurrence.js";

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

  const event = { ...normalizeEventInput(input), id };
  next.events = [...next.events, event];
  return result(next, event, null, [eventNotice("EventCreated", event)]);
}

export function updateEvent(state, eventId, patch, options = {}) {
  const next = commandState(state);
  const { seriesId, recurrenceDate } = splitOccurrenceId(eventId);
  const base = baseEvent(next, seriesId);
  const scope = recurrenceDate && options.scope !== "series" ? "occurrence" : "series";

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

  throw new TypeError("restoreEvent requires a Calendar deletion snapshot");
}
