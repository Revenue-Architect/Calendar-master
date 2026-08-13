# External Integrations

**Analysis Date:** 2026-08-13

## APIs & External Services

This planner is local-only. There is no application backend, no `fetch()` in `src/`, and no third-party SaaS SDK in `package.json`.

**Calendar interchange:**
- iCalendar export (RFC 5545 subset) — Settings → `EXPORT .ICS`
  - SDK/Client: none. Hand-rolled in `src/domains/calendar/portability/eventToIcs.js`, re-exported from `src/domains/calendar/index.js`
  - Wired in `src/Planner.jsx` (`exportIcs` → `eventsToIcs(db.events, eventForUi, normalizeMeetingLink)`)
  - Output: `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID:-//Not Boring Moleskine Planner//EN`, one `VEVENT` per stored series
  - Timing: all-day uses `VALUE=DATE` with exclusive `DTEND`; floating times stay floating (no `Z`); zoned times carry `TZID`
  - Recurrence: `RRULE` from `freq` / `interval` / `BYDAY` / `COUNT` / `UNTIL`
  - Meeting URLs become `URL:` after `normalizeMeetingLink` in `src/features/planner/meetingLink.js`
  - One bad event returns `null` and is counted in `skipped`; it must not abort the download
  - Auth: none
  - There is **no ICS import** and no Google Calendar / Outlook / CalDAV sync

**Notes interchange:**
- Native bundle, Markdown, and plain text — `src/domains/notes/portability/notePortability.js`
  - Native format id: `calendar-master-notes`, version `1` (`NOTE_EXPORT_FORMAT` / `NOTE_EXPORT_VERSION`)
  - Caps: 100_000 text chars, 500 notes, 500 tags, 1_000 attachments, 2_000 blocks/note
  - Functions: `exportNoteAsPlainText`, `exportNoteAsMarkdown`, `exportNativeNoteCollection`, `importPlainTextNote`, `importMarkdownNote`, `importNativeNoteCollection`
  - These are domain adapters. The Settings file picker currently imports a **full planner JSON notebook**, not a notes-only bundle

**Meeting links (user-supplied URLs, not vendor APIs):**
- Stored as `http:` / `https:` only via `normalizeMeetingLink` in `src/features/planner/meetingLink.js`
- Bare domains get `https://` prefixed. `javascript:`, relative paths, and non-host strings become `""`
- Renderers put the stored value straight into `href`. There is no Zoom / Meet / Teams SDK

**Browser platform APIs (not remote services):**
- `Notification` — in-session reminder toast plus optional system notification when `preferences.notifications.systemEnabled` and permission is `granted` (`src/Planner.jsx`). `Notification.requestPermission()` is the Settings “ALLOW” path. There is no push server and no Notification Triggers API
- `navigator.vibrate` — completion haptics via `triggerDeviceHaptic` in `src/features/feedback/haptics.js` (`HAPTIC_PATTERNS.complete = [24, 32, 36]`)
- `AudioContext` / `webkitAudioContext` — synthesized beeps in `useSynth` inside `src/Planner.jsx`
- `crypto.randomUUID()` — persisted ids from `src/shared/ids.js` (fallback only for older Node tests)
- `Intl.DateTimeFormat` — IANA timezone projection in `src/shared/time/timezone.js`
- `Blob` + `URL.createObjectURL` — JSON / ICS / crash-recovery downloads (`src/Planner.jsx`, `src/app/ErrorBoundary.jsx`)
- `FileReader.readAsText` — Settings JSON import (`src/Planner.jsx`)

## Data Storage

**Databases:**
- None. No Postgres, SQLite, IndexedDB, or remote store.

**Browser / host key-value (the only persistence):**
- Port: `src/storage.js`
  - Prefer host `window.storage` when the app is embedded (`get` / `set` / optional `remove`)
  - Else `window.localStorage` after a write-probe (`nbmp:probe`)
  - Reads never reject (missing → `null`); writes reject so Settings can warn and keep export as the recovery path
  - `writable` is probed once at module load
