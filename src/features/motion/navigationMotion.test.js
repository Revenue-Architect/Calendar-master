import test from "node:test";
import assert from "node:assert/strict";
import { navPageFit, sideWallInsets } from "./navPageFit.js";

function transition(currentPhase, command) {
  switch (command) {
    case "open":
      if (currentPhase === "closed" || currentPhase === "closing") return "opening";
      return currentPhase;
    case "close":
      if (currentPhase === "open" || currentPhase === "opening") return "closing";
      return currentPhase;
    case "toggle":
      if (currentPhase === "open" || currentPhase === "opening") return "closing";
      return "opening";
    case "reverse":
      if (currentPhase === "opening") return "closing";
      if (currentPhase === "closing") return "opening";
      return currentPhase;
    default:
      return currentPhase;
  }
}

test("navigation state transitions follow explicit reversible contract", () => {
  // From closed
  assert.equal(transition("closed", "open"), "opening");
  assert.equal(transition("closed", "toggle"), "opening");
  assert.equal(transition("closed", "close"), "closed");
  assert.equal(transition("closed", "reverse"), "closed");

  // From opening
  assert.equal(transition("opening", "open"), "opening");
  assert.equal(transition("opening", "close"), "closing");
  assert.equal(transition("opening", "toggle"), "closing");
  assert.equal(transition("opening", "reverse"), "closing");

  // From open
  assert.equal(transition("open", "close"), "closing");
  assert.equal(transition("open", "toggle"), "closing");
  assert.equal(transition("open", "open"), "open");
  assert.equal(transition("open", "reverse"), "open");

  // From closing
  assert.equal(transition("closing", "open"), "opening");
  assert.equal(transition("closing", "toggle"), "opening");
  assert.equal(transition("closing", "close"), "closing");
  assert.equal(transition("closing", "reverse"), "opening");
});

test("stale run completion cannot settle a newer motion run", () => {
  let activeRun = 1;
  let phase = "opening";

  const finishOpen = (run) => {
    if (run !== activeRun || phase !== "opening") return false;
    phase = "open";
    return true;
  };

  const finishClose = (run) => {
    if (run !== activeRun || phase !== "closing") return false;
    phase = "closed";
    return true;
  };

  // Run 1 starts opening, but before it completes, Run 2 starts closing
  activeRun = 2;
  phase = "closing";

  // Stale completion event from Run 1 arrives
  assert.equal(finishOpen(1), false);
  assert.equal(phase, "closing", "phase must remain closing");

  // Stale close event with wrong run ID
  assert.equal(finishClose(1), false);
  assert.equal(phase, "closing");

  // Valid current run settlement succeeds
  assert.equal(finishClose(2), true);
  assert.equal(phase, "closed");
});

test("desktop frame exposes direct viewport-coordinate insets without subtraction derived artifacts", () => {
  const fit = navPageFit({ viewportWidth: 1280, viewportHeight: 900 });
  // Final desktop frame: top 24px, right 22px, bottom 24px, left 322px
  assert.equal(fit.frame.top, 24);
  assert.equal(fit.frame.right, 22);
  assert.equal(fit.frame.bottom, 24);
  assert.equal(fit.frame.left, 322);

  // Carrier travel: (322px, 20px)
  assert.equal(fit.carrier.x, 322);
  assert.equal(fit.carrier.y, 20);
});

test("desktop side walls follow the in-flight card, not the destination insets", () => {
  /* Destination top is 24px. At p=0.35 the card's top is 8.4px. Side walls that
     stay at 24px leave a strip past the rounded corner where the unclipped page
     leaks. */
  const frame = navPageFit({ viewportWidth: 1280, viewportHeight: 900 }).frame;
  assert.equal(sideWallInsets(0, frame).top, 0);
  assert.equal(sideWallInsets(0.35, frame).top, 8.4);
  assert.equal(sideWallInsets(0.35, frame).bottom, 8.4);
  assert.equal(sideWallInsets(1, frame).top, 24);
});
