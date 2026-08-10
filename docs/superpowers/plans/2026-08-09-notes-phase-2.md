# Notes Phase 2 Implementation Plan

**Goal:** Make the block document model reachable, and give notes a revision history.

## Status

Complete. The domain work and the interface work that makes it reachable both landed.

| Area | Module | State |
| --- | --- | --- |
| Line shorthand for every block type (§3.2) | `documents/shorthand.js` | Done |
| Inline marks parsed to runs, readable text for search (§3.5) | `documents/shorthand.js` | Done |
| Every block type renders as itself (§Interface 9.1) | `src/Planner.jsx` — `NoteBlock` | Done |
| Marks render while stored text keeps its punctuation (§Interface 9.2) | `src/Planner.jsx` — `Inline` | Done |
| Revisions with checksum, cap and restore (§10.2) | `revisions/noteRevisions.js` | Done |
| History recorded on save, browsable, restorable (§Interface 9.3) | `src/Planner.jsx` — `NoteHistory` | Done |
| Editor round-trips through shorthand | `src/Planner.jsx`, `features/notes/noteText.js` | Done |

## Decisions worth keeping visible

- **A line declares its own type.** The document model held seven block types from
  the start and nothing could create more than a paragraph. Rather than a formatting
  toolbar, a line's opening characters name its type — the notation people already
  type in plain text.
- **The editor shows shorthand, not bare text.** This is what makes the parse safe:
  a checklist reads back as `[ ] …`, so retyping the line without its marker is a
  deliberate change of type rather than a silent loss of one. Parsing shorthand while
  displaying bare text would have degraded every checklist to a paragraph on the next
  edit, which is why both changed together.
- **Identity is matched by type, not position.** Editing one line does not renumber
  the ids after it, so links and task extractions survive an edit above them.
- **A fenced block is taken verbatim.** Code keeps its own indentation and blank
  lines instead of being re-parsed as prose.
- **A block reads as what it is.** Rendering every type as the same italic paragraph
  made the shorthand pointless: typing a heading looked identical to typing prose.
  Headings take the label face rather than a larger body size, so a written page uses
  the same typographic system as the rest of the product.
- **Marks render; source is preserved.** `**bold**` reads as bold on the page, and the
  punctuation stays in storage. Search keeps indexing readable text, and a task
  extracted from a checklist line takes the readable text rather than the markup.
- **A revision is a checkpoint, not a keystroke.** Saving an unchanged document adds
  nothing, history is capped per note, and each entry carries a checksum so a
  snapshot that no longer matches what it claims can be detected.
- **History holds what came before, not what is current.** The live note is always the
  head, so a revision is recorded from the pre-save body — going back lands on a page
  someone actually saw.
- **Going back is an edit.** The version being left becomes the newest earlier version,
  so returning to an earlier point never erases the point you returned from.
- **A damaged revision is shown, not restored.** Putting text that fails its own
  checksum over a good document is worse than losing the snapshot.

## Defects found while wiring this up

- **Undoing a deleted note restored nothing.** `doDelete` captured what it removed
  inside the `setDb` updater, which React runs after the handler returns — so `flash`
  built its undo payload from a variable that was still `null`. The payload is now
  read from current state before the mutation. Its revisions ride along in the same
  payload, so undo restores the note and its history together.
- **The undo toast offered a button with nothing behind it.** Informational messages
  pass a null payload; clicking UNDO dereferenced it inside a state updater and blanked
  the page. Those messages no longer render the button, and the handler guards.
- **Creating an entry in the last minutes of a day crashed the app.** `snapTo(nowMin, 15)`
  clamps to 1440, and no day has a minute 1440 — between 23:53 and midnight the composer
  built `…T24:00`, which the time model rejects from inside render. A new entry now
  starts in the last slot the day actually has, clamped both at the call sites and in
  the composer so no caller can reintroduce it.

## Not done

- [ ] Conflict resolution (§10.3).
- [ ] Attachments (§11) — needs a storage decision before any of it is real.
- [ ] Notebooks and folders as user-facing organisation (§8.4, §8.5).
- [ ] Daily note templates and prompts (§4.3), and resurfacing (§9.4).
- [ ] Inbox processing states (§6.1) beyond the plain inbox view.
- [ ] Collaboration fields (§3.4), which wait on the sharing model.
