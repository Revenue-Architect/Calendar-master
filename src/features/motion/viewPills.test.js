import assert from "node:assert/strict";
import test from "node:test";
import {
  VIEW_PILL_COMPACT_MAX, VIEW_PILL_ICON, VIEW_PILL_WORD, VIEW_PILL_GAP,
  viewPillTrackWidth, viewPillSlots, viewPillIndicatorBox, viewPillFlipOffset, viewPillLabelClip,
  viewPillSlotWidth,
} from "./viewPills.js";

test("a compact tab only ever occupies a reserved slot", () => {
  assert.equal(viewPillSlotWidth(true), VIEW_PILL_ICON + VIEW_PILL_WORD);
  assert.equal(viewPillSlotWidth(false), VIEW_PILL_ICON);
  const slots = viewPillSlots({ activeIndex: 1 });
  assert.deepEqual(slots.map((slot) => slot.width), [
    viewPillSlotWidth(false),
    viewPillSlotWidth(true),
    viewPillSlotWidth(false),
  ]);
});

test("reserves one word plus three icon slots so WEEK is not crushed", () => {
  assert.equal(viewPillTrackWidth(), VIEW_PILL_ICON * 3 + VIEW_PILL_GAP * 2 + VIEW_PILL_WORD);
  /* Today's labelled tablist measures 276.4px, so a reserved track is a shrink.
     240 is the ceiling the PRD's layout contract allows. */
  assert.ok(viewPillTrackWidth() <= 240);
});

test("the track is the same width whichever sibling is open", () => {
  for (const activeIndex of [0, 1, 2]) {
    const slots = viewPillSlots({ activeIndex });
    const last = slots[slots.length - 1];
    assert.equal(last.left + last.width, viewPillTrackWidth());
  }
});

test("only the active sibling carries a word", () => {
  const slots = viewPillSlots({ activeIndex: 1 });
  assert.deepEqual(slots.map((slot) => slot.width), [
    VIEW_PILL_ICON, VIEW_PILL_ICON + VIEW_PILL_WORD, VIEW_PILL_ICON,
  ]);
  assert.deepEqual(slots.map((slot) => slot.left), [0, VIEW_PILL_ICON, VIEW_PILL_ICON * 2 + VIEW_PILL_WORD]);
});

test("the indicator box is the active slot, so it can never drift from it", () => {
  const box = viewPillIndicatorBox({ activeIndex: 2, height: 25 });
  const slots = viewPillSlots({ activeIndex: 2 });
  assert.deepEqual(box, { left: slots[2].left, top: 0, width: slots[2].width, height: 25 });
});

test("siblings translate by the word they are making room for", () => {
  const offset = (from, to, index) => viewPillFlipOffset({ fromIndex: from, toIndex: to, index });
  /* TIMELINE -> ACTIONS: the leftmost sibling is already home; the two to its
     right start one word further along and travel back. */
  assert.deepEqual([0, 1, 2].map((i) => offset(0, 2, i)), [0, VIEW_PILL_WORD, VIEW_PILL_WORD]);
  assert.deepEqual([0, 1, 2].map((i) => offset(2, 0, i)), [0, -VIEW_PILL_WORD, -VIEW_PILL_WORD]);
  assert.deepEqual([0, 1, 2].map((i) => offset(1, 2, i)), [0, 0, VIEW_PILL_WORD]);
  assert.deepEqual([0, 1, 2].map((i) => offset(0, 0, i)), [0, 0, 0]);
});

test("the word is revealed by a clip, never by a track animation", () => {
  assert.equal(viewPillLabelClip(true), "inset(0 0 0 0)");
  assert.equal(viewPillLabelClip(false), "inset(0 100% 0 0)");
});

test("compact behavior stops one hundredth of a pixel below Tailwind's sm", () => {
  assert.equal(VIEW_PILL_COMPACT_MAX, 639.98);
});

test("label side resolves relative to activeIndex correctly", () => {
  assert.equal(viewPillLabelClip(false, "left"), "inset(0 100% 0 0)");
  assert.equal(viewPillLabelClip(false, "right"), "inset(0 0 0 100%)");
});

test("track width and slot calculations remain stable for 2, 3, 4 option sets", () => {
  for (const count of [2, 3, 4, 5]) {
    const total = viewPillTrackWidth({ count });
    assert.equal(total, VIEW_PILL_ICON * count + VIEW_PILL_WORD);
    const slots = viewPillSlots({ count, activeIndex: 0 });
    assert.equal(slots.length, count);
    const last = slots[count - 1];
    assert.equal(last.left + last.width, total);
  }
});
