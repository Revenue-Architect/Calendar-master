import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNote } from "../index.js";
import {
  MAX_REVISIONS, dropRevisionsFor, recordRevision, restoredNote, revisionIsIntact, revisionsFor,
} from "../revisions/noteRevisions.js";

const note = (over = {}) => normalizeNote({
  id: "n", kind: "daily", date: "2026-08-09",
  blocks: [{ id: "b", type: "paragraph", text: "First" }], ...over,
});

test("a revision captures the document with a checksum", () => {
  const revs = recordRevision([], note(), { at: "2026-08-09T10:00" });
  assert.equal(revs.length, 1);
  assert.equal(revs[0].revision, 1);
  assert.ok(revisionIsIntact(revs[0]));
});

test("saving the same document twice does not add a second revision", () => {
  const first = recordRevision([], note(), { at: "t1" });
  assert.equal(recordRevision(first, note(), { at: "t2" }).length, 1, "history is checkpoints, not keystrokes");
});

test("a changed document adds a revision", () => {
  const first = recordRevision([], note(), { at: "t1" });
  const changed = note({ blocks: [{ id: "b", type: "paragraph", text: "Second" }], revision: 2 });
  assert.equal(recordRevision(first, changed, { at: "t2" }).length, 2);
});

test("history is capped per note and keeps the newest", () => {
  let revs = [];
  for (let i = 1; i <= MAX_REVISIONS + 5; i += 1) {
    revs = recordRevision(revs, note({ blocks: [{ id: "b", type: "paragraph", text: `v${i}` }], revision: i }), { at: `t${i}` });
  }
  const mine = revisionsFor(revs, "n");
  assert.equal(mine.length, MAX_REVISIONS);
  assert.equal(mine[0].revision, MAX_REVISIONS + 5, "newest first");
});

test("restoring returns the old body without erasing history", () => {
  const original = note();
  const history = recordRevision([], original, { at: "t1" });
  const changed = note({ blocks: [{ id: "b", type: "paragraph", text: "Rewritten" }], revision: 2 });
  const back = restoredNote(changed, history[0]);
  assert.equal(back.blocks[0].text, "First");
  assert.equal(history.length, 1, "the earlier revision is still there");
});

test("a tampered revision is detectable", () => {
  const revs = recordRevision([], note(), { at: "t1" });
  const tampered = { ...revs[0], blocks: [{ id: "b", type: "paragraph", text: "Forged", order: 0 }] };
  assert.equal(revisionIsIntact(tampered), false);
});

test("revisions for a deleted note are removable", () => {
  const revs = recordRevision([], note(), { at: "t1" });
  assert.deepEqual(dropRevisionsFor(revs, ["n"]), []);
  assert.equal(dropRevisionsFor(revs, ["other"]).length, 1);
});
