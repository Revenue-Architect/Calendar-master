import { textToBlocks } from "../../domains/notes/documents/shorthand.js";

/* The planner's editor is plain text, but a note is a document of typed blocks
   (§3.2). This adapter is the boundary: it parses what was typed into blocks and
   carries forward everything the previous version of a block held — identity,
   completion, extraction reference and any attribute this version does not
   understand — so editing a note never quietly discards part of it.
   Line shorthand is what makes the other block types reachable at all; before it,
   a document could only ever contain paragraphs. */
export function textToNoteBlocks(text, existing = [], createId) {
  return textToBlocks(text, existing, createId);
}
