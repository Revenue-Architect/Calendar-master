import test from "node:test";
import assert from "node:assert/strict";
import {
  canExposeEventTouchResize,
  classifyTimelineTouchTarget,
  EVENT_TOUCH_GRIP_MIN_HEIGHT,
  EVENT_TOUCH_GRIP_MIN_WIDTH,
  TOUCH_TARGET_KINDS,
} from "./timelineTouchTarget.js";

function fakeNode(markers = {}, parent = null) {
  const node = {
    parentElement: parent,
    getAttribute(name) { return markers[name] ?? null; },
    closest(selector) {
      for (let current = node; current; current = current.parentElement) {
        if (selector.includes("[data-timeline-complete]") && current.getAttribute("data-timeline-complete") != null) return current;
        if (selector.includes("a[href]") && current.getAttribute("href") != null) return current;
        if (selector.includes("[data-join]") && current.getAttribute("data-join") != null) return current;
        if (selector.includes("[data-touch-resize]") && current.getAttribute("data-touch-resize") != null) return current;
        if (selector.includes("[data-action-estimate]") && current.getAttribute("data-action-estimate") != null) return current;
        if (selector.includes("[data-event-id]") && current.getAttribute("data-event-id") != null) return current;
        if (selector.includes("[data-task-chip]") && current.getAttribute("data-task-chip") != null) return current;
      }
      return null;
    },
  };
  return node;
}

test("Event touch grip eligibility has exact coarse-pointer boundaries", () => {
  assert.equal(canExposeEventTouchResize({ height: EVENT_TOUCH_GRIP_MIN_HEIGHT - 1, width: EVENT_TOUCH_GRIP_MIN_WIDTH }), false);
  assert.equal(canExposeEventTouchResize({ height: EVENT_TOUCH_GRIP_MIN_HEIGHT, width: EVENT_TOUCH_GRIP_MIN_WIDTH }), true);
  assert.equal(canExposeEventTouchResize({ height: EVENT_TOUCH_GRIP_MIN_HEIGHT + 1, width: EVENT_TOUCH_GRIP_MIN_WIDTH + 1 }), true);
  assert.equal(canExposeEventTouchResize({ height: EVENT_TOUCH_GRIP_MIN_HEIGHT, width: EVENT_TOUCH_GRIP_MIN_WIDTH - 1 }), false);
});

test("a desktop data-resize overlay without a semantic touch marker remains Event body", () => {
  const event = fakeNode({ "data-event-id": "evt-1" });
  const overlay = fakeNode({ "data-resize": "evt-1", "data-resize-edge": "start" }, event);
  assert.deepEqual(classifyTimelineTouchTarget(overlay), { kind: TOUCH_TARGET_KINDS.eventBody, edge: null, node: event });
});

test("semantic Event start/end grips classify as resize", () => {
  const event = fakeNode({ "data-event-id": "evt-1" });
  for (const edge of ["start", "end"]) {
    const grip = fakeNode({ "data-touch-resize": edge }, event);
    const result = classifyTimelineTouchTarget(grip);
    assert.equal(result.kind, TOUCH_TARGET_KINDS.eventResize);
    assert.equal(result.edge, edge);
    assert.equal(result.node, grip);
  }
});

test("Action estimate and body are distinct touch roles", () => {
  const action = fakeNode({ "data-task-chip": "task-1" });
  assert.equal(classifyTimelineTouchTarget(fakeNode({}, action)).kind, TOUCH_TARGET_KINDS.actionBody);
  assert.equal(classifyTimelineTouchTarget(fakeNode({ "data-action-estimate": "task-1" }, action)).kind, TOUCH_TARGET_KINDS.actionEstimate);
});

test("JOIN and completion controls outrank their containing card", () => {
  const event = fakeNode({ "data-event-id": "evt-1" });
  const join = fakeNode({ href: "https://meet.example" }, event);
  join.target = "_blank";
  assert.equal(classifyTimelineTouchTarget(join).kind, TOUCH_TARGET_KINDS.link);
  assert.equal(classifyTimelineTouchTarget({ target: join }).kind, TOUCH_TARGET_KINDS.link);
  const action = fakeNode({ "data-task-chip": "task-1" });
  assert.equal(classifyTimelineTouchTarget(fakeNode({ "data-timeline-complete": "task-1" }, action)).kind, TOUCH_TARGET_KINDS.complete);
});

test("unmarked space is empty", () => {
  assert.equal(classifyTimelineTouchTarget(fakeNode()).kind, TOUCH_TARGET_KINDS.empty);
});
