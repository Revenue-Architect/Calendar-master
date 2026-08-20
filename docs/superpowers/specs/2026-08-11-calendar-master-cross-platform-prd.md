# Calendar Master Cross-Platform PRD and Technical Design

**Status:** Draft for product and engineering review  
**Date:** 2026-08-11  
**Repository baseline:** `origin/main` at `bde5dd3`  
**Product owner:** Kamran  
**Initial launch target:** Android, with the existing web app retained for Windows and macOS  
**Backend:** Convex  
**Native client:** Expo / React Native  

## 1. Executive decision

Calendar Master should become a **connected** daily planning system that combines the
calendars a person already keeps, the work that arrives by mail, executable actions, and
contextual notes in one trustworthy day view.

**This supersedes the local-first positioning of the previous revision.** Isolation was
never the value; a correct, legible day was. A planner that cannot see the Google and
Outlook calendars where the user's commitments actually live is not a smaller product,
it is a wrong one — it asks the user to maintain a second copy of their day by hand.

The wedge is still narrower and more defensible than reproducing Fantastical: a person
opens one realistic day assembled from every account they use, understands what is fixed
and what is actionable, reshapes the plan directly, captures new work in natural
language, has the mail that creates work offered back as proposals, and trusts that the
result survives offline use and appears correctly on every device.

The approved strategy is:

- Keep the existing React/Vite application as the Windows and macOS experience for now.
- Build the Android application with Expo and React Native; support iOS after the Android
  interaction model and sync layer are proven.
- Preserve and extract the existing JavaScript domain code rather than rewriting
  recurrence, task, note, reminder, and time logic in Dart or Kotlin.
- Use Convex for identity-linked application data, transactions, reactive sync signals,
  server functions, and provider orchestration.
- **Reach Google and Microsoft through one provider layer behind an interface.** A
  unified API (Nylas is the leading candidate) is preferred over hand-writing Google
  Calendar, Microsoft Graph, Gmail and Outlook-mail adapters, because breadth across four
  integrations is exactly where a unified API earns its price. The choice is deferred to
  an explicit gate; see §7.6.
- **Mail proposes, it never writes.** Extraction produces candidate events a person
  accepts or dismisses. No inbox UI, no sending, no silent calendar writes.
- **Offline remains a first-class state, not a fallback.** Keep an on-device database and
  durable outbox on every client. Connected does not mean online-only: the day must stay
  readable and writable with no signal.
- Use Chrono as one temporal parser within a deterministic quick-add pipeline. Do not put
  a general-purpose LLM in the critical path for event or task creation.
- Package the existing web app with Tauri only after cross-device sync is reliable and
  desktop system integration becomes a measured priority.

This document supersedes the Phase A Supabase proposal, the earlier assumption that a
framework decision could wait until after sync, and the local-first product framing.

## 2. Product thesis

### 2.1 Problem

Most calendar products show commitments but do not help users execute their day. Most
task products show obligations but do not make time constraints tangible. Notes often
become a third disconnected system. And a large share of what ends up on the day never
arrives as a calendar invitation at all — it arrives as mail that a person has to read,
interpret, and re-enter somewhere by hand.

The user is left reconciling four systems across two accounts and several devices.

Calendar Master will make the day itself the primary workspace:

- Events answer, “Where must my time go?”
- Actions answer, “What must I move forward?”
- Notes answer, “What context and thinking support this work?”
- The timeline answers, “How does this fit in reality?”
- Connected accounts answer, “Is this all of it?” — a day assembled from one account is
  a guess.
- Mail extraction answers, “What did I agree to without noticing?”

### 2.2 Positioning

Calendar Master is a personal execution calendar over the accounts a person already has —
not a team project manager, and not merely a prettier calendar client.

The pairing it claims is one neither neighbour can: a unified calendar client shows every
event across every account and still does not know what is **owed**; a task app knows
what is owed and cannot see Thursday. Reading mail for commitments is what closes the
loop between them, because that is where most obligations are actually created.

It borrows Fantastical's speed, calendar sets, quick access, and scheduling ergonomics,
while differentiating through native actions, subtask progress, planning notes, mail-
derived proposals, and a more opinionated daily workflow.

Provider payloads are **mapped, never stored raw**. A Google or Outlook event becomes a
Calendar Master event carrying its provenance, so recurrence, overdue and planning rules
remain the app's own rather than being inherited from whichever API answered.

### 2.3 Primary user

The initial product is for a single knowledge worker who:

- Uses an Android phone and one or more desktop computers.
- Has meetings, appointments, focused work, and personal tasks in the same week.
- Wants tasks to be schedulable without turning every task into a fake external calendar event.
- Needs quick capture, offline reliability, and confidence that edits will not disappear.
- Values a polished, tactile interface but will reject motion that slows or obscures the result.

### 2.4 Jobs to be done

1. When I begin or re-plan my day, show commitments and actions together so I can make a realistic plan.
2. When the plan changes, let me move or resize work directly and show the exact time consequence before I commit it.
3. When I remember something, let me capture it in one line without completing a form.
4. When I switch devices or lose connectivity, preserve every authored change and explain sync state honestly.
5. When a meeting is imminent, let me join it directly without navigating through an editor.
6. When I work on an item, keep its supporting notes and decisions nearby.

## 3. Goals, non-goals, and product principles

### 3.1 Goals for the first cross-platform milestone

- A user connects a Google account and an Outlook account and sees **one** day assembled
  from both, alongside their own Actions and Notes.
- A user can plan one complete day on a Samsung phone, close the app while offline,
  reopen it, and later see the same correct day on the web app.
- Mail that creates a commitment is offered back as a proposal the user accepts or
  dismisses, and dismissing one is remembered.
- Events and actions share one timeline while retaining distinct semantics.
- Touch interactions for hold, move, and resize feel native and remain correct across
  scrolling and overlapping items.
