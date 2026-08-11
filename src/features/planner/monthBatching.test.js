import assert from "node:assert/strict";
import test from "node:test";

import { busyFractionForDay, busyFractionsForRange, monthDensitiesForRange } from "./weekProjection.js";
import { createBlankPlannerState } from "../../platform/persistence/plannerStateImport.js";
import { createEvent } from "../../domains/calendar/index.js";
import { createTask, planTask } from "../../domains/tasks/index.js";
import { getVisibleOccurrencesForRange } from "../../domains/calendar/index.js";
import { getDayTasks } from "../../domains/tasks/index.js";
import { addDaysToKey } from "../../shared/time/dateKey.js";

/* The month grid used to ask the domain two questions per cell — 84 range
 * queries a step, each re-expanding the same six weeks of recurrence. The
 * batched versions ask once and hand back a lookup.
 *
 * A speedup that quietly changes an answer is not a speedup, so this does not
 * assert what the numbers are. It asserts that the batched pass and the per-day
 * one agree, across a notebook with recurring events, multi-day events, events
 * that run past midnight, and tasks — for every day of a six-week grid.
 */

const START = "2026-08-01";
const DAYS = 42;

function notebook() {
  let state = createBlankPlannerState({});
  const event = (title, startLocal, endLocal, recurrence = null) => {
    state = createEvent(state, {
      calendarId: "calendar-default", title, category: "DEEP WORK",
      timing: { kind: "timed", timeZoneMode: "floating", startLocal, endLocal },
      ...(recurrence ? { recurrence } : {}),
    }, { id: `evt-${title.replace(/\W/g, "")}-${startLocal}` }).state;
  };

  event("Daily standup", "2026-08-03T09:00", "2026-08-03T09:15",
    { frequency: "daily", interval: 1, weekStart: 0, missingDatePolicy: "skip" });
  event("Weekly review", "2026-08-07T15:00", "2026-08-07T17:00",
    { frequency: "weekly", interval: 1, weekStart: 0, missingDatePolicy: "skip",
      byWeekday: [{ weekday: 5, ordinal: null }] });
  event("Deep block", "2026-08-11T09:00", "2026-08-11T13:00");
  /* Runs past midnight: it has to count on both days, in both implementations. */
  event("Night shift", "2026-08-14T21:00", "2026-08-15T07:00");
  /* Entirely outside the 06:00-22:00 window, so it must count for nothing. */
  event("Insomnia", "2026-08-18T01:00", "2026-08-18T04:00");
  /* Overlapping pair: the union is what counts, not the sum. */
  event("Overlap A", "2026-08-20T10:00", "2026-08-20T12:00");
  event("Overlap B", "2026-08-20T11:00", "2026-08-20T14:00");

  for (const [id, date] of [["t1", "2026-08-05"], ["t2", "2026-08-05"], ["t3", "2026-08-21"]]) {
    state = { ...state, tasks: createTask(state.tasks, { id, title: `Task ${id}` }).tasks };
    state = { ...state, tasks: planTask(state.tasks, id, { date, startMinute: null, estimateMinutes: null }).tasks };
  }
  return state;
}

const perDayDensity = (state, key) => getVisibleOccurrencesForRange(state, key, addDaysToKey(key, 1)).length
  + getDayTasks(state, key).filter((task) => task.status !== "completed").length;

test("the batched density agrees with asking one day at a time, for all 42 cells", () => {
  const state = notebook();
  const batched = monthDensitiesForRange(state, START, DAYS);
  let key = START;
  for (let i = 0; i < DAYS; i += 1) {
    assert.equal(batched.get(key), perDayDensity(state, key), `density disagreed on ${key}`);
    key = addDaysToKey(key, 1);
  }
});

test("the batched busy fraction agrees with asking one day at a time, for all 42 cells", () => {
  const state = notebook();
  const batched = busyFractionsForRange(state, START, DAYS);
  let key = START;
  for (let i = 0; i < DAYS; i += 1) {
    assert.equal(batched.get(key), busyFractionForDay(state, key), `busy fraction disagreed on ${key}`);
    key = addDaysToKey(key, 1);
  }
});

test("every day of the grid gets an answer, including the empty ones", () => {
  const state = notebook();
  const density = monthDensitiesForRange(state, START, DAYS);
  const busy = busyFractionsForRange(state, START, DAYS);
  assert.equal(density.size, DAYS);
  assert.equal(busy.size, DAYS);
  for (const value of busy.values()) assert.ok(value >= 0 && value <= 1);
  for (const value of density.values()) assert.ok(Number.isInteger(value) && value >= 0);
});

test("an event that runs past midnight counts on both sides of it", () => {
  const state = notebook();
  const busy = busyFractionsForRange(state, START, DAYS);
  assert.ok(busy.get("2026-08-14") > 0, "the evening of the night shift");
  assert.ok(busy.get("2026-08-15") > 0, "and the morning after");
  assert.equal(busy.get("2026-08-14"), busyFractionForDay(state, "2026-08-14"));
  assert.equal(busy.get("2026-08-15"), busyFractionForDay(state, "2026-08-15"));
});

test("overlapping events are a union, not a sum", () => {
  /* 10-12 and 11-14 is four booked hours, not five. On its own notebook, so the
     number is the thing under test rather than the sum of everything else. */
  let state = createBlankPlannerState({});
  for (const [id, start, end] of [["a", "10:00", "12:00"], ["b", "11:00", "14:00"]]) {
    state = createEvent(state, {
      calendarId: "calendar-default", title: `Overlap ${id}`, category: "DEEP WORK",
      timing: { kind: "timed", timeZoneMode: "floating", startLocal: `2026-08-20T${start}`, endLocal: `2026-08-20T${end}` },
    }, { id: `evt-overlap-${id}` }).state;
  }
  assert.equal(busyFractionsForRange(state, START, DAYS).get("2026-08-20"), 4 * 60 / (16 * 60));
  assert.equal(busyFractionsForRange(state, START, DAYS).get("2026-08-20"), busyFractionForDay(state, "2026-08-20"));
});

test("a notebook with nothing in it produces zeros, not gaps", () => {
  const state = createBlankPlannerState({});
  const busy = busyFractionsForRange(state, START, DAYS);
  const density = monthDensitiesForRange(state, START, DAYS);
  assert.equal(busy.size, DAYS);
  assert.deepEqual([...new Set(busy.values())], [0]);
  assert.deepEqual([...new Set(density.values())], [0]);
});

test("no state, or no days, is an empty lookup rather than a throw", () => {
  assert.equal(busyFractionsForRange(null, START, DAYS).size, 0);
  assert.equal(monthDensitiesForRange(null, START, DAYS).size, 0);
  assert.equal(busyFractionsForRange(createBlankPlannerState({}), START, 0).size, 0);
  assert.equal(monthDensitiesForRange(createBlankPlannerState({}), START, 0).size, 0);
});
