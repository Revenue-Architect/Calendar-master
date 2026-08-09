export function textToNoteBlocks(text, existing = [], createId) {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const previous = existing[index];
      return {
        ...(previous ?? {}),
        id: previous?.id ?? createId(),
        type: previous?.type === "checklist" ? "checklist" : "paragraph",
        text: part,
        order: index,
      };
    });
}
