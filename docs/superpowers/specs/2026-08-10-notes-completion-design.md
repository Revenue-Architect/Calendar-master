# Notes Completion — Phase 3F Design

**Status:** Approved implementation design under the existing Planner Foundation
approval.

## Outcome

Notes gains a durable organization and portability foundation without making the
React shell, a provider, or a binary-storage adapter the owner of note truth. A
v8 planner state adds explicit inbox processing, stable tag records, template
provenance, attachment metadata references, and native note portability.

## Product decisions

### Processing and discovery

- `archived` remains the existing lifecycle flag. Processing is a separate
  non-archived state: `inbox`, `in-progress`, `processed`, or `snoozed` with a
  required date. An archived note cannot appear in the inbox.
- A newly created standalone note starts in `inbox`; a daily, event, or task note
  starts `processed` because its context has already filed it. A v7 standalone
  note with no context migrates to `inbox`; every other v7 note migrates to
  `processed`.
- `getInboxNotes` returns active `inbox` notes plus snoozed notes whose date is
  today or earlier. It never mutates a note just because time has passed.

### Tags

- `noteTags` is a planner-level catalog of `{ id, name, color }`; notes hold only
  `tagIds`. IDs, not display text, are canonical, so rename is immediate across
  search and every future view without rewriting note content.
- Creation rejects a duplicate normalized name. Rename preserves ID. Merge moves
  source references to a destination ID then removes the source tag; delete only
  removes references. No tag operation deletes a note.
- The v7 string tags migrate deterministically into a catalog and references. A
  note without tags receives an empty `tagIds` array.

### Templates

- Seven immutable built-ins are available: blank, daily planning, daily
  reflection, meeting, task planning, weekly review, and decision record.
- A template is a versioned specification, not a saved note. Instantiation needs
  an ID factory and produces fresh block IDs every time; its optional provenance
  is saved on the new note. Updating a built-in can never rewrite a prior note.
- User-authored templates, template editing, prompt delivery, and automatic note
  creation remain intentionally deferred.

### Attachment metadata

- Binary bytes stay outside the notebook. The v8 state holds `noteAttachments`
  metadata and each note's `attachmentIds`; references must be reciprocal.
- Valid statuses are `pending`, `available`, `failed`, `quarantined`, `missing`,
  and `deleted`. Metadata sanitizes names and validates byte counts, but the
  future storage adapter owns MIME-policy enforcement, bytes, uploads, and
  preview generation.
- Deleting a note removes its metadata references and undo restores them. This
  phase does not implement a file picker or binary storage; it makes that future
  adapter safe and replaceable.

### Portability

- Export returns native versioned JSON, Markdown, or plain text from domain
  records. Native bundles carry selected note records, their referenced tag
  records, attachment metadata, and explicit warnings that binary bytes are not
  included.
- Imports are validate-first and side-effect free: malformed input returns no
  partial aggregate. A native ID collision supports explicit `copy`, `skip`, or
  metadata-only `merge`; merge never overwrites title or document blocks without
  conflict-resolution UI.
- Imported attachment metadata is marked `missing` and loses its source storage
  reference because bytes were not transferred. External links remain links and
  are preserved as unresolved context when their target is absent.

## Architecture boundaries

| Concern | Owner | Does not own |
| --- | --- | --- |
| Note metadata and processing commands | `domains/notes` | UI interaction state |
| Tag catalog/reference integrity | `domains/notes` | task tags or global search parsing |
| Built-in template definitions/instantiation | `domains/notes/templates` | persistence or editor state |
| Attachment metadata lifecycle | `domains/notes/attachments` | binary bytes and uploads |
| Text/Markdown/native transformations | `domains/notes/portability` | browser download/upload widgets |
| Schema v7 to v8 migration and validation | `domains/notes/migrations` | device-specific preferences |
| State-key read/write cutover | `platform/persistence` | note business rules |
| Import/export buttons and later visual adoption | Planner feature seam | canonical transforms |

## Migration and recovery

`migrateV7ToV8` derives every new field without altering existing note, block,
link, revision, calendar, or task identity. `validatePlannerStateV8` delegates
the v7 invariants first, then verifies tag IDs and attachment ownership. The
local-state store writes and reads `nbmp:state:v8` before removing v7, following
the existing confirmed-cutover pattern. Invalid v8 input is rejected before it
can replace a healthy local notebook.

## Explicit non-goals

- Provider sync, accounts, sharing, collaboration permissions, CRDT/block merge,
  binary upload/download, file previews, OCR, user template editing, notebook
  CRUD, folders, draft recovery, resurfacing notifications, or automatic task
  creation/scheduling.
- A Notes frontend redesign. Existing Notes UI remains compatible while the next
  experience-focused slice can adopt these domain APIs deliberately.

## Acceptance criteria

1. V7 and older imports upgrade to validated v8 state; a failed v8 persistence
   confirmation preserves the prior state.
2. Inbox processing and snooze membership are pure, deterministic reads; tag
   rename/merge/delete preserve note and document identities.
3. Repeated template application allocates independent block IDs and provenance;
   no template can mutate an existing note retroactively.
4. Attachment metadata has validated reciprocal ownership and cannot become
   orphaned through note deletion/undo.
5. Native, Markdown, and plain-text portability preserve supported note meaning;
   malformed imports and binary-less attachment transfer fail safely.
6. Full tests, production build, diff hygiene, dependency audit, and a browser
   flow attempt are recorded before publication.
