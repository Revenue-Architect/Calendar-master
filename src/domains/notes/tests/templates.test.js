import assert from "node:assert/strict";
import test from "node:test";

import {
  getBuiltInNoteTemplate,
  instantiateBuiltInNoteTemplate,
  listBuiltInNoteTemplates,
} from "../index.js";

test("built-in templates expose the full intentional starting set", () => {
  assert.deepEqual(listBuiltInNoteTemplates().map((template) => template.id), [
    "blank", "daily-planning", "daily-reflection", "meeting", "task-planning", "weekly-review", "decision-record",
  ]);
  assert.equal(getBuiltInNoteTemplate("meeting").version, 1);
});

test("each template application creates fresh blocks with immutable provenance", () => {
  let counter = 0;
  const createBlockId = () => `blk-${++counter}`;
  const first = instantiateBuiltInNoteTemplate("daily-planning", { createBlockId });
  const second = instantiateBuiltInNoteTemplate("daily-planning", { createBlockId });

  assert.equal(first.templateProvenance.id, "daily-planning");
  assert.equal(first.templateProvenance.version, 1);
  assert.notDeepEqual(first.blocks.map((block) => block.id), second.blocks.map((block) => block.id));
  assert.notEqual(first.blocks, second.blocks);
  first.blocks[0].text = "Changed locally";
  assert.notEqual(second.blocks[0].text, "Changed locally");
});

test("template instantiation refuses an unknown template or broken ID factory", () => {
  assert.throws(() => instantiateBuiltInNoteTemplate("unknown", { createBlockId: () => "b" }), /unknown note template/);
  assert.throws(() => instantiateBuiltInNoteTemplate("blank", {}), /createBlockId/);
});
