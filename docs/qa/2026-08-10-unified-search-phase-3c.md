# Unified Search and Deep Links — Phase 3C QA

**Scope:** Pure local unified search, source-owned recurring deep links, and
adoption by the existing Search sheet.

## Automated evidence

| Gate | Result |
| --- | --- |
| Focused Search domain and feature tests | 13 passing, 0 failing |
| Full automated suite | 241 passing, 0 failing |
| Production build | Vite completed successfully; 98 modules transformed |
| Source hygiene | `git diff --check` completed with no whitespace errors |
| Production dependencies | `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities |

The focused coverage proves:

- Diacritic- and punctuation-insensitive matching, quoted phrases, supported
  filters (including task planning, deadline, and follow-up dates), explicit
  unsupported-filter issues, and archived task/note exclusion.
- Deterministic ranking across Calendar, Tasks, and Notes without exposing note
  blocks in UI-facing results.
- Calendar moved occurrences and Task recurring occurrences resolve through their
  own canonical domain queries.
- An archived note selected from stale UI state returns an explicit unavailable
  outcome rather than opening its old content.
- Completed and cancelled recurring task instances skip to the next actionable
  canonical occurrence under a direct pressure probe.

## Browser-flow evidence limit

Vite started successfully, but the available cloud browser again rejected
`http://localhost:5173` with `net::ERR_BLOCKED_BY_CLIENT`. No interactive
Search sheet, screenshots, or assistive-technology flows are claimed as passed
from this environment.

## Required browser/device follow-up

- Open Search with both `/` and `⌘/Ctrl+K`; confirm input focus and that global
  shortcuts do not affect the planner while Search is open.
- Search accent-insensitive text, a quoted phrase, each supported filter, and an
  unsupported filter. Confirm result order and the ignored-filter explanation.
- Open a one-off event, a moved recurring event, a recurring task, a dated note,
  an inbox task, and a stale/archived result. Confirm the selected day and correct
  inspector/editor outcome.
- Verify keyboard navigation, focus return on close, screen-reader announcements,
  narrow-screen reflow, and reduced-motion behavior.

## Result

The search and deep-link contract passes all executable gates and source-level
pressure paths. Visual and assistive-technology verification remains explicitly
blocked by the local cloud-browser connection policy.
