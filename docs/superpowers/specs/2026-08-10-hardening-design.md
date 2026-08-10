# Accessibility, Diagnostics, and Input Hardening — Phase 3G Design

**Status:** Approved implementation design under the existing Planner Foundation
approval.

## Outcome

The final non-provider foundation slice makes common failures observable without
capturing private planner content, gives every modal sheet a predictable keyboard
boundary, and bounds untrusted Notes portability input before it can consume an
unbounded amount of local memory.

## Decisions

- Modal sheets capture the opener, focus an in-sheet control only when a child has
  not already focused itself, cycle `Tab`/`Shift+Tab` within the dialog, close on
  Escape, and restore the opener when it remains connected. Their title supplies
  the dialog accessible name.
- Status, reminder, and undo messages use the appropriate live-region semantics:
  routine state is polite, a failed save or reminder interruption is assertive.
  Visual toast text stays the single user-facing message rather than creating a
  separate accessibility-only copy.
- Diagnostics is a separate, capped v1 local ledger. Each record is limited to a
  controlled category, operation, version, timestamp, opaque correlation ID, and
  safe error code. It never accepts task/event/note text, locations, URLs, stack
  traces, provider payloads, or arbitrary error messages.
- Planner records later persistence failures in that ledger, but a diagnostics
  store failure only surfaces through the existing save warning; it does not write
  a diagnostic about itself and create a failure loop. Diagnostic export is a pure,
  explicit, content-free projection for a future settings surface.
- Native Notes bundles and plain/Markdown import have fixed record and text-size
  limits. Validation happens before aggregate construction, so rejected input
  yields no partial Notes state. React continues to render imported text as text;
  this slice adds no HTML interpretation or URL opening path.

## Boundaries

| Concern | Owner | Does not own |
| --- | --- | --- |
| Dialog focus calculations | `features/accessibility` | canonical planner state |
| Live region semantics | Planner shell | persistence or content transformation |
| Redacted diagnostic records | `platform/diagnostics` | analytics, content capture, remote reporting |
| Diagnostic local storage | `platform/persistence` | diagnostic category policy |
| Note import limits | `domains/notes/portability` | file picker/upload transport |

## Non-goals

- Automated visual or screen-reader certification, remote telemetry, crash upload,
  analytics consent UI, credential storage, rich HTML rendering, URL-preview/open
  actions, provider security, authorization roles, or a general file-size policy.

## Acceptance criteria

1. Focus navigation math covers empty, forward-wrap, and reverse-wrap dialog cases;
   the Sheet adopts that behavior without stealing an existing child autofocus.
2. Diagnostic records validate, cap, round-trip in their own key, and export no
   user-authored content or arbitrary error message.
3. Note native, text, and Markdown import reject oversized untrusted input before
   producing a new record or aggregate.
4. Full regression, build, diff hygiene, dependency audit, and available-browser
   evidence are recorded before publication.
