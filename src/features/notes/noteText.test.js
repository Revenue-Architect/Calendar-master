import assert from "node:assert/strict";
import test from "node:test";

import { textToNoteBlocks } from "./noteText.js";

test("editing note text preserves extraction references and unknown block attributes", () => {
  const existing = [{
    id: "block-a",
    type: "checklist",
    text: "Old text",
    order: 0,
    done: false,
    extractedTaskId: "task-a",
    futureAttribute: { source: "import" },
  }];

  const result = textToNoteBlocks("Edited text", existing, () => "new-id");

  assert.deepEqual(result, [{
    id: "block-a",
    type: "checklist",
    text: "Edited text",
    order: 0,
    done: false,
    extractedTaskId: "task-a",
    futureAttribute: { source: "import" },
  }]);
});

test("editing a checklist block preserves its type and completion state", () => {
  const result = textToNoteBlocks("Still done", [{
    id: "check-a",
    type: "checklist",
    text: "Done",
    order: 4,
    done: true,
  }], () => "new-id");

  assert.deepEqual(result, [{ id: "check-a", type: "checklist", text: "Still done", order: 0, done: true }]);
});

test("new paragraphs receive stable supplied ids", () => {
  const ids = ["first", "second"];
  const result = textToNoteBlocks("One\n\nTwo", [], () => ids.shift());

  assert.deepEqual(result, [
    { id: "first", type: "paragraph", text: "One", order: 0 },
    { id: "second", type: "paragraph", text: "Two", order: 1 },
  ]);
});
