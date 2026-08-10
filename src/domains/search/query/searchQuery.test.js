import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSearchText, parseSearchQuery } from "./searchQuery.js";

test("normalizes diacritics and punctuation while preserving quoted phrases", () => {
  const query = parseSearchQuery('Café—plan "next step" type:task tag:Client');

  assert.deepEqual(query.terms, ["cafe", "plan", "next step"]);
  assert.deepEqual(query.filters.types, ["task"]);
  assert.deepEqual(query.filters.tags, ["client"]);
  assert.equal(normalizeSearchText("Crème brûlée!"), "creme brulee");
});

test("records an unsupported filter without treating it as free text", () => {
  const query = parseSearchQuery("roadmap owner:me");

  assert.deepEqual(query.terms, ["roadmap"]);
  assert.deepEqual(query.issues, [{ token: "owner:me", reason: "unsupported-filter" }]);
});

test("keeps supported filters separate from normalized text", () => {
  const query = parseSearchQuery("type:note status:completed tag:Client date:2026-08-10 list:list-work calendar:calendar-default");

  assert.deepEqual(query.terms, []);
  assert.deepEqual(query.filters, {
    types: ["note"],
    statuses: ["completed"],
    tags: ["client"],
    dates: ["2026 08 10"],
    lists: ["list work"],
    calendars: ["calendar default"],
  });
});
