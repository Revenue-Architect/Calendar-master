import test from "node:test";
import assert from "node:assert/strict";
import { describeQuickAdd, parseQuickAdd, quickAddToEntry } from "./quickAdd.js";

/* 2026-08-10 is a Monday, which makes every weekday offset below checkable by
   hand: Tue is +1, Sun is +6, and "next Mon" is +7. */
const MONDAY = "2026-08-10";
const on = (text, options = {}) => parseQuickAdd(text, { todayDate: MONDAY, ...options });

test("the headline case parses day, time and duration and keeps the rest as the title", () => {
  const draft = on("Lunch w/ Sara Tue 1pm 45m");
  assert.equal(draft.kind, "event");
  assert.equal(draft.title, "Lunch w/ Sara");
  assert.equal(draft.date, "2026-08-11");
  assert.equal(draft.startMinute, 13 * 60);
  assert.equal(draft.durationMinutes, 45);
  assert.equal(draft.confident, true);
});

test("blank input is nothing at all, not an empty draft", () => {
  assert.equal(on(""), null);
  assert.equal(on("   \t "), null);
});

test("a line with no time is an action, and a line with one is an event", () => {
  assert.equal(on("Email the landlord").kind, "task");
  assert.equal(on("Standup 9:30am").kind, "event");
});

test("an explicit prefix overrides the time heuristic in both directions", () => {
  const task = on("todo: call the bank 3pm");
  assert.equal(task.kind, "task");
  assert.equal(task.title, "call the bank");
  assert.equal(task.startMinute, 15 * 60);
  /* A task keeps the time it was given but is never handed a duration. */
  assert.equal(task.durationMinutes, null);

  const event = on("event: think about the roadmap");
  assert.equal(event.kind, "event");
  assert.equal(event.title, "think about the roadmap");
  assert.equal(event.startMinute, null);
  /* An event with no time cannot be committed blind — that is the composer's job. */
  assert.equal(event.confident, false);
});

test("times parse in every ordinary written form", () => {
  assert.equal(on("x 1pm").startMinute, 13 * 60);
  assert.equal(on("x 1:30pm").startMinute, 13 * 60 + 30);
  assert.equal(on("x 13:00").startMinute, 13 * 60);
  assert.equal(on("x 9:05am").startMinute, 9 * 60 + 5);
  assert.equal(on("x 12am").startMinute, 0);
  assert.equal(on("x 12pm").startMinute, 12 * 60);
  assert.equal(on("x at noon").startMinute, 12 * 60);
  assert.equal(on("x midnight").startMinute, 0);
});

test("a bare number is a title, never a time", () => {
  const draft = on("Review Q3 numbers");
  assert.equal(draft.kind, "task");
  assert.equal(draft.startMinute, null);
  assert.equal(draft.title, "Review Q3 numbers");
});

test("a time range sets start and duration, and borrows the trailing meridiem", () => {
  const pm = on("Design review 1-2pm");
  assert.equal(pm.startMinute, 13 * 60);
  assert.equal(pm.durationMinutes, 60);
  assert.equal(pm.title, "Design review");

  const explicit = on("Sync 9:00-10:30");
  assert.equal(explicit.startMinute, 9 * 60);
  assert.equal(explicit.durationMinutes, 90);

  const crossing = on("Party 11pm-1am");
  assert.equal(crossing.startMinute, 23 * 60);
  assert.equal(crossing.durationMinutes, 120);
});

test("an explicit duration wins over the one a range implies", () => {
  const draft = on("Workshop 1-2pm 90m");
  assert.equal(draft.startMinute, 13 * 60);
  assert.equal(draft.durationMinutes, 90);
});

test("durations parse in hours and minutes, whole and fractional", () => {
  assert.equal(on("x 1pm 45m").durationMinutes, 45);
  assert.equal(on("x 1pm 90min").durationMinutes, 90);
  assert.equal(on("x 1pm 2h").durationMinutes, 120);
  assert.equal(on("x 1pm 1.5h").durationMinutes, 90);
  assert.equal(on("x 1pm for 30 minutes").durationMinutes, 30);
});

test("an event with a time but no stated duration gets the default", () => {
  assert.equal(on("Interview 2pm").durationMinutes, 60);
  assert.equal(on("Interview 2pm", { defaultDurationMinutes: 30 }).durationMinutes, 30);
});

test("named days resolve against the supplied today, not the host clock", () => {
  assert.equal(on("x today 9am").date, MONDAY);
  assert.equal(on("x tomorrow 9am").date, "2026-08-11");
  assert.equal(on("x yesterday 9am").date, "2026-08-09");
});

test("tonight is both a day and an implied hour", () => {
  const draft = on("Dinner tonight");
  assert.equal(draft.date, MONDAY);
  assert.equal(draft.startMinute, 19 * 60);
  assert.equal(draft.kind, "event");
});

test("a weekday means the next one, counting today itself", () => {
  assert.equal(on("x mon 9am").date, MONDAY, "Monday typed on a Monday is today");
  assert.equal(on("x tue 9am").date, "2026-08-11");
  assert.equal(on("x sunday 9am").date, "2026-08-16");
});

