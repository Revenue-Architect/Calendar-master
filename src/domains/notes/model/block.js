export class NoteValidationError extends Error {
  constructor(issues) {
    super(issues.map((entry) => `${entry.field}: ${entry.message}`).join("; "));
    this.name = "NoteValidationError";
    this.issues = issues;
  }
}

/* §3.2. The block types the first document model understands. Anything outside this
   set is refused rather than coerced — silently rewriting an unknown block is how a
   document loses content it was trusted to hold. */
export const BLOCK_TYPES = Object.freeze([
  "paragraph",
  "heading",
  "bulleted",
  "numbered",
  "checklist",
  "quote",
  "divider",
  "code",
]);

const TEXTLESS = new Set(["divider"]);

export function normalizeBlock(input, index = 0) {
  if (!input || typeof input !== "object") {
    throw new NoteValidationError([{ field: "block", message: "must be an object" }]);
  }
  if (typeof input.id !== "string" || !input.id) {
    throw new NoteValidationError([{ field: "block.id", message: "is required" }]);
  }
  if (!BLOCK_TYPES.includes(input.type)) {
    throw new NoteValidationError([{ field: "block.type", message: `must be one of ${BLOCK_TYPES.join(", ")}` }]);
  }
  const text = typeof input.text === "string" ? input.text : "";
  if (TEXTLESS.has(input.type) && text) {
    throw new NoteValidationError([{ field: "block.text", message: `a ${input.type} carries no text` }]);
  }
  const block = {
    id: input.id,
    type: input.type,
    text,
    order: Number.isInteger(input.order) ? input.order : index,
  };
  if (input.type === "checklist") {
    block.done = input.done === true;
    block.completedAt = block.done ? input.completedAt ?? null : null;
    /* §7.1. Set when this line has been turned into a real task, so the same line
       cannot silently spawn a second one (§7.2). */
    block.extractedTaskId = input.extractedTaskId ?? null;
  }
  if (input.type === "heading") {
    const level = Number(input.level ?? 2);
    block.level = level === 1 || level === 3 ? level : 2;
  }
  /* §3.1. Attributes this version does not understand are carried through untouched
     rather than dropped, so a document written by a later version survives a
     round trip through this one. */
  const known = new Set(["id", "type", "text", "order", "done", "completedAt", "extractedTaskId", "level"]);
  for (const [key, value] of Object.entries(input)) {
    if (!known.has(key)) block[key] = value;
  }
  return block;
}

export function normalizeBlocks(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new NoteValidationError([{ field: "blocks", message: "must be an array" }]);
  }
  const seen = new Set();
  const blocks = input.map((block, index) => {
    const normalized = normalizeBlock(block, index);
    /* §3.3. Identity must be unique inside the note; deep links and extracted tasks
       reference a block id, so a duplicate would make a reference ambiguous. */
    if (seen.has(normalized.id)) {
      throw new NoteValidationError([{ field: "blocks", message: `duplicate block ${normalized.id}` }]);
    }
    seen.add(normalized.id);
    return normalized;
  });
  return blocks
    .sort((left, right) => left.order - right.order)
    .map((block, index) => ({ ...block, order: index }));
}

export function blocksToText(blocks) {
  return (blocks ?? [])
    .filter((block) => block.type !== "divider")
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n");
}

/* §3.1. Deterministic serialization, so two documents with the same content always
   produce the same string and a revision comparison cannot report a false change. */
export function serializeBlocks(blocks) {
  return JSON.stringify((blocks ?? []).map((block) => {
    const entries = Object.entries(block).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  }));
}
