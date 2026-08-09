import { normalizeTaskInput, DEFAULT_LIST_ID, INBOX_LIST_ID } from "../model/task.js";
import { validatePlannerStateV6 } from "./validatePlannerStateV6.js";

export const DEFAULT_TASK_LISTS = Object.freeze([
  Object.freeze({ id: INBOX_LIST_ID, name: "Inbox", isSystem: true, isDefault: false, order: 0 }),
  Object.freeze({ id: DEFAULT_LIST_ID, name: "Actions", isSystem: false, isDefault: true, order: 1 }),
]);

let counter = 0;
const nextId = (prefix) => `${prefix}-${(counter += 1).toString(36)}`;

function migrateRecurrence(repeat) {
  if (!repeat) return null;
  return {
    frequency: repeat.freq ?? repeat.frequency,
    interval: Number(repeat.interval || 1),
    ...(Array.isArray(repeat.byDay) ? { byWeekday: [...repeat.byDay] } : {}),
    ...(Array.isArray(repeat.byWeekday) ? { byWeekday: [...repeat.byWeekday] } : {}),
    ...(repeat.until ? { until: repeat.until } : {}),
    /* §9.3. Existing repeating tasks were producing one overdue row per missed day.
       They migrate to `skip`, which is the policy that behaviour should always have
       had — habits do not accrue debt. */
    missedPolicy: repeat.missedPolicy ?? "skip",
  };
}

/* Legacy subs were a flat done/not-done list with no planning fields of their own,
   which is exactly a checklist (§8), not a subtask. They migrate to checklist items
   so nothing claims capabilities it never had; promotion (§8.4) is how a step earns
   real subtask identity later. */
function migrateChecklist(subs) {
  if (!Array.isArray(subs)) return [];
  return subs.map((sub, index) => ({
    id: sub.id ?? nextId("chk"),
    title: sub.title,
    done: sub.done === true,
    completedAt: null,
    order: index,
  }));
}

function migrateTask(task) {
  return normalizeTaskInput({
    id: task.id,
    listId: task.listId ?? DEFAULT_LIST_ID,
    parentTaskId: task.parentTaskId ?? null,
    title: task.title,
    status: task.status ?? (task.done ? "completed" : "open"),
    planned: { date: task.date ?? null, startMinute: task.at ?? null, estimateMinutes: null },
    deadline: { date: task.due ?? null, minute: null },
    priority: task.priority ?? "none",
    someday: task.someday === true,
    tags: Array.isArray(task.tags) ? task.tags : [],
    category: task.cat ?? task.category ?? null,
    note: task.note ?? "",
    checklist: migrateChecklist(task.subs ?? task.checklist),
    recurrence: migrateRecurrence(task.repeat ?? task.recurrence),
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
    rank: Number.isInteger(task.order) ? task.order : task.rank ?? 0,
    reward: Number.isInteger(task.xp) ? task.xp : 0,
    completedAt: task.completedAt ?? null,
  });
}

/* v5 kept per-occurrence task edits in the shared `overrides` map keyed `id@date`.
   v6 promotes those to typed task exceptions (§9.4) and leaves `overrides` holding
   calendar entries only. */
function migrateOverrides(overrides, taskIds) {
  const remaining = {};
  const exceptions = [];
  for (const [key, patch] of Object.entries(overrides ?? {})) {
    const index = key.lastIndexOf("@");
    const seriesId = index === -1 ? key : key.slice(0, index);
    const occurrenceDate = index === -1 ? null : key.slice(index + 1);
    if (!occurrenceDate || !taskIds.has(seriesId)) {
      remaining[key] = patch;
      continue;
    }
    if (patch?.deleted) {
      exceptions.push({ id: nextId("tex"), seriesId, occurrenceDate, kind: "cancelled", patch: {} });
    } else if (patch?.done) {
      exceptions.push({ id: nextId("tex"), seriesId, occurrenceDate, kind: "completed", patch: {}, completedAt: null });
    } else {
      exceptions.push({ id: nextId("tex"), seriesId, occurrenceDate, kind: "modified", patch: patch ?? {} });
    }
  }
  return { remaining, exceptions };
}

export function migrateV5ToV6(state) {
  if (!state || typeof state !== "object") throw new TypeError("planner state must be an object");
  const legacyTasks = Array.isArray(state.tasks) ? state.tasks : [];
  const taskIds = new Set(legacyTasks.map((task) => task.id));
  const { remaining, exceptions } = migrateOverrides(state.overrides, taskIds);

  const migrated = {
    ...state,
    schemaVersion: 6,
    taskLists: Array.isArray(state.taskLists) && state.taskLists.length
      ? state.taskLists
      : DEFAULT_TASK_LISTS.map((list) => ({ ...list })),
    tasks: legacyTasks.map(migrateTask),
    taskExceptions: Array.isArray(state.taskExceptions) ? state.taskExceptions : exceptions,
    overrides: remaining,
  };
  return validatePlannerStateV6(migrated);
}
