/* Parse a planner JSON file into a pending import, or explain why not.
 *
 * Settings → IMPORT used to gate on `parsed.events` being truthy. That
 * rejected a valid empty notebook (`events: []` is fine; a wiped export
 * looks like that) and accepted any object that happened to have an
 * `events` array, even when `schemaVersion` was missing or the rest of
 * the file was junk. `normalizeImportedPlannerState` already knows how
 * to detect v4–v8 and how to reject the rest — this wrapper just adds
 * the file-size bound and turns thrown validation into a result the UI
 * can show without crashing the settings sheet.
 *
 * The bound is a client-side courtesy, not a security boundary. A 2 MB
 * planner JSON is already a very large personal notebook; past that we
 * refuse rather than freeze the tab on `JSON.parse`.
 */

import { normalizeImportedPlannerState } from "./plannerStateImport.js";

export const MAX_PLANNER_IMPORT_BYTES = 2 * 1024 * 1024;

export function describeImportError(error) {
  const message = error instanceof Error ? error.message : String(error || "import failed");
  if (/unsupported planner schema version/i.test(message)) return message;
  if (/must be an object/i.test(message)) return "This file is not a planner notebook.";
  if (/schemaVersion/i.test(message)) return message;
  /* V8 says "Unexpected token"; newer Node names the expected token instead. */
  if (/invalid JSON|Unexpected|Expected property name|JSON at position|in JSON/i.test(message)) {
    return "This file is not valid JSON.";
  }
  return `Could not import this notebook: ${message}`;
}

/**
 * @param {string} text file contents
 * @param {{ byteLength?: number }} [meta]
 * @returns {{ ok: true, state: object } | { ok: false, error: string }}
 */
export function readPlannerImportText(text, { byteLength = null } = {}) {
  if (byteLength != null && byteLength > MAX_PLANNER_IMPORT_BYTES) {
    return {
      ok: false,
      error: `This file is larger than ${Math.round(MAX_PLANNER_IMPORT_BYTES / (1024 * 1024))} MB.`,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: describeImportError(error) };
  }
  try {
    return { ok: true, state: normalizeImportedPlannerState(parsed) };
  } catch (error) {
    return { ok: false, error: describeImportError(error) };
  }
}
