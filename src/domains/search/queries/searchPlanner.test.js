import assert from "node:assert/strict";
import test from "node:test";

import { searchPlanner } from "./searchPlanner.js";

const state = {
  events: [
    {
      id: "event-place", title: "Workshop", calendarId: "calendar-work",
      place: "Café planning room", category: "work",
      timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-12T09:00", endLocal: "2026-08-12T10:00" },
      recurrence: null,
    },
  ],
  tasks: [
    {
      id: "task-title", title: "Café Plan", note: "", category: "work", tags: ["client"],
      checklist: [], status: "open", listId: "list-work",
      planned: { date: "2026-08-10" }, deadline: { date: null }, followUpDate: null,
      recurrence: null,
    },
    {
      id: "archived-task", title: "Archive", note: "", category: null, tags: [],
      checklist: [], status: "archived", listId: "list-work",
      planned: { date: null }, deadline: { date: null }, followUpDate: null,
      recurrence: null,
    },
    {
      id: "task-deadline", title: "Pay invoice", note: "", category: null, tags: [],
      checklist: [], status: "open", listId: "list-work",
      planned: { date: "2026-08-10" }, deadline: { date: "2026-08-11" }, followUpDate: "2026-08-12",
      recurrence: null,
    },
  ],
  notes: [
    {
      id: "note-body", kind: "standalone", title: "Loose note", date: "2026-08-10",
      blocks: [{ id: "body", type: "paragraph", text: "Café planning thoughts" }],
      tags: ["client"], links: [], pinned: false, archived: false,
    },
    {
      id: "archived-note", kind: "standalone", title: "Archive", date: null,
      blocks: [], tags: [], links: [], pinned: false, archived: true,
    },
  ],
};

test("searches all domains with accent-insensitive deterministic ranking", () => {
  const found = searchPlanner(state, { query: "cafe plan", todayDate: "2026-08-10" }).results;

  assert.deepEqual(found.map((item) => [item.kind, item.id]), [
    ["task", "task-title"], ["note", "note-body"], ["event", "event-place"],
  ]);
  assert.equal("blocks" in found[1], false);
});

test("applies type status tag date list and calendar filters to owning records", () => {
  const tasks = searchPlanner(state, {
    query: "type:task status:open tag:client date:2026-08-10 list:list-work",
    todayDate: "2026-08-10",
  }).results;
  const events = searchPlanner(state, {
    query: "type:event calendar:calendar-work",
    todayDate: "2026-08-10",
  }).results;

  assert.deepEqual(tasks.map((item) => item.id), ["task-title"]);
  assert.deepEqual(events.map((item) => item.id), ["event-place"]);
});

test("matches a task date filter against planning deadline and follow-up dates", () => {
  const deadline = searchPlanner(state, {
    query: "type:task date:2026-08-11", todayDate: "2026-08-10",
  }).results;
  const followUp = searchPlanner(state, {
    query: "type:task date:2026-08-12", todayDate: "2026-08-10",
  }).results;

  assert.deepEqual(deadline.map((item) => item.id), ["task-deadline"]);
  assert.deepEqual(followUp.map((item) => item.id), ["task-deadline"]);
});

test("requires a quoted phrase to be contiguous", () => {
  const found = searchPlanner(state, { query: '"cafe planning"', todayDate: "2026-08-10" }).results;

  assert.deepEqual(found.map((item) => item.id), ["note-body", "event-place"]);
});

test("omits archived tasks and notes by default", () => {
  const found = searchPlanner(state, { query: "archive", todayDate: "2026-08-10" }).results;

  assert.deepEqual(found, []);
});
