# Calendar Master Cross-Platform PRD and Technical Design

**Status:** Draft for product and engineering review  
**Date:** 2026-08-11  
**Repository baseline:** `origin/main` at `bde5dd3`  
**Product owner:** Kamran  
**Initial launch target:** Android, with the existing web app retained for Windows and macOS  
**Backend:** Convex  
**Native client:** Expo / React Native  

## 1. Executive decision

Calendar Master should become a local-first daily planning system that combines calendar commitments, executable actions, and contextual notes in one trustworthy day view.

The next release should not attempt to reproduce all of Fantastical. Its wedge is narrower and more defensible: a person can open one realistic day, understand what is fixed and what is actionable, reshape the plan directly, capture new work in natural language, and trust that the result survives offline use and appears correctly on every device.

The approved platform strategy is:

- Keep the existing React/Vite application as the Windows and macOS experience for now.
- Build the Android application with Expo and React Native; support iOS after the Android interaction model and sync layer are proven.
- Preserve and extract the existing JavaScript domain code rather than rewriting recurrence, task, note, reminder, and time logic in Dart or Kotlin.
- Use Convex for identity-linked application data, transactions, reactive sync signals, server functions, and provider orchestration.
- Keep an on-device database and durable outbox on every client. Convex's reactive cache improves freshness, but does not replace durable offline storage.
- Use Chrono as one temporal parser within a deterministic quick-add pipeline. Do not put a general-purpose LLM in the critical path for event or task creation.
- Package the existing web app with Tauri only after cross-device sync is reliable and desktop system integration becomes a measured priority.

This document supersedes the Phase A Supabase proposal and the earlier assumption that a framework decision could wait until after sync. The framework decision now matters because the first sync vertical slice must prove the shared domain package inside both the existing web app and the new Android app.

## 2. Product thesis

### 2.1 Problem

Most calendar products show commitments but do not help users execute their day. Most task products show obligations but do not make time constraints tangible. Notes often become a third disconnected system. The user must mentally reconcile all three while moving between devices.

Calendar Master will make the day itself the primary workspace:

- Events answer, “Where must my time go?”
- Actions answer, “What must I move forward?”
- Notes answer, “What context and thinking support this work?”
- The timeline answers, “How does this fit in reality?”

### 2.2 Positioning

Calendar Master is a personal execution calendar, not a team project manager and not merely a prettier calendar client. It borrows Fantastical's speed, calendar sets, quick access, and scheduling ergonomics, while differentiating through native actions, subtask progress, planning notes, and a more opinionated daily workflow.

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

- A user can plan one complete day on a Samsung phone, close the app while offline, reopen it, and later see the same correct day on the web app.
- Events and actions share one timeline while retaining distinct semantics.
- Touch interactions for hold, move, and resize feel native and remain correct across scrolling and overlapping items.
- Quick add handles the common scheduling language already supported by the repository and improves temporal recognition through Chrono without reducing deterministic behavior.
- Account, sync, conflict, and offline states are visible and recoverable.
- The existing recurrence, occurrence identity, task, notes, search, reminder, and projection behavior remains covered by automated tests.

### 3.2 Non-goals for the first milestone

- Full Fantastical feature parity.
- Google Calendar two-way sync, Microsoft Graph, CalDAV, Apple Reminders, Google Tasks, or Todoist integration.
- Tauri packaging, tray controls, global shortcuts, widgets, or launch-at-login.
- Scheduling links, meeting voting, or multi-user collaboration.
- On-device open-weight LLM inference.
- Automatic AI changes to a user's calendar.
- A full visual rewrite of the existing web app.

### 3.3 Product principles

1. **Trust before breadth.** A smaller synchronized product is better than a wide product that can lose or misrepresent time.
2. **The day is the unit of value.** Every major capability must make planning, executing, or reviewing a day easier.
3. **Local writes are immediate.** Network availability must not gate creation, editing, completion, moving, or resizing.
4. **Motion explains continuity.** Animation must communicate origin, destination, or state change. It must never add a surprise bounce, zoom the viewport, or delay control.
5. **Deterministic by default.** Dates, recurrence, reminders, task metadata, and sync policies must be auditable and testable.
6. **Progressive intelligence.** Use heuristics and Chrono for high-confidence parsing; add model assistance later only where it creates measurable value.
7. **One domain, adaptive surfaces.** Business rules are shared; controls and navigation adapt to touch, keyboard, window size, and operating system.

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
- Movement snaps to the configured increment, initially 15 minutes, while preserving exact values for events imported with non-standard minutes.
- Auto-scroll begins near timeline edges and stops immediately when the pointer leaves the edge zone.
- Releasing commits one atomic mutation. Cancelling returns the card to its origin without a server write.

