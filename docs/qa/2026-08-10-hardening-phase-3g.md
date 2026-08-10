# Accessibility, Diagnostics, and Input Hardening — Phase 3G QA

**Scope:** Modal keyboard boundaries, truthful live announcements, redacted local
diagnostics, and bounded untrusted Notes portability input. This closes the planned
non-provider Planner foundation; it does not add provider integrations, remote
telemetry, binary attachments, rich HTML, or a visual Notes-management surface.

## Automated evidence

| Gate | Result |
| --- | --- |
| Focused Notes portability, dialog-focus, and diagnostics tests | 14 passing, 0 failing |
| Full automated suite | 292 passing, 0 failing |
| Production build | Vite completed successfully; 116 modules transformed |
| Source hygiene | `git diff --check` completed with no whitespace errors |
| Production dependencies | `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities |

## Pressure coverage

- Oversized plain text, Markdown, and native note, tag, attachment, or block input
  are rejected before a Note or imported aggregate can be constructed. Native import
  remains all-or-nothing on malformed input.
- Dialog focus math covers empty lists plus forward and reverse wrap. The Sheet
  integration labels the dialog, traps tab navigation, respects a child autofocus,
  restores a connected opener, and retains Escape close behavior.
- Diagnostics rejects extra fields such as raw messages and stacks, accepts only
  safe tokens and controlled operation/category pairs, caps retained records at 50,
  and exports a fresh content-free projection.
- Diagnostics storage initializes separately, round-trips through its own key, and
  rejects malformed data rather than replacing it. The Planner never records a
  diagnostics-store failure into that store, avoiding a write-failure feedback loop.

## Runtime and browser evidence limit

`npm run dev` starts Vite on `http://localhost:5173/`; the development server was
stopped after the runtime smoke check. This execution environment has no usable cloud
browser client and local browser access is blocked by policy, so mouse, visual-layout,
assistive-technology, and real DOM-focus flows were not claimed as passed.

## Required browser/device follow-up

- Exercise every Sheet with keyboard-only open, close, forward and reverse tab wrap,
  child autofocus, opener removal, and narrow-screen scrolling.
- Verify assertive save/reminder announcements and polite undo wording with a screen
  reader across themes and reduced-motion settings.
- Import files at the documented boundaries through the future file-picker surface,
  then verify rejected input leaves the displayed notebook unchanged.
- Force each storage port to fail after boot and confirm the visible warning, capped
  diagnostics record, no diagnostic self-loop, and safe explicit diagnostic export.