- Crash recovery must **not** import `src/storage.js`. It re-probes in the same order from `src/app/notebookRecovery.js` (`readRecoverableNotebook`)

**Keys (do not invent new ones without a store module):**

| Key | Owner | Purpose |
| --- | --- | --- |
| `nbmp:state:v8` | `src/platform/persistence/plannerStateStore.js` | Canonical notebook (schema v8) |
| `nbmp:state:v7` … `nbmp:state:v4` | same | Legacy keys; load migrates in memory, writes v8, confirms, then deletes the old key |
| `nbmp:preferences:v1` | `src/platform/persistence/preferencesStore.js` | Theme, clock, week start, motion, sound, haptics, notification flag, motivation toggles (preferences schema v2 inside the value) |
| `nbmp:reminders:v1` | `src/platform/persistence/reminderStore.js` | Reminder ledger (not inside the notebook) |
| `nbmp:motivation:v1` | `src/platform/persistence/gamificationStore.js` | XP / levels / streaks ledger |
| `nbmp:diagnostics:v1` | `src/platform/persistence/diagnosticsStore.js` | Local diagnostic ledger (`calendar-master-diagnostics`) |
| `nbmp:backup:v1` | `src/platform/persistence/backupStore.js` | Last-export fingerprint (`src/features/planner/backupReminder.js`) |
| `nbmp:ui:actionsOpen` | `src/Planner.jsx` | Best-effort Actions column collapse |
| `nbmp:ui:gestureHintSeen` | `src/Planner.jsx` | One-shot gesture hint |
| `nbmp:probe` | `src/storage.js` | localStorage writability probe; not persisted data |

**Notebook load / cutover (`loadPlannerState` in `src/platform/persistence/plannerStateStore.js`):**
1. Read v8 → validate (`validatePlannerStateV8`)
2. Else migrate the oldest present version **in memory** (v4→v5→v6→v7→v8), write v8, read it back, validate, then `remove` the previous key
3. A failed write leaves the previous version untouched. There is no dual-write window
4. Missing storage seeds a blank validated notebook. Malformed data is not overwritten on startup

**Replace / wipe transaction (`src/platform/persistence/plannerNotebookReplace.js`):**
- Replaces notebook + clears reminders + resets motivation opening balance to 0 + resets backup fingerprint
- **Keeps** preferences and diagnostics — they are device settings / crash history, not notebook content

**JSON notebook interchange:**
- Export: `planner-{date}.json` via `download()` in `src/Planner.jsx` (also records a backup)
- Import: hidden `<input type="file" accept="application/json">` → `readPlannerImportText` in `src/platform/persistence/plannerStateRead.js`
- Cap: `MAX_PLANNER_IMPORT_BYTES = 2 * 1024 * 1024`
- Versions accepted: schema 4–8 via `normalizeImportedPlannerState` in `src/platform/persistence/plannerStateImport.js`
- Crash screen export: `planner-recovery-{date}.json` from raw storage bytes (`src/app/ErrorBoundary.jsx`)

**File Storage:**
- Local filesystem only, and only as user-initiated downloads / file picks. No S3, Drive, or object store
- Note attachment records (`src/domains/notes/model/noteAttachment.js`) hold metadata (`storageRef`, media type, ≤ 25 MB `byteSize`). There is no blob-upload backend; `storageRef` is a local reference string

**Caching:**
- None. No Redis, no service worker, no HTTP cache layer
- In-process only: `Intl.DateTimeFormat` cache in `src/shared/time/timezone.js`

## Authentication & Identity

**Auth Provider:**
- None. No accounts, sessions, OAuth, API keys, or multi-user access

**Implementation:**
- A notebook is whoever can read this origin’s `localStorage` (or the embed host’s `window.storage`)
- Record ids are `crypto.randomUUID()` from `src/shared/ids.js`, not user ids
- Meeting-link sanitization is the only URL allow-list (`http`/`https` + hostname with a dot)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, LogRocket, analytics)

