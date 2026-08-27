import test from "node:test";
import assert from "node:assert/strict";

import { parseMorphKey } from "./morphKeys.js";
import { createEventInspectorOpener, createEventMorphOrigin } from "./eventMorphOrigin.js";

test("creates distinct Day, Week, and all-day identities for one ordinary Event", () => {
  const event = { id: "event-planning", date: "2026-08-27", instance: false };

  const day = createEventMorphOrigin(event, { view: "day", lane: "timeline" });
  const week = createEventMorphOrigin(event, { view: "week", lane: "timeline" });
  const allDay = createEventMorphOrigin(event, { view: "day", lane: "allday" });

  assert.equal(day.key, "morph:event:id:event-planning:d:2026-08-27:v:day:l:timeline");
  assert.equal(week.key, "morph:event:id:event-planning:d:2026-08-27:v:week:l:timeline");
  assert.notEqual(day.key, week.key, "the active Day and Week cards must never compete for one source slot");
  assert.notEqual(day.key, allDay.key, "a Day all-day row is a distinct physical source from the timed card");
  assert.deepEqual(day, {
    key: day.key,
    eventId: "event-planning",
    dateKey: "2026-08-27",
    view: "day",
    lane: "timeline",
  });
});

test("uses a recurring occurrence identity instead of collapsing it to the series event id", () => {
  const event = {
    id: "occ.v1.c3RhbmR1cA.MjAyNi0wOC0yN1QwOTowMA",
    seriesId: "standup",
    date: "2026-08-27",
    instance: true,
  };

  const origin = createEventMorphOrigin(event, { view: "week", lane: "timeline" });
  const parsed = parseMorphKey(origin.key);

  assert.equal(parsed.occurrenceId, event.id);
  assert.equal(parsed.eventId, undefined);
  assert.equal(origin.eventId, event.id);
  assert.equal(origin.dateKey, "2026-08-27");
  assert.equal(origin.view, "week");
});

test("keeps a segmented all-day card separate from its timed timeline source", () => {
  const event = { id: "project-kickoff", date: "2026-08-27", instance: false };

  const allDay = createEventMorphOrigin(event, { view: "week", lane: "allday" });
  const timeline = createEventMorphOrigin(event, { view: "week", lane: "timeline" });

  assert.notEqual(allDay.key, timeline.key);
  assert.equal(parseMorphKey(allDay.key).lane, "allday");
});

test("fails closed when a rendered Event has no semantic identity", () => {
  assert.equal(createEventMorphOrigin(null, { view: "day" }), null);
  assert.equal(createEventMorphOrigin({ id: "event-1" }, { view: "day" }), null);
  assert.equal(createEventMorphOrigin({ date: "2026-08-27" }, { view: "day" }), null);
});

test("the Inspector opener carries the same semantic key as its physical source", () => {
  const event = { id: "occurrence-42", date: "2026-08-27", instance: true };
  const opened = [];
  let beeps = 0;
  const open = createEventInspectorOpener({
    beep: () => { beeps += 1; },
    setInspect: (value) => opened.push(value),
    dateKey: "2026-08-27",
    view: "week",
    lane: "timeline",
  });

  open(event);
  assert.equal(beeps, 1);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].id, event.id);
  assert.equal(opened[0].morphOrigin.key, createEventMorphOrigin(event, {
    dateKey: event.date,
    view: "week",
    lane: "timeline",
  }).key);

  open({ date: "2026-08-27" });
  assert.equal(beeps, 1, "an invalid Event must not produce feedback or an Inspector request");
  assert.equal(opened.length, 1);
});
