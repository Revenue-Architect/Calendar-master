import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERACTION_OWNERS,
  INTERACTION_ORIGINS,
  INTERACTION_PHASES,
  activateInteraction,
  activateWithMovement,
  armInteraction,
  cancelActiveInteraction,
  cancelArmedInteraction,
  clickFollowsCancelledArm,
  commitInteraction,
  createIdleInteraction,
  createScrollSession,
  settleInteraction,
  timelineChromeIntent,
  rubberBand,
  shouldCommitSwipe,
  finishCommittedInteraction,
  interactionOwnerAllows,
  recordTimelineGestureProposalHistory,
  resolveShortEventEdge,
  restoreCancelledInteraction,
  shouldYieldArmedHold,
  timelineTouchReleaseIntent,
  updateInteractionProposal,
} from "./timelineInteractionState.js";

const before = { start: 600, duration: 30, date: "2026-08-13" };

function armed() {
  return armInteraction(createIdleInteraction(), {
    owner: INTERACTION_OWNERS.dayStream,
    surface: "day",
    input: "pointer",
    origin: INTERACTION_ORIGINS.eventBody,
    mode: "move",
    id: "evt-1",
    before,
  });
}

test("an armed press cancelled before lift returns to idle and suppresses the following click", () => {
  const next = cancelArmedInteraction(armed());
  assert.equal(next.phase, INTERACTION_PHASES.idle);
  assert.equal(next.proposal, null);
  assert.equal(clickFollowsCancelledArm(next), true);
});

test("cancelling an active move restores the original snapshot and never asks to persist", () => {
  const active = updateInteractionProposal(activateInteraction(armed()), { start: 660, duration: 30, date: "2026-08-13" });
  const cancelled = cancelActiveInteraction(active);
  assert.equal(cancelled.phase, INTERACTION_PHASES.cancelled);
  assert.deepEqual(cancelled.proposal, before);
  assert.deepEqual(cancelled.before, before);
  const idle = restoreCancelledInteraction(cancelled);
  assert.equal(idle.phase, INTERACTION_PHASES.idle);
  assert.equal(clickFollowsCancelledArm(idle), true);
});

test("start-edge and end-edge cancellations restore the exact original boundaries", () => {
  for (const origin of [INTERACTION_ORIGINS.eventStart, INTERACTION_ORIGINS.eventEnd]) {
    const start = armInteraction(createIdleInteraction(), {
      owner: INTERACTION_OWNERS.dayStream,
      origin,
      mode: origin === INTERACTION_ORIGINS.eventStart ? "resize-start" : "resize-end",
      id: "evt-1",
      before,
    });
    const moved = updateInteractionProposal(activateInteraction(start), { start: 580, duration: 50, date: "2026-08-13" });
    const cancelled = cancelActiveInteraction(moved);
    assert.deepEqual(cancelled.proposal, before, origin);
  }
});

test("a normal release with no proposal change produces no persist", () => {
  const { shouldPersist, state } = commitInteraction(activateInteraction(armed(), before));
  assert.equal(shouldPersist, false);
  assert.equal(state.phase, INTERACTION_PHASES.idle);
});

test("settling an active change returns to click-suppressed idle and is persistence-idempotent", () => {
  const active = activateWithMovement(armed(), { start: 615, duration: 30, date: "2026-08-13" });
  const settled = settleInteraction(active);
  assert.equal(settled.phase, INTERACTION_PHASES.idle);
  assert.equal(settled.sequence, active.sequence);
  assert.equal(clickFollowsCancelledArm(settled), true);

  const repeated = settleInteraction(settled);
  assert.equal(repeated.phase, INTERACTION_PHASES.idle);
  assert.equal(repeated.sequence, settled.sequence);
  assert.equal(commitInteraction(repeated).shouldPersist, false);
});

test("a changed proposal commits exactly once even if a fallback observes the same release", () => {
  const active = updateInteractionProposal(activateInteraction(armed()), { start: 615, duration: 30, date: "2026-08-13" });
  const first = commitInteraction(active);
  assert.equal(first.shouldPersist, true);
  assert.equal(first.state.phase, INTERACTION_PHASES.committed);
  const second = commitInteraction(first.state);
  assert.equal(second.shouldPersist, false);
  const finished = finishCommittedInteraction(first.state);
  assert.equal(finished.phase, INTERACTION_PHASES.idle);
  assert.equal(clickFollowsCancelledArm(finished), true);
});

test("the movement that crosses activation updates the proposal in that same frame", () => {
  const next = activateWithMovement(armed(), { start: 620, duration: 30, date: "2026-08-13" });
  assert.equal(next.phase, INTERACTION_PHASES.active);
  assert.equal(next.proposal.start, 620);
});

test("elapsed lift time alone is not recorded as manipulation", () => {
  const active = activateInteraction(armed(), before);
  assert.equal(active.phase, INTERACTION_PHASES.active);
  assert.equal(active.proposalChanged, false);
});

test("proposal history survives a deliberate move back to the origin", () => {
  const moved = updateInteractionProposal(
    activateInteraction(armed(), before),
    { start: 630, duration: 30, date: "2026-08-13" },
  );
  const returned = updateInteractionProposal(moved, before);
  assert.equal(returned.proposalChanged, true);
  assert.deepEqual(returned.proposal, before);
  assert.equal(commitInteraction(returned).shouldPersist, false);
});

