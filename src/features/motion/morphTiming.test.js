import assert from "node:assert/strict";
import test from "node:test";

import {
  CASCADE_GROUPS,
  MORPH_FADE,
  MORPH_LEAD,
  MORPH_MS,
  MORPH_STAGE_CONTENT,
  MORPH_STAGE_REVEAL,
  MORPH_STEP,
  cascadeSpan,
} from "./morphTiming.js";

test("the cascade finishes inside the shape it belongs to", () => {
  /* lead + 8*step + fade must stay <= 1. If this fails, group 8 lands after
     MORPH_MS and the composer reads as a fade laid over a settled sheet. */
  assert.ok(cascadeSpan() <= 1);
  const lastStart = MORPH_MS * (MORPH_LEAD + CASCADE_GROUPS * MORPH_STEP);
  const lastEnd = lastStart + MORPH_MS * MORPH_FADE;
  assert.ok(lastEnd <= MORPH_MS, `group ${CASCADE_GROUPS} ends at ${lastEnd}ms, past MORPH_MS ${MORPH_MS}`);
});

test("stage handoffs stay ordered fractions of the container", () => {
  assert.ok(MORPH_STAGE_REVEAL < MORPH_STAGE_CONTENT);
  assert.ok(MORPH_STAGE_CONTENT < 1);
  assert.equal(MORPH_MS * MORPH_STAGE_REVEAL, 268.8);
  assert.equal(MORPH_MS * MORPH_STAGE_CONTENT, 331.2);
});

test("the lead is the wait that keeps content off an unfinished clip", () => {
  assert.equal(MORPH_LEAD, 0.35);
  assert.ok(MORPH_LEAD > MORPH_STAGE_REVEAL * 0, "lead is a fraction, not milliseconds");
});
