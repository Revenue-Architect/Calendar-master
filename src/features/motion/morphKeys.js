/**
 * Calendar Master — Semantic Morph Keys
 *
 * Implements deterministic, collision-free motion identities for physical
 * spatial choreography and object morphing across Day, Week, Actions, and Composer.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §5
 */

function sanitizeComponent(val) {
  if (val == null) return "";
  return String(val).replace(/[:/]/g, "_");
}

/**
 * Creates a unique motion key for an Event card / occurrence.
 * Differentiates recurring occurrences, views (day vs week), and timeline lanes.
 */
export function eventMorphKey({
  occurrenceId,
  eventId,
  dateKey,
  view = "day",
  lane = "timeline",
} = {}) {
  const primaryId = occurrenceId || (eventId && dateKey ? `${eventId}@${dateKey}` : eventId);
  if (!primaryId) {
    throw new Error("eventMorphKey requires occurrenceId or eventId");
  }
  const cleanId = sanitizeComponent(primaryId);
  const cleanView = sanitizeComponent(view);
  const cleanLane = sanitizeComponent(lane);
  return `morph:event:${cleanId}:v:${cleanView}:l:${cleanLane}`;
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
  const cleanId = sanitizeComponent(taskId);
  const cleanView = sanitizeComponent(view);
  const listPart = listId ? `:list:${sanitizeComponent(listId)}` : "";
  return `morph:task:${cleanId}:v:${cleanView}${listPart}`;
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
  const cleanId = sanitizeComponent(noteId);
  const cleanCtx = sanitizeComponent(context);
  return `morph:note:${cleanId}:ctx:${cleanCtx}`;
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
  const cleanView = sanitizeComponent(view);
  const cleanDate = sanitizeComponent(dateKey);
  const cleanMin = sanitizeComponent(startMinute);
  const cleanLane = sanitizeComponent(lane);
  return `morph:slot:v:${cleanView}:d:${cleanDate}:m:${cleanMin}:l:${cleanLane}`;
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
  const cleanId = sanitizeComponent(controlId);
  const cleanView = sanitizeComponent(view);
  return `morph:control:${cleanId}:v:${cleanView}`;
}

/**
 * Extracts kind and primary ID from a morph key.
 */
export function parseMorphKey(key) {
  if (typeof key !== "string" || !key.startsWith("morph:")) {
    return null;
  }
  const parts = key.split(":");
  const kind = parts[1];
  return {
    key,
    kind,
    rawParts: parts.slice(2),
  };
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
  return parsedA.rawParts[0] === parsedB.rawParts[0];
}
