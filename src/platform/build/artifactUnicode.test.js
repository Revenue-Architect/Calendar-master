import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DIST_INDEX = join(ROOT, "dist", "index.html");
const ARTIFACT_HTML = join(ROOT, "artifact", "planner.html");

const REPRESENTATIVE_GLYPHS = [
  { name: "en-dash", codePoint: "U+2013", char: "\u2013" },
  { name: "right-arrow", codePoint: "U+2192", char: "\u2192" },
  { name: "middle-dot", codePoint: "U+00B7", char: "\u00B7" },
  { name: "return-arrow", codePoint: "U+21A9", char: "\u21A9" },
];

const KNOWN_MOJIBAKE_SIGNATURES = [
  "â€“", // UTF-8 en dash decoded as Windows-1252 / ISO-8859-1
  "â†’", // UTF-8 right arrow decoded as Windows-1252
  "Â·",  // UTF-8 middle dot decoded as Windows-1252
  "â†©", // UTF-8 return arrow decoded as Windows-1252
  "\uFFFD", // Unicode replacement character
];

function ensureBuiltArtifacts() {
  if (!existsSync(DIST_INDEX) || !existsSync(ARTIFACT_HTML)) {
    execSync("npm run build:artifact", { cwd: ROOT, stdio: "pipe" });
  }
}

test("built dist and artifact declare UTF-8 charset", () => {
  ensureBuiltArtifacts();
  const distHtml = readFileSync(DIST_INDEX, "utf8");
  const artifactHtml = readFileSync(ARTIFACT_HTML, "utf8");

  assert.match(distHtml, /<meta\s+charset=["']?utf-8["']?/i, "dist/index.html must declare UTF-8 charset");
  assert.ok(artifactHtml.length > 0, "artifact/planner.html must not be empty");
});

test("built dist and artifact reject known mojibake signatures and replacement characters", () => {
  ensureBuiltArtifacts();
  const distHtml = readFileSync(DIST_INDEX, "utf8");
  const artifactHtml = readFileSync(ARTIFACT_HTML, "utf8");

  for (const mojibake of KNOWN_MOJIBAKE_SIGNATURES) {
    assert.ok(
      !distHtml.includes(mojibake),
      `dist/index.html contains mojibake signature: ${mojibake}`,
    );
    assert.ok(
      !artifactHtml.includes(mojibake),
      `artifact/planner.html contains mojibake signature: ${mojibake}`,
    );
  }
});

test("fixture containing representative glyphs U+2013, U+2192, U+00B7, and U+21A9 survives artifact serialization intact", () => {
  const sampleBundle = `
    const symbols = {
      enDash: "\\u2013", // ${REPRESENTATIVE_GLYPHS[0].char}
      rightArrow: "\\u2192", // ${REPRESENTATIVE_GLYPHS[1].char}
      middleDot: "\\u00B7", // ${REPRESENTATIVE_GLYPHS[2].char}
      returnArrow: "\\u21A9", // ${REPRESENTATIVE_GLYPHS[3].char}
      literalText: "Review – Step 1 → Done · Repeat ↩"
    };
  `;
  const sampleStyles = `/* Font test with · and → */ .nb-test { content: "·"; }`;

  const safeBundle = sampleBundle.replace(/<\/script/gi, "<\\/script");
  const assembledPage = `<title>Planner</title>\n<style>\n${sampleStyles}\n</style>\n<script type="module">\n${safeBundle}\n</script>\n`;

  const utf8Buffer = Buffer.from(assembledPage, "utf8");
  const roundTripped = utf8Buffer.toString("utf8");

  for (const glyph of REPRESENTATIVE_GLYPHS) {
    assert.ok(
      roundTripped.includes(glyph.char),
      `Intended glyph ${glyph.name} (${glyph.codePoint}) was corrupted during serialization`,
    );
  }

  for (const mojibake of KNOWN_MOJIBAKE_SIGNATURES) {
    assert.ok(
      !roundTripped.includes(mojibake),
      `Serialization generated mojibake signature: ${mojibake}`,
    );
  }
});
