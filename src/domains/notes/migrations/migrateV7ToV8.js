import { normalizeNote } from "../model/note.js";
import { normalizedTagName, tagNameKey } from "../model/noteTag.js";
import { validatePlannerStateV7 } from "./validatePlannerStateV7.js";
import { validatePlannerStateV8 } from "./validatePlannerStateV8.js";

function tagIdFor(name) {
  return `note-tag:${encodeURIComponent(tagNameKey(name))}`;
}

export function migrateV7ToV8(state) {
  validatePlannerStateV7(state);
  const tagsByKey = new Map();
  const notes = state.notes.map((raw) => {
    const legacyTags = Array.isArray(raw.tags) ? raw.tags : [];
    const tagIds = [];
    for (const value of legacyTags) {
      const name = normalizedTagName(String(value));
      const key = tagNameKey(name);
      let tag = tagsByKey.get(key);
      if (!tag) {
        tag = { id: tagIdFor(name), name, color: null };
        tagsByKey.set(key, tag);
      }
      if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
    }
    const normalized = normalizeNote({
      ...raw,
      tags: [],
      tagIds,
      attachmentIds: [],
      processing: raw.processing ?? undefined,
      templateProvenance: raw.templateProvenance ?? null,
    });
    const { tags, ...note } = normalized;
    return note;
  });
  return validatePlannerStateV8({
    ...state,
    schemaVersion: 8,
    notes,
    noteTags: [...tagsByKey.values()].sort((left, right) => left.name.localeCompare(right.name)),
    noteAttachments: [],
  });
}
