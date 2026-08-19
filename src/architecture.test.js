import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL(".", import.meta.url));

/* Two ratchets that make written architecture rules executable.
 *
 * Both are allowed to move in one direction only. When work lands that improves
 * a number, lower it in the same commit; raising either one is the thing these
 * exist to make visible, and should not pass review quietly. */

/* ---------------------------------------------------------------- size ---- */

/* docs/spec/structure.md: "do not grow Planner.jsx". Nothing enforced it, and
   the consequence is in the history: three commits titled "extract X from
   Planner" left it at exactly 9,470 lines each time, because the extraction
   copied code out and never deleted the original. The file then grew to 9,615
   during a refactor meant to shrink it. A ratchet turns that from something you
   have to notice into something CI notices for you. */
const PLANNER_CEILING = 7093; // split("\n").length, so one more than `wc -l`

test("Planner.jsx does not grow", () => {
  const lines = readFileSync(join(SRC, "Planner.jsx"), "utf8").split("\n").length;
  assert.ok(
    lines <= PLANNER_CEILING,
    `Planner.jsx is ${lines} lines, ceiling is ${PLANNER_CEILING}. `
    + "Extract instead of appending — see docs/spec/structure.md. If an extraction "
    + "genuinely shrank it, lower the ceiling in this file in the same commit.",
  );
});

/* ------------------------------------------------------------- wiring ---- */

/* A module nobody imports is not an extraction, it is a second copy that will
   drift from the one the app actually runs — and its unit tests will keep
   passing while they prove nothing about the running app. That already happened
   here: features/motion/Sheet.jsx sat 134 lines behind Planner's own Sheet, and
   a fix applied to it changed nothing until an e2e test caught the mistake.
   Every name below is a module extracted but never wired up. The list may only
   get shorter. */
const UNWIRED = new Set([]);

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.jsx?$/.test(entry) && !/\.test\.jsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test("every module under src/features is imported by something outside its own folder", () => {
  const all = sourceFiles(SRC);
  const corpus = all.map((file) => ({ file, text: readFileSync(file, "utf8") }));

  const orphans = [];
  for (const file of all) {
    const rel = relative(SRC, file).replaceAll("\\", "/");
    if (!rel.startsWith("features/")) continue;
    const folder = rel.slice(0, rel.lastIndexOf("/"));
    const stem = rel.slice(rel.lastIndexOf("/") + 1).replace(/\.jsx?$/, "");

    /* An importer outside this module's own folder. Same-folder imports do not
       count: a cluster of files importing each other while nothing reaches the
       cluster is still dead. Matched on the import statement, not any mention,
       so a comment naming the path is not mistaken for a wiring. */
    const wired = corpus.some(({ file: other, text }) => {
      const otherRel = relative(SRC, other).replaceAll("\\", "/");
      if (otherRel === rel || otherRel.startsWith(`${folder}/`)) return false;
      return new RegExp(`^\\s*import[^;]*["'][^"']*/${stem}(\\.jsx?)?["']`, "m").test(text);
    });
    if (!wired) orphans.push(rel);
  }

  const surprises = orphans.filter((o) => !UNWIRED.has(o));
  assert.deepEqual(
    surprises, [],
    `Extracted but never imported: ${surprises.join(", ")}. `
    + "Wire it up or delete it — a second copy drifts from the one that runs.",
  );

  const fixed = [...UNWIRED].filter((known) => !orphans.includes(known));
  assert.deepEqual(
    fixed, [],
    `Now wired up: ${fixed.join(", ")}. Remove them from UNWIRED in this file.`,
  );
});

/* --------------------------------------------------------------- scope ---- */

/* The third failure this project has had of exactly one shape: code moves out of
   Planner, loses a binding Planner had, and nothing notices. A dropped `MONO`
   import took out 46 browser tests in Phase 1.3. `parseInline` and `rowSpan`
   went missing from fields.jsx in Phase 4 and crashed the app on first render,
   producing 133 failures against a baseline of 2.

   Neither the build nor the unit suite can see it. Vite bundles an undefined
   identifier without complaint, and no unit test renders Planner. So the check
   has to be written down. */
function bindings(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const names = new Set();
  for (const m of code.matchAll(/import\s+([A-Za-z_$][\w$]*)?\s*,?\s*\{([^}]*)\}\s*from|import\s+([A-Za-z_$][\w$]*)\s+from/g)) {
    if (m[1]) names.add(m[1]);
    if (m[3]) names.add(m[3]);
    if (m[2]) for (const p of m[2].split(",")) {
      const n = p.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }
  return { code, imported: names };
}

test("no module under src/features uses a Planner binding without importing it", () => {
  const planner = readFileSync(join(SRC, "Planner.jsx"), "utf8");
  /* Both halves of Planner's module scope. A component that moves out loses a
     name Planner imported and a name Planner declared in the same silent way. */
  const plannerScope = new Set([
    ...bindings(planner).imported,
    ...[...planner.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
    ...[...planner.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
  ]);

  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file).replaceAll("\\", "/");
    if (!rel.startsWith("features/")) continue;
    const { code, imported } = bindings(readFileSync(file, "utf8"));

    /* Anything the file declares itself, parameters included, shadows an outer
       name and is not a missing import. Captured roughly on purpose. */
    const local = new Set([
      ...[...code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
      ...[...code.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
      ...[...code.matchAll(/(?:function[^(]*|\)?\s*=>|\()\s*\(?([^)]*)\)?\s*(?:=>|\{)/g)]
        .flatMap((m) => (m[1] || "").split(",").map((p) => p.trim().replace(/[{}[\].]/g, "").split(/[:=]/)[0].trim())),
    ].filter(Boolean));

    /* Only free identifiers count. A name is not a reference to an outer binding
       when it is a property (`item.dur`), an object key (`dur:`), or part of a
       hyphenated string such as the CSS custom property `--nb-morph-dur` inside
       a template literal. All three produced false positives on modules that
       were entirely correct. */
    const used = new Set();
    for (const m of code.matchAll(/(^|[^.\w$-])([A-Za-z_$][\w$]*)(:)?/g)) {
      if (m[3] === ":") continue;
      used.add(m[2]);
    }

    for (const name of used) {
      if (plannerScope.has(name) && !imported.has(name) && !local.has(name)) {
        offenders.push(`${rel} uses ${name}`);
      }
    }
  }

  assert.deepEqual(
    [...new Set(offenders)], [],
    "A module uses a name from Planner's module scope but does not import it. "
    + "It will be undefined at runtime while the build stays green.",
  );
});
