import assert from "node:assert/strict";
import test from "node:test";

import { THEMES } from "./themes.js";
import { contrastRatio, describeFailure, failures, luminance, parseHex, readable, readableOn } from "./contrast.js";
import { TYPE_SCALE, isLargeText, requiredRatio } from "./typography.js";

test("the arithmetic matches the definition at its endpoints", () => {
  assert.deepEqual(parseHex("#CCFF00"), [204, 255, 0]);
  assert.deepEqual(parseHex("fff"), [255, 255, 255]);
  assert.equal(luminance("#000000"), 0);
  assert.equal(luminance("#FFFFFF"), 1);
  /* Black on white is the maximum a screen can do. */
  assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF") * 100) / 100, 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  /* Order does not matter — the ratio is between them, not from one to another. */
  assert.equal(contrastRatio("#123456", "#FEDCBA"), contrastRatio("#FEDCBA", "#123456"));
});

test("a colour that is not a colour is an error, not a silent zero", () => {
  assert.throws(() => parseHex("rebeccapurple"), RangeError);
  assert.throws(() => parseHex("#12345"), RangeError);
  assert.throws(() => parseHex(null), TypeError);
});

/* The check itself. Fifteen themes, seven pairs each — and it has to name the
   theme and the numbers when it fails, because "contrast test failed" against a
   hundred and five pairs is not a bug report. */
test("every theme is legible on both of its grounds", () => {
  const broken = [];
  for (const theme of THEMES) {
    for (const pair of failures(theme)) broken.push(describeFailure(theme, pair));
  }
  assert.deepEqual(broken, [], `\n  ${broken.join("\n  ")}\n`);
});

test("all fifteen themes are actually being checked", () => {
  /* A guard against the list being trimmed and the suite going quietly green:
     the failure above is only meaningful if the input is complete. */
  assert.equal(THEMES.length, 15);
  const ids = new Set(THEMES.map((t) => t.id));
  assert.equal(ids.size, 15, "two themes share an id");
  for (const theme of THEMES) {
    for (const key of ["bg", "card", "line", "text", "dim", "faint", "accent", "on"]) {
      assert.match(theme[key], /^#[0-9A-Fa-f]{6}$/, `${theme.id}.${key} is not a hex colour`);
    }
  }
});

/* The scale decides which bar a pair has to clear, so the boundary is worth
   pinning: it moved when the scale did. */
test("the large-text boundary follows WCAG, not intuition", () => {
  assert.equal(isLargeText({ px: 24, weight: 400 }), true);
  assert.equal(isLargeText({ px: 23, weight: 400 }), false);
  assert.equal(isLargeText({ px: 19, weight: 700 }), true);
  assert.equal(isLargeText({ px: 18, weight: 700 }), false);
  assert.equal(requiredRatio("body"), 4.5);
  assert.equal(requiredRatio("display"), 3);
  assert.throws(() => requiredRatio("gigantic"), RangeError);
});

test("the scale has a middle, which is the whole reason it changed", () => {
  const sizes = Object.values(TYPE_SCALE).map((s) => s.px).sort((a, b) => a - b);
  /* The old scale was a barbell: 12, 14, then 60–72 with nothing between. Assert
     there is no gap wider than 6px anywhere below the display step. */
  const body = sizes.filter((px) => px < 40);
  for (let i = 1; i < body.length; i += 1) {
    assert.ok(
      body[i] - body[i - 1] <= 6,
      `the scale jumps from ${body[i - 1]}px to ${body[i]}px with nothing between`,
    );
  }
  /* And nothing in the interface is below 11px. */
  assert.ok(Math.min(...sizes) >= 11, "a step is smaller than 11px");
});

test("a colour that already reads is returned untouched", () => {
  /* The derivation is a floor, not a filter: it must not quietly restyle the
     themes that were already fine. */
  assert.equal(readableOn("#F2F2F5", "#0A0A0C"), "#F2F2F5");
  assert.equal(readableOn("#14141A", "#FFFFFF"), "#14141A");
});

test("a colour that does not read is moved, and only as far as it must", () => {
  const before = contrastRatio("#C48B9F", "#F7F3F4");
  const after = readableOn("#C48B9F", "#F7F3F4");
  assert.ok(before < 4.5, "the fixture stopped being a failing case");
  assert.ok(contrastRatio(after, "#F7F3F4") >= 4.5, "still unreadable after derivation");
  /* Not black: it should stop at the first step that clears the bar. */
  assert.notEqual(after, "#000000");
});

test("every fill keeps the colour the theme authored", () => {
  /* The whole point of deriving a text colour is that the surfaces do not
     change. If this ever fails, the identity has been edited by a contrast
     routine, which is exactly the outcome the derivation exists to avoid. */
  for (const theme of THEMES) {
    const derived = readable(theme);
    assert.equal(theme.accent, theme.accent, `${theme.id} accent`);
    assert.ok(typeof derived.accentOnBg === "string" && derived.accentOnBg.startsWith("#"));
  }
});
