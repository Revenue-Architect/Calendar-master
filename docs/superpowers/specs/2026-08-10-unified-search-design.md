# Unified Search and Deep Links — Phase 3C Design

**Status:** Approved implementation decision under the Planner Product Foundation.
The user has authorised implementation choices within the documented
non-provider scope.

## Outcome

Replace the ad-hoc Search sheet filtering in `Planner.jsx` with a pure search
domain that composes Calendar, Tasks, and Notes into deterministic local results
and resolves a selected result to a canonical in-app target. Search stays
offline and on-demand: it persists neither a duplicate index nor source content.

## Decision

Three approaches were considered:

1. Keep filtering in `Planner.jsx`. It is quick, but repeats domain knowledge in
   presentation code and leaves recurring deep links fragile.
2. Persist a denormalized browser index. It would require invalidation,
   migration, privacy controls, and recovery before local scale justifies it.
3. **Chosen: pure composition and resolution.** `domains/search` parses intent,
   projects searchable source fields, ranks matching records, and resolves a
   target from current canonical state. React owns query text, sheet focus, and
   opening the returned target.

The third option keeps future indexing replaceable behind a repository adapter
and prevents a second source of truth.

## Query contract

`searchPlanner(state, { query, todayDate, limit })` returns a parsed query and
display-safe results with canonical `kind`, `id`, `target`, `title`, `excerpt`,
`date`, `status`, and `tags` fields.

- Matching is case-, punctuation-, and diacritic-insensitive.
- Quoted phrases match as contiguous normalized phrases; unquoted terms are
  ANDed.
- `type:`, `status:`, `tag:`, `date:`, `list:`, and `calendar:` filters apply
  only to record types that own that field.
- Unsupported `name:value` tokens are returned as issues and ignored for matching.
- Archived tasks and notes are excluded by default.
- Ranking is deterministic: exact title, title prefix, title-token, then other
  source text; proximity to `todayDate`; finally `kind` and canonical ID.

## Deep-link contract

`resolveSearchTarget(state, result, { todayDate })` returns either
`{ status: "available", kind, entityId, occurrenceId, date }` or
`{ status: "unavailable", kind, entityId, reason }`.

- One-off events, tasks, and dated notes resolve to canonical IDs and dates.
- Repeating events resolve through Calendar occurrence queries, including moved
  exceptions; repeating tasks resolve through Task occurrence queries.
- Missing, archived, cancelled, or moved targets produce an explicit outcome;
  search does not throw or select an unrelated record.
- Search never changes source records, selected date, or navigation history.

## UI and verification

The existing `/` and `⌘/Ctrl+K` entry points remain. The Search sheet receives
projected results and emits one selection; `Planner.jsx` applies `jumpTo` and
opens the existing note or inspector surface. Commands, remote indexing,
providers, saved searches, and background indexing remain out of scope.

Tests must prove normalization, quotes, all modeled filters, archived exclusion,
stable ranking, recurring/moved target resolution, and unavailable targets. The
final gate is `npm test && npm run build && git diff --check`, followed by the
documented browser/device flow check.