#### Resize

- Timed cards expose top and bottom resize targets that are large enough for touch but visually quiet.
- Dragging the top edge changes the start while preserving the end; dragging the bottom edge changes the end.
- The preview must show duration and block invalid ranges before release.
- Minimum duration is configurable by entity type; the launch default is 15 minutes.
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
- Client-authored timestamp for diagnostics, never as the sole ordering authority.

A Convex mutation:

1. Authenticates the user and verifies device ownership.
2. Returns the original result if the mutation id was already applied.
3. Loads the current record by indexed owner/entity key.
4. Applies the object-specific conflict policy.
5. Increments the user's sync head and writes the entity, change record, and idempotency record atomically.
6. Returns the authoritative row and sync version.

Clients pull `syncChanges` by owner and sync version in bounded pages. Convex reactivity may notify a visible client that the sync head changed, but the indexed pull protocol remains the source of catch-up correctness.

### 7.5 Conflict rules

The invariant is: no user-authored content disappears solely because two devices edited while disconnected.

| Object | Resolution |
|---|---|
| Event or action | Merge disjoint fields. For the same field, the authoritative winner is retained and the losing value is stored in a conflict record the user can inspect. |
| Completion | A newer explicit completion event is not reversed by an older general record patch. Reopening is its own later command. |
| Subtasks | Merge by stable subtask id. Additions union; edits conflict per field; deletion is a tombstone. |
| Note body/blocks | Keep the authoritative current revision and always persist the losing authored version in note revisions. |
| Preferences | Resolve per preference key, never by replacing the entire preferences object. |
| Delete versus edit | Tombstone wins in the primary view; the edited loser remains recoverable from conflicts for the retention period. |
| Series and exceptions | Submit and apply as a transactional domain batch. Revalidate exceptions after a recurrence-rule change; retain orphans as recoverable one-off events. |

Conflict policy version is recorded with the mutation result so behavior is auditable as policies evolve.

### 7.6 Provider boundary

Provider integrations are server adapters, not client-specific branches.

- Convex actions call Google, Microsoft, or CalDAV APIs.
- Convex mutations commit provider results and sync changes transactionally after an action returns.
- Provider identifiers, etags, sync tokens, provider timestamps, and origin are reserved in the model before the first provider integration.
- Provider webhooks are hints to run delta sync; correctness does not depend on receiving every webhook.
- The app model remains authoritative for native actions and notes. External calendars remain authoritative for provider-owned fields according to an explicit mapping policy.

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

- Encrypt transport everywhere and use the platform's encryption at rest.
- Store provider refresh tokens only on the server, encrypted with managed key material.
- Store device refresh/session material in SecureStore or an OS credential store.
- Apply authorization at the Convex function boundary for every read and write. Public functions are thin authenticated wrappers; internal functions perform privileged work.
- Do not log event titles, note content, descriptions, meeting links, or parsed input.
- Keep content analytics off by default. Product analytics use event names and coarse counts, not authored text.
- Support complete JSON export, individual device revocation, and account deletion with a stated grace period.
- Do not claim end-to-end encryption while the server must read provider and calendar fields for sync. Explain this honestly in the privacy policy.
- Treat deep links and meeting links as untrusted input and validate protocol, host, and redirect behavior.

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

Each phase is an outcome gate, not a date promise. Later phases may be reordered only when evidence changes the product risk.

### Phase 0 — Freeze behavior and establish boundaries

**Outcome:** The current web product has a reproducible behavior baseline and its domain can be consumed outside the Vite application.

- Record upstream baseline and run all unit/browser tests.
- Extract the pure domain and shared-time code into a workspace package without semantic rewrites.
- Add import-boundary checks and recurrence round-trip characterization tests.
- Define versioned sync and quick-add contracts.

**Gate:** Existing web behavior and tests remain green; the package imports in both Node and a minimal Expo screen.

### Phase 1 — Cross-platform trust vertical slice

**Outcome:** One real day survives offline Android use and converges with web through Convex.

- Scaffold the Expo app and Android-first day route.
- Add SQLite and IndexedDB per-record repositories with durable outboxes.
- Add OIDC sign-in, devices, typed event/action records, idempotent push, indexed pull, and visible sync health in Convex.
- Render one day of events and actions on mobile.
- Support create, edit, complete, Join, hold-to-move, and edge resize for non-recurring timed items.
- Prove two-client convergence, process termination recovery, and Samsung hardware behavior.

**Gate:** Plan a day offline on Android, terminate and reopen the app, reconnect, and see byte-equivalent domain records and the same rendered day on web with zero lost edits.

