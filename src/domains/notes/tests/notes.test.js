import test from "node:test";
import assert from "node:assert/strict";
import {
  appendBlock, archiveNote, createNote, deleteNote, getBacklinks, getDailyNote,
  getInboxNotes, getNotebookNotes, getNotesForEntity, getPinnedNotes, isEmptyNote, linkNote,
  markBlockExtracted, migrateV6ToV7, moveBlock, normalizeNote, noteExcerpt,
  pinNote, removeBlock, searchNotes, serializeBlocks, toggleChecklistBlock,
  updateBlock, updateNote,
} from "../index.js";

const NOW = "2026-08-09T10:00";
const DAY = "2026-08-09";

const daily = (over = {}) => normalizeNote({
  id: "n1", kind: "daily", date: DAY,
  blocks: [{ id: "b1", type: "paragraph", text: "First" }, { id: "b2", type: "paragraph", text: "Second" }],
  ...over,
});

test("a daily note requires a date", () => {
  assert.throws(() => normalizeNote({ id: "n", kind: "daily" }), /daily note requires a date/);
});

test("an event or task note must link to its entity", () => {
  assert.throws(() => normalizeNote({ id: "n", kind: "task" }), /must link to its task/);
  const ok = normalizeNote({ id: "n", kind: "task", links: [{ type: "task", targetId: "t1" }] });
  assert.equal(ok.links.length, 1);
});

test("block ids must be unique inside a note", () => {
  assert.throws(() => normalizeNote({
    id: "n", blocks: [{ id: "same", type: "paragraph" }, { id: "same", type: "paragraph" }],
  }), /duplicate block/);
});

test("an unknown block type is refused rather than coerced", () => {
  assert.throws(() => normalizeNote({ id: "n", blocks: [{ id: "b", type: "spreadsheet" }] }), /block.type/);
});

test("a divider carries no text", () => {
  assert.throws(() => normalizeNote({ id: "n", blocks: [{ id: "b", type: "divider", text: "x" }] }), /carries no text/);
});

test("unknown block attributes survive a round trip", () => {
  const note = normalizeNote({ id: "n", blocks: [{ id: "b", type: "paragraph", text: "t", colour: "blue" }] });
  assert.equal(note.blocks[0].colour, "blue", "a later version's attribute is not dropped");
});

test("reordering changes order but never identity", () => {
  const { notes } = createNote([], daily(), { now: NOW });
  const moved = moveBlock(notes, "n1", "b2", 0, { now: NOW }).notes[0];
  assert.deepEqual(moved.blocks.map((b) => b.id), ["b2", "b1"]);
  assert.deepEqual(moved.blocks.map((b) => b.order), [0, 1]);
});

test("a save that changes nothing does not bump the revision", () => {
  const { notes } = createNote([], daily(), { now: NOW });
  const before = notes[0].revision;
  const same = updateNote(notes, "n1", { title: "" }, { now: NOW });
  assert.equal(same.notes[0].revision, before);
  assert.deepEqual(same.events, [], "and produces no change event");

  const changed = updateNote(notes, "n1", { title: "Monday" }, { now: NOW });
  assert.equal(changed.notes[0].revision, before + 1);
});

test("serialization is deterministic regardless of key order", () => {
  const a = serializeBlocks([{ id: "b", type: "paragraph", text: "x", order: 0 }]);
  const b = serializeBlocks([{ order: 0, text: "x", type: "paragraph", id: "b" }]);
  assert.equal(a, b);
});

test("blocks can be appended, edited, toggled and removed", () => {
  let notes = createNote([], daily(), { now: NOW }).notes;
  notes = appendBlock(notes, "n1", { id: "b3", type: "checklist", text: "Call the bank" }, { now: NOW }).notes;
  assert.equal(notes[0].blocks.length, 3);

  notes = toggleChecklistBlock(notes, "n1", "b3", { now: NOW }).notes;
  const done = notes[0].blocks.find((b) => b.id === "b3");
  assert.equal(done.done, true);
  assert.equal(done.completedAt, NOW, "completion records when");

  notes = updateBlock(notes, "n1", "b1", { text: "Edited" }, { now: NOW }).notes;
  assert.equal(notes[0].blocks[0].text, "Edited");

  notes = removeBlock(notes, "n1", "b1", { now: NOW }).notes;
  assert.equal(notes[0].blocks.some((b) => b.id === "b1"), false);
});

