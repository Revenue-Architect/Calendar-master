import { TaskValidationError } from "./taskStatus.js";

/* §8. A checklist item is deliberately lighter than a subtask: no schedule, deadline,
   reminder, recurrence or history of its own. When a step needs any of those it is
   promoted to a real subtask (§8.4) rather than growing fields here. */

export function normalizeChecklistItem(input, index = 0) {
  if (!input || typeof input !== "object") {
    throw new TaskValidationError([{ field: "checklistItem", message: "must be an object" }]);
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    throw new TaskValidationError([{ field: "checklistItem.title", message: "is required" }]);
  }
  if (typeof input.id !== "string" || !input.id) {
    throw new TaskValidationError([{ field: "checklistItem.id", message: "is required" }]);
  }
  const done = input.done === true;
  return {
    id: input.id,
    title,
    done,
    /* §8.3 records when, not just whether. A completed item with no timestamp is
       data from before this field existed, so it stays null rather than guessing. */
    completedAt: done ? input.completedAt ?? null : null,
    order: Number.isInteger(input.order) ? input.order : index,
  };
}

export function normalizeChecklist(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new TaskValidationError([{ field: "checklist", message: "must be an array" }]);
  }
  const seen = new Set();
  const items = input.map((item, index) => {
    const normalized = normalizeChecklistItem(item, index);
    if (seen.has(normalized.id)) {
      throw new TaskValidationError([{ field: "checklist", message: `duplicate item ${normalized.id}` }]);
    }
    seen.add(normalized.id);
    return normalized;
  });
  /* §8.2 ordering has to survive reloads, so rank is normalised to a dense sequence
     on the way in instead of relying on array position alone. */
  return items
    .sort((left, right) => left.order - right.order)
    .map((item, index) => ({ ...item, order: index }));
}

export function checklistProgress(checklist) {
  const items = checklist ?? [];
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}
