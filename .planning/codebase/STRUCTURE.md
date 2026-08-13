# Codebase Structure

**Analysis Date:** 2026-08-13

## Directory Layout

```
Calendar-master/
├── index.html                 # Vite HTML shell; mounts #root
├── package.json               # react 19 + vite 7 + playwright + node --test
├── vite.config.js             # React + Tailwind plugins; assetsInlineLimit 64 kB
├── playwright.config.js       # tests/e2e against vite preview
├── build-artifact.mjs         # Inlines dist/ into artifact/planner.html
├── DESIGN.md                  # Visual constitution (themes, type, motion)
├── README.md                  # Runbook + ownership pointer
├── replit.md                  # Replit host notes
├── src/
│   ├── main.jsx               # createRoot + ErrorBoundary + Planner
│   ├── Planner.jsx            # Composition root (~8318 lines) — do not grow
│   ├── storage.js             # window.storage || localStorage adapter
│   ├── index.css              # Tailwind import + page resets
│   ├── app/                   # Process-level crash shell
│   ├── assets/fonts/          # Jost variable font (must stay inlined)
│   ├── design/                # Themes, contrast, typography tokens
│   ├── domains/               # Bounded contexts (rules, not React)
│   │   ├── calendar/
│   │   ├── tasks/
│   │   ├── notes/
│   │   ├── planner/           # Cross-domain day aggregate / review
│   │   ├── reminders/
│   │   ├── gamification/
│   │   └── search/
│   ├── features/              # Application use-cases + extracted UI
│   │   ├── planner/
│   │   ├── search/
│   │   ├── notes/
│   │   ├── accessibility/
│   │   ├── motion/
│   │   └── feedback/
│   ├── platform/              # Ports: persistence, preferences, diagnostics
│   └── shared/                # Date/time/id primitives (no domain imports)
├── tests/e2e/                 # Playwright specs + helpers.js
├── docs/
│   ├── adr/                   # Accepted architecture decisions
│   ├── spec/                  # In-force implementation contracts
│   ├── product/               # Living product capability
│   ├── interaction-contracts/ # Gesture / sheet contracts
│   ├── qa/                    # Completed pressure-test evidence
│   └── superpowers/           # Historical plans + design specs
├── plans/                     # Ad-hoc plan notes
├── scripts/                   # contact-sheet, post-merge, sites-worker
├── .agents/memory/            # Agent memory (not a source of truth)
├── .planning/codebase/        # Generated codebase maps (this folder)
├── dist/                      # Vite build output (gitignored)
├── artifact/                  # Single-file HTML (gitignored)
└── test-results/              # Playwright output (gitignored)
```

## Directory Purposes

**`src/app/`:**
- Purpose: Process-level shell that must survive a Planner crash.
- Contains: Class component boundary and host/localStorage notebook probe.
- Key files: `src/app/ErrorBoundary.jsx`, `src/app/notebookRecovery.js`, `src/app/notebookRecovery.test.js`

**`src/domains/<context>/`:**
- Purpose: One bounded context per folder. Owns model, invariants, commands, queries, events, migrations, tests.
- Contains: `index.js` (public API), `model/`, `commands/`, `queries/`, optional `migrations/`, `recurrence/`, `portability/`, `tests/` or colocated `*.test.js`.
- Key files: `src/domains/calendar/index.js`, `src/domains/tasks/index.js`, `src/domains/notes/index.js`, `src/domains/reminders/index.js`, `src/domains/gamification/index.js`, `src/domains/search/index.js`, `src/domains/planner/index.js`

**`src/features/`:**
- Purpose: Application use-cases and extracted presentation until a real `src/ui/` and `src/app/` service layer exist.
- Contains: Projections, parsers, undo helpers, gesture arithmetic, one extracted card (`TimelineActionCard.jsx`).
- Key files: `src/features/planner/dayProjection.js`, `src/features/planner/weekProjection.js`, `src/features/planner/quickAdd.js`, `src/features/planner/taskMutations.js`, `src/features/search/searchProjection.js`, `src/features/accessibility/dialogFocus.js`

