import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_SWIPE_COMMIT_PX,
  DIRECT_DRAG_ACTIVATION_PX,
  EMPTY_SPACE_LIFT_MS,
  HOLD_CANCEL_PX,
  LIFT_MS,
  MINUTES_PER_DAY,
  MIN_EVENT_MINUTES,
  MIN_TASK_MINUTES,
  timelineBlockHeight,
  gestureChangedAnything,
  isResizable,
  liftDelayForTimelineTarget,
  minimumFor,
  movedEnoughToCancelHold,
  movedEnoughToActivateDirectDrag,
  pointerButtonsHeld,
  proposeGesture,
  proposeMove,
  proposeResizeEnd,
  proposeResizeStart,
  snapMinute,
  shouldCommitActionSwipe,
  timelineTouchIntent,
} from "./timelineGesture.js";

test("snapping lands on the grid and never leaves the day", () => {
  assert.equal(snapMinute(602), 600);
  assert.equal(snapMinute(603), 605);
  assert.equal(snapMinute(-40), 0);
  assert.equal(snapMinute(99_999), MINUTES_PER_DAY);
});

test("a nonsense step falls back rather than dividing by zero", () => {
  assert.equal(snapMinute(603, 0), 605);
  assert.equal(snapMinute(603, -5), 605);
  assert.equal(snapMinute(603, Number.NaN), 605);
});

test("a mouse drag is dead once the buttons are up", () => {
  assert.equal(pointerButtonsHeld({ pointerType: "mouse", buttons: 1 }), true);
  assert.equal(pointerButtonsHeld({ pointerType: "mouse", buttons: 0 }), false);
  assert.equal(pointerButtonsHeld({ pointerType: "touch", buttons: 0 }), true);
});

test("a press that has not travelled is still a press", () => {
  const origin = { x: 100, y: 100 };
  assert.equal(movedEnoughToCancelHold(origin, { x: 100, y: 100 }), false);
  assert.equal(movedEnoughToCancelHold(origin, { x: 104, y: 104 }), false, "within the threshold");
  assert.equal(movedEnoughToCancelHold(origin, { x: 100, y: 100 + HOLD_CANCEL_PX + 1 }), true);
  assert.equal(movedEnoughToCancelHold(null, { x: 0, y: 0 }), false);
});

test("desktop direct manipulation has its own small movement threshold", () => {
  const origin = { x: 100, y: 100 };
  assert.equal(movedEnoughToActivateDirectDrag(origin, origin), false);
  assert.equal(movedEnoughToActivateDirectDrag(origin, { x: 102, y: 100 }), false);
  assert.equal(movedEnoughToActivateDirectDrag(origin, { x: 103, y: 100 }), true);
  assert.equal(movedEnoughToActivateDirectDrag(origin, { x: 103, y: 102 }), true);
  assert.equal(movedEnoughToActivateDirectDrag(origin, { x: 100, y: 100 }, DIRECT_DRAG_ACTIVATION_PX), false);
  assert.equal(movedEnoughToActivateDirectDrag(null, { x: 0, y: 0 }), false);
});

test("empty space waits longer than a card before becoming a timeline gesture", () => {
  assert.equal(liftDelayForTimelineTarget("card"), LIFT_MS);
  assert.equal(liftDelayForTimelineTarget("resize"), LIFT_MS);
  assert.equal(liftDelayForTimelineTarget("empty"), EMPTY_SPACE_LIFT_MS);
  assert.ok(LIFT_MS <= 300, "card manipulation must still feel immediate");
  assert.equal(EMPTY_SPACE_LIFT_MS, 500, "empty creation should wait half a second");
});