- Quick add handles the common scheduling language already supported by the repository and
  improves temporal recognition through Chrono without reducing deterministic behavior.
- Account, connection, sync, conflict, and offline states are visible and recoverable.
- The existing recurrence, occurrence identity, task, notes, search, reminder, and
  projection behavior remains covered by automated tests.

### 3.2 Non-goals for the first milestone

Connected calendars and mail extraction have **moved out of this list** and into the
product's core; see §1. What remains out of scope:

- Full Fantastical feature parity.
- **An email client.** No inbox, no triage, no reading pane, no sending or replying. Mail
  is read to propose events and for nothing else.
- **Any automatic write to a connected calendar from an extracted proposal.** A person
  confirms, always.
- CalDAV, Apple Reminders, Google Tasks, or Todoist. Google and Microsoft first, and only
  those until they are trustworthy.
- Tauri packaging, tray controls, global shortcuts, widgets, or launch-at-login.
- Scheduling links, meeting voting, or multi-user collaboration.
- On-device open-weight LLM inference.
- A full visual rewrite of the existing web app.

### 3.3 Product principles

1. **Trust before breadth.** A smaller synchronized product is better than a wide product
   that can lose or misrepresent time. Two providers done correctly beat six done partly.
2. **The day is the unit of value.** Every major capability must make planning,
   executing, or reviewing a day easier.
3. **Local writes are immediate.** Network availability must not gate creation, editing,
   completion, moving, or resizing. Connected does not mean online-only.
4. **Nothing enters the day unconfirmed.** Mail extraction, heuristics and models produce
   *proposals*. The person disposes. This is what makes reading someone's mail
   defensible, and it is not negotiable for a convenience win.
5. **The domain model is ours; providers are sources.** Provider payloads are mapped,
   never stored raw, and never become domain records verbatim.
6. **Motion explains continuity.** Animation must communicate origin, destination, or
   state change. It must never add a surprise bounce, zoom the viewport, or delay control.
7. **Deterministic by default.** Dates, recurrence, reminders, task metadata, and sync
   policies must be auditable and testable.
8. **Progressive intelligence.** Use heuristics and Chrono for high-confidence parsing;
   add model assistance later only where it creates measurable value.
9. **One domain, adaptive surfaces.** Business rules are shared; controls and navigation
   adapt to touch, keyboard, window size, and operating system.

## 4. Current product baseline

The current repository is not a prototype to discard. It already contains a domain-oriented modular monolith with substantial behavior in:

- Calendar event validation, recurrence expansion, series splitting, exceptions, occurrence identity, segmentation, projections, and layout.
- Actions, lists, subtasks, dependencies, recurrence, completion events, planning state, and smart views.
- Structured notes, templates, attachments, revisions, organization, search, and links to planner context.
- Reminder intents and missed-reminder behavior.
- Unified search, day aggregation, preferences, diagnostics, backup/export, and gamification.
- Quick-add parsing and conversion into event or action payloads.
- Timeline gesture arithmetic and recent mobile touch/navigation hardening.

The principal architectural asset is not `Planner.jsx`; it is the pure domain behavior below it. The migration should reduce the oversized UI file over time, but must not combine a platform migration with a domain rewrite.

## 5. Product experience requirements

### 5.1 Unified day timeline

The day timeline is the primary product surface.

Required behavior:

- Display timed events and scheduled actions in one chronological canvas.
- Keep all-day events and unscheduled/due actions reachable without making them look like timed blocks.
- Preserve visual distinction between externally sourced events and native actions.
- Show current time, working hours, collisions, and duration legibly on phone and desktop.
- Keep recurring occurrence identity stable when an occurrence is moved or edited.
- Update all projections after a mutation: day, week, agenda, search, notes context, and reminders.

The first mobile vertical slice may render one day only. Week and month views follow after the interaction and sync contracts are stable.

### 5.2 Direct manipulation: hold, move, and resize

Direct manipulation is a core capability, not a decorative enhancement.

#### Hold and drag

- A brief tap opens details, except on dedicated inline controls such as Join or Complete.
- A deliberate hold enters drag mode. The threshold must distinguish intent from scrolling.
- Once drag mode begins, the card lifts visually without changing the viewport scale.
- The original slot remains visible as a low-emphasis placeholder.
- A time label tracks the proposed start and end.
- Movement snaps to the configured increment, initially five minutes to preserve the existing interaction contract, while preserving exact values for imported events.
- Auto-scroll begins near timeline edges and stops immediately when the pointer leaves the edge zone.
- Releasing commits one atomic mutation. Cancelling returns the card to its origin without a server write.

#### Resize

- Timed cards expose top and bottom resize targets that are large enough for touch but visually quiet.
- Dragging the top edge changes the start while preserving the end; dragging the bottom edge changes the end.
- The preview must show duration and block invalid ranges before release.
- Minimum duration is configurable by entity type; the launch defaults preserve the current 10-minute event and 15-minute action floors.
- Resizing a recurring occurrence must ask whether the change applies to this occurrence, this and following, or the full series when those operations are valid.

#### Gesture ownership

- A gesture may be owned by scrolling, opening, dragging, or resizing, never more than one.
- Movement beyond the scroll slop before the hold threshold gives ownership to scroll.
- A dedicated resize handle gives ownership to resize immediately after its activation threshold.
- Native React Native gesture recognizers and UI-thread animations handle mobile movement; domain functions compute dates, snapping, constraints, and mutation payloads.

### 5.3 Event and action details

- Opening and closing must feel like the same spatial transition in opposite directions.
- A mobile detail surface should be a native-feeling sheet or route, not a browser modal that triggers viewport zoom.
- Creation and editing share fields and validation but retain distinct navigation histories.
- Dismissal is explicit through save, cancel/back, scrim, or a platform back gesture according to unsaved-change rules.
- Reduced-motion mode replaces transforms and morphs with short opacity transitions or immediate state changes.

