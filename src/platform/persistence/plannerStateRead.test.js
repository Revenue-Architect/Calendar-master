import assert from "node:assert/strict";
import test from "node:test";

import { createBlankPlannerState } from "./plannerStateImport.js";
import {
  MAX_PLANNER_IMPORT_BYTES,
  readPlannerImportText,
} from "./plannerStateRead.js";

test("an empty-events v8 notebook is a valid import", () => {
  const blank = createBlankPlannerState({});
  const result = readPlannerImportText(JSON.stringify(blank));
  assert.equal(result.ok, true);
  assert.equal(result.state.schemaVersion, 8);
  assert.deepEqual(result.state.events, []);
});

test("legacy v4 without schemaVersion still migrates", () => {
  const result = readPlannerImportText(JSON.stringify({
    themeId: "cream-blue",
    events: [],
    tasks: [],
    notes: [],
    overrides: {},
  }));
  assert.equal(result.ok, true);
  assert.equal(result.state.schemaVersion, 8);
});

test("malformed JSON and unknown versions surface as errors, not throws", () => {
  const broken = readPlannerImportText("{");
  assert.equal(broken.ok, false);
  assert.match(broken.error, /not valid JSON/i);

  const unknown = readPlannerImportText(JSON.stringify({ schemaVersion: 99, events: [] }));
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /unsupported planner schema version 99/);
});

test("files over the size bound are refused before parse", () => {
  const result = readPlannerImportText("{}", { byteLength: MAX_PLANNER_IMPORT_BYTES + 1 });
  assert.equal(result.ok, false);
  assert.match(result.error, /larger than/i);
});
