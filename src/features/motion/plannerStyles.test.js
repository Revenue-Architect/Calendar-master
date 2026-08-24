import test from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../../design/themes.js";
import { plannerStyles } from "./plannerStyles.js";

const prefs = { display: { reducedMotion: false } };

test("nav frame fill follows the active ground instead of a hardcoded dark tile", () => {
  const cream = THEMES.find((theme) => theme.id === "cream-terracotta");
  const css = plannerStyles({ T: { ...cream, accentText: cream.accent }, preferences: prefs });
  const fill = css.match(/--nav-frame-fill:([^;]+);/)?.[1];
  assert.ok(fill, "the shell must expose a frame fill token");
  assert.notEqual(fill.toLowerCase(), "#17181b");
  assert.ok(css.includes(".nb-nav-motion-mask>i{position:absolute;display:block;background:var(--nav-frame-fill)"));
  assert.ok(css.includes("radial-gradient(circle farthest-side at 0 100%,transparent 0 calc(100% - 0.5px),var(--nav-frame-fill) 100%)"));
});

test("obsidian keeps the cinematic dark stage", () => {
  const obsidian = THEMES.find((theme) => theme.id === "obsidian-acid");
  const css = plannerStyles({ T: { ...obsidian, accentText: obsidian.accent }, preferences: prefs });
  const fill = css.match(/--nav-frame-fill:([^;]+);/)?.[1];
  assert.equal(fill.toLowerCase(), "#17181b");
});
