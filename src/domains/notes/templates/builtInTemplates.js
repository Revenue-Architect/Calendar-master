import { normalizeBlocks } from "../model/block.js";

const BUILT_INS = Object.freeze([
  { id: "blank", version: 1, name: "Blank note", title: "", blocks: [] },
  {
    id: "daily-planning", version: 1, name: "Daily planning", title: "", blocks: [
      { type: "heading", level: 2, text: "Today" },
      { type: "paragraph", text: "What would make today feel well used?" },
      { type: "heading", level: 2, text: "Make space for" },
      { type: "bulleted", text: "" },
    ],
  },
  {
    id: "daily-reflection", version: 1, name: "Daily reflection", title: "", blocks: [
      { type: "heading", level: 2, text: "What happened" },
      { type: "paragraph", text: "" },
      { type: "heading", level: 2, text: "What I learned" },
      { type: "paragraph", text: "" },
    ],
  },
  {
    id: "meeting", version: 1, name: "Meeting note", title: "", blocks: [
      { type: "heading", level: 2, text: "Purpose" },
      { type: "paragraph", text: "" },
      { type: "heading", level: 2, text: "Decisions" },
      { type: "bulleted", text: "" },
      { type: "heading", level: 2, text: "Follow-through" },
      { type: "checklist", text: "", done: false },
    ],
  },
  {
    id: "task-planning", version: 1, name: "Task planning", title: "", blocks: [
      { type: "heading", level: 2, text: "Outcome" },
      { type: "paragraph", text: "" },
      { type: "heading", level: 2, text: "Next steps" },
      { type: "checklist", text: "", done: false },
    ],
  },
  {
    id: "weekly-review", version: 1, name: "Weekly review", title: "", blocks: [
      { type: "heading", level: 2, text: "Worth carrying forward" },
      { type: "paragraph", text: "" },
      { type: "heading", level: 2, text: "To close or release" },
      { type: "paragraph", text: "" },
      { type: "heading", level: 2, text: "Next week" },
      { type: "paragraph", text: "" },
    ],
  },
  {
    id: "decision-record", version: 1, name: "Decision record", title: "", blocks: [
      { type: "heading", level: 2, text: "Decision" },
      { type: "paragraph", text: "" },
      { type: "heading", level: 2, text: "Why now" },
      { type: "paragraph", text: "" },
      { type: "heading", level: 2, text: "What would change it" },
      { type: "paragraph", text: "" },
    ],
  },
]);

function copyTemplate(template) {
  return {
    ...template,
    blocks: template.blocks.map((block) => ({ ...block })),
  };
}

export function listBuiltInNoteTemplates() {
  return BUILT_INS.map(({ id, version, name }) => ({ id, version, name }));
}

export function getBuiltInNoteTemplate(templateId) {
  const template = BUILT_INS.find((entry) => entry.id === templateId);
  if (!template) throw new RangeError(`unknown note template ${templateId}`);
  return copyTemplate(template);
}

export function instantiateBuiltInNoteTemplate(templateId, { createBlockId } = {}) {
  if (typeof createBlockId !== "function") throw new TypeError("createBlockId is required");
  const template = getBuiltInNoteTemplate(templateId);
  return {
    title: template.title,
    blocks: normalizeBlocks(template.blocks.map((block, order) => ({ ...block, id: createBlockId(), order }))),
    templateProvenance: { id: template.id, version: template.version },
  };
}
