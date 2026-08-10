import assert from "node:assert/strict";
import test from "node:test";

import {
  projectPlannerSearch,
  resolvePlannerSearchPick,
  searchResultDateLabel,
} from "./searchProjection.js";

const state = {
  events: [],
  eventExceptions: [],
  occurrenceAliases: [],
  tasks: [{
    id: "habit", title: "Walk roadmap", note: "", category: null, tags: [],
    checklist: [], status: "open", listId: "list-default", parentTaskId: null,
    planned: { date: "2026-08-10", startMinute: null, estimateMinutes: null },
    deadline: { date: null, minute: null }, followUpDate: null,
    recurrence: { frequency: "daily", interval: 1, missedPolicy: "skip" },
  }],
  taskExceptions: [],
  notes: [{
    id: "note", kind: "standalone", title: "Roadmap", date: "2026-08-10",
    blocks: [{ id: "body", type: "paragraph", text: "Keep this implementation focused." }],
    tags: [], links: [], pinned: false, archived: false,
  }],
};

test("projects filterable display-safe results without note blocks", () => {
  const projection = projectPlannerSearch(state, {
    query: "type:note roadmap", todayDate: "2026-08-10",
  });

  assert.deepEqual(projection.results.map((item) => item.kind), ["note"]);
  assert.equal("blocks" in projection.results[0], false);
  assert.equal(searchResultDateLabel(projection.results[0], (date) => "DATE " + date), "DATE 2026-08-10");
});

test("maps a recurring target to the inspection contract", () => {
  const pick = resolvePlannerSearchPick(state, {
    kind: "task", target: { entityId: "habit" },
  }, { todayDate: "2026-08-10" });

  assert.deepEqual(pick, {
    status: "available", inspect: { kind: "task", id: "habit@2026-08-10" },
    date: "2026-08-10",
  });
});
