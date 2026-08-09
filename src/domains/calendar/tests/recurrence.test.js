import test from "node:test";
import assert from "node:assert/strict";

import {
  expandEventOnDay,
  makeOccurrenceId,
  occursOn,
  splitOccurrenceId,
} from "../recurrence/recurrence.js";

const daily = {
  id: "daily",
  date: "2026-08-01",
  title: "Morning pages",
  start: 420,
  dur: 30,
  repeat: { freq: "daily", interval: 1 },
};

test("occurrence identity round-trips a series and recurrence date", () => {
  assert.equal(makeOccurrenceId("series-1", "2026-08-05"), "series-1@2026-08-05");
  assert.deepEqual(splitOccurrenceId("series-1@2026-08-05"), {
    seriesId: "series-1",
    recurrenceDate: "2026-08-05",
  });
  assert.deepEqual(splitOccurrenceId("series-1"), {
    seriesId: "series-1",
    recurrenceDate: null,
  });
});

test("weekly recurrence uses selected weekdays and interval from the start week", () => {
  const event = {
    ...daily,
    id: "weekly",
    date: "2026-08-03",
    repeat: { freq: "weekly", interval: 2, byDay: [1, 3] },
  };
  assert.equal(occursOn(event, "2026-08-03"), true);
  assert.equal(occursOn(event, "2026-08-05"), true);
  assert.equal(occursOn(event, "2026-08-10"), false);
  assert.equal(occursOn(event, "2026-08-17"), true);
});

test("monthly recurrence skips months without the original day", () => {
  const event = {
    ...daily,
    id: "month-end",
    date: "2026-01-31",
    repeat: { freq: "monthly", interval: 1 },
  };
  assert.equal(occursOn(event, "2026-02-28"), false);
  assert.equal(occursOn(event, "2026-03-31"), true);
});

test("weekly recurrence keeps a stable occurrence ID and applies one exception", () => {
  const event = {
    ...daily,
    id: "series-1",
    date: "2026-08-03",
    title: "Standup",
    start: 540,
    repeat: { freq: "weekly", interval: 1, byDay: [1, 3] },
  };
  const overrides = {
    "series-1@2026-08-05": { start: 600, title: "Late standup" },
  };
  const [occurrence] = expandEventOnDay(event, "2026-08-05", overrides);
  assert.equal(occurrence.id, "series-1@2026-08-05");
  assert.equal(occurrence.seriesId, "series-1");
  assert.equal(occurrence.recurrenceDate, "2026-08-05");
  assert.equal(occurrence.date, "2026-08-05");
  assert.equal(occurrence.start, 600);
  assert.equal(occurrence.title, "Late standup");
  assert.equal(occurrence.instance, true);
});

test("a deleted exception suppresses only its occurrence", () => {
  const overrides = { "daily@2026-08-10": { deleted: true } };
  assert.equal(expandEventOnDay(daily, "2026-08-10", overrides).length, 0);
  assert.equal(expandEventOnDay(daily, "2026-08-11", overrides).length, 1);
});

test("a moved exception keeps its original identity alongside the target date occurrence", () => {
  const overrides = { "daily@2026-08-10": { date: "2026-08-12", start: 600 } };
  assert.equal(expandEventOnDay(daily, "2026-08-10", overrides).length, 0);
  const occurrences = expandEventOnDay(daily, "2026-08-12", overrides);
  assert.deepEqual(occurrences.map((event) => event.id), [
    "daily@2026-08-12",
    "daily@2026-08-10",
  ]);
  const moved = occurrences.find((event) => event.recurrenceDate === "2026-08-10");
  assert.equal(moved.id, "daily@2026-08-10");
  assert.equal(moved.recurrenceDate, "2026-08-10");
  assert.equal(moved.date, "2026-08-12");
  assert.equal(moved.start, 600);
});

test("a multi-day all-day event appears on every inclusive legacy date", () => {
  const event = {
    id: "offsite",
    date: "2026-08-09",
    endDate: "2026-08-11",
    title: "Offsite",
    allDay: true,
    start: 0,
    dur: 0,
  };
  assert.equal(expandEventOnDay(event, "2026-08-08").length, 0);
  assert.equal(expandEventOnDay(event, "2026-08-09").length, 1);
  assert.equal(expandEventOnDay(event, "2026-08-11").length, 1);
  assert.equal(expandEventOnDay(event, "2026-08-12").length, 0);
});