test("toggling a non-checklist block is refused", () => {
  const { notes } = createNote([], daily(), { now: NOW });
  assert.throws(() => toggleChecklistBlock(notes, "n1", "b1", { now: NOW }), /not a checklist block/);
});

test("a line becomes a task once and only once", () => {
  let notes = createNote([], daily({
    blocks: [{ id: "b1", type: "checklist", text: "Book the venue" }],
  }), { now: NOW }).notes;

  const first = markBlockExtracted(notes, "n1", "b1", "task-1", { now: NOW });
  notes = first.notes;
  assert.equal(notes[0].blocks[0].extractedTaskId, "task-1");
  assert.equal(first.events.at(-1).type, "TaskExtracted");

  assert.throws(() => markBlockExtracted(notes, "n1", "b1", "task-2", { now: NOW }), /already became a task/);
});

test("links are set-like and drive backlinks", () => {
  let notes = createNote([], daily(), { now: NOW }).notes;
  notes = createNote(notes, { id: "n2", kind: "standalone" }, { now: NOW }).notes;

  notes = linkNote(notes, "n2", { type: "note", targetId: "n1" }, { now: NOW }).notes;
  const again = linkNote(notes, "n2", { type: "note", targetId: "n1" }, { now: NOW });
  assert.equal(again.notes.find((n) => n.id === "n2").links.length, 1, "linking twice is linking once");
  assert.deepEqual(getBacklinks(notes, "n1").map((n) => n.id), ["n2"]);
});

test("entity notes are found from the entity side", () => {
  const { notes } = createNote([], {
    id: "n1", kind: "event", links: [{ type: "event", targetId: "evt-1" }],
  }, { now: NOW });
  assert.deepEqual(getNotesForEntity(notes, "event", "evt-1").map((n) => n.id), ["n1"]);
});

test("notebook views are derived from active, pinned, and archived note state", () => {
  let notes = createNote([], daily(), { now: NOW }).notes;
  notes = createNote(notes, { id: "standalone", kind: "standalone", title: "Idea" }, { now: NOW }).notes;
  notes = pinNote(notes, "standalone", true, { now: NOW }).notes;
  notes = createNote(notes, { id: "archived", kind: "standalone", title: "Old", archived: true }, { now: NOW }).notes;

  assert.deepEqual(getNotebookNotes(notes, "all").map((note) => note.id).sort(), ["n1", "standalone"]);
  assert.deepEqual(getNotebookNotes(notes, "pinned").map((note) => note.id), ["standalone"]);
  assert.deepEqual(getNotebookNotes(notes, "archived").map((note) => note.id), ["archived"]);
});

test("event occurrence backlinks include series notes and only the selected occurrence", () => {
  let notes = createNote([], {
    id: "series", kind: "event", title: "Series context", links: [{ type: "event", targetId: "event-1" }],
  }, { now: NOW }).notes;
  notes = createNote(notes, {
    id: "today", kind: "event", title: "Today only", links: [{ type: "event", targetId: "event-1", occurrenceDate: DAY }],
  }, { now: NOW }).notes;
  notes = createNote(notes, {
    id: "tomorrow", kind: "event", title: "Tomorrow only", links: [{ type: "event", targetId: "event-1", occurrenceDate: "2026-08-10" }],
  }, { now: NOW }).notes;

  assert.deepEqual(getNotesForEntity(notes, "event", "event-1", { occurrenceDate: DAY }).map((note) => note.id).sort(), ["series", "today"]);
  assert.deepEqual(getNotesForEntity(notes, "event", "event-1", { occurrenceDate: "2026-08-10" }).map((note) => note.id).sort(), ["series", "tomorrow"]);
});

test("a series link and an occurrence link are distinct relationships", () => {
  let notes = createNote([], { id: "n1", kind: "standalone" }, { now: NOW }).notes;
  notes = linkNote(notes, "n1", { type: "event", targetId: "event-1" }, { now: NOW }).notes;
  notes = linkNote(notes, "n1", { type: "event", targetId: "event-1", occurrenceDate: DAY }, { now: NOW }).notes;

  assert.deepEqual(notes[0].links, [
    { type: "event", targetId: "event-1" },
    { type: "event", targetId: "event-1", occurrenceDate: DAY },
  ]);
});

