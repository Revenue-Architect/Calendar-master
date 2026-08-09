import assert from "node:assert/strict";
import test from "node:test";

import { resolveTaskForInspection } from "./taskInspection.js";

test("resolves an occurrence from the visible day before its series", () => {
  const occurrence = { id: "habit@2026-08-09", title: "Today habit" };
  const series = { id: "habit", title: "Habit" };

  assert.equal(resolveTaskForInspection([occurrence], [series], occurrence.id), occurrence);
});

test("resolves an unplanned task that is absent from the visible day", () => {
  const inboxTask = { id: "inbox", title: "Inbox task" };

  assert.equal(resolveTaskForInspection([], [inboxTask], "inbox"), inboxTask);
});

test("returns null for an unknown task", () => {
  assert.equal(resolveTaskForInspection([], [], "missing"), null);
});