**`src/platform/`:**
- Purpose: Implement interfaces domains own. Browser/host details stop here.
- Contains: Persistence stores, import/replace, preferences schema, diagnostics ledger, storage-status classification.
- Key files: `src/platform/persistence/plannerStateStore.js`, `src/platform/persistence/plannerStateImport.js`, `src/platform/persistence/plannerNotebookReplace.js`, `src/platform/preferences/preferences.js`

**`src/shared/`:**
- Purpose: Stable primitives. Cannot import a product domain.
- Contains: Date keys, local DateTime, intervals, IANA timezone projection, ids.
- Key files: `src/shared/time/dateKey.js`, `src/shared/time/localDateTime.js`, `src/shared/time/timezone.js`, `src/shared/ids.js`

**`src/design/`:**
- Purpose: Visual tokens consumed by Planner. Not yet `src/ui/themes`.
- Contains: Theme list, contrast repair, typography step helpers.
- Key files: `src/design/themes.js`, `src/design/contrast.js`, `src/design/typography.js`

**`src/assets/fonts/`:**
- Purpose: Self-hosted Jost variable font. Vite must inline it (`assetsInlineLimit` in `vite.config.js`) or the CSP-bound artifact silently falls back.
- Contains: `jost-latin-variable.woff2`, `OFL.txt`

**`tests/e2e/`:**
- Purpose: Browser regression against the production bundle. Not renamed as part of domain extraction.
- Contains: `*.spec.js` plus `helpers.js` (shared Playwright fixtures / `data-test` locators).

**`docs/`:**
- Purpose: Human source of truth. Precedence is ADR > SPEC > PRD > `DESIGN.md` > interaction contracts > QA/plans > agent memory (`docs/spec/structure.md`).
- Contains: `docs/adr/0001-domain-oriented-modular-monolith.md`, `docs/spec/structure.md`, `docs/product/planner-foundation.md`, `docs/interaction-contracts/planner-interactions.md`

## Key File Locations

**Entry Points:**
- `index.html`: Document shell, `#root`, `/src/main.jsx`
- `src/main.jsx`: `createRoot` → `<ErrorBoundary><Planner /></ErrorBoundary>`
- `src/Planner.jsx`: `export default function Planner` — composition root
- `build-artifact.mjs`: Single-file artifact entry (`artifact/planner.html`)

**Configuration:**
- `package.json`: Scripts (`dev`, `build`, `test`, `test:e2e`, `build:artifact`)
- `vite.config.js`: Plugins, `assetsInlineLimit: 64 * 1024`, dev server `:5000`
- `playwright.config.js`: `testDir: ./tests/e2e`, `testIdAttribute: data-test`, serial workers
- `.gitignore`: `dist/`, `artifact/`, `test-results/`, `node_modules/`, `.worktrees/`
- No `.env` files are present. Runtime config is host `window.storage` plus `PLAYWRIGHT_*` env vars for CI.

**Core Logic:**
- `src/domains/calendar/commands/calendarCommands.js`: create/update/move/resize/delete/restore events
- `src/domains/calendar/commands/occurrenceCommands.js`: add/cancel/modify/move/restore one occurrence
- `src/domains/calendar/commands/seriesCommands.js`: `changeRecurrence`, `splitSeries`
- `src/domains/calendar/queries/planningQueries.js`: visible occurrences, busy intervals, free slots, briefing
- `src/domains/tasks/commands/taskCommands.js`: lifecycle, plan/schedule/defer/complete
- `src/domains/tasks/commands/listCommands.js`: lists and tags
- `src/domains/notes/commands/noteCommands.js`: note / block writes
- `src/domains/notes/portability/notePortability.js`: markdown / native import-export
- `src/domains/reminders/commands/reminderCommands.js`: reconcile / deliver / snooze / dismiss
- `src/domains/gamification/model/ledger.js`: award / reverse / normalize
- `src/domains/search/queries/searchPlanner.js`: unified search
- `src/domains/planner/queries/dayAggregate.js`: cross-domain day read model
- `src/features/planner/quickAdd.js`: capture-line parser
- `src/platform/persistence/plannerStateStore.js`: v4–v8 load/save/cutover
- `src/storage.js`: only storage I/O

