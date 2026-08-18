import assert from "node:assert/strict";
import test from "node:test";

import {
  FLUID_TRIGGER_MAX_AGE_MS,
  clearFluidTrigger,
  recentFluidTriggerRadius,
  recentFluidTriggerRect,
  rememberFluidTrigger,
  rememberFluidTriggerFromEvent,
} from "./fluidTrigger.js";

test.beforeEach(() => {
  clearFluidTrigger();
});

test("a press is remembered as geometry, not as a node", () => {
  rememberFluidTrigger({ left: 10, top: 20, width: 40, height: 24, radius: "8px" }, 1_000);
  assert.deepEqual(recentFluidTriggerRect(1_000), {
    left: 10, top: 20, width: 40, height: 24, radius: "8px",
  });
  assert.equal(recentFluidTriggerRadius(1_000), "8px");
});

test("an empty or zero-size press is not an origin", () => {
  rememberFluidTrigger({ left: 0, top: 0, width: 0, height: 20, radius: "999px" }, 1_000);
  assert.equal(recentFluidTriggerRect(1_000), null);
  rememberFluidTrigger(null, 1_000);
  assert.equal(recentFluidTriggerRect(1_000), null);
});

test("a snapshot older than the window is not an origin", () => {
  rememberFluidTrigger({ left: 0, top: 0, width: 40, height: 20, radius: "999px" }, 1_000);
  assert.ok(recentFluidTriggerRect(1_000 + FLUID_TRIGGER_MAX_AGE_MS));
  assert.equal(recentFluidTriggerRect(1_000 + FLUID_TRIGGER_MAX_AGE_MS + 1), null);
});

test("a keystroke-shaped clear forgets the press", () => {
  rememberFluidTrigger({ left: 0, top: 0, width: 40, height: 20, radius: "12px" }, 1_000);
  clearFluidTrigger();
  assert.equal(recentFluidTriggerRect(1_000), null);
});

test("a press on a matching control walks out from the true target", () => {
  const button = {
    closest(selector) {
      assert.ok(selector.includes("button"));
      return this;
    },
    getBoundingClientRect() {
      return { left: 4, top: 8, width: 80, height: 32 };
    },
  };
  rememberFluidTriggerFromEvent(
    { target: { closest: (selector) => button.closest(selector) } },
    2_000,
    () => ({ borderTopLeftRadius: "999px" }),
  );
  assert.deepEqual(recentFluidTriggerRect(2_000), {
    left: 4, top: 8, width: 80, height: 32, radius: "999px",
  });
});

test("a press that misses a control leaves no origin", () => {
  rememberFluidTrigger({ left: 1, top: 1, width: 10, height: 10, radius: "0px" }, 1);
  rememberFluidTriggerFromEvent(
    { target: { closest() { return null; } } },
    2,
    () => ({ borderTopLeftRadius: "4px" }),
  );
  assert.equal(recentFluidTriggerRect(2), null);
});
