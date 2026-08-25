import test from "node:test";
import assert from "node:assert/strict";
import {
  eventMorphKey,
  taskMorphKey,
  noteMorphKey,
  slotMorphKey,
  controlMorphKey,
  parseMorphKey,
  isSameBusinessObject,
} from "./morphKeys.js";

test("eventMorphKey generates deterministic keys and prevents collisions", () => {
  const dayKey = eventMorphKey({ occurrenceId: "occ-1", view: "day", lane: "timeline" });
  const weekKey = eventMorphKey({ occurrenceId: "occ-1", view: "week", lane: "timeline" });
  const alldayKey = eventMorphKey({ occurrenceId: "occ-1", view: "day", lane: "allday" });

  assert.equal(dayKey, "morph:event:occ-1:v:day:l:timeline");
  assert.equal(weekKey, "morph:event:occ-1:v:week:l:timeline");
  assert.equal(alldayKey, "morph:event:occ-1:v:day:l:allday");

  // Verify view and lane distinguish distinct render sources
  assert.notEqual(dayKey, weekKey);
  assert.notEqual(dayKey, alldayKey);

  // Recurring series instances on different dates generate distinct keys
  const recurring1 = eventMorphKey({ eventId: "evt-series", dateKey: "2026-08-25" });
  const recurring2 = eventMorphKey({ eventId: "evt-series", dateKey: "2026-08-26" });
  assert.notEqual(recurring1, recurring2);
  assert.equal(recurring1, "morph:event:evt-series@2026-08-25:v:day:l:timeline");
});

test("taskMorphKey distinguishes timeline vs list views", () => {
  const tTimeline = taskMorphKey({ taskId: "task-42", view: "timeline" });
  const tActions = taskMorphKey({ taskId: "task-42", view: "actions", listId: "inbox" });

  assert.equal(tTimeline, "morph:task:task-42:v:timeline");
  assert.equal(tActions, "morph:task:task-42:v:actions:list:inbox");
  assert.notEqual(tTimeline, tActions);
});

test("slotMorphKey generates distinct coordinates for empty creation slots", () => {
  const slot1 = slotMorphKey({ view: "day", dateKey: "2026-08-25", startMinute: 600 });
  const slot2 = slotMorphKey({ view: "day", dateKey: "2026-08-25", startMinute: 630 });
  const slotWeek = slotMorphKey({ view: "week", dateKey: "2026-08-25", startMinute: 600 });

  assert.equal(slot1, "morph:slot:v:day:d:2026-08-25:m:600:l:timeline");
  assert.equal(slot2, "morph:slot:v:day:d:2026-08-25:m:630:l:timeline");
  assert.notEqual(slot1, slot2);
  assert.notEqual(slot1, slotWeek);
});

test("parseMorphKey and isSameBusinessObject correctly correlate render sources to business entities", () => {
  const dayKey = eventMorphKey({ occurrenceId: "occ-99", view: "day" });
  const weekKey = eventMorphKey({ occurrenceId: "occ-99", view: "week" });
  const otherKey = eventMorphKey({ occurrenceId: "occ-100", view: "day" });

  const parsed = parseMorphKey(dayKey);
  assert.equal(parsed.kind, "event");

  assert.ok(isSameBusinessObject(dayKey, weekKey), "Day and Week views of the same occurrence share business identity");
  assert.ok(!isSameBusinessObject(dayKey, otherKey), "Different occurrences must not match");
});

test("negative control: missing IDs or malformed inputs throw early", () => {
  assert.throws(() => eventMorphKey({}), /requires occurrenceId or eventId/);
  assert.throws(() => taskMorphKey({}), /requires taskId/);
  assert.throws(() => noteMorphKey({}), /requires noteId/);
  assert.throws(() => slotMorphKey({}), /requires dateKey/);
  assert.throws(() => controlMorphKey({}), /requires controlId/);
  assert.equal(parseMorphKey("invalid-string"), null);
});