Gooey effects may be used only for closely related controls whose geometry visibly merges. They must not be used to disguise unrelated modal mounting, must not toggle expensive filters during a transition, and must pass a low-end Android performance check.

### 5.4 Meeting links

- Detect Zoom, Google Meet, Microsoft Teams, Webex, and valid generic HTTPS conferencing links.
- A visible **Join** action on a timeline or agenda card opens the meeting URL directly and must stop propagation so it does not open event details.
- The event title or non-interactive card area opens event details.
- Show the Join action at all times when space permits; emphasize it from five minutes before start until the configured late window.
- Validate schemes and require a user confirmation for an unfamiliar non-HTTPS link.

### 5.5 Actions and subtask progress

- Actions can remain unscheduled, have a due date, or occupy a timeline interval.
- Dragging an unscheduled action into the timeline creates scheduling data on that action; it does not create a duplicate event.
- Completion remains distinct from scheduling.
- A subtask progress bar contains one segment per current subtask.
- Filled segments are based on the count of completed subtasks, always filled left to right, regardless of which subtask identifiers were completed.
- Progress transitions interpolate width/scale smoothly when the completed count changes; segments must not abruptly swap only their colors.
- Adding or deleting subtasks preserves a comprehensible transition and never implies that a specific visual segment maps to a specific subtask.

### 5.6 Notes as execution context

Notes are part of the product wedge, but a general notes application is not.

Required roles:

- Meeting notes linked to an event series or one occurrence.
- Planning notes linked to a day, action, or project/list context.
- Daily planning and reflection templates.
- Revision history for authored text, including conflict recovery.
- Search across note title, structured blocks, tags, and linked planner objects.
- A lightweight capture inbox that can later be processed into an action, event, or durable note.

The notes experience should become contextually reachable from the timeline before advanced editing features are added. Rich collaboration, publishing, and database-style custom schemas are out of scope.

### 5.7 Quick add and natural language

Quick add is a deterministic parser pipeline with visible interpretation.

#### Input surfaces

- Persistent quick-add entry on mobile and web.
- A desktop global overlay after Tauri is introduced.
- Optional voice transcription later; transcription is input, not interpretation.

#### Parsing pipeline

1. Detect explicit kind prefixes such as `task:`, `event:`, or `meeting:`.
2. Parse application syntax for target list/calendar, tags, priority, reminders, links, and task/event distinctions.
3. Use Chrono to propose absolute and relative dates and times.
4. Apply Calendar Master's existing duration, recurrence, and timezone rules.
5. Normalize the proposal into the existing event/action validation model.
6. Render the interpretation as editable chips before or immediately after creation.

Chrono must sit behind a small adapter and return candidates with source ranges, timezone assumptions, and confidence reasons. The current parser remains the control implementation until a shadow-mode corpus proves that the new adapter improves coverage without unacceptable regressions.

#### Ambiguity policy

- High confidence: create with an immediate undo affordance.
- Medium confidence: prefill the composer and highlight uncertain fields.
- Low confidence: preserve the title and ask for the missing date/time through focused controls.
- Never silently invent attendees, recurrence, calendar ownership, or a destructive series edit.

#### LLM decision

A free open-weight LLM is not the replacement for the NLP engine in the launch path. “Free weights” do not mean free product operation: mobile inference adds application size, memory pressure, battery usage, device variance, and model lifecycle work; server inference adds hosting cost, latency, privacy obligations, and nondeterminism.

An LLM may be evaluated later for bounded assistance such as:

- Turning a long capture into a proposed title plus subtasks.
- Suggesting a duration from a user's history.
- Producing candidate meeting times with an explanation.
- Classifying a note into a user-confirmed action, event, or reference.

Any model output remains a proposal, is schema-validated, and requires confirmation when it changes time or external provider data. A model is never the recurrence engine, occurrence identity authority, or conflict resolver.

### 5.8 Account and sync experience

Local mode remains available. Signing in adds backup and cross-device continuity; it does not make the app unusable when Convex or the network is unavailable.

Settings must show:

- Signed-in identity and connected devices.
- Last successful synchronization time.
- Pending local mutation count.
- Recoverable sync or authentication errors.
- Conflict count with a path to compare versions.
- Export, sign out on this device, revoke another device, and delete account.

Sync status should be quiet while healthy and specific when unhealthy. “Saved” means committed locally; “Synced” means acknowledged by Convex.

## 6. Platform and application architecture

### 6.1 Platform sequence

| Surface | Technology | Role | Timing |
|---|---|---|---|
| Android | Expo / React Native | First native client and touch reference implementation | Now |
| Windows and macOS | Existing React/Vite web app | Desktop planning and cross-device counterpart | Now |
| iOS | Same Expo application | Native expansion after Android quality gate | After mobile core parity |
| Windows and macOS native shell | Tauri v2 around the web client | Tray, global quick add, notifications, autostart | After sync/provider validation |
| React Native Windows/macOS | Not selected | Would add immature platform surface and a third migration problem | Reconsider only with new evidence |

### 6.2 Repository shape

The target is a workspace with explicit boundaries:

```text
apps/
  web/                    existing React/Vite application, migrated incrementally
  mobile/                 Expo Router application
packages/
  domain/                 calendar, tasks, notes, reminders, search, planner rules
  sync-contracts/         mutation envelopes, record metadata, conflict types
  quick-add/              deterministic parser orchestration and Chrono adapter
convex/
  schema.ts
  auth.config.ts
  sync.ts
  events.ts
  actions.ts
  notes.ts
  providers/
```

