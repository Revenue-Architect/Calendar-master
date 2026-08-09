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

  /* The editor round-trips through shorthand, so a checklist arrives back with its
     marker; keeping it is what preserves the type. */
  const result = textToNoteBlocks("[ ] Edited text", existing, () => "new-id");

  assert.deepEqual(result, [{
    id: "block-a",
    type: "checklist",
    text: "Edited text",
    order: 0,
    done: false,
    completedAt: null,
    extractedTaskId: "task-a",
    futureAttribute: { source: "import" },
  }]);
});

test("a line declares its own type through shorthand", () => {
  const ids = ["a", "b", "c", "d"];
  const result = textToNoteBlocks("# Heading\n- Bullet\n> Quote\n---", [], () => ids.shift());
  assert.deepEqual(result.map((b) => b.type), ["heading", "bulleted", "quote", "divider"]);
});

test("editing a checklist block preserves its type and completion state", () => {
  const result = textToNoteBlocks("[x] Still done", [{
    id: "check-a",
    type: "checklist",
    text: "Done",
    order: 4,
    done: true,
  }], () => "new-id");

  assert.deepEqual(result, [{ id: "check-a", type: "checklist", text: "Still done", order: 0, done: true, completedAt: null, extractedTaskId: null }]);
});

test("new paragraphs receive stable supplied ids", () => {
  const ids = ["first", "second"];
  const result = textToNoteBlocks("One\n\nTwo", [], () => ids.shift());

  assert.deepEqual(result, [
    { id: "first", type: "paragraph", text: "One", order: 0 },
    { id: "second", type: "paragraph", text: "Two", order: 1 },
  ]);
});