test("'next' pushes a weekday a full week out", () => {
  assert.equal(on("x next mon 9am").date, "2026-08-17");
  assert.equal(on("x next tue 9am").date, "2026-08-18");
});

test("relative day phrases count forward", () => {
  assert.equal(on("x in 3 days").date, "2026-08-13");
  assert.equal(on("x in 2 weeks").date, "2026-08-24");
});

test("calendar dates parse month-first, day-first, numeric and ISO", () => {
  assert.equal(on("x jan 15 9am").date, "2027-01-15", "a past month rolls to next year");
  assert.equal(on("x 15 jan 9am").date, "2027-01-15");
  assert.equal(on("x dec 3 9am").date, "2026-12-03");
  assert.equal(on("x 9/3 9am").date, "2026-09-03");
  assert.equal(on("x 2027-03-14 9am").date, "2027-03-14");
});

test("an explicit year is taken at face value even when it is in the past", () => {
  assert.equal(on("x 2020-01-01").date, "2020-01-01");
  assert.equal(on("x 1/1/2020").date, "2020-01-01");
});

test("a month name only counts beside a number", () => {
  const draft = on("Marchbank review");
  assert.equal(draft.title, "Marchbank review");
  assert.equal(draft.date, null);

  const modal = on("Ask whether may works");
  assert.equal(modal.title, "Ask whether may works");
  assert.equal(modal.date, null);
});

test("a weekday inside a longer word is left alone", () => {
  assert.equal(on("Sunset photos").title, "Sunset photos");
  assert.equal(on("Sunset photos").date, null);
  assert.equal(on("Satellite uplink").date, null);
});

test("an impossible date is not consumed and stays in the title", () => {
  const draft = on("x 2026-02-30");
  assert.equal(draft.date, null);
  assert.equal(draft.title, "x 2026-02-30");
});

test("an impossible time is not consumed", () => {
  assert.equal(on("Build 25:00").startMinute, null);
  assert.equal(on("Build 9:75").startMinute, null);
});

test("deadlines parse off 'by' and 'due' and stay separate from the planned day", () => {
  const draft = on("File taxes by friday");
  assert.equal(draft.kind, "task");
  assert.equal(draft.title, "File taxes");
  assert.equal(draft.deadline, "2026-08-14");
  assert.equal(draft.date, null);

  const both = on("Draft memo tue due friday");
  assert.equal(both.date, "2026-08-11");
  assert.equal(both.deadline, "2026-08-14");
  assert.equal(both.title, "Draft memo");
});

test("an event never carries a deadline", () => {
  const draft = on("Review 3pm by friday");
  assert.equal(draft.kind, "event");
  assert.equal(draft.deadline, null);
});

test("#list names a list and resolves to its id when it exists", () => {
  const lists = [{ id: "list-work", name: "Work" }, { id: "list-home", name: "Home" }];
  const draft = on("Ship the invoice #work", { lists });
  assert.equal(draft.title, "Ship the invoice");
  assert.equal(draft.listName, "work");
  assert.equal(draft.listId, "list-work");

  const unknown = on("Ship the invoice #nowhere", { lists });
  assert.equal(unknown.listName, "nowhere");
  assert.equal(unknown.listId, null, "an unknown list is reported, never invented");
});

test("a numeric #token is an issue number and stays in the title", () => {
  const draft = on("review PR #42");
  assert.equal(draft.title, "review PR #42");
  assert.equal(draft.listName, null);
});

test("a numeric #token does not stop a real list on the same line", () => {
  const draft = on("review PR #42 #work", { lists: [{ id: "list-work", name: "Work" }] });
  assert.equal(draft.listId, "list-work");
  assert.equal(draft.title, "review PR #42");
});

test("named hours read as times, including inside a range", () => {
  assert.equal(on("Lunch noon").startMinute, 12 * 60);
  const range = on("Block noon-2pm");
  assert.equal(range.startMinute, 12 * 60);
  assert.equal(range.durationMinutes, 120);
  assert.equal(range.title, "Block");

  const toNoon = on("Focus 9am-noon");
  assert.equal(toNoon.startMinute, 9 * 60);
  assert.equal(toNoon.durationMinutes, 180);
  assert.equal(toNoon.title, "Focus");
});

test("'afternoon' is a word, not a time", () => {
  const draft = on("Afternoon reading");
  assert.equal(draft.title, "Afternoon reading");
  assert.equal(draft.startMinute, null);
});

test("a zero-length range is a typo, not a day-long event", () => {
  const draft = on("Sync 3pm-3pm");
  assert.equal(draft.startMinute, 15 * 60);
  assert.equal(draft.durationMinutes, 60, "it falls through to a plain start time");
});

test("@tag collects every tag on the line", () => {
  const draft = on("Renew passport @admin @urgent");
  assert.deepEqual(draft.tags, ["admin", "urgent"]);
  assert.equal(draft.title, "Renew passport");
});

