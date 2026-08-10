import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_COMPLETE_DELAY_MS, autoCompleteStillValid, togglesLastOpenStep } from "./autoComplete.js";

const task = (overrides = {}) => ({
  id: "task-1", status: "open", checklist: [], ...overrides,
});
const step = (id, done) => ({ id, title: id, done, order: 0 });

test("ticking the only open step is the last step", () => {
  const t = task({ checklist: [step("a", true), step("b", false)] });
  assert.equal(togglesLastOpenStep(t, "b"), true);
});

test("ticking a step while others are still open is not", () => {
  const t = task({ checklist: [step("a", false), step("b", false)] });
  assert.equal(togglesLastOpenStep(t, "a"), false);
});

test("a single step is the last step", () => {
  assert.equal(togglesLastOpenStep(task({ checklist: [step("only", false)] }), "only"), true);
});

test("unticking never completes the parent", () => {
  /* The whole checklist is done and the user is unticking one of them. Reading
     the step after the toggle would make this look like a completion. */
  const t = task({ checklist: [step("a", true), step("b", true)] });
  assert.equal(togglesLastOpenStep(t, "a"), false);
  assert.equal(togglesLastOpenStep(t, "b"), false);
});

test("an already-completed task never re-triggers", () => {
  const t = task({ status: "completed", checklist: [step("a", true), step("b", false)] });
  assert.equal(togglesLastOpenStep(t, "b"), false);
});

test("a step that is not on the task decides nothing", () => {
  const t = task({ checklist: [step("a", false)] });
  assert.equal(togglesLastOpenStep(t, "missing"), false);
});

test("a task with no checklist has no last step", () => {
  assert.equal(togglesLastOpenStep(task(), "anything"), false);
  assert.equal(togglesLastOpenStep(task({ checklist: undefined }), "anything"), false);
});

test("nothing is not a task", () => {
  assert.equal(togglesLastOpenStep(null, "a"), false);
  assert.equal(togglesLastOpenStep(undefined, "a"), false);
});

test("revalidation passes when every step is genuinely done", () => {
  assert.equal(autoCompleteStillValid(task({ checklist: [step("a", true), step("b", true)] })), true);
});

test("unticking within the delay cancels the completion", () => {
  /* The exact race the delay exists for: scheduled while complete, fired after
     the user changed their mind. */
  assert.equal(autoCompleteStillValid(task({ checklist: [step("a", true), step("b", false)] })), false);
});

test("a task completed by another route in the meantime is not completed twice", () => {
  const t = task({ status: "completed", checklist: [step("a", true)] });
  assert.equal(autoCompleteStillValid(t), false);
});

test("a checklist emptied within the delay cancels the completion", () => {
  assert.equal(autoCompleteStillValid(task({ checklist: [] })), false);
});

test("a task that no longer exists cancels the completion", () => {
  /* A detached occurrence whose creation was undone inside the delay window. */
  assert.equal(autoCompleteStillValid(null), false);
  assert.equal(autoCompleteStillValid(undefined), false);
});

test("the delay is long enough to change your mind and short enough to feel immediate", () => {
  assert.ok(AUTO_COMPLETE_DELAY_MS >= 250);
  assert.ok(AUTO_COMPLETE_DELAY_MS <= 800);
});