test("touch intent distinguishes a horizontal action swipe from timeline scrolling", () => {
  const origin = { x: 100, y: 100 };
  assert.equal(timelineTouchIntent(origin, { x: 108, y: 103 }), "pending");
  assert.equal(timelineTouchIntent(origin, { x: 118, y: 104 }), "horizontal");
  assert.equal(timelineTouchIntent(origin, { x: 104, y: 118 }), "vertical");
  assert.equal(timelineTouchIntent(origin, { x: 118, y: 116 }), "pending", "diagonal movement belongs to neither custom gesture");
});

test("a scheduled action completes only after a deliberate right swipe", () => {
  const origin = { x: 40, y: 200 };
  assert.equal(shouldCommitActionSwipe(origin, { x: 40 + ACTION_SWIPE_COMMIT_PX - 1, y: 204 }), false);
  assert.equal(shouldCommitActionSwipe(origin, { x: 40 + ACTION_SWIPE_COMMIT_PX, y: 204 }), true);
  assert.equal(shouldCommitActionSwipe(origin, { x: 120, y: 280 }), false, "vertical travel remains a scroll");
  assert.equal(shouldCommitActionSwipe(origin, { x: -40, y: 200 }), false, "left swipes do not complete");
});

test("moving keeps the length and takes the grab point into account", () => {
  /* Picked up 20 minutes into a 60-minute block, dropped with the pointer at
     11:00 — the block starts at 10:40, not 11:00. */
  const moved = proposeMove({ pointerMinute: 660, grab: 20, duration: 60 });
  assert.equal(moved.start, 640);
  assert.equal(moved.duration, 60);
});

test("moving cannot push a block off either end of the day", () => {
  assert.equal(proposeMove({ pointerMinute: -500, grab: 0, duration: 60 }).start, 0);
  const late = proposeMove({ pointerMinute: MINUTES_PER_DAY + 500, grab: 0, duration: 60 });
  assert.equal(late.start, MINUTES_PER_DAY - 60);
  assert.equal(late.duration, 60);
});

test("resizing from the bottom keeps the start and moves the end", () => {
  const resized = proposeResizeEnd({ start: 600, pointerMinute: 720 });
  assert.equal(resized.start, 600, "the start is what a bottom-edge drag holds still");
  assert.equal(resized.duration, 120);
});

test("resizing from the bottom respects the floor for its kind", () => {
  assert.equal(proposeResizeEnd({ start: 600, pointerMinute: 601 }).duration, MIN_EVENT_MINUTES);
  assert.equal(proposeResizeEnd({ start: 600, pointerMinute: 400 }).duration, MIN_EVENT_MINUTES, "dragging above the start");
  assert.equal(proposeResizeEnd({ start: 600, pointerMinute: 601, kind: "task" }).duration, MIN_TASK_MINUTES);
});

test("resizing from the bottom cannot run past midnight", () => {
  const resized = proposeResizeEnd({ start: MINUTES_PER_DAY - 30, pointerMinute: MINUTES_PER_DAY + 400 });
  assert.equal(resized.start + resized.duration, MINUTES_PER_DAY);
});

test("resizing from the top keeps the end exactly", () => {
  /* The thing a person dragging a top edge is holding still in their head. */
  const resized = proposeResizeStart({ start: 600, duration: 60, pointerMinute: 540 });
  assert.equal(resized.start, 540);
  assert.equal(resized.duration, 120);
  assert.equal(resized.start + resized.duration, 660, "the end never moved");
});

test("resizing from the top respects the floor without moving the end", () => {
  const squeezed = proposeResizeStart({ start: 600, duration: 60, pointerMinute: 900 });
  assert.equal(squeezed.start + squeezed.duration, 660);
  assert.equal(squeezed.duration, MIN_EVENT_MINUTES);

  const task = proposeResizeStart({ start: 600, duration: 60, pointerMinute: 900, kind: "task" });
  assert.equal(task.start + task.duration, 660);
  assert.equal(task.duration, MIN_TASK_MINUTES);
});

test("resizing from the top cannot start before midnight", () => {
  const resized = proposeResizeStart({ start: 30, duration: 60, pointerMinute: -400 });
  assert.equal(resized.start, 0);
  assert.equal(resized.start + resized.duration, 90);
});

