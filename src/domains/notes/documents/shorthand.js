import { normalizeBlocks } from "../model/block.js";
import { createId } from "../../../shared/ids.js";

/* §3.2. The document model has always held seven block types; nothing could create
   more than a paragraph. Rather than a formatting toolbar, a line declares its own
   type by how it starts — the shorthand people already type in plain text. Typing
   stays the whole interface, and the parse is reversible so editing a note does not
   quietly rewrite it. */

const RULES = [
  { type: "heading", level: 1, re: /^#\s+(.*)$/ },
  { type: "heading", level: 2, re: /^##\s+(.*)$/ },
  { type: "heading", level: 3, re: /^###\s+(.*)$/ },
  { type: "checklist", done: true, re: /^[-*]?\s*\[[xX]\]\s+(.*)$/ },
  { type: "checklist", done: false, re: /^[-*]?\s*\[\s?\]\s+(.*)$/ },
  { type: "quote", re: /^>\s+(.*)$/ },
  { type: "numbered", re: /^\d+[.)]\s+(.*)$/ },
  { type: "bulleted", re: /^[-*]\s+(.*)$/ },
];

const DIVIDER = /^(---|___|\*\*\*)$/;

function classify(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (DIVIDER.test(trimmed)) return { type: "divider", text: "" };
  for (const rule of RULES) {
    const hit = trimmed.match(rule.re);
    if (hit) {
      return {
        type: rule.type,
        text: hit[1].trim(),
        ...(rule.level ? { level: rule.level } : {}),
        ...(rule.type === "checklist" ? { done: rule.done } : {}),
      };
    }
  }
  return { type: "paragraph", text: trimmed };
}

export function textToBlocks(text, existing = [], newId = createId) {
  const lines = String(text ?? "").split("\n");
  const blocks = [];
  let fence = null;

  for (const line of lines) {
    /* A fenced block swallows its lines verbatim, so code keeps its own indentation
       and blank lines instead of being re-parsed as prose. */
    if (line.trim().startsWith("```")) {
      if (fence) { blocks.push(fence); fence = null; } else { fence = { type: "code", text: "" }; }
      continue;
    }
    if (fence) { fence.text = fence.text ? `${fence.text}\n${line}` : line; continue; }
    const parsed = classify(line);
    if (parsed) blocks.push(parsed);
  }
  if (fence) blocks.push(fence);

  /* Match unchanged content first. Position-only reuse made an inserted checklist
     inherit the task extracted from the line below it — a silent, dangerous link.
     When exactly one same-type block remains on either side it is an edit, not an
     insertion, so its stable identity can still follow a changed sentence. */
  const signature = (block) => JSON.stringify({
    type: block.type, text: block.text,
    ...(block.type === "heading" ? { level: block.level ?? 2 } : {}),
    ...(block.type === "checklist" ? { done: block.done === true } : {}),
  });
  const exact = new Map();
  for (const block of existing) {
    const key = signature(block);
    if (!exact.has(key)) exact.set(key, []);
    exact.get(key).push(block);
  }
  const matched = new Map();
  const used = new Set();
  blocks.forEach((block, index) => {
    const queue = exact.get(signature(block));
    const reused = queue?.shift() ?? null;
    if (reused) { matched.set(index, reused); used.add(reused.id); }
  });
  const freshByType = new Map();
  const remainingByType = new Map();
  blocks.forEach((block, index) => {
    if (matched.has(index)) return;
    if (!freshByType.has(block.type)) freshByType.set(block.type, []);
    freshByType.get(block.type).push(index);
  });
  for (const block of existing) {
    if (used.has(block.id)) continue;
    if (!remainingByType.has(block.type)) remainingByType.set(block.type, []);
    remainingByType.get(block.type).push(block);
  }
  for (const [type, indices] of freshByType) {
    const remaining = remainingByType.get(type) ?? [];
    if (indices.length === 1 && remaining.length === 1) matched.set(indices[0], remaining[0]);
  }

  return normalizeBlocks(blocks.map((block, index) => {
    const reused = matched.get(index) ?? null;
    return {
      ...(reused ?? {}),
      ...block,
      id: reused?.id ?? newId(),
      order: index,
      ...(block.type === "checklist"
        ? {
          done: block.done,
          completedAt: block.done ? reused?.completedAt ?? null : null,
          extractedTaskId: reused?.extractedTaskId ?? null,
        }
        : {}),
    };
  }));
}

export function blocksToShorthand(blocks) {
  return (blocks ?? []).map((block) => {
    if (block.type === "divider") return "---";
    if (block.type === "heading") return `${"#".repeat(block.level ?? 2)} ${block.text}`;
    if (block.type === "checklist") return `[${block.done ? "x" : " "}] ${block.text}`;
    if (block.type === "quote") return `> ${block.text}`;
    if (block.type === "bulleted") return `- ${block.text}`;
    if (block.type === "numbered") return `1. ${block.text}`;
    if (block.type === "code") return `\`\`\`\n${block.text}\n\`\`\``;
    return block.text;
  }).join("\n");
}

/* §3.5. Inline marks are stored as the text people typed rather than as serialized
   editor markup, so search indexes readable text (§9.1) and a note written here
   stays legible anywhere else. */
const INLINE = [
  { re: /\*\*([^*]+)\*\*/g, mark: "strong" },
  { re: /(?<!\*)\*([^*]+)\*(?!\*)/g, mark: "em" },
  { re: /`([^`]+)`/g, mark: "code" },
  { re: /~~([^~]+)~~/g, mark: "strike" },
];

export function parseInline(text) {
  const source = String(text ?? "");
  const marks = [];
  for (const { re, mark } of INLINE) {
    for (const hit of source.matchAll(re)) {
      marks.push({ mark, start: hit.index, end: hit.index + hit[0].length, text: hit[1] });
    }
  }
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cursor = 0;
  for (const found of marks) {
    if (found.start < cursor) continue;
    if (found.start > cursor) out.push({ mark: null, text: source.slice(cursor, found.start) });
    out.push({ mark: found.mark, text: found.text });
    cursor = found.end;
  }
  if (cursor < source.length) out.push({ mark: null, text: source.slice(cursor) });
  return out.length ? out : [{ mark: null, text: source }];
}

export function plainText(text) {
  return parseInline(text).map((run) => run.text).join("");
}
