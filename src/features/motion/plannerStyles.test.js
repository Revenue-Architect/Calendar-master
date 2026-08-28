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
      css.includes("border:0;border-radius:inherit;background-color:var(--event-morph-source-surface,var(--morph-card));box-shadow:var(--e1),var(--sheen)"),
      `${themeId} must carry only the normal soft elevation, not a hard expanded-card outline`,
    );
    assert.ok(
      css.includes("0%,30%{opacity:0}"),
      `${themeId} must start inspector facts after the Event shell responds, without translating the destination title a second time`,
    );
    assert.ok(
      css.includes("clip-path:inset(var(--event-morph-clip-top,0px) var(--event-morph-clip-right,0px) var(--event-morph-clip-bottom,0px) var(--event-morph-clip-left,0px) round var(--event-morph-source-radius,14px))"),
      `${themeId} must reveal the carrier from the source-card rectangle rather than exposing a full panel`,
    );
    assert.ok(
      css.includes("visibility:hidden"),
      `${themeId} must reserve shared title ownership for MorphSurface while the carrier is moving`,
    );
  }
});
