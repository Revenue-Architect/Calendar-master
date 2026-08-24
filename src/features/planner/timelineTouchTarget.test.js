import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_COMPLETION_LANE,
  ACTION_ESTIMATE_LANE,
  ACTION_MOVE_MIN_WIDTH,
  canExposeActionTouchResize,
  canExposeActionTouchMove,
  canExposeEventTouchResize,
  canExposeEventTouchMove,
  EVENT_JOIN_RESERVATION,
  classifyTimelineTouchTarget,
  EVENT_JOIN_LANE,
  EVENT_TOUCH_GRIP_MIN_HEIGHT,
  EVENT_TOUCH_GRIP_MIN_WIDTH,
  EVENT_TOUCH_GRIP_SIZE,
  EVENT_TOUCH_BODY_MIN_WIDTH,
  ACTION_TOUCH_BODY_MIN_WIDTH,
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
        if (selector.includes("[data-touch-move]") && current.getAttribute("data-touch-move") != null) return current;
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
  assert.equal(canExposeEventTouchResize({ height: EVENT_TOUCH_GRIP_MIN_HEIGHT, width: EVENT_TOUCH_GRIP_MIN_WIDTH + EVENT_JOIN_RESERVATION - 1, hasJoin: true }), false);
  assert.equal(canExposeEventTouchResize({ height: EVENT_TOUCH_GRIP_MIN_HEIGHT, width: EVENT_TOUCH_GRIP_MIN_WIDTH + EVENT_JOIN_RESERVATION, hasJoin: true }), true);
  assert.equal(canExposeEventTouchResize({ height: EVENT_TOUCH_GRIP_MIN_HEIGHT, width: EVENT_TOUCH_GRIP_MIN_WIDTH, hasJoin: true }), false);
  assert.equal(EVENT_JOIN_RESERVATION, EVENT_JOIN_LANE + 4);
});

test("Event move eligibility leaves a readable body after its reserved lanes", () => {
  const moveOnly = EVENT_TOUCH_GRIP_SIZE + EVENT_TOUCH_BODY_MIN_WIDTH;
  assert.equal(canExposeEventTouchMove({ height: 44, width: moveOnly - 1 }), false);
  assert.equal(canExposeEventTouchMove({ height: 44, width: moveOnly }), true);
  assert.equal(canExposeEventTouchMove({ height: 43, width: moveOnly }), false);
  assert.equal(canExposeEventTouchMove({ height: 44, width: moveOnly + EVENT_JOIN_RESERVATION, hasJoin: true }), true);
  assert.equal(canExposeEventTouchMove({ height: 44, width: moveOnly + EVENT_JOIN_RESERVATION - 1, hasJoin: true }), false);
  assert.equal(canExposeEventTouchMove({ height: 88, width: EVENT_TOUCH_GRIP_MIN_WIDTH, hasResize: true }), true);
  assert.equal(canExposeEventTouchMove({ height: 88, width: EVENT_TOUCH_GRIP_MIN_WIDTH - 1, hasResize: true }), false);
});

test("Action estimate resize reserves completion and body lanes", () => {
  const minimum = ACTION_COMPLETION_LANE + ACTION_ESTIMATE_LANE + ACTION_MOVE_MIN_WIDTH + ACTION_TOUCH_BODY_MIN_WIDTH;
  assert.equal(canExposeActionTouchResize({ width: minimum - 1, hasEstimate: true }), false);
  assert.equal(canExposeActionTouchResize({ width: minimum, hasEstimate: true }), true);
  assert.equal(canExposeActionTouchResize({ width: minimum, hasEstimate: false }), false);
});

test("Action move eligibility leaves a readable body after completion and controls", () => {
  const minimum = ACTION_COMPLETION_LANE + ACTION_MOVE_MIN_WIDTH + ACTION_TOUCH_BODY_MIN_WIDTH;
  assert.equal(canExposeActionTouchMove({ width: minimum - 1 }), false);
  assert.equal(canExposeActionTouchMove({ width: minimum }), true);
  assert.equal(canExposeActionTouchMove({ width: minimum + ACTION_ESTIMATE_LANE - 1, hasEstimate: true }), false);
  assert.equal(canExposeActionTouchMove({ width: minimum + ACTION_ESTIMATE_LANE, hasEstimate: true }), true);
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

test("an explicit data-touch-move descendant is a distinct Event and Action role", () => {
  assert.equal(TOUCH_TARGET_KINDS.eventMove, "event-move");
  assert.equal(TOUCH_TARGET_KINDS.actionMove, "action-move");

  const event = fakeNode({ "data-event-id": "evt-1" });
  const eventMove = fakeNode({ "data-touch-move": "evt-1" }, event);
  const eventResult = classifyTimelineTouchTarget(eventMove);
  assert.equal(eventResult.kind, "event-move");
  assert.equal(eventResult.edge, null);
  assert.equal(eventResult.node, eventMove);
  assert.equal(classifyTimelineTouchTarget(event).kind, TOUCH_TARGET_KINDS.eventBody);

  const action = fakeNode({ "data-task-chip": "task-1" });
  const actionMove = fakeNode({ "data-touch-move": "task-1" }, action);
  const actionResult = classifyTimelineTouchTarget(actionMove);
  assert.equal(actionResult.kind, "action-move");
  assert.equal(actionResult.edge, null);
  assert.equal(actionResult.node, actionMove);
  assert.equal(classifyTimelineTouchTarget(action).kind, TOUCH_TARGET_KINDS.actionBody);
});

test("JOIN, completion, and resize outrank data-touch-move", () => {
  const event = fakeNode({ "data-event-id": "evt-1" });
  const eventResize = fakeNode({ "data-touch-resize": "end", "data-touch-move": "evt-1" }, event);
  assert.equal(classifyTimelineTouchTarget(eventResize).kind, TOUCH_TARGET_KINDS.eventResize);
  const join = fakeNode({ href: "https://meet.example", "data-touch-move": "evt-1" }, event);
  assert.equal(classifyTimelineTouchTarget(join).kind, TOUCH_TARGET_KINDS.link);

  const action = fakeNode({ "data-task-chip": "task-1" });
  const complete = fakeNode({ "data-timeline-complete": "task-1", "data-touch-move": "task-1" }, action);
  assert.equal(classifyTimelineTouchTarget(complete).kind, TOUCH_TARGET_KINDS.complete);
  const estimate = fakeNode({ "data-action-estimate": "task-1", "data-touch-move": "task-1" }, action);
  assert.equal(classifyTimelineTouchTarget(estimate).kind, TOUCH_TARGET_KINDS.actionEstimate);
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