Extraction must preserve the current ES module behavior first. Converting the entire domain to TypeScript is not part of the extraction. New public contracts and backend functions should be TypeScript, and existing modules can migrate incrementally when touched.

Package boundaries:

- `packages/domain` may depend only on deterministic utilities and must not import React, React Native, DOM APIs, Expo, Convex, local storage, network clients, or wall-clock globals hidden inside business operations.
- Platform applications translate UI intent into domain commands and persist the resulting records.
- Convex validates authorization, ordering, idempotency, and sync conflicts; it imports only server-safe shared code.
- Presentation state, gestures, animations, navigation, and platform storage remain in their applications.

### 6.3 Expo client

- Use Expo Router for mobile routes and platform navigation.
- Start in Expo Go while all required modules are supported.
- Move to a development build at the first capability that requires custom native code, background execution, widgets, or app extensions. Do not introduce a custom client merely as ceremony.
- Use React Native Gesture Handler for gesture arbitration and Reanimated for UI-thread drag/resize feedback.
- Use Expo SQLite as the durable local record and outbox store.
- Store device session material in SecureStore, never AsyncStorage or public Expo environment variables.
- Keep route files under `app/`; reusable components, repositories, domain adapters, and types live outside the routes directory.
- Use adaptive sheets/routes and native back behavior rather than porting browser modals directly.

### 6.4 Web client

- Preserve the current Vite app through the first mobile milestone.
- Replace whole-notebook `localStorage` persistence with per-record IndexedDB storage behind the existing persistence boundary.
- Add the same outbox and sync contract used by mobile.
- Keep desktop keyboard and pointer interactions; share domain calculations rather than forcing identical UI components.
- Migrate `Planner.jsx` by vertical feature seams only after the cross-platform storage and domain boundaries are stable.

## 7. Convex backend design

### 7.1 Responsibilities

Convex owns:

- Authenticated application data and per-user authorization.
- Idempotent mutation acceptance and server-side revisions.
- A monotonic per-user sync sequence assigned in the same transaction as each accepted change.
- Indexed change queries for clients resuming from a cursor.
- Conflict records and device metadata.
- Server actions for future Google/Microsoft/CalDAV adapters, webhook handling, and token refresh.
- Lightweight reactive signals that tell a visible client to pull new changes.

Convex does not replace:

- Durable offline storage.
- The client outbox.
- Domain recurrence logic.
- Native notification scheduling while a device is offline.
- Explicit provider reconciliation rules.

### 7.2 Authentication

Use a Convex-supported OIDC provider. The default recommendation is Clerk with Google sign-in because it is mature across React and Expo and avoids building a custom session system. This choice must be validated in a small authentication spike before domain migration.

Identity and calendar authorization remain separate:

- Identity requests profile scopes only.
- A future calendar connection uses incremental provider consent.
- Provider refresh tokens are server-only and encrypted; devices receive only Calendar Master sessions.
- A user may sign in with one account and connect calendars owned by another.

### 7.3 Typed schema

Use typed tables rather than one generic JSON record table. The target model includes:

- `users`
- `devices`
- `syncHeads`
- `syncChanges`
- `appliedMutations`
- `conflicts`
- `calendars`
- `events`
- `eventExceptions`
- `actions`
- `subtasks`
- `taskCompletions`
- `notes`
- `noteRevisions`
- `noteTags`
- `reminderIntents`
- `preferences`
- `calendarConnections`

Phase 1 creates only the tables needed for its vertical slice plus sync infrastructure. Later tables are introduced when their feature enters the slice; an empty future schema is not progress.

Every synchronized domain row includes or can derive:

- `ownerId`
- Stable application `entityId`
- Server `revision`
- Server `syncVersion`
- Server-maintained revision metadata for each conflict-mergeable field
- Authored and updated timestamps with explicit provenance
- Optional tombstone timestamp
- Last accepted mutation identifier

All list queries must use indexes and bounds or pagination. Whole-workspace subscriptions and unbounded `.collect()` calls are prohibited.

### 7.4 Sync protocol

Each device maintains:

```text
records     current local projections keyed by collection and entity id
outbox      ordered, durable mutation envelopes
metadata    device id, user id, schema version, last pulled sync version
```

A local write and its outbox entry commit in one local database transaction. The UI reads the committed local state immediately.

Each mutation contains:

- Stable `clientMutationId` reused across retries.
- Device identifier.
- Entity type and stable entity identifier.
- Operation: create, patch, delete, or a named transactional domain command.
- Base server revision.
- Changed fields or command payload.
- Optional atomic group identifier for one domain operation that changed related records.
- Client-authored timestamp for diagnostics, never as the sole ordering authority.

A Convex mutation:

1. Authenticates the user and verifies device ownership.
2. Returns the original result if the mutation id was already applied.
3. Loads the current record by indexed owner/entity key.
4. Applies the object-specific conflict policy using server-maintained field revisions, not device timestamps.
5. Assigns a unique next user sync version to each change row and writes the entity, change record, and idempotency record atomically. Related rows in an atomic group receive consecutive unique versions in the same transaction.
6. Returns the authoritative row and sync version.

Clients pull `syncChanges` by owner and sync version in bounded pages. A user never has two change rows with the same sync version, so a page cursor can safely advance to the highest returned version without skipping a row. Convex reactivity may notify a visible client that the sync head changed, but the indexed pull protocol remains the source of catch-up correctness.

### 7.5 Conflict rules

The invariant is: no user-authored content disappears solely because two devices edited while disconnected.

