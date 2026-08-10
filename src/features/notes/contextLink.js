import { parseTaskOccurrenceId } from "../../domains/tasks/index.js";

/* The day surface renders occurrences, but a note must survive a redraw, a move,
   and a recurrence expansion. These adapters turn UI records back into the stable
   identities owned by Calendar and Tasks. */
export function eventNoteLink(event) {
  /* Added occurrences have no recurrence anchor. Their rendered date is the
     durable occurrence context available to the current link schema. */
  const occurrenceDate = event.recurrenceAnchor?.slice(0, 10) ?? event.recurrenceDate ?? (event.instance ? event.date ?? null : null);
  return {
    type: "event",
    targetId: event.seriesId || event.id,
    occurrenceDate,
    label: event.title,
  };
}

export function taskNoteLink(task) {
  return {
    type: "task",
    targetId: parseTaskOccurrenceId(task.id).seriesId,
    occurrenceDate: null,
    label: task.title,
  };
}
