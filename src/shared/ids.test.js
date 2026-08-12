import assert from "node:assert/strict";
import test from "node:test";

import { createId } from "./ids.js";

test("createId returns a non-empty string and does not collide in a small batch", () => {
  const ids = new Set(Array.from({ length: 200 }, () => createId()));
  assert.equal(ids.size, 200);
  for (const id of ids) {
    assert.equal(typeof id, "string");
    assert.ok(id.length >= 8);
  }
});
