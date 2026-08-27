import { useCallback, useEffect, useRef } from "react";

import { eventMorphKey } from "./morphKeys.js";

/**
 * Builds the immutable semantic identity shared by an Event card and the
 * Inspector it opens. `instance` distinguishes a recurring occurrence from a
 * normal event whose projection also carries a seriesId for domain lookups.
 */
export function createEventMorphOrigin(event, {
  dateKey = event?.date,
  view = "day",
  lane = "timeline",
} = {}) {
  if (!event?.id || !dateKey) return null;

  const occurrenceId = event.instance ? event.id : null;
  const key = eventMorphKey({
    occurrenceId: occurrenceId || undefined,
    eventId: occurrenceId ? undefined : event.id,
    dateKey,
    view,
    lane,
  });

  return Object.freeze({
    key,
    eventId: event.id,
    dateKey,
    view,
    lane,
  });
}

/** Creates a click/tap handler without coupling timeline gesture ownership to motion. */
export function createEventInspectorOpener({ beep, setInspect, dateKey, view, lane }) {
  return (event, { keyboard = false } = {}) => {
    if (!event?.id) return;
    beep("click");
    setInspect({
      kind: "event",
      id: event.id,
      morphOrigin: createEventMorphOrigin(event, { dateKey: event.date ?? dateKey, view, lane }),
      /* A key opens the same Inspector but must not invent a spatial origin.
         The pointer gesture remains the only authority for physical travel. */
      motion: keyboard ? "instant" : undefined,
    });
  };
}

/* Week cards may need the selected Day to catch up before its Inspector record
   can resolve. Keep that one deferred handoff owned and cancellable, rather
   than leaving a timer able to reopen a stale Event after navigation. */
export function useDeferredEventInspector({ beep, setInspect }) {
  const timerRef = useRef(null);
  const requestRef = useRef(0);

  const cancelPendingEventOpen = useCallback(() => {
    requestRef.current += 1;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => cancelPendingEventOpen, [cancelPendingEventOpen]);

  const openDeferredEventInspector = useCallback((event, origin, { dateKey, onNavigate, instant = false }) => {
    if (!event?.id) return;
    cancelPendingEventOpen();
    const targetDate = origin?.dateKey ?? event.date ?? dateKey;
    const resolvedOrigin = origin ?? createEventMorphOrigin(event, {
      dateKey: targetDate,
      view: "week",
      lane: "timeline",
    });
    beep("click");
    if (targetDate !== dateKey) onNavigate(targetDate);
    const request = ++requestRef.current;
    timerRef.current = setTimeout(() => {
      if (request !== requestRef.current) return;
      timerRef.current = null;
      setInspect({
        kind: "event",
        id: event.id,
        morphOrigin: resolvedOrigin,
        motion: instant ? "instant" : undefined,
      });
    }, targetDate !== dateKey ? 80 : 0);
  }, [beep, cancelPendingEventOpen, setInspect]);

  return { cancelPendingEventOpen, openDeferredEventInspector };
}
