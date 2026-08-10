import test from "node:test";
import assert from "node:assert/strict";
import { matchCommands } from "./commandPalette.js";

const COMMANDS = [
  { id: "new-event", label: "New event" },
  { id: "new-action", label: "New action" },
  { id: "jump-today", label: "Jump to today", keywords: ["now"] },
  { id: "switch-theme", label: "Switch theme", keywords: ["dark", "light", "colour"] },
  { id: "toggle-clock", label: "Toggle 12/24-hour clock", keywords: ["time format"] },
  { id: "week-start", label: "Week starts Monday" },
];

const ids = (list) => list.map((command) => command.id);

test("an empty query is a menu, in declared order", () => {
  assert.deepEqual(ids(matchCommands(COMMANDS, "")), ids(COMMANDS));
  assert.deepEqual(ids(matchCommands(COMMANDS, "   ")), ids(COMMANDS));
});

test("a label prefix ranks above every weaker kind of match", () => {
  assert.equal(ids(matchCommands(COMMANDS, "new"))[0], "new-event");
  assert.deepEqual(ids(matchCommands(COMMANDS, "new e")), ["new-event"]);
});

test("a word inside the label is enough", () => {
  assert.equal(ids(matchCommands(COMMANDS, "event"))[0], "new-event");
  assert.equal(ids(matchCommands(COMMANDS, "theme"))[0], "switch-theme");
});

test("a fragment inside a word still matches, below word prefixes", () => {
  const matches = ids(matchCommands(COMMANDS, "vent"));
  assert.ok(matches.includes("new-event"));
});

test("letters in order match as an acronym", () => {
  assert.ok(ids(matchCommands(COMMANDS, "nev")).includes("new-event"));
});

test("keywords match without being part of the label", () => {
  assert.equal(ids(matchCommands(COMMANDS, "dark"))[0], "switch-theme");
  assert.equal(ids(matchCommands(COMMANDS, "now"))[0], "jump-today");
});

test("nothing matching returns nothing rather than everything", () => {
  assert.deepEqual(matchCommands(COMMANDS, "zzzzzz"), []);
});

test("matching is case- and whitespace-insensitive", () => {
  assert.deepEqual(ids(matchCommands(COMMANDS, "  NEW EVENT ")), ["new-event"]);
});

test("the limit is respected and defaults to something a sheet can show", () => {
  assert.equal(matchCommands(COMMANDS, "", { limit: 2 }).length, 2);
  assert.ok(matchCommands(COMMANDS, "").length <= 8);
});

test("ranking is stable: equal scores keep declared order", () => {
  const tie = [
    { id: "b", label: "Same" },
    { id: "a", label: "Same" },
  ];
  assert.deepEqual(ids(matchCommands(tie, "same")), ["b", "a"]);
});

test("the shorter label wins inside a tier", () => {
  const list = [
    { id: "long", label: "New event with a very long name" },
    { id: "short", label: "New event" },
  ];
  assert.deepEqual(ids(matchCommands(list, "new event")), ["short", "long"]);
});

test("a missing or malformed command list is empty, not a crash", () => {
  assert.deepEqual(matchCommands(null, "new"), []);
  assert.deepEqual(matchCommands(undefined, ""), []);
  assert.deepEqual(matchCommands([], "new"), []);
});

test("a command with no keywords is handled like one with an empty list", () => {
  assert.deepEqual(ids(matchCommands([{ id: "x", label: "Xylophone" }], "xyl")), ["x"]);
});

test("the same query always returns the same order", () => {
  const once = ids(matchCommands(COMMANDS, "t"));
  for (let i = 0; i < 5; i += 1) assert.deepEqual(ids(matchCommands(COMMANDS, "t")), once);
});