| Object | Resolution |
|---|---|
| Event or action | Merge fields whose last server field revision is no newer than the client's base revision. For a same-field conflict, the later server-accepted mutation wins and the previous value is stored in a conflict record the user can inspect. Device clocks do not choose the winner. |
| Completion | A newer explicit completion event is not reversed by an older general record patch. Reopening is its own later command. |
| Subtasks | Merge by stable subtask id. Additions union; edits conflict per field; deletion is a tombstone. |
| Note body/blocks | Keep the authoritative current revision and always persist the losing authored version in note revisions. |
| Preferences | Resolve per preference key, never by replacing the entire preferences object. |
| Delete versus edit | Tombstone wins in the primary view; the edited loser remains recoverable from conflicts for the retention period. |
| Series and exceptions | Submit and apply as a transactional domain batch. Revalidate exceptions after a recurrence-rule change; retain orphans as recoverable one-off events. |

Conflict policy version is recorded with the mutation result so behavior is auditable as policies evolve.

### 7.6 Provider boundary

Provider integrations are server adapters, not client-specific branches.

- Convex actions call the provider layer; clients never hold provider credentials.
- Convex mutations commit provider results and sync changes transactionally after an
  action returns.
- Provider identifiers, etags, sync tokens, provider timestamps, and origin are reserved
  in the model before the first provider integration.
- Provider webhooks are hints to run delta sync; correctness does not depend on receiving
  every webhook. This is not defensive pessimism — webhook loss and delivery latency under
  load are among the most commonly reported failure modes of hosted provider APIs.
- The app model remains authoritative for native actions and notes. External calendars
  remain authoritative for provider-owned fields according to an explicit mapping policy.

#### Unified API or direct adapters — decided at a gate, not now

The product needs four integrations across two vendors: Google Calendar, Microsoft Graph
calendar, Gmail, and Outlook mail. Breadth across vendors is precisely where a unified
API earns its price, and hand-writing four adapters plus token refresh, incremental sync
tokens, etag handling and recurrence-exception equivalence is the single largest block of
undifferentiated work in this plan.

**Nylas is the leading candidate.** What it does and does not do must be stated plainly,
because it is easy to over-scope:

| | |
| --- | --- |
| Replaces | Google/Microsoft calendar and mail adapters, OAuth grant handling, token refresh, provider normalisation, change notification |
| Does **not** replace | Convex, the domain model, the outbox, conflict resolution, auth/identity, recurrence, notifications |
| Does **not** store | Actions, subtasks, notes, revisions, tags, reminders, XP — roughly 16 of the 18 tables in §7.3 |

Two consequences follow and neither is optional:

1. **A unified API is an adapter, never a backend.** It is not an alternative to §7.3; it
   sits behind §7.6. Any proposal to "use Nylas instead of Convex" is a category error.
2. **It does not remove Google/Microsoft app verification.** Restricted Gmail scopes still
   require the vendor's verification path and, at scale, a third-party security
   assessment. Personal use runs in testing mode; public launch does not. Budget for this
   as calendar time, not engineering time.

**Therefore: define the boundary now, choose the implementation at the gate.** All
provider access goes through one narrow server-side interface — roughly
`listCalendars`, `listEvents(range)`, `writeEvent`, `deleteEvent`,
`subscribeChanges(cursor)`, `listMessages(since)` — with at least a direct-Google
implementation and a unified-API implementation costed against it before either is
committed. Nothing above this interface may know which one is running.

Cost shape to carry into that gate: unified APIs price **per connected account per
month**, which is a recurring per-user cost on a consumer product and must be compared
against the one-off engineering cost of direct adapters at the user counts this product
actually expects — not at zero and not at a million.

### 7.7 Mail extraction boundary

Mail is read to **propose** and for nothing else. This section is a constraint, not a
feature description.

**Scope.** Read-only access to Gmail and Outlook mail. No inbox surface, no triage, no
reading pane, no drafting, no sending, no reply. The user never manages mail here.

**Pipeline.** Each stage is separable and testable:

1. Fetch new messages since a cursor, server-side.
2. Detect candidates — structured invitations first, then booking, travel and
   reservation confirmations, then natural-language scheduling intent.
3. Reconcile against events already known, so an invitation that is already on the
   calendar never becomes a proposal.
4. Emit a proposal carrying its source message reference and a confidence.
5. The user accepts, edits-then-accepts, or dismisses. Only acceptance runs a domain
   command.

**Determinism.** Structured invitations and machine-generated confirmations are parsed
deterministically and must never depend on a model. Model assistance is permitted only
for step 2 on unstructured prose, only as a proposal, and never as the recurrence engine,
occurrence-identity authority, or conflict resolver — consistent with §3.3.4.

**Dismissal is memory, not a no-op.** A dismissed proposal must not return. Re-proposing
something the user rejected is the fastest way to make this feature feel like spam and
get the whole connection revoked.

**What is stored.** Proposals, their source message identifiers, and extraction
decisions. **Not** raw message bodies, and not attachments. Retention for extraction
state is bounded and stated in the privacy policy alongside §10.

**Failure posture.** Extraction is best-effort and additive. It may be behind, it may
miss things, and the day must be complete and correct without it. Nothing in the
planner's correctness may depend on a proposal having been generated.

## 8. Local storage and migration

### 8.1 Web

The existing v8 notebook blob migrates to per-record IndexedDB storage. For one release, the app also writes a recoverable v8-shaped backup snapshot. The UI-facing state shape remains compatible during the migration so storage work does not force a simultaneous `Planner.jsx` rewrite.

### 8.2 Mobile

Expo SQLite stores normalized records, tombstones, outbox entries, metadata, and schema migrations. Repository methods return domain records rather than SQL rows. SQL transactions enforce the local-write-plus-outbox invariant.

### 8.3 First sign-in

- An unsigned local notebook remains fully usable.
- On first sign-in, the user chooses to upload local data into an empty cloud notebook or review a merge when cloud data already exists.
- Import is expressed as idempotent mutation batches and may resume after interruption.
- A local export is offered before a destructive merge choice.

## 9. Notifications, background work, and widgets

