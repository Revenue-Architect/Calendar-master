# Ingested Constraints

## Current ownership map freeze
- source: docs/spec/structure.md
- type: protocol
- content: This freezes the current ownership map. It does not authorize a folder move. Accepted ADR 0001 still owns the target tree. Finish that migration incrementally. Do not invent a fourth documentation plane and do not grow Planner.jsx.

## Source placement
- source: docs/spec/structure.md
- type: protocol
- content: Domain rule, command, query, migration goes in src/domains/<bounded-context>/ and is exported from that domain's index.js. Persistence, schema cutover, import/export goes in src/platform/persistence/. Date, id, validation primitives go in src/shared/. Application use-case, undo, projection, gesture arithmetic goes in src/features/<area>/ until a real src/app/ service exists. Visible React surface goes in src/features/*/Foo.jsx for now; later src/ui/... once that tree exists. Host storage adapter is src/storage.js. Planner remains the composition root. Tests stay colocated as *.test.js. Browser specs stay in tests/e2e/ and are not renamed as part of organization.

## Documentation homes
- source: docs/spec/structure.md
- type: protocol
- content: Architecture decision lives in docs/adr/. Product capability lives in docs/product/. In-force implementation contract lives in docs/spec/ or docs/interaction-contracts/. Visual constitution is DESIGN.md. Completed plans and QA evidence stay in place until an approved archive pass. Do not add .planning/ as a source of truth. The draft Convex/Expo PRD is not binding on folder structure.

## Documentation precedence
- source: docs/spec/structure.md
- type: nfr
- content: Accepted ADR > approved SPEC > living PRD > DESIGN.md > interaction contracts > QA/plans > agent memory.

## Domain dependency rules
- source: docs/adr/0001-domain-oriented-modular-monolith.md
- type: protocol
- content: shared cannot import a product domain. A domain cannot import another domain's persistence or UI. Cross-domain workflows are coordinated in app or through domain events. platform implements interfaces owned by domains; domains do not depend on provider SDKs or browser storage details. ui may invoke application commands and queries but cannot mutate canonical records directly. Provider payloads are never used as canonical domain models.

## Interaction region ownership
- source: docs/interaction-contracts/planner-interactions.md
- type: protocol
- content: Handlers implement this document. They do not invent a second meaning for a region. Cancel is never commit. pointercancel and touchcancel restore the before snapshot, clear lifted visuals, and open neither a composer nor a toast. Day/Week Event JOIN opens the meeting directly and must not open the Event inspector. Day Action check completes or reopens and opens no inspector. Add a Step is visible first whenever an existing open Action is editable, including an empty checklist. Visibility is derived from editability, not checklist length.

## Interaction lifecycle
- source: docs/interaction-contracts/planner-interactions.md
- type: protocol
- content: Lifecycle is idle to armed to active to committed or cancelled. One sequence has one owner: day-stream, captured-card, week-grid, or external. Only a normal pointer/touch end may persist, and only when the proposal differs from the before snapshot. A drag attempt, including a cancelled arm, suppresses the following click.

## Week Action parity
- source: docs/interaction-contracts/planner-interactions.md
- type: protocol
- content: Week Action move, resize, and swipe are deferred. Week Action cards must not advertise those gestures.

## Actions destination
- source: docs/interaction-contracts/planner-interactions.md
- type: nfr
- content: Actions is a calendar-context-free destination. The date ribbon, Week strip, and Month grid are absent there at every zoom. Returning to Timeline or Agenda restores the selected date and places its ribbon cell inside the visible strip on the first painted frame.

## Inspector draft
- source: docs/interaction-contracts/planner-interactions.md
- type: protocol
- content: detailEditing is the draft transaction. A separate inspectField key owns the one expanded inline editor. The sheet node must not remount or replay its entrance.

## Focus source
- source: docs/interaction-contracts/planner-interactions.md
- type: protocol
- content: Focus source is manual or auto. Manual focus from F or the toggle survives scrolling until the user restores it. Automatic focus may change only during an active user scroll session.

## Calendar arithmetic ownership
- source: docs/product/planner-foundation.md
- type: nfr
- content: Shared time primitives MUST own date arithmetic and formatting policy. React components MUST NOT implement calendar arithmetic. Gestures MUST produce domain commands rather than rewriting stored objects.
