import assert from "node:assert/strict";
import test from "node:test";
import { classifyStorageFailures, isCanonicalStorageScope } from "./storageStatus.js";

test("planner and device failures are canonical", () => {
  assert.equal(isCanonicalStorageScope("planner"), true);
  assert.equal(isCanonicalStorageScope("device"), true);
  assert.deepEqual(classifyStorageFailures(new Set(["planner", "diagnostics"])), {
    canonical: true,
    supporting: ["diagnostics"],
  });
});

test("supporting failures do not claim the notebook is not saving", () => {
  assert.equal(isCanonicalStorageScope("preferences"), false);
  assert.deepEqual(classifyStorageFailures(["preferences", "reminders"]), {
    canonical: false,
    supporting: ["preferences", "reminders"],
  });
});

test("the classifier handles an empty or unknown scope collection", () => {
  assert.deepEqual(classifyStorageFailures([]), { canonical: false, supporting: [] });
  assert.deepEqual(classifyStorageFailures(["future-support-store"]), {
    canonical: false,
    supporting: ["future-support-store"],
  });
});
