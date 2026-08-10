import test from "node:test";
import assert from "node:assert/strict";
import { eventNoteLink, taskNoteLink } from "./contextLink.js";

test("a canonical recurring event note uses the stable series id and anchor date", () => {
  assert.deepEqual(eventNoteLink({
    id: "occ.v1.series.anchor", seriesId: "series", recurrenceAnchor: "2026-08-09T09:00", title: "Standup",
  }), {
    type: "event", targetId: "series", occurrenceDate: "2026-08-09", label: "Standup",
  });
});

test("an added event occurrence uses its visible day when it has no recurrence anchor", () => {
  assert.deepEqual(eventNoteLink({
    id: "added-occurrence", seriesId: "series", instance: true, date: "2026-08-10", title: "Make-up meeting",
  }), {
    type: "event", targetId: "series", occurrenceDate: "2026-08-10", label: "Make-up meeting",
  });
});

test("a rendered recurring task note targets its canonical task series", () => {
  assert.deepEqual(taskNoteLink({ id: "habit@2026-08-09", title: "Walk" }), {
    type: "task", targetId: "habit", occurrenceDate: null, label: "Walk",
  });
});