These capabilities follow the reliable local model and are not prerequisites for the first sync slice.

- Local reminders should be scheduled from reminder intents stored on device.
- Server jobs may deliver remote notifications for provider changes or when a device has not scheduled an intent, but duplicate suppression is required.
- Android background work must be tested against OS battery restrictions on the actual Samsung device.
- Widgets read a deliberately small local projection and enqueue intents; they must not assume the full app or network is active.
- Desktop tray, global quick add, and launch-at-login arrive with Tauri, not through a second desktop UI rewrite.

## 10. Privacy and security

Reading a person's mailbox is a far larger commitment than reading their calendar, and
the first four rules exist because of it.

- **Request the narrowest provider scopes that work, and say why each is needed at the
  moment it is requested.** Calendar and mail authorization are separate consents,
  incremental, and separate again from sign-in.
- **Do not retain message bodies or attachments.** Extraction keeps proposals, source
  message identifiers, and decisions; see §7.7.
- **Mail is read to propose and for nothing else.** No profiling, no advertising, no
  training a model on user mail, no derived data sold or shared. This is a product
  boundary, not only a policy sentence.
- **Disconnecting an account removes its derived data**, not just the token, and the UI
  says what will be removed before the user confirms.
- Encrypt transport everywhere and use the platform's encryption at rest.
- Store provider refresh tokens only on the server, encrypted with managed key material.
- Store device refresh/session material in SecureStore or an OS credential store.
- Apply authorization at the Convex function boundary for every read and write. Public
  functions are thin authenticated wrappers; internal functions perform privileged work.
- Do not log event titles, note content, descriptions, meeting links, message subjects,
  or parsed input.
- Keep content analytics off by default. Product analytics use event names and coarse
  counts, not authored text.
- Support complete JSON export, individual device revocation, and account deletion with a
  stated grace period.
- Do not claim end-to-end encryption while the server must read provider, calendar and
  mail fields. Explain this honestly in the privacy policy.
- Treat deep links and meeting links as untrusted input and validate protocol, host, and
  redirect behavior.
- **Budget for vendor verification as calendar time.** Restricted Gmail scopes require
  Google's verification path and, at scale, a third-party security assessment. A unified
  provider API does not remove this.

## 11. Accessibility and motion quality

- All actions must remain available without drag gestures.
- Touch targets meet a 44–48 px minimum depending on platform guidance.
- Screen readers announce item type, time, duration, completion, conflict state, and the result of a move or resize.
- Keyboard users can move or resize a selected item in configured increments.
- Color is never the only indicator of state, completion, or conflict.
- Respect reduced-motion and increased-contrast preferences.
- Target 60 frames per second during common timeline manipulation on the reference Samsung device.
- No transition may animate browser or native viewport scale. Text inputs must use platform-appropriate font sizes to avoid browser auto-zoom.
- Exit transitions remain mounted until their animation completes, and are the spatial inverse of entry unless the platform navigation convention requires otherwise.

## 12. Success measures

### 12.1 North-star outcome

**Planned days completed:** a day in which the user viewed the unified day, created or modified at least one event/action, and later completed an action or joined an event.

This measures whether Calendar Master supports execution, not simply whether it was opened.

### 12.2 Activation

Within the first seven days, a user:

- Creates or imports at least three items.
- Schedules at least one action on the timeline.
- Uses quick add at least twice.
- Opens the same notebook on a second device.

### 12.3 Quality guardrails

- Zero known lost user-authored mutations.
- At least 99.9% of accepted mutations converge without manual intervention.
- Crash-free sessions above 99.5% during private beta.
- Timeline drag/resize input-to-frame latency remains within the 60 fps budget on the reference device for the normal day density.
- Quick-add exact-field accuracy on the approved corpus is at least 95% for supported syntax; low-confidence cases must not silently write uncertain fields.
- Join-link activation opens the external link rather than details in 100% of automated interaction cases.

### 12.4 Learning measures

- Percentage of active days that combine events and actions.
- Percentage of scheduled actions moved or resized.
- Quick-add use, correction, undo, and abandonment rates by parser feature, without storing raw text.
- Notes opened from an event/action/day context.
- Conflict rate per 1,000 mutations and recovery choice.
- Device-pair retention after the first successful cross-device sync.

## 13. Release roadmap

Each phase is an outcome gate, not a date promise. Later phases may be reordered only when
evidence changes the product risk.

**This sequence was reordered when the product moved from local-first to connected.** The
previous order built the cross-platform sync slice first and reached Google Calendar at
Phase 4. That made sense when connected calendars were an enhancement. They are now the
product, which changes two things:

- **The riskiest assumption moved.** It is no longer "can two clients converge offline";
  it is "can this assemble a correct day from accounts we do not control". Untested risk
  should be retired early, so provider work now comes first.
- **Mobile is no longer the gate to value.** The existing web client can prove connected
  calendars on its own. Building Expo and Android before knowing whether provider mapping,
  recurrence equivalence and token handling hold up would be building a second client for
  an unproven product.

Offline remains non-negotiable (§3.3.3), but it arrives where it is first needed: reads are
cached from Phase 1, and the durable outbox lands in Phase 2 with the first write.

### Phase 0 — Freeze behavior and establish boundaries

**Outcome:** The current web product has a reproducible behavior baseline and its domain can be consumed outside the Vite application.

- Record upstream baseline and run all unit/browser tests.
- Extract the pure domain and shared-time code into a workspace package without semantic rewrites.
- Add import-boundary checks and recurrence round-trip characterization tests.
- Define versioned sync and quick-add contracts.

**Gate:** Existing web behavior and tests remain green; the package imports in both Node and a minimal Expo screen.

### Phase 1 — Account, server, and the first connected calendar (read-only)

