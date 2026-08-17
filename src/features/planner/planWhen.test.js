import test from "node:test";
import assert from "node:assert/strict";
import { nextMonday, planWhenOptions, resolvePlanWhen } from "./planWhen.js";

test("PLAN offers today, tomorrow, next week, and a custom day before writing", () => {
  const options = planWhenOptions("2026-08-17");
  assert.deepEqual(options.map((option) => option.id), ["today", "tomorrow", "next-week", "custom"]);
  assert.equal(options[0].date, "2026-08-17");
  assert.equal(options[1].date, "2026-08-18");
  assert.equal(options[2].date, "2026-08-24");
  assert.equal(options[3].date, null);
});

test("next week is the coming Monday, never the current one", () => {
  assert.equal(nextMonday("2026-08-17"), "2026-08-24");
  assert.equal(nextMonday("2026-08-24"), "2026-08-31");
  assert.equal(nextMonday("2026-08-23"), "2026-08-24");
});

test("resolving a PLAN choice never defaults to today unless today was chosen", () => {
  assert.equal(resolvePlanWhen("tomorrow", "2026-08-17"), "2026-08-18");
  assert.equal(resolvePlanWhen("next-week", "2026-08-17"), "2026-08-24");
  assert.equal(resolvePlanWhen("custom", "2026-08-17"), null);
  assert.equal(resolvePlanWhen("custom", "2026-08-17", { customDate: "2026-09-01" }), "2026-09-01");
  assert.equal(resolvePlanWhen("today", "2026-08-17"), "2026-08-17");
});