### Phase 2 — Mobile core parity

**Outcome:** Android can serve as the user's daily primary client.

- Recurring occurrence and series edits.
- Week and agenda surfaces; month navigation as a planning index.
- Unscheduled action tray, time blocking, subtasks, dependencies, and progress motion.
- Complete quick-add UI with Chrono shadow evaluation graduated for proven expressions.
- Search, settings, import/export, conflict comparison, and accessibility completion.
- Local reminders and lifecycle/background hardening.

**Gate:** Two weeks of real use on Android plus web, with no unexplained divergence, lost edits, or severity-one gesture failures.

### Phase 3 — Contextual notes and review loop

**Outcome:** Notes improve execution without turning Calendar Master into a general document suite.

- Event-, occurrence-, action-, and day-linked notes.
- Meeting and planning templates.
- Revision/conflict recovery across devices.
- Capture inbox processing and daily/weekly review flows.
- Search and backlinks across planner context.

**Gate:** Users can prepare, execute, and review a meeting or focused action without leaving the linked Calendar Master context.

### Phase 4 — Google Calendar integration

**Outcome:** Calendar Master becomes a safe daily interface over a real external calendar.

- Incremental Google calendar authorization separate from sign-in.
- Server-held tokens, initial import, delta sync, webhook hints, and health UI.
- Provider event mapping, recurrence/exception equivalence, attendee fields, conferencing links, and provider conflict rules.
- Outbound create/edit/delete with retry and reconciliation.

**Gate:** A controlled Google calendar passes recurring-series, offline-write, webhook-loss, token-revocation, and two-device reconciliation tests before broad beta.

### Phase 5 — Native shells and ambient access

**Outcome:** Calendar Master is available at the speed expected of a system calendar.

- Tauri packages for Windows and macOS.
- Tray/menu-bar agenda, global quick add, launch-at-login, and native notifications.
- Android widgets and notification actions; iOS beta and widgets after platform-specific validation.
- Deep links and Join handoff across platforms.

**Gate:** Quick access launches reliably, preserves the same account/local database contract, and adds no duplicate-notification or stale-widget defects.

### Phase 6 — Calendar sets and provider breadth

**Outcome:** Users can control context and availability across accounts.

- Manual calendar/task-list sets.
- Time-based automatic switching.
- Location rules only after a privacy and battery review.
- Busy-without-details availability overlays.
- Microsoft 365 adapter, followed by CalDAV based on demand.
- Task-provider imports only where ownership and conflict behavior are explicit.

**Gate:** Context switching never changes underlying data, leaks private event details, or causes provider write ambiguity.

### Phase 7 — Proposals and scheduling links

**Outcome:** Users can offer availability without a separate scheduling tool.

- Select and copy ad-hoc candidate slots.
- Recipient voting with expiry and host confirmation.
- Booking links, buffers, limits, advance notice, intake fields, and timezone handling.
- Abuse controls, public-page privacy, audit history, and idempotent booking creation.

**Gate:** Double-booking, race, timezone, cancellation, and provider-failure scenarios pass before public availability.

### Phase 8 — Optional assistive intelligence

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

- Expo/React Native for Android and later iOS.
- Existing web client for Windows/macOS during the trust milestone.
- Convex backend with durable local databases on clients.
- Shared domain package; no Flutter or Kotlin rewrite.
- Chrono as an adapter inside deterministic quick add; no LLM dependency for launch.
- Google Calendar is the first provider, after native cross-device data is trustworthy.
- Notes are contextual execution support and enter before provider breadth.

### Decisions made at explicit gates

- **Authentication provider:** validate Clerk + Google inside the Phase 1 tracer; retain only if Expo, web, device revocation, and Convex authorization are straightforward.
- **Expo Go to development build:** switch when the first required native capability cannot run faithfully in Expo Go.
- **Chrono graduation:** promote individual expression classes only after corpus metrics meet the accuracy guardrail.
- **Tauri timing:** begin only after cross-device sync is stable and desktop quick-access demand is validated.
- **Open-weight model:** evaluate only in Phase 8 against a named bounded task and total operating cost.

## 17. References

- [Convex React Native quickstart](https://docs.convex.dev/quickstart/react-native)
- [Convex optimistic updates](https://docs.convex.dev/client/react/optimistic-updates)
- [Convex overview](https://docs.convex.dev/understanding/overview)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo modules overview](https://docs.expo.dev/modules/overview/)
- [Chrono natural-language date parser](https://github.com/wanasit/chrono)
- [React Native for Windows](https://microsoft.github.io/react-native-windows/)