**Outcome:** The existing web client shows one real day assembled from the user's own Google calendar alongside their Actions and Notes, and is honest about connection state.

- Convex project, OIDC sign-in, `users`/`devices`, and only the sync tables from §7.3 this slice needs.
- The provider interface of §7.6, with a direct-Google implementation and a unified-API implementation behind it, so the gate below is decided on measurement.
- Incremental Google calendar authorization, separate from sign-in, with server-held tokens.
- Initial import, delta sync by sync token, webhook hints, and visible connection health.
- Provider event mapping: recurrence and exception equivalence, all-day handling, timezone fidelity, attendee fields, conferencing links, provenance on every record.
- Read-only. Nothing writes back to Google in this phase.
- Cached provider reads so the day still renders with no signal.

**Gate:** A controlled Google calendar containing recurring series, exceptions, all-day events and cross-timezone events renders for a full month identically to Google's own UI, survives token revocation and webhook loss without corrupting the local day, and the provider-layer decision of §7.6 is made against the two implementations rather than a vendor page.

### Phase 2 — Two-way sync and Microsoft

**Outcome:** Calendar Master is a safe daily interface over real external calendars, not a viewer.

- Durable outbox and idempotent mutation push; local writes are immediate and queue offline.
- Outbound create/edit/delete with retry, reconciliation, and the conflict rules of §7.5.
- Microsoft Graph calendar through the same provider interface, which is what proves the interface was real.
- Conflict comparison UI and recoverable sync-failure states.

**Gate:** An offline edit to a recurring occurrence on a connected calendar, made with no signal and synced later, produces exactly one correct change in the provider and no duplicate or ghost occurrence — proven on both Google and Microsoft.

### Phase 3 — Mail proposals

**Outcome:** Work that arrived by mail is offered back as something the user accepts, and the day stops silently missing things.

- Read-only Gmail and Outlook mail access through the provider interface.
- The extraction pipeline of §7.7: fetch, detect, reconcile against known events, propose.
- Deterministic parsing for structured invitations and machine-generated confirmations; model assistance permitted only for unstructured prose, only as a proposal.
- A proposal surface with accept, edit-then-accept, and dismiss — and dismissal that is remembered.
- Retention and privacy disclosure for extraction state.

**Gate:** Across a real mailbox for two weeks: no proposal duplicates an event already on the calendar, no dismissed proposal returns, no message body is retained, and precision is high enough that the user does not begin ignoring the surface. Recall is explicitly not gated — missing a proposal is acceptable, inventing one is not.

### Phase 4 — Cross-platform trust vertical slice

**Outcome:** One real day survives offline Android use and converges with web through Convex.

- Scaffold the Expo app and Android-first day route.
- Add SQLite per-record repositories with durable outboxes, matching the web contract.
- Render one day of events and actions on mobile, including connected-calendar events.
- Support create, edit, complete, Join, hold-to-move, and edge resize for non-recurring timed items.
- Prove two-client convergence, process termination recovery, and Samsung hardware behavior.

**Gate:** Plan a day offline on Android, terminate and reopen the app, reconnect, and see byte-equivalent domain records and the same rendered day on web with zero lost edits.

### Phase 5 — Mobile core parity

**Outcome:** Android can serve as the user's daily primary client.

- Recurring occurrence and series edits.
- Week and agenda surfaces; month navigation as a planning index.
- Unscheduled action tray, time blocking, subtasks, dependencies, and progress motion.
- Complete quick-add UI with Chrono shadow evaluation graduated for proven expressions.
- Search, settings, import/export, conflict comparison, and accessibility completion.
- Local reminders and lifecycle/background hardening.

**Gate:** Two weeks of real use on Android plus web, with no unexplained divergence, lost edits, or severity-one gesture failures.

### Phase 6 — Contextual notes and review loop

**Outcome:** Notes improve execution without turning Calendar Master into a general document suite.

- Event-, occurrence-, action-, and day-linked notes.
- Meeting and planning templates.
- Revision/conflict recovery across devices.
- Capture inbox processing and daily/weekly review flows.
- Search and backlinks across planner context.

**Gate:** Users can prepare, execute, and review a meeting or focused action without leaving the linked Calendar Master context.

### Phase 7 — Native shells and ambient access

**Outcome:** Calendar Master is available at the speed expected of a system calendar.

- Tauri packages for Windows and macOS.
- Tray/menu-bar agenda, global quick add, launch-at-login, and native notifications.
- Android widgets and notification actions; iOS beta and widgets after platform-specific validation.
- Deep links and Join handoff across platforms.

**Gate:** Quick access launches reliably, preserves the same account/local database contract, and adds no duplicate-notification or stale-widget defects.

### Phase 8 — Calendar sets and context

**Outcome:** Users can control context and availability across the accounts they have connected.

- Manual calendar/task-list sets.
- Time-based automatic switching.
- Location rules only after a privacy and battery review.
- Busy-without-details availability overlays.
- CalDAV only if demand is evidenced; task providers only where ownership and conflict behavior are explicit.

**Gate:** Context switching never changes underlying data, leaks private event details, or causes provider write ambiguity.

### Phase 9 — Scheduling links

**Outcome:** Users can offer availability without a separate scheduling tool.

- Select and copy ad-hoc candidate slots.
- Recipient voting with expiry and host confirmation.
- Booking links, buffers, limits, advance notice, intake fields, and timezone handling.
- Abuse controls, public-page privacy, audit history, and idempotent booking creation.

**Gate:** Double-booking, race, timezone, cancellation, and provider-failure scenarios pass before public availability.

### Phase 10 — Optional assistive intelligence

**Outcome:** Intelligence saves effort without weakening trust.

- Evaluate bounded model-assisted capture, duration suggestions, and planning proposals.
- Compare device, server-hosted open-weight, and managed models on privacy, latency, cost, and quality.
- Require structured output, validation, confidence, user confirmation, and complete fallback.