test("every proposal snaps, whichever edge is dragged", () => {
  assert.equal(proposeMove({ pointerMinute: 603, grab: 0, duration: 60 }).start % 5, 0);
  assert.equal(proposeResizeEnd({ start: 600, pointerMinute: 733 }).duration % 5, 0);
  assert.equal(proposeResizeStart({ start: 600, duration: 60, pointerMinute: 533 }).start % 5, 0);
});

test("the mode dispatcher agrees with the function it stands for", () => {
  const input = { start: 600, duration: 60, pointerMinute: 540, grab: 0 };
  assert.deepEqual(proposeGesture("resize-start", input), proposeResizeStart(input));
  assert.deepEqual(proposeGesture("resize-end", input), proposeResizeEnd(input));
  assert.deepEqual(proposeGesture("move", input), proposeMove(input));
  assert.deepEqual(proposeGesture("anything-else", input), proposeMove(input), "move is the default");
});

test("a drop that lands where it started changed nothing", () => {
  const at = { start: 600, duration: 60, date: "2026-08-11" };
  assert.equal(gestureChangedAnything(at, { ...at }), false);
  assert.equal(gestureChangedAnything(at, { ...at, start: 605 }), true);
  assert.equal(gestureChangedAnything(at, { ...at, duration: 65 }), true);
  assert.equal(gestureChangedAnything(at, { ...at, date: "2026-08-12" }), true);
  assert.equal(gestureChangedAnything(null, at), false);
});

test("an action with no estimate is a point on the day, not a block", () => {
  assert.equal(isResizable({ planned: { estimateMinutes: 30 } }, "task"), true);
  assert.equal(isResizable({ planned: { estimateMinutes: null } }, "task"), false);
  assert.equal(isResizable({ planned: {} }, "task"), false);
  assert.equal(isResizable({ planned: { estimateMinutes: 0 } }, "task"), false);
  /* Events always have a length, so they always have handles. */
  assert.equal(isResizable({ start: 600, dur: 60 }, "event"), true);
  assert.equal(isResizable(null, "event"), false);
});

test("the floors are the ones the surfaces are told to use", () => {
  assert.equal(minimumFor("event"), MIN_EVENT_MINUTES);
  assert.equal(minimumFor("task"), MIN_TASK_MINUTES);
  assert.equal(minimumFor(undefined), MIN_EVENT_MINUTES);
});

test("an Action block paints below 44px once the estimate drops under ~41 minutes", () => {
  /* Preferred hour row is 68px (HOUR_H). A 30-minute claim is half an hour
     minus the 3px inter-card gap: 31px. The old paint floor of 44px made every
     drag below ~41 minutes look stuck. */
  const dayHeight = 68 * 24;
  assert.equal(timelineBlockHeight(30, dayHeight), 31);
  assert.equal(timelineBlockHeight(15, dayHeight), 22);
  assert.ok(timelineBlockHeight(30, dayHeight) < 44);
  assert.equal(timelineBlockHeight(60, dayHeight), 65);
});

test("garbage in does not produce a record that cannot exist", () => {
  for (const bad of [Number.NaN, undefined, null, "nope", Infinity]) {
    const moved = proposeMove({ pointerMinute: bad, grab: bad, duration: 60 });
    assert.ok(moved.start >= 0 && moved.start <= MINUTES_PER_DAY - 60, `move ${String(bad)}`);

    const ended = proposeResizeEnd({ start: 600, pointerMinute: bad });
    assert.ok(ended.duration >= MIN_EVENT_MINUTES, `resize-end ${String(bad)}`);

    const started = proposeResizeStart({ start: 600, duration: 60, pointerMinute: bad });
    assert.equal(started.start + started.duration, 660, `resize-start ${String(bad)} moved the end`);
  }
});
