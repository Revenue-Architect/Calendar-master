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

  assert.equal(dayKey, "morph:event:occ:occ-1:v:day:l:timeline");
  assert.equal(weekKey, "morph:event:occ:occ-1:v:week:l:timeline");
  assert.equal(alldayKey, "morph:event:occ:occ-1:v:day:l:allday");

  // Verify view and lane distinguish distinct render sources
  assert.notEqual(dayKey, weekKey);
  assert.notEqual(dayKey, alldayKey);

  // Recurring series instances on different dates generate distinct keys
  const recurring1 = eventMorphKey({ eventId: "evt-series", dateKey: "2026-08-25" });
  const recurring2 = eventMorphKey({ eventId: "evt-series", dateKey: "2026-08-26" });
  assert.notEqual(recurring1, recurring2);
  assert.equal(recurring1, "morph:event:id:evt-series:d:2026-08-25:v:day:l:timeline");
  const parsed = parseMorphKey(recurring1);
  assert.equal(parsed.eventId, "evt-series");
  assert.equal(parsed.dateKey, "2026-08-25");
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
  assert.equal(parsed.occurrenceId, "occ-99");

  assert.ok(isSameBusinessObject(dayKey, weekKey), "Day and Week views of the same occurrence share business identity");
  assert.ok(!isSameBusinessObject(dayKey, otherKey), "Different occurrences must not match");
});

test("reversible component encoding prevents collision between colons, slashes, and underscores", () => {
  const keyColon = eventMorphKey({ occurrenceId: "a:b" });
  const keyUnderscore = eventMorphKey({ occurrenceId: "a_b" });
  const keySlash = eventMorphKey({ occurrenceId: "a/b" });

  assert.notEqual(keyColon, keyUnderscore, "a:b and a_b must not collide");
  assert.notEqual(keySlash, keyUnderscore, "a/b and a_b must not collide");
  assert.notEqual(keyColon, keySlash, "a:b and a/b must not collide");

  // Reversibility check
  const parsedColon = parseMorphKey(keyColon);
  assert.equal(parsedColon.occurrenceId, "a:b");
  const parsedSlash = parseMorphKey(keySlash);
  assert.equal(parsedSlash.occurrenceId, "a/b");
  const parsedUnderscore = parseMorphKey(keyUnderscore);
  assert.equal(parsedUnderscore.occurrenceId, "a_b");
});

test("encoding handles percent signs, special characters, and Unicode safely without collision", () => {
  const keyPercent1 = taskMorphKey({ taskId: "100%_complete" });
  const keyPercent2 = taskMorphKey({ taskId: "100%25_complete" });
  assert.notEqual(keyPercent1, keyPercent2, "100% and 100%25 must not collide");

  const parsedPercent1 = parseMorphKey(keyPercent1);
  assert.equal(parsedPercent1.id, "100%_complete");

  const keyUnicode1 = eventMorphKey({ occurrenceId: "東京_standup" });
  const keyUnicode2 = eventMorphKey({ occurrenceId: "北京_standup" });
  assert.notEqual(keyUnicode1, keyUnicode2);

  const parsedUnicode1 = parseMorphKey(keyUnicode1);
  assert.equal(parsedUnicode1.occurrenceId, "東京_standup");
});

test("note and control positive key generation and parsing", () => {
  const nKey = noteMorphKey({ noteId: "note/urgent:1", context: "notebook:personal" });
  const cKey = controlMorphKey({ controlId: "btn/plus:new", view: "bar/mobile" });

  const parsedN = parseMorphKey(nKey);
  assert.equal(parsedN.kind, "note");
  assert.equal(parsedN.id, "note/urgent:1");

  const parsedC = parseMorphKey(cKey);
  assert.equal(parsedC.kind, "control");
  assert.equal(parsedC.id, "btn/plus:new");
});

test("negative control: missing IDs or malformed inputs throw early", () => {
  assert.throws(() => eventMorphKey({}), /requires occurrenceId or eventId/);
  assert.throws(() => taskMorphKey({}), /requires taskId/);
  assert.throws(() => noteMorphKey({}), /requires noteId/);
  assert.throws(() => slotMorphKey({}), /requires dateKey/);
  assert.throws(() => controlMorphKey({}), /requires controlId/);
  assert.equal(parseMorphKey("invalid-string"), null);
});

test("Issue 2: eventId@dateKey boundary ambiguity is collision-free with tagged components", () => {
  // Previously: eventId="a@b", dateKey="c" and eventId="a", dateKey="b@c" both produced "a@b@c"
  const key1 = eventMorphKey({ eventId: "a@b", dateKey: "c" });
  const key2 = eventMorphKey({ eventId: "a", dateKey: "b@c" });
  assert.notEqual(key1, key2, "eventId='a@b'+dateKey='c' vs eventId='a'+dateKey='b@c' must not collide");

  // Also verify occurrenceId="a@b@c" doesn't collide with either
  const key3 = eventMorphKey({ occurrenceId: "a@b@c" });
  assert.notEqual(key1, key3, "eventId+dateKey must not collide with occurrenceId");
  assert.notEqual(key2, key3, "eventId+dateKey must not collide with occurrenceId");

  // Verify all three parse back correctly
  const parsed1 = parseMorphKey(key1);
  assert.equal(parsed1.eventId, "a@b");
  assert.equal(parsed1.dateKey, "c");

  const parsed2 = parseMorphKey(key2);
  assert.equal(parsed2.eventId, "a");
  assert.equal(parsed2.dateKey, "b@c");

  // Verify isSameBusinessObject distinguishes ambiguous cases
  assert.equal(isSameBusinessObject(key1, key2), false, "Different events must not be considered same business object");
  assert.equal(isSameBusinessObject(key1, key3), false, "Event vs Occurrence must not be considered same business object");
  assert.equal(isSameBusinessObject(key2, key3), false, "Event vs Occurrence must not be considered same business object");

  // Verify same event across views is recognized
  const key1Week = eventMorphKey({ eventId: "a@b", dateKey: "c", view: "week" });
  assert.equal(isSameBusinessObject(key1, key1Week), true, "Same event in different view must be recognized");
});