**Gate:** A measured experiment beats deterministic UX on task success and correction rate without exposing authored content contrary to the privacy contract.

## 14. Verification strategy

### 14.1 Domain and contract tests

- Existing domain tests continue unchanged after extraction.
- Run recurrence and occurrence identity through web → Convex → mobile round trips across DST gaps, DST folds, floating time, explicit zones, exceptions, and series splits.
- Contract fixtures are consumed by web, mobile, and Convex test suites.

### 14.2 Two-client convergence

Run two clients against one test deployment with divergent offline edits. Assert:

- Both clients converge to the same authoritative records.
- Every authored mutation is represented in current state, a tombstone, a revision, or a conflict.
- The rendered day projection is equivalent after convergence.

### 14.3 Durability

- Terminate a client immediately after a local write and before network drain.
- Restart it and verify the local state and outbox survive.
- Replay the same mutation batch and verify idempotent results.
- Interrupt initial sign-in import and resume it without duplicates.

### 14.4 Interaction tests

- Test touch, mouse, keyboard, and screen-reader alternatives separately.
- Verify tap versus hold versus scroll arbitration.
- Verify top/bottom resize, snap boundaries, minimum duration, cancellation, and auto-scroll.
- Verify Join stops card-detail navigation.
- Verify modal/sheet entry and exit, reduced motion, keyboard avoidance, and no viewport zoom.
- Verify subtask segments fill by completed count, left to right, with an interpolated transition.

### 14.5 Real hardware

No mobile phase closes without testing on the owner's actual Samsung phone under:

- Online, airplane mode, reconnect, background, and force-stop conditions.
- Low-power/battery-restricted behavior.
- A dense day, long titles, overlapping events, and keyboard-open layouts.
- At least one low-performance device profile or emulator.

Every new high-risk test must be mutation-tested once: deliberately break the behavior and confirm the test fails before trusting it.

## 15. Risks and mitigations

| Risk | Product consequence | Mitigation |
|---|---|---|
| Rewriting working domain logic during platform migration | Silent recurrence or task corruption | Extract behavior unchanged; migrate language and types incrementally. |
| Treating Convex cache as offline persistence | Lost writes after termination or long offline periods | SQLite/IndexedDB transaction plus durable outbox is mandatory. |
| Over-subscribing reactive queries | Mobile battery, bandwidth, and backend cost | Subscribe to small indexed sync heads/visible scopes; pull bounded changes. |
| Building two UIs creates delivery drag | Feature velocity slows | Share domain/contracts, deliver vertical slices, and keep web stable rather than chasing immediate visual parity. |
| Chrono regressions or locale ambiguity | Wrong dates written confidently | Adapter, shadow corpus, interpretation chips, confidence thresholds, undo. |
| LLM enthusiasm expands scope | Latency, cost, privacy, and nondeterministic writes | Keep models out of critical scheduling path until a bounded experiment has evidence. |
| Provider recurrence differs from local recurrence | Duplicate or ghost occurrences | Equivalence suite and provider-specific reconciliation before outbound sync. |
| Polished motion harms interaction | Bounces, zoom, dropped frames, unclear dismissal | Motion contract, UI-thread gestures, reduced motion, hardware performance gate. |
| `Planner.jsx` remains a monolith | Cross-platform port becomes fragile | Extract by feature seams after domain/storage contracts, never as a big-bang rewrite. |

## 16. Decisions and review gates

### Locked by this PRD

- **The product is connected, not local-first.** Google and Microsoft calendars, and
  mail-derived proposals, are core rather than enhancements.
- **Offline is a first-class state.** Durable local storage and an outbox on every
  client; connected never means online-only.
- **Mail proposes, never writes.** No inbox surface, no sending, no unconfirmed calendar
  writes.
- **Provider access sits behind one server-side interface**, so the implementation is
  replaceable and no domain code knows which vendor answered.
- Expo/React Native for Android and later iOS.
- Existing web client for Windows/macOS during the connected milestone.
- Convex backend with durable local databases on clients.
- Shared domain package; no Flutter or Kotlin rewrite.
- Chrono as an adapter inside deterministic quick add; no LLM dependency for launch.
- Google is the first provider, Microsoft the second, and no third until both are
  trustworthy.

### Decisions made at explicit gates

- **Provider layer — unified API or direct adapters.** Build both behind the §7.6
  interface during Phase 1 and decide on measured integration cost, latency, webhook
  reliability and per-connected-account price at the user counts actually expected. Do
  not decide from a vendor page, and do not let the decision leak above the interface.
- **Mail extraction technique.** Deterministic parsers ship first. A model is admitted
  for unstructured prose only if it measurably raises precision without lowering it
  elsewhere, and only as a proposal.
- **Authentication provider:** validate Clerk + Google inside the Phase 1 tracer; retain
  only if Expo, web, device revocation, and Convex authorization are straightforward.
- **Expo Go to development build:** switch when the first required native capability
  cannot run faithfully in Expo Go.
- **Chrono graduation:** promote individual expression classes only after corpus metrics
  meet the accuracy guardrail.
- **Tauri timing:** begin only after cross-device sync is stable and desktop quick-access
  demand is validated.
- **Open-weight model:** evaluate only in Phase 10 against a named bounded task and total
  operating cost.

## 17. References

- [Convex React Native quickstart](https://docs.convex.dev/quickstart/react-native)
- [Convex optimistic updates](https://docs.convex.dev/client/react/optimistic-updates)
- [Convex overview](https://docs.convex.dev/understanding/overview)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo modules overview](https://docs.expo.dev/modules/overview/)
- [Chrono natural-language date parser](https://github.com/wanasit/chrono)
- [React Native for Windows](https://microsoft.github.io/react-native-windows/)
