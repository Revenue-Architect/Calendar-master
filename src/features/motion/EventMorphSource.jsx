import React, { useMemo } from "react";

import { createEventMorphOrigin } from "./eventMorphOrigin.js";
import { useMorphSource } from "./useMorphSource.js";

/* Deliberately adds no wrapper and no interaction behavior. The existing Event
   card remains the pointer/focus owner; this only gives the registry its stable
   physical node and semantic identity. */
export default function EventMorphSource({ origin, event, dateKey, view, lane, children }) {
  /* Week projection recreates its small origin objects during ordinary renders.
     Memoising by scalar semantic fields leaves the registry metadata stable
     without trusting object identity from a parent map. */
  const resolvedOrigin = useMemo(() => origin?.key
    ? origin
    : createEventMorphOrigin(event, { dateKey, view, lane }), [
    origin?.key,
    origin?.eventId,
    origin?.dateKey,
    origin?.view,
    origin?.lane,
    event?.id,
    event?.instance,
    dateKey,
    view,
    lane,
  ]);
  const ref = useMorphSource({
    key: resolvedOrigin?.key,
    kind: "event",
    meta: resolvedOrigin,
    enabled: Boolean(resolvedOrigin?.key),
  });

  return React.cloneElement(children, {
    ref,
    "data-morph-key": resolvedOrigin?.key,
  });
}
