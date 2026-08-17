import {
  normalizeTaskInput,
  parseTaskOccurrenceId,
  planTask,
  upsertTaskException,
} from "../../domains/tasks/index.js";

/* PLAN TODAY, as a function rather than a click handler.
 *
 * Overdue is a fact about a deadline, so planning overdue work for today makes it
 * actionable without un-missing the deadline — the task stays overdue and stays
 * on the list. That has one consequence worth naming: a task already planned onto
 * today is still overdue, so pulling it again would move nothing. Counting it
 * would promise "3 planned for today" and change one thing.
 *
 * The other case is a missed occurrence of an accumulating series. Its id is
 * `series@date`, which is not a row any command can find, so it is detached into
 * a real one-off first — the same way every other single-occurrence edit works —
 * and the detached task is what gets planned.
 *
 * `makeId` is injected so a test can assert the resulting state rather than a
 * shape with random ids in it.
 */

/** The overdue entries that planning today would actually move. */
export function pullableOverdue(overdue, todayKey) {
  return (overdue ?? []).filter((task) => task?.planned?.date !== todayKey);
}

/**
 * Plan pullable overdue entries onto an explicit day.
 *
 * @param {object} state     planner state
 * @param {Array}  overdue   the overdue read, unfiltered
 * @param {string} dateKey
 * @param {object} options
 * @param {Function} options.makeId  id factory for detached tasks and exceptions
 * @returns {{ state: object, planned: number }}
 */
export function planOverdueForDate(state, overdue, dateKey, { makeId } = {}) {
  if (typeof makeId !== "function") throw new TypeError("makeId is required");
  const entries = pullableOverdue(overdue, dateKey);
  if (!entries.length) return { state, planned: 0 };

  let staged = state;
  for (const entry of entries) {
    const { seriesId, occurrenceDate } = parseTaskOccurrenceId(entry.id);
    const series = occurrenceDate
      ? staged.tasks.find((task) => task.id === seriesId && task.recurrence)
      : null;

    if (!series) {
      staged = {
        ...staged,
        tasks: planTask(staged.tasks, entry.id, {
          date: dateKey,
          startMinute: entry.planned.startMinute ?? null,
          estimateMinutes: entry.planned.estimateMinutes ?? null,
        }).tasks,
      };
      continue;
    }

    const detachedId = makeId();
    const detached = normalizeTaskInput({
      ...series,
      id: detachedId,
      recurrence: null,
      planned: { ...series.planned, date: occurrenceDate },
    });
    staged = {
      ...staged,
      tasks: [...staged.tasks, detached],
      /* The occurrence is cancelled on the series so the same day cannot be
         owed twice — once as a missed occurrence and once as the detached task. */
      taskExceptions: upsertTaskException(staged.taskExceptions, {
        id: makeId(), seriesId, occurrenceDate, kind: "cancelled",
      }),
    };
    staged = {
      ...staged,
      tasks: planTask(staged.tasks, detachedId, {
        date: dateKey,
        startMinute: detached.planned.startMinute ?? null,
        estimateMinutes: detached.planned.estimateMinutes ?? null,
      }).tasks,
    };
  }

  return { state: staged, planned: entries.length };
}

export function planOverdueForToday(state, overdue, todayKey, options) {
  return planOverdueForDate(state, overdue, todayKey, options);
}