test("a lifted stationary touch inspects while a moved-returned touch remains a gesture", () => {
  const stationary = { mode: "move", kind: "event", touchId: 1, start: 600, dur: 30, was: { start: 600, dur: 30 } };
  assert.equal(timelineTouchReleaseIntent(stationary, activateInteraction(armed(), before), "2026-08-13"), "inspect");

  const moved = { ...stationary, proposalChanged: true };
  assert.equal(recordTimelineGestureProposalHistory(moved, moved, null, "2026-08-13"), true);
  assert.equal(timelineTouchReleaseIntent(moved, null, "2026-08-13"), "finish");
});

test("an Action drop target counts as manipulation even when its time is unchanged", () => {
  const action = { mode: "task", kind: "task", id: "task-a", touchId: 1, start: 600, dur: 30, was: { start: 600, dur: 30 } };
  const overSibling = { ...action, overTask: "task-b" };
  assert.equal(recordTimelineGestureProposalHistory(action, overSibling, null, "2026-08-13"), true);
  assert.equal(timelineTouchReleaseIntent(overSibling, null, "2026-08-13"), "finish");
});

test("an armed hold yields to scroll once the shared threshold is crossed", () => {
  assert.equal(shouldYieldArmedHold({ x: 10, y: 10 }, { x: 12, y: 12 }), false);
  assert.equal(shouldYieldArmedHold({ x: 10, y: 10 }, { x: 10, y: 30 }), true);
});

test("only the recorded owner may continue a live sequence", () => {
  const live = activateInteraction(armed());
  assert.equal(interactionOwnerAllows(live, INTERACTION_OWNERS.dayStream), true);
  assert.equal(interactionOwnerAllows(live, INTERACTION_OWNERS.weekGrid), false);
  assert.equal(interactionOwnerAllows(createIdleInteraction(), INTERACTION_OWNERS.weekGrid), true);
});

test("short cards resolve the nearest edge instead of stacking two grips", () => {
  assert.equal(resolveShortEventEdge(100, 100, 24), "start");
  assert.equal(resolveShortEventEdge(120, 100, 24), "end");
});

test("a scroll session expires after end instead of remaining sticky", async () => {
  const session = createScrollSession({ timeoutMs: 15 });
  session.begin();
  assert.equal(session.isActive(), true);
  session.end();
  assert.equal(session.isActive(), true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(session.isActive(), false);
});

test("timelineChromeIntent restores only at the top of the timeline", () => {
  /* Midnight is the moment the day heading is wanted back. */
  assert.equal(timelineChromeIntent({ previousScrollTop: 200, nextScrollTop: 0 }), "restore");
  assert.equal(timelineChromeIntent({ previousScrollTop: 200, nextScrollTop: 20 }), "restore");
});

test("timelineChromeIntent stays collapsed while scrolling up mid-timeline", () => {
  /* The header must not reappear over 3pm just because the finger moved up. */
  assert.equal(timelineChromeIntent({ previousScrollTop: 900, nextScrollTop: 700 }), "none");
  assert.equal(timelineChromeIntent({ previousScrollTop: 120, nextScrollTop: 100 }), "none");
});

test("timelineChromeIntent collapses only past the trigger, moving away", () => {
  assert.equal(timelineChromeIntent({ previousScrollTop: 0, nextScrollTop: 40 }), "collapse");
  /* Ten pixels down is still the top of the day, so the heading stays. */
  assert.equal(timelineChromeIntent({ previousScrollTop: 0, nextScrollTop: 10 }), "restore");
});

test("timelineChromeIntent treats one hour of scroll as still the top of the day", () => {
  /* One wheel tick (~24px) used to collapse the week ribbon. The live trigger
     is the current hour row so midnight stays visible until the reader has
     actually left 12AM. */
  const hour = 68;
  assert.equal(timelineChromeIntent({ previousScrollTop: 0, nextScrollTop: 24, triggerPx: hour }), "restore");
  assert.equal(timelineChromeIntent({ previousScrollTop: 0, nextScrollTop: 40, triggerPx: hour }), "restore");
  assert.equal(timelineChromeIntent({ previousScrollTop: 0, nextScrollTop: hour, triggerPx: hour }), "restore");
  assert.equal(timelineChromeIntent({ previousScrollTop: 0, nextScrollTop: hour + 1, triggerPx: hour }), "collapse");
});

test("timelineChromeIntent ignores sub-pixel jitter in both directions", () => {
  assert.equal(timelineChromeIntent({ previousScrollTop: 500, nextScrollTop: 500 }), "none");
  assert.equal(timelineChromeIntent({ previousScrollTop: 500, nextScrollTop: 500.5 }), "none");
});

test("rubberBand passes small drags through untouched", () => {
  assert.equal(rubberBand(80, 140), 80);
  assert.equal(rubberBand(-80, 140), -80);
});

test("rubberBand resists past the limit instead of stopping dead", () => {
  /* The clamp returned exactly 140 for every value beyond it. */
  const at200 = rubberBand(200, 140);
  assert.ok(at200 > 140, "must keep moving past the soft limit");
  assert.ok(at200 < 200, "but must move less than the finger");
  assert.ok(rubberBand(400, 140) > at200, "and must never stop increasing");
});

test("rubberBand is symmetric", () => {
  assert.equal(rubberBand(-300, 140), -rubberBand(300, 140));
});

test("shouldCommitSwipe accepts a fast flick that never reaches the distance", () => {
  assert.equal(shouldCommitSwipe({ delta: 50, elapsedMs: 120, distanceThreshold: 64 }), true);
});

test("shouldCommitSwipe still rejects a slow short drag", () => {
  assert.equal(shouldCommitSwipe({ delta: 50, elapsedMs: 900, distanceThreshold: 64 }), false);
});

test("shouldCommitSwipe still accepts distance regardless of speed", () => {
  assert.equal(shouldCommitSwipe({ delta: 90, elapsedMs: 4000, distanceThreshold: 64 }), true);
});
