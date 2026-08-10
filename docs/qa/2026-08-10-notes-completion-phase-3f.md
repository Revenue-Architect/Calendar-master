# Notes Completion — Phase 3F QA

**Scope:** Provider-free Notes processing, catalog tags, built-in templates,
attachment metadata, portability, and schema-v8 persistence.

## Automated evidence

| Gate | Result |
| --- | --- |
| Focused Notes foundation tests | 40 passing, 0 failing across processing/tags, templates, attachments, portability, and v8 migration tests |
| Persistence and search integration tests | 22 passing, 0 failing |
| Full automated suite | 283 passing, 0 failing |
| Production build | Vite completed successfully; 113 modules transformed |
| Source hygiene | `git diff --check` completed with no whitespace errors |
| Production dependencies | `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities |

## Pressure coverage

- A due snooze returns through a pure read without mutating the note; a future
  snooze remains hidden.
- Tag rename retains tag IDs; merge and deletion remove only classifications, not
  blocks or notes.
- Repeated template application has independent block identities and immutable
  provenance.
- Attachment metadata sanitizes a hostile filename, enforces reciprocal ownership,
  and travels with note deletion/undo. No binary bytes are accepted or stored.
- Native export flags each attachment as binary-excluded. Import marks attachment
  metadata missing, does not retain its source storage reference, rejects malformed
  input before producing an aggregate, and distinguishes copy/skip/metadata-merge.
- The v7-to-v8 migration preserves existing identities, makes deterministic tag
  references, and the storage cutover confirms v8 before dropping the v7 key.
- A non-conflicting native import does not require collision factories; its supplied
  note, block, and attachment IDs remain stable.

## Browser-flow evidence limit

The current slice deliberately provides domain and persistence foundations rather
than new visible editor controls for processing, tags, templates, attachments, or
portability. In addition, this runtime has no usable cloud browser client and the
local browser path is blocked by policy. No visual interaction is claimed as
passed.

`npm run dev` did start a Vite server on `http://localhost:5173/`; it was stopped
cleanly after the runtime limitation was confirmed. This establishes the normal
development-server boundary, not a visual product pass.

## Required browser/device follow-up

- Add and exercise the focused Notes surface: inbox processing/snooze, catalog tag
  management, template choice, native/text/Markdown import/export, and attachment
  status presentation.
- Verify note deletion/undo with attachment metadata after a reload, then confirm
  narrow-screen keyboard focus and screen-reader labels.
- Exercise a real storage adapter with allowed MIME/size policy and actual bytes;
  the metadata contract must report failed, quarantined, and missing states without
  blocking a note save.
