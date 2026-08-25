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
    assert.ok(
      css.includes("--nav-stage-fill:#17181b"),
      `${themeId} must set --nav-stage-fill:#17181b`,
    );
    assert.ok(
      css.includes("box-shadow:0 0 0 9999px var(--nav-stage-fill, #17181b)"),
      `${themeId} must use single continuous frame overlay with obsidian stage shadow`,
    );
    assert.equal(css.includes("--nav-frame-fill:"), false, `${themeId} must not theme the stage`);
    assert.equal(css.includes("--nav-mask-"), false, `${themeId} must not include obsolete mask variables`);
  }
});
