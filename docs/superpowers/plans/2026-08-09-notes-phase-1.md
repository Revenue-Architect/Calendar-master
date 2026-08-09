# Notes Phase 1 Implementation Plan

**Goal:** Replace the `{ id, date, text }` note with a real document domain — identified blocks, note kinds, links and backlinks, system views, search, and revisions — and migrate stored notes onto it.

**Architecture:** Same shape as Calendar and Tasks. Pure modules under `src/domains/notes`, commands returning `{ notes, events }`, and a confirmed-write migration to schema v7.

## Status

Complete.

| Area | Module | State |
| --- | --- | --- |
| Block document, stable identity, deterministic serialization (§3) | `model/block.js` | Done |
| Note kinds, links, revisions (§2, §5, §10) | `model/note.js` | Done |
| Lifecycle, blocks, links, extraction (§1, §7) | `commands/noteCommands.js` | Done |
| System views and search (§8, §9) | `queries/noteQueries.js` | Done |
| v6 to v7 migration and validation | `migrations/` | Done |
| Behaviour tests | `tests/notes.test.js` | Done — 22 tests |
| Interface adoption | `src/Planner.jsx` | Done |

## Decisions worth keeping visible

- **Content is identified blocks, not a string.** Task extraction and deep links
  reference a block id (§3.3); a text offset breaks the moment the line above is
  edited.
- **Unknown block attributes survive migration.** A document written by a later
  version round-trips through this one without losing what it carried (§3.1).
- **Migration splits legacy text only on blank lines.** A paragraph break is the one
  structural signal the old format actually carried; inferring headings or lists out
  of prose would invent structure the user never wrote.
- **A no-op save does not bump the revision.** Otherwise autosave inflates history
  every time the editor loses focus (§10.1).
- **One daily note per day (§4.1).** Writing on a day that already has one edits it.
  Two notes for a day makes "the note for today" unanswerable — and the validator
  rejects it, so the interface must not try.
- **Extraction is recorded on the block.** A line that became a task cannot become a
  second one (§7.2), and the affordance disappears once used.

## Carried into Notes Phase 2

- [ ] Inline formatting (§3.5) and the remaining block types: numbered lists,
      code blocks, link previews.
- [ ] Revision history browsing and conflict resolution (§10.2, §10.3).
- [ ] Attachments (§11) — needs a storage decision before any of it is real.
- [ ] Notebooks and folders as user-facing organisation (§8.4, §8.5). The notebook
      id already exists on every note so this needs no re-identification.
- [ ] Daily note templates and prompts (§4.3), and resurfacing (§9.4).
- [ ] Inbox processing states (§6.1) beyond the plain inbox view.
