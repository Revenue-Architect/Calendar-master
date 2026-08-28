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
test("the event-morph carrier preserves card material and delays generic details", () => {
  for (const themeId of ["obsidian-acid", "cream-terracotta"]) {
    const css = cssFor(themeId);
    assert.ok(
      css.includes("border-radius:var(--event-morph-open-radius, 20px)!important"),
      `${themeId} must give the expanded Event its own card-scale corner radius`,
    );
    assert.ok(
      css.includes("0%,24%{background-color:var(--event-morph-source-surface, var(--morph-card));border-color:var(--event-morph-source-border, transparent);box-shadow:var(--e1),var(--sheen)}"),
      `${themeId} must preserve source-compatible material and elevation during early opening`,
    );
    assert.ok(
      css.includes("0%,48%{opacity:0;transform:translateY(8px)}"),
      `${themeId} must delay generic inspector details until container expansion provides room`,
    );
    assert.ok(
      css.includes("clip-path:inset(var(--event-morph-clip-top,0px) var(--event-morph-clip-right,0px) var(--event-morph-clip-bottom,0px) var(--event-morph-clip-left,0px) round var(--event-morph-source-radius,14px))"),
      `${themeId} must reveal the carrier from the source-card rectangle rather than exposing a full panel`,
    );
    assert.ok(
      css.includes("100%{background-color:var(--event-morph-source-surface, var(--morph-card));border-color:var(--event-morph-source-border, transparent);box-shadow:var(--e2),var(--sheen)}"),
      `${themeId} must retain source Event material after the expansion settles`,
    );
  }
});
