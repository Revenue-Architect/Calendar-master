import test from "node:test";
import assert from "node:assert/strict";
import { blocksToShorthand, parseInline, plainText, textToBlocks } from "../documents/shorthand.js";

const ids = () => { let n = 0; return () => `b${n += 1}`; };

test("a line declares its own type", () => {
  const blocks = textToBlocks("# Title\n## Sub\n- Bullet\n1. First\n[ ] Todo\n[x] Done\n> Quote\n---\nJust prose", [], ids());
  assert.deepEqual(blocks.map((b) => b.type),
    ["heading", "heading", "bulleted", "numbered", "checklist", "checklist", "quote", "divider", "paragraph"]);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].level, 2);
  assert.equal(blocks[4].done, false);
  assert.equal(blocks[5].done, true);
});

test("a fenced block keeps its contents verbatim", () => {
  const blocks = textToBlocks("Before\n```\nif (x) {\n\n  go();\n}\n```\nAfter", [], ids());
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "code", "paragraph"]);
  assert.equal(blocks[1].text, "if (x) {\n\n  go();\n}", "blank lines and indentation survive");
});

test("shorthand round-trips through the document", () => {
  const source = "# Title\n- One\n[x] Two\n> Three\n---\nProse";
  const blocks = textToBlocks(source, [], ids());
  assert.equal(blocksToShorthand(blocks), source);
  assert.deepEqual(textToBlocks(blocksToShorthand(blocks), blocks, ids()).map((b) => b.type), blocks.map((b) => b.type));
});

test("identity and extraction survive an edit", () => {
  const existing = textToBlocks("[ ] Ring the printer", [], ids())
    .map((b) => ({ ...b, extractedTaskId: "task-1", futureAttribute: 7 }));
  const edited = textToBlocks("[ ] Ring the printer twice", existing, ids());
  assert.equal(edited[0].id, existing[0].id, "the same line keeps its id");
  assert.equal(edited[0].extractedTaskId, "task-1", "so it cannot produce a second task");
  assert.equal(edited[0].futureAttribute, 7, "and a later version's attribute is not dropped");
});

test("editing one line does not renumber the ids after it", () => {
  const existing = textToBlocks("One\nTwo\nThree", [], ids());
  const edited = textToBlocks("One\nTwo edited\nThree", existing, ids());
  assert.deepEqual(edited.map((b) => b.id), existing.map((b) => b.id));
});

test("inline marks parse to runs and reduce to readable text", () => {
  assert.deepEqual(parseInline("a **b** c").map((r) => [r.mark, r.text]),
    [[null, "a "], ["strong", "b"], [null, " c"]]);
  assert.deepEqual(parseInline("`code`").map((r) => r.mark), ["code"]);
  assert.equal(plainText("**bold** and *thin* and ~~gone~~"), "bold and thin and gone",
    "search indexes readable text, not markup");
});
