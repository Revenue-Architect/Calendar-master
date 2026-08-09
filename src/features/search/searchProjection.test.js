import assert from "node:assert/strict";
import test from "node:test";

import {
  projectNoteSearchResult,
  projectTaskSearchResult,
  searchResultDateLabel,
} from "./searchProjection.js";

test("projects canonical task planning and recurrence for search deep links", () => {
  const result = projectTaskSearchResult({
    id: "habit",
    title: "Walk",
    planned: { date: "2026-08-10", startMinute: null, estimateMinutes: null },
    recurrence: { frequency: "weekly", interval: 2, byWeekday: [1, 3], until: "2026-10-01" },
  });

  assert.equal(result.kind, "task");
  assert.equal(result.date, "2026-08-10");
  assert.deepEqual(result.repeat, {
    freq: "weekly",
    interval: 2,
    byDay: [1, 3],
    until: "2026-10-01",
  });
});

test("uses safe labels for unplanned tasks and undated notes", () => {
  let formats = 0;
  const formatDate = () => { formats += 1; return "SHOULD NOT RUN"; };
  const task = projectTaskSearchResult({ id: "inbox", title: "Inbox", planned: { date: null }, recurrence: null });
  const note = projectNoteSearchResult({ id: "note", kind: "standalone", date: null }, "Loose thought");

  assert.equal(searchResultDateLabel(task, formatDate), "INBOX");
  assert.equal(searchResultDateLabel(note, formatDate), "NOTE");
  assert.equal(formats, 0);
});

test("formats dated results and marks repeating results without formatting", () => {
  const formatted = projectNoteSearchResult({ id: "daily", kind: "daily", date: "2026-08-09" }, "Daily note");
  const repeating = projectTaskSearchResult({
    id: "repeat",
    title: "Repeat",
    planned: { date: "2026-08-09" },
    recurrence: { frequency: "daily", interval: 1 },
  });

  assert.equal(searchResultDateLabel(formatted, (date) => `DATE ${date}`), "DATE 2026-08-09");
  assert.equal(searchResultDateLabel(repeating, () => { throw new Error("must not format"); }), "↻");
});
