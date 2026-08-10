import assert from "node:assert/strict";
import test from "node:test";

import { migrateV4ToV5 } from "../../domains/calendar/migrations/migrateV4ToV5.js";
import { migrateV5ToV6 } from "../../domains/tasks/migrations/migrateV5ToV6.js";
import { migrateV6ToV7 } from "../../domains/notes/migrations/migrateV6ToV7.js";
import { migrateV7ToV8 } from "../../domains/notes/migrations/migrateV7ToV8.js";
import {
  createBlankPlannerState,
  normalizeImportedPlannerState,
} from "./plannerStateImport.js";

const legacy = {
  themeId: "cream-blue",
  sound: false,
  notifs: true,
  clock: "24",
  xp: 30,
  events: [{ id: "event", title: "Imported event", date: "2026-08-09", start: 540, dur: 60 }],
  tasks: [{ id: "task", title: "Imported task", date: "2026-08-09", done: false, subs: [], order: 0, xp: 30 }],
  notes: [{ id: "note", date: "2026-08-09", text: "Imported note" }],
  overrides: {},
};

const v5 = migrateV4ToV5(legacy);
const v6 = migrateV5ToV6(v5);
const v7 = migrateV6ToV7(v6);
const v8 = migrateV7ToV8(v7);

for (const [label, input] of [["v4", legacy], ["v5", v5], ["v6", v6], ["v7", v7], ["v8", v8]]) {
  test(`normalizes ${label} imports to validated v8 state`, () => {
    const result = normalizeImportedPlannerState(structuredClone(input));
    assert.equal(result.schemaVersion, 8);
    assert.equal(result.events[0].title, "Imported event");
    assert.equal(result.tasks[0].title, "Imported task");
    assert.equal(result.notes[0].blocks[0].text, "Imported note");
  });
}

test("rejects unknown and malformed planner imports before replacement", () => {
  assert.throws(
    () => normalizeImportedPlannerState({ ...v7, schemaVersion: 99 }),
    /unsupported planner schema version 99/,
  );
  assert.throws(
    () => normalizeImportedPlannerState({ ...v7, events: "broken" }),
    /events/,
  );
});

test("creates a valid empty v8 notebook while preserving device preferences", () => {
  const result = createBlankPlannerState({
    themeId: "cream-blue",
    sound: false,
    notifs: true,
    clock: "24",
  });

  assert.equal(result.schemaVersion, 8);
  assert.equal(result.themeId, "cream-blue");
  assert.equal(result.sound, false);
  assert.equal(result.notifs, true);
  assert.equal(result.clock, "24");
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.tasks, []);
  assert.deepEqual(result.notes, []);
  assert.ok(result.calendars.length > 0);
  assert.ok(result.taskLists.length > 0);
  assert.ok(result.notebooks.length > 0);
  assert.deepEqual(result.noteTags, []);
  assert.deepEqual(result.noteAttachments, []);
});