**Testing:**
- Colocated unit tests: `src/**/*.test.js` (for example `src/domains/calendar/tests/commands.test.js`, `src/features/planner/quickAdd.test.js`, `src/platform/persistence/plannerStateStore.test.js`)
- Browser specs: `tests/e2e/*.spec.js`
- Shared e2e helpers: `tests/e2e/helpers.js`

## Naming Conventions

**Files:**
- Domain modules: camelCase verb or noun matching the export (`calendarCommands.js`, `dayAggregate.js`, `migrateV7ToV8.js`, `validatePlannerStateV8.js`).
- Feature modules: camelCase use-case (`quickAdd.js`, `taskCompleteUndo.js`, `timelineInteractionState.js`).
- React surfaces: PascalCase `.jsx` (`Planner.jsx`, `ErrorBoundary.jsx`, `TimelineActionCard.jsx`).
- Tests: same basename + `.test.js` next to the unit, or under `src/domains/<context>/tests/` when the domain has many cases. Browser specs are kebab-case `*.spec.js`.
- Barrels: always `index.js` at the domain root. Re-export the public API; do not put logic in the barrel.

**Directories:**
- Domain folder = bounded context name, singular (`calendar`, `tasks`, `notes`, `planner`, `reminders`, `gamification`, `search`).
- Inside a domain, group by role: `model/`, `commands/`, `queries/`, `migrations/`, plus a domain-specific noun when needed (`recurrence/`, `hierarchy/`, `dependencies/`, `portability/`, `revisions/`, `templates/`, `documents/`, `segmentation/`, `layout/`, `planning/`, `events/`).
- Features group by product area (`planner`, `search`, `notes`) or cross-cutting concern (`accessibility`, `motion`, `feedback`).
- Platform group by port (`persistence`, `preferences`, `diagnostics`, `resilience`).

**Symbols:**
- Commands: verb + entity — `createEvent`, `completeTask`, `reconcileReminders`.
- Queries: `get*` / `search*` / `resolve*` — `getVisibleOccurrencesForRange`, `searchPlanner`, `resolveSearchTarget`.
- Normalizers: `normalizeX` / `legacyXToCanonical`.
- Projections: `projectPlannerDay`, `projectPlannerWeek`, `projectPlannerSearch`.
- Errors: `CalendarValidationError`, `TaskValidationError`, `NoteValidationError`.
- Storage keys: `nbmp:<store>:<version>` (`nbmp:state:v8`, `nbmp:preferences:v1`, `nbmp:reminders:v1`, `nbmp:motivation:v1`, `nbmp:diagnostics:v1`).

## Where to Add New Code

Follow `docs/spec/structure.md`. Accepted ADR 0001 still owns the *target* tree; this section describes where to put work *now* so the incremental migration continues.

**New domain rule, command, query, or migration:**
- Primary code: `src/domains/<bounded-context>/<role>/<name>.js`
- Export it from `src/domains/<bounded-context>/index.js`
- Tests: colocated `*.test.js` or `src/domains/<bounded-context>/tests/<name>.test.js`
- Do not put it in `src/Planner.jsx` or inside another domain's folder

**New cross-domain read (day briefing, review, unified search):**
- Implementation: `src/domains/planner/queries/` or `src/domains/search/queries/`
- Import other domains only through their `index.js`
- Feature wrapper (UI-facing): `src/features/planner/<name>Projection.js` or `src/features/search/<name>Projection.js`

**New application use-case (undo, gesture math, parser, projection):**
- Implementation: `src/features/<area>/<camelName>.js`
- Tests: `src/features/<area>/<camelName>.test.js`
- Wire from `src/Planner.jsx` with an import and a one-line call

**New visible React surface:**
- Implementation: `src/features/<area>/<PascalName>.jsx` (see `src/features/planner/TimelineActionCard.jsx`)
- Later destination is `src/ui/...` once that tree exists — do not create `src/ui/` ad hoc in a drive-by change
- Do not add markup to the 8318-line Planner composition root except the JSX needed to mount the extracted component

