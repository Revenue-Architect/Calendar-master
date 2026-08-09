# Notes Phase 2 Implementation Plan

**Goal:** Make the block document model reachable, and give notes a revision history.

## Status

Partly complete. What landed, and what did not, is below.

| Area | Module | State |
| --- | --- | --- |
| Line shorthand for every block type (§3.2) | `documents/shorthand.js` | Done |
| Inline marks parsed to runs, readable text for search (§3.5) | `documents/shorthand.js` | Model done, not rendered |
| Revisions with checksum, cap and restore (§10.2) | `revisions/noteRevisions.js` | Model done, not surfaced |
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
- **A revision is a checkpoint, not a keystroke.** Saving an unchanged document adds
  nothing, history is capped per note, and each entry carries a checksum so a
  snapshot that no longer matches what it claims can be detected.

## Not done

- [ ] Inline marks are parsed and tested but still render as their source text; the
      editor has no formatting affordance yet.
- [ ] Revisions are recorded by the domain but nothing writes or browses them from
      the interface. `recordRevision` needs calling on save and a history sheet.
- [ ] Conflict resolution (§10.3).
- [ ] Attachments (§11) — needs a storage decision before any of it is real.
- [ ] Notebooks and folders as user-facing organisation (§8.4, §8.5).
- [ ] Daily note templates and prompts (§4.3), and resurfacing (§9.4).
- [ ] Inbox processing states (§6.1) beyond the plain inbox view.
