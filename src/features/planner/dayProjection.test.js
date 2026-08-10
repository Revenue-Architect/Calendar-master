import assert from "node:assert/strict";
import test from "node:test";

import { projectPlannerDay } from "./dayProjection.js";

const TODAY = "2026-08-10";

function state() {
  return {
    events: [
      { id: "morning", title: "Morning call", date: TODAY, start: 600, dur: 30, allDay: false },
      { id: "afternoon", title: "Afternoon call", date: TODAY, start: 780, dur: 30, allDay: false },
    ],
    overrides: {},
    tasks: [
      {
        id: "today", title: "Plan today", status: "open", parentTaskId: null, rank: 0,
        planned: { date: TODAY, startMinute: null }, deadline: { date: null }, recurrence: null,
      },
    ],
    taskExceptions: [],
    notes: [],
  };
}

test("projects today with a mapped next event and domain-owned derived work", () => {
  const day = projectPlannerDay(state(), {
    selectedDate: TODAY,
    todayDate: TODAY,
    currentMinute: 620,
    mapEvent: (event) => ({ ...event, label: event.title.toUpperCase() }),
  });

  assert.equal(day.nextEvent.id, "afternoon");
  assert.equal(day.nextEvent.label, "AFTERNOON CALL");
  assert.equal(day.events[0].label, "MORNING CALL");
  assert.deepEqual(day.tasks.map((item) => item.id), ["today"]);
  assert.deepEqual(day.deadlines, []);
});

test("projects a past selected day without a next event", () => {
  const day = projectPlannerDay(state(), {
    selectedDate: "2026-08-09",
    todayDate: TODAY,
    currentMinute: 0,
  });

  assert.equal(day.nextEvent, null);
});

test("preserves available planner data when optional event and note sources are absent", () => {
  const partial = state();
  delete partial.events;
  delete partial.notes;

  const day = projectPlannerDay(partial, {
    selectedDate: TODAY,
    todayDate: TODAY,
    currentMinute: 0,
  });

  assert.equal(day.sections.events.status, "unavailable");
  assert.equal(day.sections.notes.status, "unavailable");
  assert.deepEqual(day.tasks.map((item) => item.id), ["today"]);
  assert.deepEqual(day.deadlines, []);
});
