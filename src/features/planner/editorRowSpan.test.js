import test from "node:test";
import assert from "node:assert/strict";
import { ROW_HALF_BASIS, ROW_HALF_MIN, rowSpan } from "./editorRowSpan.js";

test("a full row takes the whole band and imposes no floor", () => {
  const style = rowSpan("full");
  assert.equal(style.flexBasis, "100%");
  /* minWidth 0 rather than unset: a flex item defaults to min-width:auto, which
     refuses to shrink below its content and pushes long text out of the band. */
  assert.equal(style.minWidth, 0);
});

test("an unrecognised span is treated as full rather than silently half", () => {
  assert.deepEqual(rowSpan(undefined), rowSpan("full"));
  assert.deepEqual(rowSpan(null), rowSpan("full"));
  assert.deepEqual(rowSpan("halfish"), rowSpan("full"));
});

test("a half row pairs, and carries the floor that lets it split", () => {
  const style = rowSpan("half");
  assert.equal(style.flexBasis, ROW_HALF_BASIS);
  assert.equal(style.minWidth, ROW_HALF_MIN);
});

test("two halves plus the band's 8px gap total exactly one band", () => {
  /* The basis gives up 4px per side. If this is ever changed without changing the
     band's gap to match, flex-grow reclaims the difference and the mistake stays
     invisible until one of the rows paints a background. */
  assert.equal(ROW_HALF_BASIS, "calc(50% - 4px)");
});

test("an open row takes the whole band even though it asked for half", () => {
  /* Its options are wrapping chips; half a band shreds them across three lines. */
  assert.deepEqual(rowSpan("half", true), rowSpan("full"));
});

test("a closed half row is unaffected by the open flag's default", () => {
  assert.deepEqual(rowSpan("half", false), rowSpan("half"));
});

test("every row can shrink, so a pair reflows instead of overflowing the band", () => {
  for (const style of [rowSpan("full"), rowSpan("half"), rowSpan("half", true)]) {
    assert.equal(style.flexGrow, 1, "a lone row on its line must grow back to the full band");
  }
});

test("the floor leaves two halves room at the narrowest supported width", () => {
  /* 390px is the narrowest the editors are built for. The sheet is inset, so the
     band is narrower than the viewport; two floors plus the gap must still fit
     inside it or the pair would split at the width it was designed for. */
  const band = 358;
  assert.ok(ROW_HALF_MIN * 2 + 8 <= band,
    `two ${ROW_HALF_MIN}px halves plus an 8px gap must fit a ${band}px band`);
});