**New persistence / import / export / schema cutover:**
- Store module: `src/platform/persistence/<name>Store.js` (load/save + key constant)
- Schema owned by the domain: `src/domains/<context>/migrations/migrateV<n>ToV<n+1>.js` and `validatePlannerStateV<n>.js`
- Sequence the new version in `src/platform/persistence/plannerStateStore.js` and `plannerStateImport.js`
- Host I/O stays in `src/storage.js`

**New date, id, or validation primitive:**
- Shared helpers: `src/shared/time/` or `src/shared/ids.js`
- Do not hide a one-off date helper at the bottom of Planner

**New theme / contrast / type rule:**
- Tokens: `src/design/themes.js`, `src/design/contrast.js`, `src/design/typography.js`
- Visual law: update `DESIGN.md` when the constitution changes

**New browser flow:**
- Spec: `tests/e2e/<kebab-flow>.spec.js`
- Shared locators / notebook seeders: `tests/e2e/helpers.js`
- Hook the UI with `data-test` (already the Playwright `testIdAttribute`)

**New documentation:**
- Architecture decision: `docs/adr/`
- Implementation contract: `docs/spec/` or `docs/interaction-contracts/`
- Product capability: `docs/product/`
- Do not treat `.planning/` as a source of truth for folder layout

**Concrete placement examples:**

| If you are adding… | Put it here |
| --- | --- |
| A new event invariant | `src/domains/calendar/model/event.js` + export from `src/domains/calendar/index.js` |
| A new occurrence command | `src/domains/calendar/commands/occurrenceCommands.js` |
| A new task smart view | `src/domains/tasks/queries/smartViews.js` |
| A note template | `src/domains/notes/templates/builtInTemplates.js` |
| A reminder policy | `src/domains/reminders/queries/` or `commands/` |
| XP award rule | `src/domains/gamification/model/ledger.js` |
| Capture syntax | `src/features/planner/quickAdd.js` |
| Week density math | `src/features/planner/weekProjection.js` (presentation) or `src/domains/calendar/queries/planningQueries.js` (invariant) |
| Dialog focus behavior | `src/features/accessibility/dialogFocus.js` |
| A new side store | `src/platform/persistence/<name>Store.js` + key `nbmp:<name>:v1` |
| A crash-only recovery path | `src/app/notebookRecovery.js` |

## Special Directories

**`src/domains/*` empty-looking role folders:**
- Purpose: Reserved by ADR 0001 even when a given role is still thin (`src/domains/planner/` is queries-only today).
- Generated: No
- Committed: Yes

**`src/ui/`, `src/platform/notifications/`, `src/platform/integrations/`, `src/platform/telemetry/`, `src/shared/recurrence/`, `src/shared/validation/`, `src/shared/types/`:**
- Purpose: Target tree from `docs/adr/0001-domain-oriented-modular-monolith.md`. They do not exist yet.
- Generated: No
- Committed: Not applicable — do not create them until a phase is extracting that layer for real

**`dist/`:**
- Purpose: Vite production bundle
- Generated: Yes (`npm run build`)
- Committed: No

**`artifact/`:**
- Purpose: Single self-contained `planner.html`
- Generated: Yes (`npm run build:artifact`)
- Committed: No

**`test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`:**
- Purpose: Playwright output
- Generated: Yes
- Committed: No

**`node_modules/`:**
- Purpose: npm install
- Generated: Yes
- Committed: No

**`.worktrees/`:**
- Purpose: Agent worktrees
- Generated: Yes
- Committed: No

**`review.html`, `contact-sheet/`:**
- Purpose: Generated visual review (`scripts/contact-sheet.mjs`)
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: Generated GSD maps (`ARCHITECTURE.md`, `STRUCTURE.md`, …). Not an ownership source of truth (`docs/spec/structure.md`).
- Generated: Yes (this pass)
- Committed: Only if the orchestrator chooses to

**`.agents/memory/`:**
- Purpose: Agent notes (`MEMORY.md`, `calendar-read-projections.md`)
- Generated: Hand-written by agents
- Committed: Present; lowest precedence

**`docs/superpowers/`:**
- Purpose: Historical phase plans and design specs
- Generated: No
- Committed: Yes — keep in place until an approved archive pass

**`docs/qa/`:**
- Purpose: Completed pressure-test writeups
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-08-13*