test("system views separate inbox, pinned, daily and archived", () => {
  let notes = createNote([], daily(), { now: NOW }).notes;
  notes = createNote(notes, { id: "n2", kind: "standalone" }, { now: NOW }).notes;
  notes = createNote(notes, { id: "n3", kind: "standalone" }, { now: NOW }).notes;
  notes = pinNote(notes, "n3", true, { now: NOW }).notes;

  assert.equal(getDailyNote(notes, DAY).id, "n1");
  assert.deepEqual(getInboxNotes(notes).map((n) => n.id).sort(), ["n2", "n3"]);
  assert.deepEqual(getPinnedNotes(notes).map((n) => n.id), ["n3"]);

  notes = archiveNote(notes, "n2", true, { now: NOW }).notes;
  assert.equal(getInboxNotes(notes).some((n) => n.id === "n2"), false, "archived leaves the inbox");
  assert.ok(notes.find((n) => n.id === "n2"), "but the note still exists");
});

test("search covers title, body and tags and skips archived by default", () => {
  let notes = createNote([], daily({ title: "Monday", tags: ["review"] }), { now: NOW }).notes;
  assert.deepEqual(searchNotes(notes, "monday").map((n) => n.id), ["n1"]);
  assert.deepEqual(searchNotes(notes, "second").map((n) => n.id), ["n1"], "body text is indexed");
  assert.deepEqual(searchNotes(notes, "review").map((n) => n.id), ["n1"], "tags are indexed");

  notes = archiveNote(notes, "n1", true, { now: NOW }).notes;
  assert.deepEqual(searchNotes(notes, "monday"), []);
  assert.deepEqual(searchNotes(notes, "monday", { includeArchived: true }).map((n) => n.id), ["n1"]);
});

test("deleting returns the note so undo can restore it", () => {
  const { notes } = createNote([], daily(), { now: NOW });
  const { notes: after, events } = deleteNote(notes, "n1");
  assert.deepEqual(after, []);
  assert.equal(events[0].removed.id, "n1");
});

test("an empty note is recognisable", () => {
  assert.equal(isEmptyNote(normalizeNote({ id: "n", blocks: [{ id: "b", type: "paragraph", text: "" }] })), true);
  assert.equal(isEmptyNote(daily()), false);
});

test("excerpt prefers the title and truncates long bodies", () => {
  assert.equal(noteExcerpt(daily({ title: "Monday" })), "Monday");
  assert.ok(noteExcerpt(daily({ blocks: [{ id: "b", type: "paragraph", text: "x".repeat(200) }] })).endsWith("…"));
});

/* migration */

test("v6 text notes become daily notes split on blank lines", () => {
  const migrated = migrateV6ToV7({
    schemaVersion: 6,
    calendars: [], events: [], eventExceptions: [], occurrenceAliases: [], overrides: {},
    taskLists: [{ id: "list-default", name: "Actions", isDefault: true }], tasks: [], taskExceptions: [],
    notes: [{ id: "old", date: DAY, text: "First para\n\nSecond para" }],
  });
  assert.equal(migrated.schemaVersion, 7);
  const note = migrated.notes[0];
  assert.equal(note.kind, "daily");
  assert.equal(note.date, DAY);
  assert.deepEqual(note.blocks.map((b) => b.text), ["First para", "Second para"]);
  assert.ok(note.blocks.every((b) => b.type === "paragraph"), "no structure is invented from prose");
  assert.ok(migrated.notebooks.length, "a default notebook exists");
});

test("migration is idempotent over already-migrated notes", () => {
  const base = {
    schemaVersion: 6,
    calendars: [], events: [], eventExceptions: [], occurrenceAliases: [], overrides: {},
    taskLists: [{ id: "list-default", name: "Actions", isDefault: true }], tasks: [], taskExceptions: [],
    notes: [{ id: "old", date: DAY, text: "Body" }],
  };
  const once = migrateV6ToV7(base);
  const twice = migrateV6ToV7({ ...once, schemaVersion: 6 });
  assert.deepEqual(twice.notes, once.notes);
});

test("two daily notes for one day are rejected", () => {
  assert.throws(() => migrateV6ToV7({
    schemaVersion: 6,
    calendars: [], events: [], eventExceptions: [], occurrenceAliases: [], overrides: {},
    taskLists: [{ id: "list-default", name: "Actions", isDefault: true }], tasks: [], taskExceptions: [],
    notes: [{ id: "a", date: DAY, text: "one" }, { id: "b", date: DAY, text: "two" }],
  }), /more than one daily note/);
});
