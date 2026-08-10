import assert from "node:assert/strict";
import test from "node:test";

import { reconcileReminders } from "../commands/reminderCommands.js";
import { getReminderIntents } from "../queries/reminderIntents.js";

const NOW = "2026-08-10T08:00";

function state() {
  return {
    events: [
      {
        id: "event", title: "Design review", alerts: [15],
        timing: { kind: "timed", timeZoneMode: "floating", startLocal: "2026-08-10T09:00", endLocal: "2026-08-10T10:00" },
        recurrence: null, calendarId: "calendar-default",
      },
    ], eventExceptions: [], occurrenceAliases: [],
    tasks: [
      {
        id: "planned", title: "Send proposal", status: "open", parentTaskId: null, rank: 0,
        planned: { date: "2026-08-10", startMinute: 600 }, deadline: { date: null, minute: null },
        followUpDate: null, recurrence: null, reminders: [{ id: "planned-r", anchor: "planned", offsetMinutes: 10 }],
      },
      {
        id: "deadline", title: "Pay invoice", status: "open", parentTaskId: null, rank: 1,
        planned: { date: null, startMinute: null }, deadline: { date: "2026-08-10", minute: 900 },
        followUpDate: null, recurrence: null, reminders: [{ id: "deadline-r", anchor: "deadline", offsetMinutes: 30 }],
      },
    ], taskExceptions: [], notes: [], overrides: {},
  };
}

test("derives event and task reminder intent without putting delivery state in the source", () => {
  const intents = getReminderIntents(state(), { now: NOW });

  assert.deepEqual(intents.map((item) => [item.source.domain, item.source.entityId, item.scheduledFor]), [
    ["event", "event", "2026-08-10T08:45"],
    ["task", "planned", "2026-08-10T09:50"],
    ["task", "deadline", "2026-08-10T14:30"],
  ]);
  assert.equal(state().events[0].alerts[0], 15);
});

test("a changed source schedule supersedes the active prior reminder", () => {
  const [firstIntent] = getReminderIntents(state(), { now: NOW });
  const first = reconcileReminders([], [firstIntent], { now: NOW });
  const moved = { ...firstIntent, scheduledFor: "2026-08-10T09:15" };
  const reconciled = reconcileReminders(first, [moved], { now: NOW });

  assert.equal(reconciled.find((record) => record.id === first[0].id).status, "superseded");
  assert.equal(reconciled.find((record) => record.scheduledFor === "2026-08-10T09:15").status, "scheduled");
});

test("a removed near-term source cancels its active reminder", () => {
  const [intent] = getReminderIntents(state(), { now: NOW });
  const records = reconcileReminders([], [intent], { now: NOW });
  const reconciled = reconcileReminders(records, [], { now: NOW, horizonEnd: "2026-08-24T00:00" });

  assert.equal(reconciled[0].status, "cancelled");
});