**Logs:**
- In-app diagnostics ledger, local only
  - Model: `src/platform/diagnostics/diagnostics.js` (`DIAGNOSTICS_EXPORT_FORMAT = "calendar-master-diagnostics"`)
  - Store: `nbmp:diagnostics:v1` via `src/platform/persistence/diagnosticsStore.js`
  - A malformed ledger is **not** overwritten on boot; `diagnosticsSaveBlocked` stays true
- Render failures: `src/app/ErrorBoundary.jsx` — standalone fallback UI whose first control saves a copy from storage, not from crashed React state
- Playwright: list reporter locally; on `CI`, list + HTML (`open: "never"`), traces and screenshots on failure

## CI/CD & Deployment

**Hosting:**
- Static files. Three ship forms:
  1. Vite `dist/` SPA (`index.html` + hashed assets)
  2. Single-file `artifact/planner.html` for a CSP-strict artifact host (`build-artifact.mjs`)
  3. Cloudflare Sites Worker (`scripts/sites-worker.js`) — `env.ASSETS.fetch`, SPA fallback to `/index.html`
- Replit: `.replit` workflow `npm run dev -- --host 0.0.0.0 --port 5000`, port 5000 → 80, post-merge `scripts/post-merge.sh`

**CI Pipeline:**
- No `.github/workflows`, GitLab CI, CircleCI, Netlify, Vercel, Fly, or Docker files
- Playwright is CI-ready via `process.env.CI` in `playwright.config.js` (`forbidOnly`, retries: 1, no preview reuse)
- Unit + e2e locally: `npm run test:all`

## Environment Configuration

**Required env vars:**
- None for the running app. Persistence is browser/host storage, not process env

**Optional env vars (tooling only):**
- `CI`
- `PLAYWRIGHT_PORT` (default `4321`)
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
- `SHEET_BASE` (default `http://127.0.0.1:4321`)

**Secrets location:**
- Not applicable. No `.env*` files, no credential files, no API keys. Do not add them for a local-only notebook

## Webhooks & Callbacks

**Incoming:**
- None. No HTTP listener in the app. `scripts/sites-worker.js` only serves static assets

**Outgoing:**
- None. Reminders fire only while the tab is open (`getDueReminders` with a 5-minute grace). Missed items surface on next open via `getMissedReminders` in `src/domains/reminders/queries/missedReminders.js` (14-day lookback, limit 50). A web page cannot schedule a background alarm without a push server; this codebase does not add one

## Host Embed Contract

When the planner is embedded, the host **must** provide `window.storage` before `src/storage.js` evaluates:

```js
window.storage = {
  get(key) { /* return value | { value } | null */ },
  set(key, value) { /* persist string */ },
  remove?(key) { /* optional; else set(key, null) */ },
};
```

- Probe order is always host then `localStorage` (`src/storage.js`, `src/app/notebookRecovery.js`)
- Host-only notebooks must remain recoverable from the crash screen
- The artifact host additionally owns `<head>` and may enforce a CSP that blocks every external request — keep fonts/scripts/styles inline (`vite.config.js` `assetsInlineLimit`, `build-artifact.mjs`)

## Integration Constraints (follow these)

- Do not add network calls, auth, or a sync backend without an explicit architecture decision. The product contract in `README.md` is “all state is local to the device”
- New persisted data belongs in a dedicated store module under `src/platform/persistence/`, not stuffed into `nbmp:state:v8`, unless it is notebook content that should travel with JSON export/import
- Preferences, diagnostics, reminders, motivation, and backup stay in their own keys so a theme change never rewrites records
- Calendar writes go through `src/domains/calendar/index.js`. ICS stays a portability adapter and must not import `src/Planner.jsx` — inject `eventForUi`
- Import paths: planner JSON (v4–v8, ≤ 2 MB) is the Settings interchange. ICS is export-only. Notes Markdown/native helpers exist for domain use; do not silently treat an `.ics` or notes bundle as a notebook
- System notifications are best-effort and in-session only. Persist reminder *intent* in `nbmp:reminders:v1`; never assume the OS will fire while the page is closed

---

*Integration audit: 2026-08-13*
