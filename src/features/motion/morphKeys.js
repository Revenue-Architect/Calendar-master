/**
 * Calendar Master — Semantic Morph Keys
 *
 * Implements deterministic, collision-free, reversible motion identities for
 * physical spatial choreography and object morphing across Day, Week, Actions,
 * Composer, Notes, and unfoldable controls.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §5
 */

function encodeComponent(val) {
  if (val == null) return "";
  return encodeURIComponent(String(val));
}

function decodeComponent(val) {
  if (!val) return "";
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

/**
 * Creates a unique motion key for an Event card / occurrence.
 * Differentiates recurring occurrences, views (day vs week), and timeline lanes.
 *
 * Uses tagged components so occurrenceId, eventId, and dateKey are never
 * concatenated raw — each field is individually encoded under its own tag.
 */
export function eventMorphKey({
  occurrenceId,
  eventId,
  dateKey,
  view = "day",
  lane = "timeline",
} = {}) {
  if (!occurrenceId && !eventId) {
    throw new Error("eventMorphKey requires occurrenceId or eventId");
  }
  const encView = encodeComponent(view);
  const encLane = encodeComponent(lane);

  if (occurrenceId) {
    // Tagged occurrence identity: morph:event:occ:<encoded>:v:<view>:l:<lane>
    return `morph:event:occ:${encodeComponent(occurrenceId)}:v:${encView}:l:${encLane}`;
  }
  // Tagged event+date identity: morph:event:id:<encoded eventId>:d:<encoded dateKey>:v:<view>:l:<lane>
  const encId = encodeComponent(eventId);
  const encDate = dateKey ? encodeComponent(dateKey) : "";
  if (encDate) {
    return `morph:event:id:${encId}:d:${encDate}:v:${encView}:l:${encLane}`;
  }
  return `morph:event:id:${encId}:v:${encView}:l:${encLane}`;
}

/**
 * Creates a unique motion key for an Action / Task card.
 */
export function taskMorphKey({
  taskId,
  view = "timeline",
  listId,
} = {}) {
  if (!taskId) {
    throw new Error("taskMorphKey requires taskId");
  }
  const encId = encodeComponent(taskId);
  const encView = encodeComponent(view);
  const listPart = listId ? `:list:${encodeComponent(listId)}` : "";
  return `morph:task:${encId}:v:${encView}${listPart}`;
}

/**
 * Creates a unique motion key for a Note card or block.
 */
export function noteMorphKey({
  noteId,
  context = "notebook",
} = {}) {
  if (!noteId) {
    throw new Error("noteMorphKey requires noteId");
  }
  const encId = encodeComponent(noteId);
  const encCtx = encodeComponent(context);
  return `morph:note:${encId}:ctx:${encCtx}`;
}

/**
 * Creates a unique motion key for an empty slot or timeline coordinate
 * where creation / Composer originates.
 */
export function slotMorphKey({
  view = "day",
  dateKey,
  startMinute = 0,
  lane = "timeline",
} = {}) {
  if (!dateKey) {
    throw new Error("slotMorphKey requires dateKey");
  }
  const encView = encodeComponent(view);
  const encDate = encodeComponent(dateKey);
  const encMin = encodeComponent(startMinute);
  const encLane = encodeComponent(lane);
  return `morph:slot:v:${encView}:d:${encDate}:m:${encMin}:l:${encLane}`;
}

/**
 * Creates a unique motion key for an unfolding control (Plus, More, Search, Filter).
 */
export function controlMorphKey({
  controlId,
  view = "bar",
} = {}) {
  if (!controlId) {
    throw new Error("controlMorphKey requires controlId");
  }
  const encId = encodeComponent(controlId);
  const encView = encodeComponent(view);
  return `morph:control:${encId}:v:${encView}`;
}

/**
 * Parses and decodes a morph key back into its semantic descriptors.
 */
export function parseMorphKey(key) {
  if (typeof key !== "string" || !key.startsWith("morph:")) {
    return null;
  }
  const parts = key.split(":");
  if (parts.length < 3) return null;

  const kind = parts[1];
  const descriptor = {
    key,
    kind,
  };

  if (kind === "slot") {
    // format: morph:slot:v:<view>:d:<date>:m:<min>:l:<lane>
    for (let i = 2; i < parts.length; i += 2) {
      const tag = parts[i];
      const val = decodeComponent(parts[i + 1]);
      if (tag === "v") descriptor.view = val;
      else if (tag === "d") descriptor.dateKey = val;
      else if (tag === "m") descriptor.startMinute = Number(val);
      else if (tag === "l") descriptor.lane = val;
    }
  } else if (kind === "event") {
    // Tagged event formats:
    //   morph:event:occ:<occurrenceId>:v:<view>:l:<lane>
    //   morph:event:id:<eventId>:d:<dateKey>:v:<view>:l:<lane>
    //   morph:event:id:<eventId>:v:<view>:l:<lane>
    const subTag = parts[2];
    if (subTag === "occ") {
      descriptor.occurrenceId = decodeComponent(parts[3]);
      descriptor.id = descriptor.occurrenceId;
      for (let i = 4; i < parts.length; i += 2) {
        const tag = parts[i];
        const val = decodeComponent(parts[i + 1]);
        if (tag === "v") descriptor.view = val;
        else if (tag === "l") descriptor.lane = val;
      }
    } else if (subTag === "id") {
      descriptor.eventId = decodeComponent(parts[3]);
      descriptor.id = descriptor.eventId;
      for (let i = 4; i < parts.length; i += 2) {
        const tag = parts[i];
        const val = decodeComponent(parts[i + 1]);
        if (tag === "d") {
          descriptor.dateKey = val;
        } else if (tag === "v") descriptor.view = val;
        else if (tag === "l") descriptor.lane = val;
      }
    } else {
      // Legacy fallback: morph:event:<id>:v:<view>:l:<lane>
      descriptor.id = decodeComponent(subTag);
      for (let i = 3; i < parts.length; i += 2) {
        const tag = parts[i];
        const val = decodeComponent(parts[i + 1]);
        if (tag === "v") descriptor.view = val;
        else if (tag === "l") descriptor.lane = val;
      }
    }
  } else {
    // Generic format: morph:<kind>:<id>[:<tag>:<val>...]
    descriptor.id = decodeComponent(parts[2]);
    for (let i = 3; i < parts.length; i += 2) {
      const tag = parts[i];
      const val = decodeComponent(parts[i + 1]);
      if (tag === "v") descriptor.view = val;
      else if (tag === "l") descriptor.lane = val;
      else if (tag === "ctx") descriptor.context = val;
      else if (tag === "list") descriptor.listId = val;
    }
  }

  return descriptor;
}

/**
 * Checks if two keys represent the same business object, regardless of view or lane.
 */
export function isSameBusinessObject(keyA, keyB) {
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  const parsedA = parseMorphKey(keyA);
  const parsedB = parseMorphKey(keyB);
  if (!parsedA || !parsedB) return false;
  if (parsedA.kind !== parsedB.kind) return false;

  if (parsedA.kind === "slot") {
    return (
      parsedA.dateKey === parsedB.dateKey &&
      parsedA.startMinute === parsedB.startMinute &&
      parsedA.lane === parsedB.lane
    );
  }

  if (parsedA.kind === "event") {
    if (parsedA.occurrenceId || parsedB.occurrenceId) {
      return parsedA.occurrenceId === parsedB.occurrenceId;
    }
    return (
      parsedA.eventId === parsedB.eventId &&
      parsedA.dateKey === parsedB.dateKey
    );
  }

  return parsedA.id === parsedB.id;
}