test("connectives stranded by a consumed token are cleaned off the title", () => {
  assert.equal(on("Coffee with Ana on tuesday 10am").title, "Coffee with Ana");
  assert.equal(on("Gym at 7am").title, "Gym");
  assert.equal(on("Retro on 2026-09-01 at 4pm").title, "Retro");
});

test("a line that parses to no title is never confident", () => {
  const draft = on("tomorrow 3pm");
  assert.equal(draft.title, "");
  assert.equal(draft.confident, false);
  assert.equal(draft.date, "2026-08-11");
  assert.equal(draft.startMinute, 15 * 60, "what did parse is still handed back for the composer");
});

test("an action needs only a title to be committable", () => {
  assert.equal(on("Water the plants").confident, true);
});

test("consumed tokens are reported so the palette can show what it took", () => {
  const draft = on("Lunch w/ Sara Tue 1pm 45m");
  assert.ok(draft.consumed.includes("Tue"));
  assert.ok(draft.consumed.includes("1pm"));
  assert.ok(draft.consumed.includes("45m"));
});

test("parsing is pure: the same line and today always give the same draft", () => {
  assert.deepEqual(on("Lunch w/ Sara Tue 1pm 45m"), on("Lunch w/ Sara Tue 1pm 45m"));
});

test("todayDate is required and validated", () => {
  assert.throws(() => parseQuickAdd("x", {}), TypeError);
  assert.throws(() => parseQuickAdd("x", { todayDate: "nope" }), TypeError);
  assert.throws(() => parseQuickAdd(42, { todayDate: MONDAY }), TypeError);
});

test("describeQuickAdd states the draft in words", () => {
  const draft = on("Lunch w/ Sara Tue 1pm 45m");
  const line = describeQuickAdd(draft, {
    formatDate: (d) => d,
    formatTime: (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`,
    formatDuration: (m) => `${m}m`,
  });
  assert.equal(line, 'Event "Lunch w/ Sara" 2026-08-11 at 13:00 for 45m');
  assert.equal(describeQuickAdd(null), "");
  assert.equal(describeQuickAdd({ title: "" }), "");
});

test("quickAddToEntry builds an event payload the composer would have built", () => {
  const entry = quickAddToEntry(on("Lunch w/ Sara Tue 1pm 45m"), {
    fallbackDate: MONDAY, defaultCategory: "PEOPLE",
  });
  assert.equal(entry.kind, "event");
  assert.equal(entry.title, "Lunch w/ Sara");
  assert.equal(entry.date, "2026-08-11");
  assert.equal(entry.start, 13 * 60);
  assert.equal(entry.dur, 45);
  assert.equal(entry.cat, "PEOPLE");
  assert.equal(entry.allDay, false);
  assert.deepEqual(entry.timing, {
    kind: "timed",
    timeZoneMode: "floating",
    startLocal: "2026-08-11T13:00",
    endLocal: "2026-08-11T13:45",
  });
});

test("an event with no day lands on the day in view", () => {
  const entry = quickAddToEntry(on("Standup 9am"), { fallbackDate: "2026-09-01" });
  assert.equal(entry.date, "2026-09-01");
  assert.equal(entry.timing.startLocal, "2026-09-01T09:00");
});

test("quickAddToEntry keeps an undated action undated so it carries forward", () => {
  const entry = quickAddToEntry(on("Renew passport"), { fallbackDate: MONDAY });
  assert.equal(entry.kind, "task");
  assert.equal(entry.date, null);
  assert.equal(entry.unplanned, true);
  assert.equal(entry.at, null);
  assert.equal(entry.due, null);
});

test("an action with a day is planned for it, and a deadline rides along", () => {
  const entry = quickAddToEntry(on("Draft memo tue due friday"), { fallbackDate: MONDAY });
  assert.equal(entry.date, "2026-08-11");
  assert.equal(entry.unplanned, false);
  assert.equal(entry.due, "2026-08-14");
});

test("tags and a resolved list ride onto the payload, and are absent when not given", () => {
  const lists = [{ id: "list-work", name: "Work" }];
  const withBoth = quickAddToEntry(on("Invoice #work @billing", { lists }), { fallbackDate: MONDAY });
  assert.equal(withBoth.listId, "list-work");
  assert.deepEqual(withBoth.tags, ["billing"]);

  const plain = quickAddToEntry(on("Invoice"), { fallbackDate: MONDAY });
  assert.equal("listId" in plain, false);
  assert.equal("tags" in plain, false);
});

test("a draft with no title has nothing to build", () => {
  assert.equal(quickAddToEntry(on("tomorrow 3pm"), { fallbackDate: MONDAY }), null);
  assert.equal(quickAddToEntry(null, { fallbackDate: MONDAY }), null);
});

test("quickAddToEntry validates the fallback date rather than producing a bad record", () => {
  assert.throws(() => quickAddToEntry(on("Lunch 1pm"), { fallbackDate: "nope" }), TypeError);
});
