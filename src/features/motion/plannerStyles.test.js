import test from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../../design/themes.js";
import { plannerStyles } from "./plannerStyles.js";

const prefs = { display: { reducedMotion: false } };

function cssFor(themeId) {
  const theme = THEMES.find((entry) => entry.id === themeId);
  return plannerStyles({ T: { ...theme, accentText: theme.accent }, preferences: prefs });
}

test("the nav stage stays #17181b on every ground", () => {
  for (const themeId of ["obsidian-acid", "cream-terracotta"]) {
    const css = cssFor(themeId);
    assert.match(css, /\.nb-nav-shell\{[^}]*background:#17181b/, `${themeId} shell`);
    assert.ok(
      css.includes(".nb-nav-motion-mask>i{position:absolute;display:block;background:#17181b"),
      `${themeId} walls`,
    );
    assert.ok(
      css.includes("radial-gradient(circle farthest-side at 0 100%,transparent 0 calc(100% - 0.5px),#17181b 100%)"),
      `${themeId} right-corner tile`,
    );
    assert.equal(css.includes("--nav-frame-fill:"), false, `${themeId} must not theme the stage`);
  }
});
