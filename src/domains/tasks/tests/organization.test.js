import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIST_ID,
  INBOX_LIST_ID,
  allTags,
  createTask,
  createTaskList,
  deleteTag,
  deleteTaskList,
  getEarliestResponsibleStart,
  moveTaskToList,
  normalizeTaskInput,
  renameTag,
  renameTaskList,
  resolveSmartView,
  setTaskReminders,
  setTaskStatus,
  setTaskTags,
} from "../index.js";

const NOW = "2026-08-09T10:00";
const TODAY = "2026-08-09";
const lists = () => [
  { id: INBOX_LIST_ID, name: "Inbox", isSystem: true, isDefault: false, order: 0 },
  { id: DEFAULT_LIST_ID, name: "Actions", isSystem: false, isDefault: true, order: 1 },
];

test("lists can be created and renamed but system lists cannot be deleted", () => {
  let all = createTaskList(lists(), { id: "list-errands", name: "Errands" });
  assert.equal(all.length, 3);
  all = renameTaskList(all, "list-errands", "Out and about");
  assert.equal(all.find((l) => l.id === "list-errands").name, "Out and about");

  assert.throws(() => deleteTaskList(all, [], INBOX_LIST_ID), /cannot be deleted/);
  assert.throws(() => deleteTaskList(all, [], DEFAULT_LIST_ID), /cannot be deleted/);
});

test("deleting a list moves its work rather than destroying it", () => {
  const all = createTaskList(lists(), { id: "list-errands", name: "Errands" });
  const tasks = createTask([], { id: "t", title: "Post the parcel", listId: "list-errands" }, { now: NOW }).tasks;

  const result = deleteTaskList(all, tasks, "list-errands");
  assert.equal(result.lists.some((l) => l.id === "list-errands"), false);
  assert.equal(result.tasks[0].listId, DEFAULT_LIST_ID, "the task survives in the default list");
});

test("a task moves between lists", () => {
  const all = createTaskList(lists(), { id: "list-errands", name: "Errands" });
  const tasks = createTask([], { id: "t", title: "Post the parcel" }, { now: NOW }).tasks;
  const moved = moveTaskToList(tasks, "t", "list-errands", all);
  assert.equal(moved.tasks[0].listId, "list-errands");
});

test("tags cut across lists and rename everywhere at once", () => {
  let tasks = createTask([], { id: "a", title: "A", tags: ["urgent", "home"] }, { now: NOW }).tasks;
  tasks = createTask(tasks, { id: "b", title: "B", tags: ["urgent"] }, { now: NOW }).tasks;
  assert.deepEqual(allTags(tasks), ["home", "urgent"]);

  tasks = renameTag(tasks, "urgent", "now");
  assert.equal(tasks.every((t) => !t.tags.includes("urgent")), true);
  assert.equal(tasks.filter((t) => t.tags.includes("now")).length, 2);

  tasks = deleteTag(tasks, "now");
  assert.deepEqual(allTags(tasks), ["home"], "deleting a tag keeps the tasks");
});

test("setting tags de-duplicates and trims", () => {
  const tasks = createTask([], { id: "a", title: "A" }, { now: NOW }).tasks;
  const tagged = setTaskTags(tasks, "a", [" home ", "home", "work"]);
  assert.deepEqual(tagged.tasks[0].tags, ["home", "work"]);
});

/* §2.4 waiting */

test("waiting carries a follow-up date and clears it on leaving", () => {
  const tasks = createTask([], { id: "a", title: "Chase Ana" }, { now: NOW }).tasks;
  const waiting = setTaskStatus(tasks, "a", "waiting", { now: NOW, followUpDate: "2026-08-15", waitingFor: "Ana" });
  assert.equal(waiting.tasks[0].status, "waiting");
  assert.equal(waiting.tasks[0].followUpDate, "2026-08-15");
  assert.equal(waiting.tasks[0].waitingFor, "Ana");

  const back = setTaskStatus(waiting.tasks, "a", "open", { now: NOW });
  assert.equal(back.tasks[0].followUpDate, null, "no stale follow-up left behind");
  assert.equal(back.tasks[0].waitingFor, "");
});

test("a follow-up date is rejected outside waiting", () => {
  assert.throws(
    () => normalizeTaskInput({ id: "a", title: "A", status: "open", followUpDate: "2026-08-15" }),
    /only a waiting task/,
  );
});

test("invalid status transitions are refused", () => {
  const tasks = createTask([], { id: "a", title: "A" }, { now: NOW }).tasks;
  const archivedAttempt = () => setTaskStatus(tasks, "a", "archived", { now: NOW });
  assert.throws(archivedAttempt, /cannot move from open to archived/);
});

/* §12 reminders */

test("reminders anchor to a date the task already has", () => {
  const tasks = createTask([], { id: "a", title: "A", planned: { date: TODAY, startMinute: 540 } }, { now: NOW }).tasks;
  const withReminder = setTaskReminders(tasks, "a", [{ id: "r1", anchor: "planned", offsetMinutes: 15 }]);
  assert.deepEqual(withReminder.tasks[0].reminders, [{ id: "r1", anchor: "planned", offsetMinutes: 15 }]);
  assert.equal(withReminder.events[0].type, "TaskReminderIntentChanged");
});

test("an unknown reminder anchor is rejected", () => {
  const tasks = createTask([], { id: "a", title: "A" }, { now: NOW }).tasks;
  assert.throws(() => setTaskReminders(tasks, "a", [{ anchor: "whenever", offsetMinutes: 5 }]), /anchor/);
});

/* §4.3 smart views */

test("smart views partition work the way their names claim", () => {
  const tasks = [
    normalizeTaskInput({ id: "inbox", title: "Captured" }),
    normalizeTaskInput({ id: "today", title: "Today", planned: { date: TODAY } }),
    normalizeTaskInput({ id: "soon", title: "Soon", planned: { date: "2026-08-11" } }),
    normalizeTaskInput({ id: "late", title: "Late", deadline: { date: "2026-08-01" } }),
    normalizeTaskInput({ id: "someday", title: "Someday", someday: true }),
    normalizeTaskInput({ id: "waiting", title: "Waiting", status: "waiting" }),
    normalizeTaskInput({ id: "done", title: "Done", status: "completed", completedAt: NOW }),
  ];
  const state = { tasks, taskExceptions: [] };
  const ids = (view) => resolveSmartView(state, view, TODAY).map((t) => t.id);

  assert.deepEqual(ids("today"), ["today"]);
  assert.deepEqual(ids("inbox"), ["inbox"]);
  assert.deepEqual(ids("upcoming"), ["soon"]);
  assert.deepEqual(ids("overdue"), ["late"]);
  assert.deepEqual(ids("someday"), ["someday"]);
  assert.deepEqual(ids("waiting"), ["waiting"]);
  assert.deepEqual(ids("completed"), ["done"]);
  assert.ok(!ids("all").includes("done"), "All shows active work");
});

/* §15.6 scheduling intelligence */

test("planning before a blocker lands is flagged, not blocked", () => {
  let tasks = createTask([], { id: "blocker", title: "Blocker", deadline: { date: "2026-08-20" } }, { now: NOW }).tasks;
  tasks = createTask(tasks, { id: "dependent", title: "Dependent", dependsOn: ["blocker"], planned: { date: "2026-08-12" } }, { now: NOW }).tasks;

  const earliest = getEarliestResponsibleStart(tasks, "dependent");
  assert.equal(earliest, "2026-08-20");
  assert.ok(tasks.find((t) => t.id === "dependent").planned.date < earliest, "the plan is allowed to stand");
});
